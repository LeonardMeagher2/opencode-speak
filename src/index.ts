import type { Plugin } from "@opencode-ai/plugin";
import { startCapture, stopCapture, setOnChunk, setMicError } from "./vad";
import { initWhisper, waitForWhisper, transcribeBuffer, freeWhisper, setWhisperStatus } from "./stt";
import { init, isInitialized, isActive, isWaiting, setSessionID, setAgent, setActive, setWaiting, sendText, reset, log } from "./state";

const VoiceModePlugin: Plugin = async ({ client, directory }) => {
  if (isInitialized()) return {};
  init(client);

  initBg();

  return {
    dispose: async () => {
      stopCapture();
      freeWhisper();
      reset();
    },

    event: async ({ event }: any) => {
      if (event.type === "message.updated") {
        const info = event.properties.info;
        if (info?.agent) setAgent(info.agent);
        else if (info?.mode) setAgent(info.mode);
      } else if (event.type === "session.idle") {
        setWaiting(false);
      }
    },

    "command.execute.before": async (input: any, output: any) => {
      if (input.command === "voice") {
        if (input.sessionID) setSessionID(input.sessionID);
        try {
          toggleVoice();
          output.parts = [];
        } catch (err) {
          output.parts = [{ type: "text", text: `voice error: ${err instanceof Error ? err.message : err}` }];
        }
      }
    },
  };
};

async function initBg(): Promise<void> {
  try {
    setWhisperStatus((msg) => log(msg));
    setMicError((msg) => log(msg));

    initWhisper();
    await waitForWhisper();
    log("models ready");
  } catch (err) {
    await log(`initBg error: ${err instanceof Error ? err.message : err}`);
  }
}

function transcribeChunk(raw: Buffer): void {
  transcribeBuffer(raw).then((text) => {
    if (!text || text.length < 2) return;
    log(`heard: "${text}"`);
    try {
      sendText(text);
    } catch (err) {
      log(`send error: ${err instanceof Error ? err.message : err}`);
    }
  }).catch((err) => log(`STT error: ${err}`));
}

function startVoice(): void {
  if (isActive()) return;
  setActive(true);
  log("voice: on");
  setOnChunk(transcribeChunk);
  startCapture();
}

function stopVoice(): void {
  if (!isActive()) return;
  setActive(false);
  stopCapture();
  setOnChunk(() => {});
  log("voice: off");
}

function toggleVoice(): void {
  if (isActive()) stopVoice();
  else startVoice();
}

export default VoiceModePlugin;
