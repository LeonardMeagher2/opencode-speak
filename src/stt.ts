import type { WhisperContext } from "whisper-cpp-node";
import { createRequire } from "node:module";
import { existsSync, statSync, rmSync, mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { get } from "node:https";

const MODEL_DIR = join(homedir(), ".config", "opencode", "voice-models");
const WHISPER_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
const WHISPER_PATH = join(MODEL_DIR, "ggml-base.en.bin");
const VAD_URL = "https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/models/for-tests-silero-v6.2.0-ggml.bin";
const VAD_PATH = join(MODEL_DIR, "ggml-silero-vad.bin");

let ctx: WhisperContext | null = null;
let onStatus: ((msg: string) => void) | null = null;
let _whisper: any = null;
function getWhisper(): any {
  if (!_whisper) {
    const _require = createRequire(import.meta.url);
    _whisper = _require("whisper-cpp-node");
  }
  return _whisper;
}

let _vadCtx: any = null;

export function getVadContext(): any {
  if (_vadCtx) return _vadCtx;
  if (!existsSync(VAD_PATH)) return null;
  const w = getWhisper();
  _vadCtx = new w.VadContextClass({ model: VAD_PATH, threshold: 0.5 });
  return _vadCtx;
}

export function setWhisperStatus(cb: (msg: string) => void): void {
  onStatus = cb;
}

export function initWhisper(): void {
  if (ctx || _wReady) return;
  _wReady = (async () => {
    if (!existsSync(WHISPER_PATH) || statSync(WHISPER_PATH).size === 0) {
      if (existsSync(WHISPER_PATH)) rmSync(WHISPER_PATH);
      onStatus?.("Downloading whisper model (75 MB)...");
      await download(WHISPER_URL, WHISPER_PATH);
    }
    const w = getWhisper();
    ctx = w.createWhisperContext({ model: WHISPER_PATH, use_gpu: true });
  })();
}

let _wReady: Promise<void> | null = null;

export function waitForWhisper(): Promise<void> {
  if (ctx) return Promise.resolve();
  if (!_wReady) initWhisper();
  return _wReady ?? Promise.resolve();
}

export function freeWhisper(): void {
  if (ctx) { ctx.free(); ctx = null; }
}

export async function transcribeBuffer(raw: Buffer): Promise<string> {
  if (!ctx) throw new Error("Whisper not initialized");

  const samples = raw.length / 2;
  const float32 = new Float32Array(samples);
  for (let i = 0; i < samples; i++) float32[i] = raw.readInt16LE(i * 2) / 32768;

  const w = getWhisper();
  const result = await w.transcribeAsync(ctx, {
    pcmf32: float32,
    language: "en",
    n_threads: 4,
    vad: true,
    vad_model: VAD_PATH,
  });

  return (
    result.segments
      ?.map((s: { text: string }) => s.text)
      .join(" ")
      .trim() ?? ""
  );
}

function download(url: string, dest: string, depth = 0): Promise<void> {
  if (depth > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const loc = response.headers.location;
        if (!loc) { reject(new Error("Redirect with no location")); return; }
        download(loc, dest, depth + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }
      if (!existsSync(MODEL_DIR)) mkdirSync(MODEL_DIR, { recursive: true });
      const file = createWriteStream(dest);
      response.pipe(file);
      file.on("finish", () => { file.close(); onStatus?.("Model downloaded"); resolve(); });
      file.on("error", () => { file.close(); reject(new Error("File write failed")); });
    });
    request.on("error", () => reject(new Error("Download failed")));
  });
}
