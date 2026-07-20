import type { Plugin } from "@opencode-ai/plugin";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { startCapture, stopCapture, setVadError } from "./vad";
import { initWhisper, transcribe, freeWhisper, setWhisperStatus } from "./stt";
import { closeTTS, speak, setTtsError } from "./tts";
import { playMp3 } from "./player";

type Phase = "idle" | "listening" | "transcribing" | "waiting";

let sessionID: string | null = null;
let phase: Phase = "idle";
let pendingDelta = "";
let sentenceQueue: string[] = [];
let isPlaying = false;
let initialized = false;
let active = false;
let promptAsync: Function | null = null;
let commandFile = "";
let clientRef: any = null;

async function showToast(
  message: string,
  variant: "info" | "success" | "warning" | "error" = "info",
  title?: string,
  duration?: number,
): Promise<void> {
  if (!clientRef) return;
  try {
    await clientRef.tui.showToast({ body: { title, message, variant, duration } });
  } catch {}
}

export const VoiceModePlugin: Plugin = async ({ client, directory }) => {
  if (initialized) return {};
  initialized = true;
  clientRef = client;
  promptAsync = client.session.promptAsync.bind(client.session);

  commandFile = join(directory, ".opencode", "commands", "voice.md");
  try {
    mkdirSync(join(directory, ".opencode", "commands"), { recursive: true });
    writeFileSync(commandFile, `---\ndescription: Toggle voice mode on/off\n---\n`);
  } catch {}

  try {
    setWhisperStatus((msg) => showToast(msg, "info", "opencode-speak", 5000));
    setVadError((msg) => showToast(msg, "error", "opencode-speak"));
    setTtsError((msg) => showToast(msg, "error", "opencode-speak"));

    await initWhisper();

    const sess = await client.session.create({});
    if (sess.error) {
      await showToast("Voice mode: session create failed", "error", "opencode-speak");
      return {};
    }
    sessionID = sess.data.id;

    startVoice();
  } catch (err) {
    await showToast(`Init failed: ${err instanceof Error ? err.message : err}`, "error", "opencode-speak");
  }

  return {
    dispose: async () => {
      stopCapture();
      freeWhisper();
      closeTTS();
      initialized = false;
      active = false;
      try { unlinkSync(commandFile); } catch {}
    },

    event: async ({ event }) => {
      switch (event.type) {
        case "message.part.updated": {
          const { part, delta } = event.properties;
          if (part.sessionID !== sessionID) return;
          if (part.type === "text" && delta) onDelta(delta);
          break;
        }
        case "session.idle": {
          if (event.properties.sessionID !== sessionID) return;
          flushPending();
          break;
        }
      }
    },

    "command.execute.before": async (input, output) => {
      if (input.command === "voice") {
        toggleVoice();
        output.parts = [];
      }
    },
  };
};

function startVoice(): void {
  if (active) return;
  active = true;

  startCapture(async (pcm) => {
    if (phase !== "listening") return;
    phase = "transcribing";

    try {
      const text = await transcribe(pcm);
      if (!text || text.length < 2) { phase = "listening"; return; }

      const result = await promptAsync!({
        path: { id: sessionID! },
        body: { parts: [{ type: "text", text }] },
      });

      if (result.error) {
        await showToast("Failed to send prompt", "error", "opencode-speak");
        phase = "listening";
        return;
      }

      phase = "waiting";
    } catch (err) {
      await showToast(`Transcribe error: ${err instanceof Error ? err.message : err}`, "error", "opencode-speak");
      phase = "listening";
    }
  });

  phase = "listening";
  showToast("Voice mode: listening", "info", "opencode-speak", 2000);
}

function stopVoice(): void {
  if (!active) return;
  active = false;
  stopCapture();
  sentenceQueue = [];
  pendingDelta = "";
  phase = "idle";
  showToast("Voice mode stopped", "info", "opencode-speak", 2000);
}

function toggleVoice(): void {
  if (active) stopVoice();
  else startVoice();
}

function onDelta(delta: string): void {
  pendingDelta += delta;
  const parts = pendingDelta.split(/(?<=[.!?])\s+/);
  if (parts.length <= 1) return;
  for (let i = 0; i < parts.length - 1; i++) {
    const s = parts[i].trim();
    if (s) sentenceQueue.push(s);
  }
  pendingDelta = parts[parts.length - 1];
  if (!isPlaying) playNext();
}

function flushPending(): void {
  if (pendingDelta.trim()) {
    sentenceQueue.push(pendingDelta.trim());
    pendingDelta = "";
  }
  if (!isPlaying) playNext();
}

async function playNext(): Promise<void> {
  if (sentenceQueue.length === 0) {
    isPlaying = false;
    if (phase === "waiting") phase = "listening";
    return;
  }

  isPlaying = true;
  const text = sentenceQueue.shift()!;

  try {
    const mp3 = await speak(text);
    if (mp3.length > 0) await playMp3(mp3);
  } catch (err) {
    await showToast(`TTS error: ${err instanceof Error ? err.message : err}`, "error", "opencode-speak");
  }

  if (sentenceQueue.length > 0) {
    playNext();
  } else {
    isPlaying = false;
    if (phase === "waiting") phase = "listening";
  }
}
