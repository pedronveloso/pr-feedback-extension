import type { FeedbackExtractionResult } from '../core/types';

export const EXTRACT_FEEDBACK_MESSAGE_TYPE = 'EXTRACT_FEEDBACK';
export const CONTENT_SCRIPT_READY_MESSAGE_TYPE = 'CONTENT_SCRIPT_READY';
export const DEBUG_LOG_MESSAGE_TYPE = 'DEBUG_LOG';
export const GET_DEBUG_LOGS_MESSAGE_TYPE = 'GET_DEBUG_LOGS';
export const CLEAR_DEBUG_LOGS_MESSAGE_TYPE = 'CLEAR_DEBUG_LOGS';

export interface DebugLogEntry {
  timestamp: string;
  source: 'content' | 'popup' | 'background';
  level: 'info' | 'warn' | 'error';
  event: string;
  detail?: string;
}

export interface ExtractFeedbackDiagnostics {
  threadCount: number;
  entryCount: number;
  reviewerSummaryCount?: number;
  warningCount: number;
  outputLength: number;
  warnings: FeedbackExtractionResult['warnings'];
  code?: string;
  reason?: string;
}

export interface ExtractFeedbackRequest {
  type: typeof EXTRACT_FEEDBACK_MESSAGE_TYPE;
}

export interface ContentScriptReadyRequest {
  type: typeof CONTENT_SCRIPT_READY_MESSAGE_TYPE;
}

export interface DebugLogRequest {
  type: typeof DEBUG_LOG_MESSAGE_TYPE;
  entry: DebugLogEntry;
}

export interface GetDebugLogsRequest {
  type: typeof GET_DEBUG_LOGS_MESSAGE_TYPE;
}

export interface ClearDebugLogsRequest {
  type: typeof CLEAR_DEBUG_LOGS_MESSAGE_TYPE;
}

export interface ExtractFeedbackSuccessResponse {
  ok: true;
  output: string;
  warnings: FeedbackExtractionResult['warnings'];
  diagnostics: ExtractFeedbackDiagnostics;
}

export interface ExtractFeedbackErrorResponse {
  ok: false;
  error: 'UNSUPPORTED_PAGE' | 'EXTRACTION_FAILED';
  diagnostics?: ExtractFeedbackDiagnostics;
}

export type ExtractFeedbackResponse = ExtractFeedbackSuccessResponse | ExtractFeedbackErrorResponse;

export interface ContentScriptReadyResponse {
  ready: true;
}

export interface GetDebugLogsResponse {
  logs: DebugLogEntry[];
}

export interface DebugRuntimeErrorResponse {
  ok: false;
  error: string;
}

export interface ClearDebugLogsResponse {
  ok: true;
}

export type ContentScriptRequest = ExtractFeedbackRequest | ContentScriptReadyRequest;
export type ContentScriptResponse = ExtractFeedbackResponse | ContentScriptReadyResponse;
export type DebugRuntimeRequest = DebugLogRequest | GetDebugLogsRequest | ClearDebugLogsRequest;
export type DebugRuntimeResponse = GetDebugLogsResponse | ClearDebugLogsResponse | DebugRuntimeErrorResponse;

function isDebugLogEntry(message: unknown): message is DebugLogEntry {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const entry = message as Partial<DebugLogEntry>;
  return (
    typeof entry.timestamp === 'string' &&
    (entry.source === 'content' || entry.source === 'popup' || entry.source === 'background') &&
    (entry.level === 'info' || entry.level === 'warn' || entry.level === 'error') &&
    typeof entry.event === 'string' &&
    (entry.detail === undefined || typeof entry.detail === 'string')
  );
}

function isExtractFeedbackDiagnostics(message: unknown): message is ExtractFeedbackDiagnostics {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const diagnostics = message as Partial<ExtractFeedbackDiagnostics>;
  return (
    typeof diagnostics.threadCount === 'number' &&
    typeof diagnostics.entryCount === 'number' &&
    (diagnostics.reviewerSummaryCount === undefined || typeof diagnostics.reviewerSummaryCount === 'number') &&
    typeof diagnostics.warningCount === 'number' &&
    typeof diagnostics.outputLength === 'number' &&
    Array.isArray(diagnostics.warnings) &&
    (diagnostics.code === undefined || typeof diagnostics.code === 'string') &&
    (diagnostics.reason === undefined || typeof diagnostics.reason === 'string')
  );
}

export function isExtractFeedbackRequest(message: unknown): message is ExtractFeedbackRequest {
  return Boolean(
    message &&
      typeof message === 'object' &&
      'type' in message &&
      (message as { type?: unknown }).type === EXTRACT_FEEDBACK_MESSAGE_TYPE
  );
}

export function isContentScriptReadyRequest(message: unknown): message is ContentScriptReadyRequest {
  return Boolean(
    message &&
      typeof message === 'object' &&
      'type' in message &&
      (message as { type?: unknown }).type === CONTENT_SCRIPT_READY_MESSAGE_TYPE
  );
}

export function isDebugLogRequest(message: unknown): message is DebugLogRequest {
  return Boolean(
    message &&
      typeof message === 'object' &&
      'type' in message &&
      (message as { type?: unknown }).type === DEBUG_LOG_MESSAGE_TYPE &&
      'entry' in message &&
      isDebugLogEntry((message as { entry?: unknown }).entry)
  );
}

export function isGetDebugLogsRequest(message: unknown): message is GetDebugLogsRequest {
  return Boolean(
    message &&
      typeof message === 'object' &&
      'type' in message &&
      (message as { type?: unknown }).type === GET_DEBUG_LOGS_MESSAGE_TYPE
  );
}

export function isClearDebugLogsRequest(message: unknown): message is ClearDebugLogsRequest {
  return Boolean(
    message &&
      typeof message === 'object' &&
      'type' in message &&
      (message as { type?: unknown }).type === CLEAR_DEBUG_LOGS_MESSAGE_TYPE
  );
}

export function isExtractFeedbackResponse(message: unknown): message is ExtractFeedbackResponse {
  if (!message || typeof message !== 'object' || !('ok' in message)) {
    return false;
  }

  const candidate = message as Partial<ExtractFeedbackResponse>;
  if (candidate.ok === true) {
    return typeof candidate.output === 'string' && Array.isArray(candidate.warnings) && isExtractFeedbackDiagnostics(candidate.diagnostics);
  }

  if (candidate.ok !== false || (candidate.error !== 'UNSUPPORTED_PAGE' && candidate.error !== 'EXTRACTION_FAILED')) {
    return false;
  }

  if (!('diagnostics' in candidate) || candidate.diagnostics === undefined) {
    return true;
  }

  return isExtractFeedbackDiagnostics(candidate.diagnostics);
}

export function isContentScriptReadyResponse(message: unknown): message is ContentScriptReadyResponse {
  return Boolean(message && typeof message === 'object' && 'ready' in message && (message as { ready?: unknown }).ready === true);
}
