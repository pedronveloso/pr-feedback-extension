import { extractClaudeReview, extractThreadData, findReviewThreads } from './github';
import { debugLog } from './debug';
import { commentBodyToMarkdown } from './markdown';
import { setFeedbackCommentPageOrder, type FeedbackExtractionResult, type FileFeedbackEntry } from './types';

export { commentBodyToMarkdown };

function extractPullRequestAuthor(doc: Document): string | null {
  const selectors = [
    '[class*="PullRequestHeaderSummary"] a[data-hovercard-type="user"]',
    '.gh-header-meta .author',
    '.js-command-palette-pull-body .timeline-comment-header .author'
  ];

  for (const selector of selectors) {
    const author = doc.querySelector(selector)?.textContent?.trim();
    if (author) {
      return author;
    }
  }

  return doc.querySelector<HTMLMetaElement>('meta[property="og:author:username"]')?.content.trim() || null;
}

export function extractFeedbackFromDocument(doc: Document): FeedbackExtractionResult {
  const warnings: string[] = [];
  const grouped = new Map<string, FileFeedbackEntry>();
  const orderedFilePaths: string[] = [];
  const claudeReview = extractClaudeReview(doc);
  const pullRequestAuthor = extractPullRequestAuthor(doc);
  let hasUnknownReviewer = false;
  let commentPageOrder = 0;

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

    const comments = extraction.comments.filter((comment) => {
      setFeedbackCommentPageOrder(comment, commentPageOrder++);
      if (!comment.reviewer) {
        hasUnknownReviewer = true;
        return true;
      }

      return !pullRequestAuthor || comment.reviewer.toLowerCase() !== pullRequestAuthor.toLowerCase();
    });

    if (comments.length === 0) {
      return;
    }

    if (!grouped.has(extraction.filePath)) {
      grouped.set(extraction.filePath, { filePath: extraction.filePath, comments: [] });
      orderedFilePaths.push(extraction.filePath);
    }

    if (extraction.lineRange.startLine === null && extraction.lineRange.endLine === null) {
      warnings.push(`Extracted comments for ${extraction.filePath} without a line range.`);
    }

    grouped.get(extraction.filePath)!.comments.push(...comments);
  });

  if (hasUnknownReviewer) {
    warnings.push('Could not determine the reviewer for one or more feedback comments.');
  }

  return {
    entries: orderedFilePaths.map((filePath) => grouped.get(filePath)!).filter((entry) => entry.comments.length > 0),
    claudeReview,
    warnings
  };
}
