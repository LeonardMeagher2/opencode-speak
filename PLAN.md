# Production Readiness Plan

## Phase 1 — Cleanup
- [ ] Remove unused `player.ts`
- [ ] Remove dead `_speaker` / `setSpeaker` from `tts.ts`
- [ ] Clean up error handling: no more bare `catch {}`

## Phase 2 — Toast Notifications
- [ ] Add `showToast()` to `state.ts` wrapping `client.tui.showToast()`
- [ ] Replace key status logs with toasts (model download progress, ready, voice on/off, errors)
- [ ] Keep `heard:` and chat-relevant logs as logs

## Phase 3 — Configuration & Options
- [ ] Accept plugin options from `opencode.json` (silence_ms, vad_threshold, model, speed)
- [ ] Plumb options through to VAD, STT, TTS modules

## Phase 4 — Cross-Platform
- [ ] Add sox device detection (Windows waveaudio, macOS coreaudio, Linux pulse)
- [ ] Graceful error if sox not found
- [ ] Document prerequisites in README

## Phase 5 — Race Conditions
- [ ] Handle `message.part.updated` arriving before `message.updated` (first assistant text may be missed)

## Phase 6 — Packaging
- [ ] Write README with install, config, prerequisites
- [ ] Add LICENSE
- [ ] Handle `voice.md` command deployment from npm package
