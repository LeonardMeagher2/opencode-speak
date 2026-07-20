# opencode-speak

Voice mode plugin for [opencode](https://opencode.ai) — speak to your AI
assistant hands-free. Works on **Windows** (audio capture via sox + WaveAPI,
playback via Windows MediaPlayer).

## Features

- Continuous mic listening with energy-based VAD (voice activity detection)
- Local STT via `whisper-cpp-node` (tiny.en model, ~75 MB)
- Streaming TTS via Edge TTS free API (JennyNeural voice)
- Sentence-by-sentence playback as deltas arrive
- Fully automatic: plugin loads, mic activates, talk and hear responses

## Prerequisites

| Requirement | Windows | macOS / Linux |
|---|---|---|
| **Audio driver** | [sox](https://sourceforge.net/projects/sox/files/sox/) | WaveAPI not available — port needed |
| **TTS playback** | Built-in (PowerShell MediaPlayer) | Port needed |
| **opencode** | v1.18+ | v1.18+ |

## Install

### From npm (future)

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-speak"]
}
```

### From source (local dev)

```powershell
git clone https://github.com/LeonardMeagher2/opencode-speak.git
cd opencode-speak
bun install
bun run dev
```

OpenCode auto-loads `.opencode/plugins/` project-level plugins — just run
`opencode serve` from this directory.

## Usage

1. Start the opencode server: `opencode serve`
2. Wait for the whisper model to download (first run only, ~75 MB)
3. Talk to your mic — after 1.2 s of silence the utterance is sent
4. Hear the response spoken back sentence-by-sentence

## Commands

| Command | Description |
|---------|-------------|
| `bun run build` | TypeScript compile to `dist/` (npm publish) |
| `bun run dev` | Bundle to `.opencode/plugins/opencode-speak.js` |

## Platform Portability

Currently Windows-only. The audio pipeline uses:

- **Capture**: `sox` with `waveaudio` driver (Windows WaveAPI)
- **Playback**: `System.Windows.Media.MediaPlayer` via PowerShell

To port to macOS/Linux, swap:

- **macOS**: `sox -t coreaudio` for capture, `afplay` for playback
- **Linux**: `sox -t alsa` or `parec` for capture, `aplay` / `paplay` for playback

The STT (whisper-cpp-node) and TTS (Edge TTS WebSocket) layers are
cross-platform already.
