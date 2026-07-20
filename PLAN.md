# opencode Voice Mode — Implementation Plan

## Architecture

A single TypeScript plugin at `~/.config/opencode/plugins/voice-mode.ts` that runs
entirely inside opencode's Bun process. No companion scripts, no Python.

### Data Flow

```
SOX (mic -> stdout PCM) ──> JS VAD (energy threshold)
                                |
                          speech->silence detected
                                |
                          whisper-cpp-node transcribe (tiny.en model)
                                |
                          client.session.promptAsync()
                                |
                          SSE event: message.part.updated (delta)
                                |
                          accumulate deltas -> sentence boundary
                                |
                          Edge TTS WebSocket -> MP3 bytes
                                |
                          temp file -> PowerShell MediaPlayer -> audio out
                                |
                          SSE event: session.idle -> back to VAD
```

## Files to Create/Modify

| # | Path | Lines | Purpose |
|---|------|-------|---------|
| 1 | `~/.config/opencode/plugins/voice-mode.ts` | ~350 | Main plugin |
| 2 | `~/.config/opencode/package.json` | ~10 | Npm deps (whisper-cpp-node) |
| 3 | `~/.config/opencode/opencode.jsonc` | +3 lines | Add `server` section |

## Prerequisites (user must do)

```powershell
winget install --id ChrisBagwell.SoX -e
```

Everything else auto-installs (npm packages via Bun at startup, whisper model
auto-downloaded from HuggingFace on first run).

## Key Libraries

| Package | Version | Purpose | Prebuilt Win32? |
|---------|---------|---------|-----------------|
| `whisper-cpp-node` | ^0.2.12 | Local STT via whisper.cpp | Yes (.node binary) |
| (Bun built-in) | — | WebSocket (Edge TTS), child_process (sox) | — |

## Plugin Internal Structure

### Module State

```typescript
// Audio capture
let soxProcess: ChildProcess | null = null;
let audioChunks: Int16Array[] = [];
let isInSpeech = false;
let silenceStart = 0;
let speechStart = 0;

// FSM
type Phase = "listening" | "transcribing" | "waiting";
let phase: Phase = "listening";

// Session
let sessionId: string | null = null;

// Whisper
let whisper: WhisperContext | null = null;

// TTS
let ttsQueue: string[] = [];
let isPlaying = false;
let pendingDelta = "";
let ttsWs: WebSocket | null = null;
```

### Phase State Machine

```
listening ──> transcribing ──> waiting ──> listening
    │              │               │
    └── VAD        ├── whisper     ├── SSE message.part.updated
    └── RMS > th   │    STT        │       -> accumulate deltas
    └── silence    ├── send to     │       -> sentence boundary
         > 1.2s    │   opencode    │       -> Edge TTS -> play
                   │               ├── SSE session.idle
                   └── set phase   └── set phase to listening
```

### Plugin Hooks

```typescript
export const VoiceModePlugin: Plugin = async ({ client, $, directory }) => {
  // Init: check sox, download model, create whisper ctx, create session,
  //       start sox, start VAD interval (80ms)

  return {
    dispose: async () => {
      // Kill sox, free whisper, close WS, clear intervals
    },

    event: async ({ event }) => {
      if (event.type === "message.part.updated") {
        // Part.type === "text" && delta present && belongs to our session
        //   -> handleDelta(delta)
      }
      if (event.type === "session.idle") {
        // Our session completed -> finish TTS, set phase to listening
      }
    },
  };
};
```

### VAD Logic (setInterval, ~80ms)

```
1. Grab latest chunks from audioChunks buffer
2. Compute RMS of last 30ms window (480 samples at 16kHz)
3. RMS > 0.02 (tunable):
     - Transition to speaking: mark speechStart = now
     - Keep accumulating all chunks
4. RMS < 0.02 for 1.2s:
     - If was speaking: utterance complete
     - Extract PCM from speechStart to now
     - Clear buffer
     - Set phase = "transcribing"
     - Call transcribeAndSend(pcm)
```

### Transcribe + Send

```typescript
async function transcribeAndSend(pcm: Int16Array) {
  // 1. Convert Int16 -> Float32 (sample / 32768)
  // 2. whisper.transcribeAsync({ pcmf32, language: "en", n_threads: 4 })
  // 3. Extract text from result.segments[].text
  // 4. Trim. If empty, phase = "listening", return
  // 5. If !sessionId, create via client.session.create()
  // 6. client.session.promptAsync({
  //      path: { id: sessionId },
  //      body: { parts: [{ type: "text", text }] }
  //    })
  // 7. phase = "waiting"
  // 8. connectEdgeTTS()  // open WebSocket, send config
}
```

### TTS Streaming

```typescript
function handleDelta(delta: string) {
  // 1. Append to pendingDelta
  // 2. Split pendingDelta on /[.!?]\s+/
  // 3. All chunks except last -> push to ttsQueue
  // 4. Keep last chunk in pendingDelta
  // 5. If !isPlaying, processTtsQueue()
}

async function processTtsQueue() {
  // 1. isPlaying = true
  // 2. Dequeue first sentence
  // 3. Send SSML over Edge TTS WebSocket
  // 4. Collect binary MP3 frames
  // 5. Write to temp file (os.tmpdir()/opencode-voice-*.mp3)
  // 6. Play via:
  //    powershell -c "Add-Type -AssemblyName presentationCore;
  //      $m=New-Object System.Windows.Media.MediaPlayer;
  //      $m.Open('TMPFILE'); $m.Play();
  //      Start-Sleep $m.NaturalDuration.TimeSpan.TotalSeconds"
  // 7. Delete temp file
  // 8. If queue not empty -> goto 2
  // 9. isPlaying = false
}
```

### Edge TTS WebSocket

Connection URL:
```
wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1
  ?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4
  &ConnectionId={uuid-no-dashes}
  &Sec-MS-GEC={sha256-of-(timestamp+token)}
  &Sec-MS-GEC-Version=1-143.0.3650.75
```

Headers:
```
Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold
Cookie: muid={32-char-random-hex}
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...
```

Protocol:
1. Send `Path:speech.config` (JSON with outputFormat MP3)
2. Send `Path:ssml` with `<speak><voice name='en-US-JennyNeural'><prosody>TEXT</prosody></voice></speak>`
3. Receive binary messages: extract MP3 after 2-byte header length
4. On `turn.end` text message: send next sentence's SSML or close

### Whisper Model Auto-Download

On first plugin load, if model file doesn't exist:

1. Create `~/.config/opencode/voice-models/`
2. Download `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin`
3. Save to `voice-models/ggml-tiny.en.bin` (~75 MB)
4. Load with `createWhisperContext({ model: MODEL_PATH, use_gpu: false })`

### Sox Recording

Spawn:
```
sox -t waveaudio default -q --buffer 1024 -t raw -r 16000 -e signed -b 16 -c 1 -
```

Pipe stdout -> Node.js stream. On `data` event, push Int16Array chunks to
`audioChunks` buffer.

Kill on dispose.

### Response Text Cleanup

Before TTS, strip:
- Code blocks (```...```)
- Inline code (`...`)
- File paths
- Markdown formatting
- Tool output

Keep only plain text sentences.

## Edge Cases

| Situation | Handling |
|-----------|----------|
| Sox not installed | Log error + disable voice, print install command |
| Model download fails | Retry 3x with backoff, then log error |
| No speech detected | Stay listening, discard buffer periodically |
| STT returns empty | Don't send, resume listening |
| Server down | Wait + retry health check |
| TTS WS fails | Fall back to no audio (silent response) |
| Overlapping speech | Queue sentences, play sequentially |
| Plugin hot-reload | Dispose kills sox, frees whisper, closes WS |
| User speaks during TTS playback | Current utterance finishes, then new one processed |
