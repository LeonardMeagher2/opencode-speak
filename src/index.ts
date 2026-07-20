import { Plugin, tool } from "@opencode-ai/plugin";
import { startCapture, stopCapture, setOnChunk, setMicError } from "./vad";
import { initWhisper, waitForWhisper, transcribeBuffer, freeWhisper, setWhisperStatus } from "./stt";
import { init, isInitialized, isActive, isWaiting, setSessionID, setAgent, setActive, setWaiting, sendText, reset, log, getSessionID } from "./state";
import { speakText, stopVoice as stopTts, setSpeed, getVoiceSettings } from "./tts";

const _spokenTexts = new Map<string, string>();
const _assistantMsgs = new Set<string>();

const VoiceModePlugin: Plugin = async ({ client, directory }) => {
  if (isInitialized()) return {};
  init(client);

  initBg();

  return {
    dispose: async () => {
      stopTts();
      stopCapture();
      freeWhisper();
      reset();
    },

    event: async ({ event }: any) => {
      const p = event.properties;
      if (event.type === "message.updated") {
        const info = p.info;
        if (info?.sessionID) setSessionID(info.sessionID);
        if (info?.agent) setAgent(info.agent);
        else if (info?.mode) setAgent(info.mode);
        if (info?.role === "assistant" && info?.id) _assistantMsgs.add(info.id);
      } else if (event.type === "session.idle") {
        setWaiting(false);
        if (isActive() && _spokenTexts.size) flushSpokenTexts();
        _spokenTexts.clear();
        _assistantMsgs.clear();
      } else if (event.type === "message.part.updated") {
        const part = p.part;
        if (!part?.type || !isActive() || p.sessionID !== getSessionID() || !_assistantMsgs.has(part.messageID)) return;
        if (part.type === "text" && part.text) {
          _spokenTexts.set(part.id, part.text);
        } else if (_spokenTexts.size) {
          flushSpokenTexts();
        }
      }
    },

    tool: {
      voice_settings: tool({
        description: "Get or set voice speed. Call with no arguments to view current speed. Speed 1.0 is normal, higher is faster.",
        args: {
          speed: tool.schema.number().optional().describe("Speed multiplier (1.0 = normal)")
        },
        execute: async (args: any) => {
          if (args.speed !== undefined) {
            if (args.speed <= 0) return "Invalid speed.";
            setSpeed(args.speed);
          }
          return `Current speed: ${getVoiceSettings().speed}`;
        }
      })
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
  } catch (err) {
    log(`initBg error: ${err instanceof Error ? err.message : err}`);
  }
}

function flushSpokenTexts(): void {
  for (const [, text] of _spokenTexts) {
    const trimmed = text.trim();
    if (trimmed) speakText(trimmed);
  }
  _spokenTexts.clear();
}

function transcribeChunk(raw: Buffer): void {
  transcribeBuffer(raw).then((text) => {
    if (!text || text.length < 2) return;
    log(`heard: "${text}"`);
    stopTts();
    _spokenTexts.clear();
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
  stopTts();
  stopCapture();
  setOnChunk(() => {});
  log("voice: off");
}

function toggleVoice(): void {
  if (isActive()) stopVoice();
  else startVoice();
}

export default VoiceModePlugin;
