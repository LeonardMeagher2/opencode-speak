import { createHmac, randomUUID } from "node:crypto";

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const VOICE = "en-US-JennyNeural";
const WS_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

let ws: WebSocket | null = null;
let connectionId = "";

function makeId(): string {
  return randomUUID().replace(/-/g, "");
}

function buildToken(dateStr: string): string {
  return createHmac("sha256", TOKEN).update(dateStr).digest("hex").toUpperCase();
}

function formatDate(): string {
  const d = new Date();
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0);
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2,"0")} ${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}:${String(d.getUTCSeconds()).padStart(2,"0")} GMT+0000`;
}

function wsUrl(): string {
  const cid = makeId();
  connectionId = cid;
  const gec = buildToken(formatDate());
  return `${WS_URL}?TrustedClientToken=${TOKEN}&ConnectionId=${cid}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-143.0.3650.75`;
}

function connect(): WebSocket {
  if (ws && ws.readyState === WebSocket.OPEN) return ws;

  const url = wsUrl();
  const cid = makeId();

  ws = new WebSocket(url);

  ws.addEventListener("open", () => {
    sendConfig();
  });

  ws.addEventListener("error", (err: Event) => {
    console.error("[opencode-speak] TTS WS error");
  });

  ws.addEventListener("close", () => {
    ws = null;
  });

  return ws;
}

export function closeTTS(): void {
  if (ws) {
    ws.close();
    ws = null;
  }
}

function sendConfig(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const config = {
    context: {
      synthesis: { audio: { outputFormat: "audio-24khz-48kbitrate-mono-mp3" } },
    },
  };
  const header = "Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n";
  ws.send(header + JSON.stringify(config));
}

export function speak(text: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const socket = connect();
    if (socket.readyState === WebSocket.CONNECTING) {
      socket.addEventListener("open", () => doSsml(text, socket, resolve, reject), { once: true });
    } else if (socket.readyState === WebSocket.OPEN) {
      doSsml(text, socket, resolve, reject);
    } else {
      reject(new Error("TTS WebSocket not available"));
    }
  });
}

function doSsml(
  text: string,
  socket: WebSocket,
  resolve: (data: Uint8Array) => void,
  reject: (err: Error) => void,
): void {
  const clean = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/[#*_~>|]/g, "")
    .trim();

  if (!clean) {
    resolve(new Uint8Array(0));
    return;
  }

  const body =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
    `<voice name="${VOICE}"><prosody rate="0%" pitch="0%">${esc(clean)}</prosody></voice></speak>`;

  const header = `Content-Type:application/ssml+xml\r\nPath:ssml\r\nX-RequestId:${makeId()}\r\n\r\n`;

  const chunks: Uint8Array[] = [];

  const onMsg = (ev: MessageEvent) => {
    if (typeof ev.data === "string") {
      if (ev.data.includes("Path:turn.end")) {
        socket.removeEventListener("message", onMsg);
        const total = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
        let off = 0;
        for (const c of chunks) { total.set(c, off); off += c.length; }
        resolve(total);
      }
    } else if (ev.data instanceof ArrayBuffer) {
      const buf = new Uint8Array(ev.data);
      if (buf.length < 2) return;
      const hlen = buf[0] + (buf[1] << 8);
      const start = 2 + hlen;
      if (start < buf.length) chunks.push(buf.slice(start));
    } else if (ev.data instanceof Blob) {
      ev.data.arrayBuffer().then((ab) => {
        const buf = new Uint8Array(ab);
        if (buf.length < 2) return;
        const hlen = buf[0] + (buf[1] << 8);
        const start = 2 + hlen;
        if (start < buf.length) chunks.push(buf.slice(start));
      });
    }
  };

  socket.addEventListener("message", onMsg);
  socket.send(header + body);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
