import {
  createWhisperContext,
  transcribeAsync,
  type WhisperContext,
} from "whisper-cpp-node";
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { get } from "node:https";

const MODEL_DIR = join(homedir(), ".config", "opencode", "voice-models");
const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin";
const MODEL_PATH = join(MODEL_DIR, "ggml-tiny.en.bin");

let ctx: WhisperContext | null = null;
let onStatus: ((msg: string) => void) | null = null;

export function setWhisperStatus(cb: (msg: string) => void): void {
  onStatus = cb;
}

export async function initWhisper(): Promise<void> {
  if (ctx) return;
  if (!existsSync(MODEL_PATH)) {
    onStatus?.("Downloading whisper model (75 MB)...");
    await downloadModel();
  }
  ctx = createWhisperContext({ model: MODEL_PATH, use_gpu: false });
}

export function freeWhisper(): void {
  if (ctx) {
    ctx.free();
    ctx = null;
  }
}

export async function transcribe(pcm: Int16Array): Promise<string> {
  if (!ctx) throw new Error("Whisper not initialized");

  const float32 = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    float32[i] = pcm[i] / 32768;
  }

  const result = await transcribeAsync(ctx, {
    pcmf32: float32,
    language: "en",
    n_threads: 4,
  });

  return (
    result.segments
      ?.map((s: { text: string }) => s.text)
      .join(" ")
      .trim() ?? ""
  );
}

function downloadModel(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!existsSync(MODEL_DIR)) mkdirSync(MODEL_DIR, { recursive: true });

    const file = createWriteStream(MODEL_PATH);
    const request = get(MODEL_URL, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        get(response.headers.location!, (res) => res.pipe(file));
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        onStatus?.("Model downloaded");
        resolve();
      });
    });

    request.on("error", () => {
      file.close();
      reject(new Error("Model download failed"));
    });
  });
}
