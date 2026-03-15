import type { FeedbackExtractionResult } from '../core/types';

export const EXTRACT_FEEDBACK_MESSAGE_TYPE = 'EXTRACT_FEEDBACK';

export interface ExtractFeedbackRequest {
  type: typeof EXTRACT_FEEDBACK_MESSAGE_TYPE;
}

export interface ExtractFeedbackSuccessResponse {
  ok: true;
  output: string;
  warnings: FeedbackExtractionResult['warnings'];
}

export interface ExtractFeedbackErrorResponse {
  ok: false;
  error: 'UNSUPPORTED_PAGE' | 'EXTRACTION_FAILED';
}

export type ExtractFeedbackResponse = ExtractFeedbackSuccessResponse | ExtractFeedbackErrorResponse;

export function isExtractFeedbackRequest(message: unknown): message is ExtractFeedbackRequest {
  return Boolean(
    message &&
      typeof message === 'object' &&
      'type' in message &&
      (message as { type?: unknown }).type === EXTRACT_FEEDBACK_MESSAGE_TYPE
  );
}

export function isExtractFeedbackResponse(message: unknown): message is ExtractFeedbackResponse {
  if (!message || typeof message !== 'object' || !('ok' in message)) {
    return false;
  }

  const candidate = message as Partial<ExtractFeedbackResponse>;
  if (candidate.ok === true) {
    return typeof candidate.output === 'string' && Array.isArray(candidate.warnings);
  }

  return candidate.ok === false && (candidate.error === 'UNSUPPORTED_PAGE' || candidate.error === 'EXTRACTION_FAILED');
}
