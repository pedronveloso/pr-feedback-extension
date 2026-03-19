export type DebugLogLevel = 'info' | 'warn' | 'error';
export type DebugLogSource = 'content' | 'popup' | 'background';

export interface DebugLogPayload {
  event: string;
  level?: DebugLogLevel;
  source?: DebugLogSource;
  detail?: string;
}

const MAX_DEBUG_DETAIL_LENGTH = 500;
const URL_PATTERN = /https?:\/\/[^\s"'`<>]+/g;

type DebugLogger = (entry: DebugLogPayload) => void;

let debugLogger: DebugLogger = () => {};

export function setDebugLogger(logger: DebugLogger): void {
  debugLogger = logger;
}

export function debugLog(entry: DebugLogPayload): void {
  debugLogger(entry);
}

export function sanitizeDebugDetail(detail?: string): string | undefined {
  if (!detail) {
    return undefined;
  }

  const sanitized = detail.replace(URL_PATTERN, '[redacted-url]').trim();
  if (!sanitized) {
    return undefined;
  }

  if (sanitized.length <= MAX_DEBUG_DETAIL_LENGTH) {
    return sanitized;
  }

  return `${sanitized.slice(0, MAX_DEBUG_DETAIL_LENGTH - 14)}...[truncated]`;
}
