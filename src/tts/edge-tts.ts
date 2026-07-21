import { EdgeTTS } from "node-edge-tts";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { log } from "../state";
import { play } from "../player";
import type { TtsAdapter } from "../types";

export function createEdgeTts(): TtsAdapter {
  let _tts: EdgeTTS | null = null;
  let _handle: { stop(): void } | null = null;
  let _tmpFile: string | null = null;
  let _speed = 1.0;

  function getTts() {
    if (!_tts) {
      _tts = new EdgeTTS({
        voice: "en-US-AriaNeural",
        rate: speedToRate(_speed),
      });
    }
    return _tts;
  }

  function speedToRate(s: number): string {
    const pct = Math.round((s - 1) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  }

  function doStop() {
    if (_handle) {
      try { _handle.stop(); } catch {}
      _handle = null;
    }
    if (_tmpFile) {
      try { unlinkSync(_tmpFile); } catch {}
      _tmpFile = null;
    }
  }

  return {
    async speak(text: string) {
      if (!text) return;
      doStop();
      try {
        const tts = getTts();
        const file = join(tmpdir(), `speak-${Date.now()}.mp3`);
        await tts.ttsPromise(text, file);
        _tmpFile = file;
        _handle = play(file);
      } catch (err) {
        log(`TTS error: ${err instanceof Error ? err.message : err}`);
      }
    },

    stop: doStop,

    setSpeed(speed: number) {
      _speed = speed;
      _tts = null;
    },

    getSettings() { return { speed: _speed }; },

    async setup() {},

    dispose() {
      doStop();
      _tts = null;
    },
  };
}
