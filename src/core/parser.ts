import { extractClaudeReview, extractThreadData, findReviewThreads } from './github';
import { debugLog } from './debug';
import { commentBodyToMarkdown } from './markdown';
import type { FeedbackExtractionResult, FileFeedbackEntry } from './types';

export { commentBodyToMarkdown };

export function extractFeedbackFromDocument(doc: Document): FeedbackExtractionResult {
  const warnings: string[] = [];
  const grouped = new Map<string, FileFeedbackEntry>();
  const orderedFilePaths: string[] = [];
  const claudeReview = extractClaudeReview(doc);

  const threads = findReviewThreads(doc);
  debugLog({
    source: 'content',
    event: 'extraction:thread-summary',
    detail: JSON.stringify({ threadCount: threads.length, hasClaudeReview: Boolean(claudeReview) })
  });
  if (threads.length === 0 && !claudeReview) {
    warnings.push('No review threads found. GitHub DOM may have changed or the PR has no inline feedback.');
  }

  threads.forEach((thread, index) => {
    const extraction = extractThreadData(thread);
    if (!extraction.filePath) {
      warnings.push(`Skipped thread ${index + 1} without file path.`);
      return;
    }

    if (extraction.comments.length === 0) {
      return;
    }

    if (!grouped.has(extraction.filePath)) {
      grouped.set(extraction.filePath, { filePath: extraction.filePath, comments: [] });
      orderedFilePaths.push(extraction.filePath);
    }

    if (extraction.lineRange.startLine === null && extraction.lineRange.endLine === null) {
      warnings.push(`Extracted comments for ${extraction.filePath} without a line range.`);
    }

    grouped.get(extraction.filePath)!.comments.push(...extraction.comments);
  });

  return {
    entries: orderedFilePaths.map((filePath) => grouped.get(filePath)!).filter((entry) => entry.comments.length > 0),
    claudeReview,
    warnings
  };
}
