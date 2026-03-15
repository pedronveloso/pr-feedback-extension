import { extractCommentBlocks, extractFilePath, extractLineRange, findReviewThreads } from './github';
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
    const filePath = extractFilePath(thread);
    if (!filePath) {
      warnings.push(`Skipped thread ${index + 1} without file path.`);
      return;
    }

    const comments = extractCommentBlocks(thread);
    if (comments.length === 0) {
      return;
    }

    if (!grouped.has(filePath)) {
      grouped.set(filePath, { filePath, comments: [] });
      orderedFilePaths.push(filePath);
    }

    const lineRange = extractLineRange(thread);
    if (lineRange.startLine === null && lineRange.endLine === null) {
      warnings.push(`Extracted comments for ${filePath} without a line range.`);
    }

    grouped.get(filePath)!.comments.push(...comments);
  });

  return {
    entries: orderedFilePaths.map((filePath) => grouped.get(filePath)!).filter((entry) => entry.comments.length > 0),
    warnings
  };
}
