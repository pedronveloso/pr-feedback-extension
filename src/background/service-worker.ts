import {
  CLEAR_DEBUG_LOGS_MESSAGE_TYPE,
  DEBUG_LOG_MESSAGE_TYPE,
  GET_DEBUG_LOGS_MESSAGE_TYPE,
  isClearDebugLogsRequest,
  isDebugLogRequest,
  isGetDebugLogsRequest,
  type DebugLogEntry
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

chrome.runtime.onInstalled.addListener(() => {
  void clearLogs();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isDebugLogRequest(message)) {
    void appendLog(message.entry).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (isGetDebugLogsRequest(message)) {
    void hydrateLogs().then(() => sendResponse({ logs: logBuffer }));
    return true;
  }

  if (isClearDebugLogsRequest(message)) {
    void clearLogs().then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});
