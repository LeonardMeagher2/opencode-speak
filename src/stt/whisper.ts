import type { WhisperContext } from "whisper-cpp-node";
import { createRequire } from "node:module";
import { existsSync, statSync, rmSync, mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { get } from "node:https";
import type { SttAdapter } from "../types";

const MODEL_DIR = join(homedir(), ".config", "opencode", "voice-models");
const WHISPER_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
const WHISPER_PATH = join(MODEL_DIR, "ggml-base.en.bin");
const VAD_URL = "https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/models/for-tests-silero-v6.2.0-ggml.bin";
const VAD_PATH = join(MODEL_DIR, "ggml-silero-vad.bin");

export function createWhisper(): SttAdapter {
  const _require = createRequire(import.meta.url);
  let ctx: WhisperContext | null = null;
  let _whisper: any = null;
  let _vadCtx: any = null;
  let _initPromise: Promise<void> | null = null;

  function getWhisper() {
    if (!_whisper) _whisper = _require("whisper-cpp-node");
    return _whisper;
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
        file.on("finish", () => { file.close(); resolve(); });
        file.on("error", () => { file.close(); reject(new Error("File write failed")); });
      });
      request.on("error", () => reject(new Error("Download failed")));
    });
  }

  return {
    async init() {
      if (ctx) return;
      if (_initPromise) return _initPromise;
      _initPromise = (async () => {
        if (!existsSync(WHISPER_PATH) || statSync(WHISPER_PATH).size === 0) {
          if (existsSync(WHISPER_PATH)) rmSync(WHISPER_PATH);
          await download(WHISPER_URL, WHISPER_PATH);
        }
        const w = getWhisper();
        ctx = w.createWhisperContext({ model: WHISPER_PATH, use_gpu: true });

        if (!existsSync(VAD_PATH)) {
          await download(VAD_URL, VAD_PATH);
        }
        _vadCtx = new w.VadContextClass({ model: VAD_PATH, threshold: 0.5 });
      })();
      return _initPromise;
    },

    async transcribe(raw: Buffer) {
      if (!ctx) throw new Error("Whisper not initialized");
      if (!_vadCtx) throw new Error("VAD context not initialized");

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
    },

    getVadContext() { return _vadCtx; },

    dispose() {
      if (ctx) { ctx.free(); ctx = null; }
      _vadCtx = null;
      _whisper = null;
      _initPromise = null;
    },
  };
}
