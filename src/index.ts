import type { Plugin } from "@opencode-ai/plugin";
import { startCapture, stopCapture } from "./vad";
import { initWhisper, transcribe, freeWhisper } from "./stt";
import { closeTTS, speak } from "./tts";
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

export const VoiceModePlugin: Plugin = async ({ client }) => {
  if (initialized) return {};
  initialized = true;

  try {
    promptAsync = client.session.promptAsync.bind(client.session);

    await initWhisper();

    const sess = await client.session.create({});
    if (sess.error) { console.error("[opencode-speak] Session create failed:", sess.error); return {}; }
    sessionID = sess.data.id;

    startVoice();
  } catch (err) {
    console.error("[opencode-speak] Init error:", err);
  }

  return {
    dispose: async () => {
      stopCapture();
      freeWhisper();
      closeTTS();
      initialized = false;
      active = false;
    },

    event: async ({ event }) => {
      switch (event.type) {
        case "tui.command.execute": {
          if (event.properties.command === "voice") toggleVoice();
          break;
        }
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
        console.error("[opencode-speak] promptAsync error:", result.error);
        phase = "listening";
        return;
      }

      phase = "waiting";
    } catch (err) {
      console.error("[opencode-speak] Transcribe error:", err);
      phase = "listening";
    }
  });

  phase = "listening";
  console.log("[opencode-speak] Listening...");
}

function stopVoice(): void {
  if (!active) return;
  active = false;
  stopCapture();
  sentenceQueue = [];
  pendingDelta = "";
  phase = "idle";
  console.log("[opencode-speak] Stopped");
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
    console.error("[opencode-speak] TTS error:", err);
  }

  if (sentenceQueue.length > 0) {
    playNext();
  } else {
    isPlaying = false;
    if (phase === "waiting") phase = "listening";
  }
}
