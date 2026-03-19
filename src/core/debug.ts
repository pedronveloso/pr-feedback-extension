export type DebugLogLevel = 'info' | 'warn' | 'error';
export type DebugLogSource = 'content' | 'popup' | 'background';

export interface DebugLogPayload {
  event: string;
  level?: DebugLogLevel;
  source?: DebugLogSource;
  detail?: string;
}

type DebugLogger = (entry: DebugLogPayload) => void;

let debugLogger: DebugLogger = () => {};

export function setDebugLogger(logger: DebugLogger): void {
  debugLogger = logger;
}

export function debugLog(entry: DebugLogPayload): void {
  debugLogger(entry);
}
