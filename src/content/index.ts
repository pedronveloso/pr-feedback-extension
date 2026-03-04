import { extractFeedbackFromDocument } from '../core/parser';
import { formatFeedback } from '../core/formatter';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'EXTRACT_FEEDBACK') {
    return;
  }

  const extraction = extractFeedbackFromDocument(document);
  const output = formatFeedback(extraction.entries);

  sendResponse({
    ok: true,
    output,
    warnings: extraction.warnings
  });

  return true;
});
