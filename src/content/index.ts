import { findReviewThreads } from '../core/github';
import { debugLog, setDebugLogger } from '../core/debug';
import { extractFeedbackFromDocument } from '../core/parser';
import { formatFeedback } from '../core/formatter';

// Keep these protocol checks local to preserve a single-file content-script bundle.
// Chrome injects `content.js` directly, and chunked runtime imports break reinjection.
const EXTRACT_FEEDBACK_MESSAGE_TYPE = 'EXTRACT_FEEDBACK';
const CONTENT_SCRIPT_READY_MESSAGE_TYPE = 'CONTENT_SCRIPT_READY';
const DEBUG_LOG_MESSAGE_TYPE = 'DEBUG_LOG';

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

setDebugLogger(({ event, level = 'info', source = 'content', detail }) => {
  const entry = {
    timestamp: new Date().toISOString(),
    source,
    level,
    event,
    detail
  };
  const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  consoleMethod('[PR Feedback Extractor]', event, detail ?? '');
  void chrome.runtime.sendMessage({ type: DEBUG_LOG_MESSAGE_TYPE, entry }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isContentScriptReadyRequest(message)) {
    sendResponse({ ready: true });
    return false;
  }

  if (!isExtractFeedbackRequest(message)) {
    return;
  }

  try {
    debugLog({
      event: 'content:extract-request',
      detail: JSON.stringify({ url: globalThis.location.href })
    });
    const threadCount = findReviewThreads(document).length;
    const extraction = extractFeedbackFromDocument(document);
    const output = formatFeedback(extraction.entries, extraction.claudeReview);
    const extractedEntryCount = extraction.entries.length + (extraction.claudeReview ? 1 : 0);
    debugLog({
      event: 'content:extract-success',
      detail: JSON.stringify({
        threadCount,
        entryCount: extraction.entries.length,
        hasClaudeReview: Boolean(extraction.claudeReview),
        outputLength: output.length
      })
    });

    sendResponse({
      ok: true,
      output,
      warnings: extraction.warnings,
      diagnostics: {
        threadCount,
        entryCount: extractedEntryCount,
        warningCount: extraction.warnings.length,
        outputLength: output.length,
        warnings: extraction.warnings
      }
    });
  } catch (error) {
    debugLog({
      event: 'content:extract-failure',
      level: 'error',
      detail: error instanceof Error ? error.message : 'Unknown extraction error.'
    });
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
