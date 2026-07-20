import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

let counter = 0;

export function playMp3(audioData: Uint8Array): Promise<void> {
  if (audioData.length === 0) return Promise.resolve();

  const tmpFile = join(tmpdir(), `opencode-speak-${Date.now()}-${counter++}.mp3`);
  writeFileSync(tmpFile, audioData);

  const psScript = `
Add-Type -AssemblyName presentationCore;
$m = New-Object System.Windows.Media.MediaPlayer;
$m.Open('${tmpFile.replace(/\\/g, "\\\\").replace(/'/g, "''")}');
$m.Play();
Start-Sleep -Seconds ($m.NaturalDuration.TimeSpan.TotalSeconds + 0.5);
  `.trim();

  return new Promise((resolve, reject) => {
    try {
      execFileSync("powershell", ["-NoProfile", "-Command", psScript], {
        timeout: 120_000,
        windowsHide: true,
      });
    } catch (err) {
      try { unlinkSync(tmpFile); } catch {}
      reject(err);
      return;
    }
    try { unlinkSync(tmpFile); } catch {}
    resolve();
  });
}
