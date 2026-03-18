import type { FeedbackExtractionResult } from '../core/types';

export const EXTRACT_FEEDBACK_MESSAGE_TYPE = 'EXTRACT_FEEDBACK';
export const CONTENT_SCRIPT_READY_MESSAGE_TYPE = 'CONTENT_SCRIPT_READY';

export interface ExtractFeedbackDiagnostics {
  threadCount: number;
  entryCount: number;
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

export type ContentScriptRequest = ExtractFeedbackRequest | ContentScriptReadyRequest;
export type ContentScriptResponse = ExtractFeedbackResponse | ContentScriptReadyResponse;

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

export function isExtractFeedbackResponse(message: unknown): message is ExtractFeedbackResponse {
  if (!message || typeof message !== 'object' || !('ok' in message)) {
    return false;
  }

  const candidate = message as Partial<ExtractFeedbackResponse>;
  if (candidate.ok === true) {
    const diagnostics = candidate.diagnostics as Partial<ExtractFeedbackDiagnostics> | undefined;
    return (
      typeof candidate.output === 'string' &&
      Array.isArray(candidate.warnings) &&
      Boolean(
        diagnostics &&
          typeof diagnostics.threadCount === 'number' &&
          typeof diagnostics.entryCount === 'number' &&
          typeof diagnostics.warningCount === 'number' &&
          typeof diagnostics.outputLength === 'number' &&
          Array.isArray(diagnostics.warnings)
      )
    );
  }

  if (candidate.ok !== false || (candidate.error !== 'UNSUPPORTED_PAGE' && candidate.error !== 'EXTRACTION_FAILED')) {
    return false;
  }

  if (!('diagnostics' in candidate) || candidate.diagnostics === undefined) {
    return true;
  }

  const diagnostics = candidate.diagnostics as Partial<ExtractFeedbackDiagnostics>;
  return (
    typeof diagnostics.threadCount === 'number' &&
    typeof diagnostics.entryCount === 'number' &&
    typeof diagnostics.warningCount === 'number' &&
    typeof diagnostics.outputLength === 'number' &&
    Array.isArray(diagnostics.warnings) &&
    (diagnostics.code === undefined || typeof diagnostics.code === 'string') &&
    (diagnostics.reason === undefined || typeof diagnostics.reason === 'string')
  );
}

export function isContentScriptReadyResponse(message: unknown): message is ContentScriptReadyResponse {
  return Boolean(message && typeof message === 'object' && 'ready' in message && (message as { ready?: unknown }).ready === true);
}
