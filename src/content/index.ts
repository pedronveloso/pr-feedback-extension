import { extractFeedbackFromDocument } from '../core/parser';
import { formatFeedback } from '../core/formatter';
import { isExtractFeedbackRequest } from '../shared/messages';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isExtractFeedbackRequest(message)) {
    return;
  }

  try {
    const extraction = extractFeedbackFromDocument(document);
    const output = formatFeedback(extraction.entries);

    sendResponse({
      ok: true,
      output,
      warnings: extraction.warnings
    });
  } catch {
    sendResponse({
      ok: false,
      error: 'EXTRACTION_FAILED'
    });
  }

  return true;
});
