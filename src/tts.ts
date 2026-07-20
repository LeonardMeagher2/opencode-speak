import { createRequire } from "node:module";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { log } from "./state";

const _req = createRequire(import.meta.url);

let _tmpFile: string | null = null;
let _tts: any = null;
let _player: any = null;
let _speed = 1.0;
let _speaker = "MALE";

function getTts(): any {
  if (!_tts) {
    const TinyTTS = _req("tiny-tts");
    _tts = new TinyTTS();
  }
  return _tts;
}

function getPlayer(): any {
  if (!_player) _player = _req("node-wav-player");
  return _player;
}

export async function speakText(text: string): Promise<void> {
  if (!text) return;
  stopVoice();
  try {
    const tts = getTts();
    const file = join(tmpdir(), `speak-${Date.now()}.wav`);
    await tts.speak(text, { output: file, speed: _speed, speaker: _speaker });
    _tmpFile = file;
    await getPlayer().play({ path: file });
  } catch (err) {
    log(`TTS error: ${err instanceof Error ? err.message : err}`);
    stopVoice();
  }
}

export function setSpeed(speed: number): void { _speed = speed; }
export function setSpeaker(speaker: string): void { _speaker = speaker; }
export function getVoiceSettings(): { speed: number; speaker: string } {
  return { speed: _speed, speaker: _speaker };
}

export function stopVoice(): void {
  try { getPlayer().stop(); } catch {}
  if (_tmpFile) {
    try { unlinkSync(_tmpFile); } catch {}
    _tmpFile = null;
  }
}
