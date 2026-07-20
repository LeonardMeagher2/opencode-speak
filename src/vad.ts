import { spawn, type ChildProcess } from "node:child_process";

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const VAD_FRAME = 512;
const FRAME_BYTES = VAD_FRAME * BYTES_PER_SAMPLE;
const SILENCE_MS = 600;
const VAD_SPEECH = 0.3;

let soxProcess: ChildProcess | null = null;
let audioBuffer: Buffer[] = [];
let silenceStart = 0;
let onChunk: ((buf: Buffer) => void) | null = null;
let onError: ((msg: string) => void) | null = null;
let _vadCtx: any = null;

export function initVad(vadCtx: any): void { _vadCtx = vadCtx; }

function bufToF32(buf: Buffer): Float32Array {
  const samples = buf.length / 2;
  const f32 = new Float32Array(samples);
  for (let i = 0; i < samples; i++) f32[i] = buf.readInt16LE(i * 2) / 32768;
  return f32;
}

export function setOnChunk(cb: (buf: Buffer) => void): void { onChunk = cb; }
export function setMicError(cb: (msg: string) => void): void { onError = cb; }

export function startCapture(): void {
  audioBuffer = [];
  silenceStart = 0;

  const args = ["-t", "waveaudio", "default", "-t", "raw", "-r", String(SAMPLE_RATE), "-e", "signed", "-b", "16", "-c", "1", "-"];
  soxProcess = spawn("sox", args);

  let frameBuf: Buffer[] = [];
  soxProcess.stdout?.on("data", (chunk: Buffer) => {
    try {
      frameBuf.push(chunk);
      const total = frameBuf.reduce((s, b) => s + b.length, 0);
      if (total < FRAME_BYTES) return;

      const frame = Buffer.concat(frameBuf);
      frameBuf = [];
      audioBuffer.push(frame);

      if (!_vadCtx) {
        onError?.("vad ctx null");
        return;
      }

      const prob = _vadCtx.process(bufToF32(frame));

      if (prob > VAD_SPEECH) {
        silenceStart = 0;
      } else if (silenceStart === 0) {
        silenceStart = Date.now();
      } else if (Date.now() - silenceStart >= SILENCE_MS) {
        const collected = Buffer.concat(audioBuffer);
        audioBuffer = [];
        silenceStart = 0;
        if (collected.length >= SAMPLE_RATE * BYTES_PER_SAMPLE) {
          onChunk?.(collected);
        }
      }
    } catch (e) {
      onError?.(`vad error: ${e instanceof Error ? e.message : e}`);
    }
  });

  soxProcess.stderr?.on("data", () => {});
  soxProcess.on("error", (err: Error) => onError?.(`Sox error: ${err.message}`));
  soxProcess.on("exit", (code: number | null) => {
    if (code !== 0 && code !== null) onError?.(`Sox exited with code ${code}`);
  });
}

export function stopCapture(): void {
  if (soxProcess && !soxProcess.killed) soxProcess.kill();
  soxProcess = null;
  audioBuffer = [];
  silenceStart = 0;
}

export function isCapturing(): boolean {
  return soxProcess !== null && !soxProcess.killed;
}

export function isMicAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("sox", ["--version"], { stdio: ["ignore", "ignore", "ignore"] });
    proc.on("exit", (code: number | null) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}
