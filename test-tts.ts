import { speakBuffer, bufferText, stopVoice } from "./src/tts";

async function main() {
  const text = process.argv.slice(2).join(" ") || "Hello, this is a test of the text to speech system.";
  console.log(`Testing TTS with: "${text}"`);
  bufferText(text);
  await speakBuffer();
  console.log("Playing... wait 5s");
  await new Promise(r => setTimeout(r, 5000));
  console.log("Stopping...");
  stopVoice();
  console.log("Done");
  process.exit(0);
}

main().catch(e => { console.error("FAIL:", e); process.exit(1); });
