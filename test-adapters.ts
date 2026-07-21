import type { TtsAdapter } from "./src/types";
import { createTinyTts } from "./src/tts/tiny-tts";
import { createEdgeTts } from "./src/tts/edge-tts";

async function testAdapter(name: string, tts: TtsAdapter) {
  console.log(`\n=== Testing ${name} ===`);
  console.log("  setup...");
  await tts.setup();
  console.log("  speaking...");
  await tts.speak(`This is a test of the ${name} adapter.`);
  console.log("  playback started, waiting 3 seconds...");
  await new Promise((r) => setTimeout(r, 3000));
  console.log("  stopping...");
  tts.stop();
  console.log("  stopped");
  tts.dispose();
}

async function main() {
  console.log("Testing TTS adapters...\n");

  console.log("--- tiny-tts ---");
  const tiny = createTinyTts();
  await testAdapter("tiny-tts", tiny);

  await new Promise((r) => setTimeout(r, 1000));

  console.log("\n--- edge-tts ---");
  const edge = createEdgeTts();
  await testAdapter("edge-tts", edge);

  console.log("\nDone!");
}

main().catch(console.error);
