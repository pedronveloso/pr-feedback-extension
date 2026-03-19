import { findReviewThreads } from '../core/github';
import { extractFeedbackFromDocument } from '../core/parser';
import { formatFeedback } from '../core/formatter';

// Keep these protocol checks local to preserve a single-file content-script bundle.
// Chrome injects `content.js` directly, and chunked runtime imports break reinjection.
const EXTRACT_FEEDBACK_MESSAGE_TYPE = 'EXTRACT_FEEDBACK';
const CONTENT_SCRIPT_READY_MESSAGE_TYPE = 'CONTENT_SCRIPT_READY';

function isExtractFeedbackRequest(message: unknown): message is { type: typeof EXTRACT_FEEDBACK_MESSAGE_TYPE } {
  return Boolean(
    message &&
      typeof message === 'object' &&
      'type' in message &&
      (message as { type?: unknown }).type === EXTRACT_FEEDBACK_MESSAGE_TYPE
  );
}

function isContentScriptReadyRequest(message: unknown): message is { type: typeof CONTENT_SCRIPT_READY_MESSAGE_TYPE } {
  return Boolean(
    message &&
      typeof message === 'object' &&
      'type' in message &&
      (message as { type?: unknown }).type === CONTENT_SCRIPT_READY_MESSAGE_TYPE
  );
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isContentScriptReadyRequest(message)) {
    sendResponse({ ready: true });
    return false;
  }

  if (!isExtractFeedbackRequest(message)) {
    return;
  }

  try {
    const threadCount = findReviewThreads(document).length;
    const extraction = extractFeedbackFromDocument(document);
    const output = formatFeedback(extraction.entries);

    sendResponse({
      ok: true,
      output,
      warnings: extraction.warnings,
      diagnostics: {
        threadCount,
        entryCount: extraction.entries.length,
        warningCount: extraction.warnings.length,
        outputLength: output.length,
        warnings: extraction.warnings
      }
    });
  } catch (error) {
    sendResponse({
      ok: false,
      error: 'EXTRACTION_FAILED',
      diagnostics: {
        threadCount: 0,
        entryCount: 0,
        warningCount: 0,
        outputLength: 0,
        warnings: [],
        code: 'PRFE-CONTENT-001',
        reason: error instanceof Error ? error.message : 'Unknown extraction error.'
      }
    });
  }

  return true;
});
