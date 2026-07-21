export interface TtsAdapter {
  speak(text: string): Promise<void>;
  stop(): void;
  setSpeed(speed: number): void;
  getSettings(): Record<string, unknown>;
  setup(): Promise<void>;
  dispose(): void;
}

export interface SttAdapter {
  init(): Promise<void>;
  transcribe(raw: Buffer): Promise<string>;
  getVadContext(): any;
  dispose(): void;
}
