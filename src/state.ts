let _initialized = false;
let _active = false;
let _waiting = false;
let _chatSessionID: string | null = null;
let _currentAgent: string | null = null;
let _promptAsync: Function | null = null;
let _clientRef: any = null;

export function init(client: any): void {
  _clientRef = client;
  _promptAsync = client.session.promptAsync.bind(client.session);
  _initialized = true;
}

export function isInitialized(): boolean { return _initialized; }
export function isActive(): boolean { return _active; }
export function isWaiting(): boolean { return _waiting; }
export function getSessionID(): string | null { return _chatSessionID; }

export function setSessionID(id: string): void { _chatSessionID = id; }
export function setAgent(name: string | null): void { _currentAgent = name; }
export function setActive(v: boolean): void { _active = v; }
export function setWaiting(v: boolean): void { _waiting = v; }

export function reset(): void {
  _active = false;
  _waiting = false;
  _chatSessionID = null;
  _currentAgent = null;
}

export function sendText(text: string): void {
  if (!text || !_chatSessionID || !_promptAsync) return;
  (async () => {
    if (_waiting) {
      try { await _clientRef.session.abort({ path: { id: _chatSessionID } }); } catch {}
      _waiting = false;
    }
    _waiting = true;
    try {
      await _promptAsync({
        path: { id: _chatSessionID },
        body: { parts: [{ type: "text", text }], agent: _currentAgent ?? undefined },
      });
    } catch {}
  })();
}

export async function abort(): Promise<void> {
  if (!_chatSessionID || !_clientRef) return;
  _waiting = false;
  try {
    await _clientRef.session.abort({ path: { id: _chatSessionID } });
  } catch {}
}

export async function log(msg: string): Promise<void> {
  if (!_clientRef) return;
  try {
    await _clientRef.app.log({ body: { service: "opencode-speak", level: "info", message: msg } });
  } catch {}
}
