import { createRequire } from "node:module";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { log } from "../state";
import type { TtsAdapter } from "../types";

const _req = createRequire(import.meta.url);

export function createTinyTts(): TtsAdapter {
  let _tts: any = null;
  let _player: any = null;
  let _speed = 1.0;
  let _tmpFile: string | null = null;

  function getTts() {
    if (!_tts) {
      const TinyTTS = _req("tiny-tts");
      _tts = new TinyTTS();
    }
    return _tts;
  }

  function getPlayer() {
    if (!_player) _player = _req("node-wav-player");
    return _player;
  }

  function doStop() {
    try { getPlayer().stop(); } catch {}
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
        const file = join(tmpdir(), `speak-${Date.now()}.wav`);
        await tts.speak(text, { output: file, speed: _speed });
        _tmpFile = file;
        await getPlayer().play({ path: file });
      } catch (err) {
        log(`TTS error: ${err instanceof Error ? err.message : err}`);
      }
    },

    stop: doStop,

    setSpeed(speed: number) { _speed = speed; },

    getSettings() { return { speed: _speed }; },

    dispose() {
      doStop();
      _tts = null;
      _player = null;
    },
  };
}
