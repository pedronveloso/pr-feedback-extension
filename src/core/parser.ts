import { extractThreadData, findReviewThreads } from './github';
import { commentBodyToMarkdown } from './markdown';
import type { FeedbackExtractionResult, FileFeedbackEntry } from './types';

export { commentBodyToMarkdown };

export function extractFeedbackFromDocument(doc: Document): FeedbackExtractionResult {
  const warnings: string[] = [];
  const grouped = new Map<string, FileFeedbackEntry>();
  const orderedFilePaths: string[] = [];

  const threads = findReviewThreads(doc);
  if (threads.length === 0) {
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
    warnings
  };
}
