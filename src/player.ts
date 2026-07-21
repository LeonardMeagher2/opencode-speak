import { spawn, type ChildProcess } from "node:child_process";

/*
 * Platform audio players:
 *
 * Windows: PowerShell 5.1+ with System.Windows.Media.MediaPlayer
 *   - Ships with Windows, no install needed
 *   - Supports MP3, WAV, WMA, and other formats via Windows Media Foundation
 *   - Invoked as: powershell -c "MediaPlayer script..."
 *
 * macOS: afplay
 *   - Ships with macOS, no install needed
 *   - Supports MP3, WAV, AAC, and other formats via Core Audio
 *   - Invoked as: afplay <file> [-v <volume>]
 *
 * Linux: mpg123
 *   - Common package, install with: apt install mpg123 / pacman -S mpg123
 *   - Supports MP3 only via libmpg123
 *   - Invoked as: mpg123 <file>
 *   - Fallback: aplay (part of alsa-utils, WAV only)
 */

function playFile(filePath: string, volume = 0.5): ChildProcess {
  if (process.platform === "win32") {
    const escaped = filePath.replace(/'/g, "''");
    const cmd = [
      `Add-Type -AssemblyName presentationCore`,
      `$p = New-Object system.windows.media.mediaplayer`,
      `$p.open('${escaped}')`,
      `$p.Volume = ${volume}`,
      `$p.Play()`,
      `Start-Sleep 1`,
      `Start-Sleep -s $p.NaturalDuration.TimeSpan.TotalSeconds`,
      `Exit`,
    ].join("; ");
    return spawn("powershell", ["-c", cmd], { stdio: "ignore" });
  }
  if (process.platform === "darwin") {
    return spawn("afplay", [filePath, "-v", String(volume)], { stdio: "ignore" });
  }
  return spawn("mpg123", [filePath], { stdio: "ignore" });
}

export interface PlayHandle {
  stop(): void;
}

export function play(filePath: string): PlayHandle {
  const proc = playFile(filePath);
  return {
    stop() {
      try { proc.kill(); } catch {}
    },
  };
}
