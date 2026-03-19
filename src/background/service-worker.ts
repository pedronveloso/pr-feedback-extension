import {
  CLEAR_DEBUG_LOGS_MESSAGE_TYPE,
  DEBUG_LOG_MESSAGE_TYPE,
  GET_DEBUG_LOGS_MESSAGE_TYPE,
  isClearDebugLogsRequest,
  isDebugLogRequest,
  isGetDebugLogsRequest,
  type DebugLogEntry,
  type DebugRuntimeErrorResponse,
  type DebugRuntimeResponse
} from '../shared/messages';

const DEBUG_LOGS_STORAGE_KEY = 'debugLogs';
const MAX_DEBUG_LOGS = 200;

let logBuffer: DebugLogEntry[] = [];
let didHydrateLogs = false;

async function hydrateLogs(): Promise<void> {
  if (didHydrateLogs || !chrome.storage?.session) {
    didHydrateLogs = true;
    return;
  }

  const stored = await chrome.storage.session.get(DEBUG_LOGS_STORAGE_KEY);
  logBuffer = Array.isArray(stored[DEBUG_LOGS_STORAGE_KEY]) ? (stored[DEBUG_LOGS_STORAGE_KEY] as DebugLogEntry[]) : [];
  didHydrateLogs = true;
}

async function persistLogs(): Promise<void> {
  if (!chrome.storage?.session) {
    return;
  }

  await chrome.storage.session.set({ [DEBUG_LOGS_STORAGE_KEY]: logBuffer });
}

async function appendLog(entry: DebugLogEntry): Promise<void> {
  await hydrateLogs();
  logBuffer = [...logBuffer, entry].slice(-MAX_DEBUG_LOGS);
  await persistLogs();
}

async function clearLogs(): Promise<void> {
  await hydrateLogs();
  logBuffer = [];

  if (chrome.storage?.session) {
    await chrome.storage.session.remove(DEBUG_LOGS_STORAGE_KEY);
  }
}

function toDebugRuntimeErrorResponse(error: unknown, fallbackMessage: string): DebugRuntimeErrorResponse {
  if (error instanceof Error && error.message.trim()) {
    return { ok: false, error: error.message.trim() };
  }

  if (typeof error === 'string' && error.trim()) {
    return { ok: false, error: error.trim() };
  }

  return { ok: false, error: fallbackMessage };
}

interface DebugLogOperations {
  appendLog(entry: DebugLogEntry): Promise<void>;
  hydrateLogs(): Promise<void>;
  clearLogs(): Promise<void>;
  getLogs(): DebugLogEntry[];
}

type DebugRuntimeSendResponse = (response: DebugRuntimeResponse) => void;

const defaultDebugLogOperations: DebugLogOperations = {
  appendLog,
  hydrateLogs,
  clearLogs,
  getLogs: () => logBuffer
};

export function handleDebugRuntimeMessage(
  message: unknown,
  sendResponse: DebugRuntimeSendResponse,
  operations: DebugLogOperations = defaultDebugLogOperations
): boolean {
  if (isDebugLogRequest(message)) {
    void operations
      .appendLog(message.entry)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse(toDebugRuntimeErrorResponse(error, 'Could not append debug log.')));
    return true;
  }

  if (isGetDebugLogsRequest(message)) {
    void operations
      .hydrateLogs()
      .then(() => sendResponse({ logs: operations.getLogs() }))
      .catch((error) => sendResponse(toDebugRuntimeErrorResponse(error, 'Could not load debug logs.')));
    return true;
  }

  if (isClearDebugLogsRequest(message)) {
    void operations
      .clearLogs()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse(toDebugRuntimeErrorResponse(error, 'Could not clear debug logs.')));
    return true;
  }

  return false;
}

chrome.runtime.onInstalled.addListener(() => {
  void clearLogs().catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  return handleDebugRuntimeMessage(message, sendResponse);
});
