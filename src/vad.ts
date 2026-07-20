import { spawn, type ChildProcess } from "node:child_process";

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const FRAME_MS = 80;
const FRAME_SAMPLES = Math.floor(SAMPLE_RATE * (FRAME_MS / 1000));
const FRAME_BYTES = FRAME_SAMPLES * BYTES_PER_SAMPLE;
const SILENCE_TIMEOUT_MS = 1200;
const RMS_THRESHOLD = 0.02;

let soxProcess: ChildProcess | null = null;
let audioBuffer: Buffer[] = [];
let isSpeaking = false;
let silenceStart = 0;
let speechStart = 0;
let vadInterval: ReturnType<typeof setInterval> | null = null;
let utteranceCallback: ((pcm: Int16Array) => void) | null = null;
let onError: ((msg: string) => void) | null = null;

export function setVadError(cb: (msg: string) => void): void {
  onError = cb;
}

export function startCapture(onUtterance: (pcm: Int16Array) => void): void {
  utteranceCallback = onUtterance;
  audioBuffer = [];
  isSpeaking = false;

  soxProcess = spawn("sox", [
    "-t", "waveaudio", "default",
    "-q",
    "--buffer", "1024",
    "-t", "raw",
    "-r", String(SAMPLE_RATE),
    "-e", "signed",
    "-b", "16",
    "-c", "1",
    "-",
  ]);

  soxProcess.stdout?.on("data", (chunk: Buffer) => {
    audioBuffer.push(chunk);
  });

  soxProcess.stderr?.on("data", () => {});

  soxProcess.on("error", (err: Error) => {
    onError?.(`Sox error: ${err.message}`);
  });

  soxProcess.on("exit", (code: number | null) => {
    if (code !== 0 && code !== null) {
      onError?.(`Sox exited with code ${code}`);
    }
  });

  vadInterval = setInterval(processVad, FRAME_MS);
}

export function stopCapture(): void {
  if (vadInterval !== null) {
    clearInterval(vadInterval);
    vadInterval = null;
  }
  if (soxProcess && !soxProcess.killed) {
    soxProcess.kill();
  }
  soxProcess = null;
  audioBuffer = [];
  isSpeaking = false;
  utteranceCallback = null;
}

function processVad(): void {
  if (!utteranceCallback) return;

  const totalBytes = audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
  if (totalBytes < FRAME_BYTES) return;

  const now = Date.now();
  const rms = computeRms(lastBytes(FRAME_BYTES));

  if (rms > RMS_THRESHOLD) {
    if (!isSpeaking) {
      isSpeaking = true;
      speechStart = now;
      silenceStart = 0;
    }
  } else {
    if (isSpeaking) {
      if (silenceStart === 0) {
        silenceStart = now;
      } else if (now - silenceStart >= SILENCE_TIMEOUT_MS) {
        finishUtterance();
      }
    }
  }
}

function computeRms(buf: Buffer): number {
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const sample = buf.readInt16LE(i);
    sumSq += sample * sample;
    count++;
  }
  if (count === 0) return 0;
  return Math.sqrt(sumSq / count) / 32768;
}

function lastBytes(n: number): Buffer {
  const collected = Buffer.concat(audioBuffer);
  if (collected.length <= n) return collected;
  return collected.subarray(collected.length - n);
}

function finishUtterance(): void {
  if (!utteranceCallback) return;

  const speechEndMs = silenceStart + SILENCE_TIMEOUT_MS;
  const collected = Buffer.concat(audioBuffer);
  const totalDurationMs = (collected.length / (SAMPLE_RATE * BYTES_PER_SAMPLE)) * 1000;
  const speechBytes = Math.floor(((speechEndMs - speechStart) / totalDurationMs) * collected.length);
  const speechBuffer = collected.subarray(0, Math.min(speechBytes, collected.length));
  audioBuffer = [];

  isSpeaking = false;
  silenceStart = 0;

  if (speechBuffer.length < SAMPLE_RATE * BYTES_PER_SAMPLE) return;

  const pcm = new Int16Array(speechBuffer.length / 2);
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = speechBuffer.readInt16LE(i * 2);
  }

  utteranceCallback(pcm);
}

export function isMicAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("sox", ["--version"], { stdio: ["ignore", "ignore", "ignore"] });
    proc.on("exit", (code: number | null) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}
