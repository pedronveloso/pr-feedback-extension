import { debugLog } from './debug';
import { getFeedbackCommentPageOrder, type FeedbackComment, type FileFeedbackEntry } from './types';

function formatLineRange(startLine: number | null, endLine: number | null): string | null {
  if (startLine === null && endLine === null) {
    return null;
  }

  if (startLine !== null && endLine !== null) {
    if (startLine === endLine) {
      return `From line ${startLine}:`;
    }

    return `From lines ${startLine} to ${endLine}:`;
  }

  const line = startLine ?? endLine;
  return line === null ? null : `From line ${line}:`;
}

function formatFileFeedback(filePath: string, comments: FeedbackComment[]): string {
  const blocks = comments
    .map((comment) => {
      const lineRange = formatLineRange(comment.startLine, comment.endLine);
      const parts = [lineRange, '"""', comment.body.trim(), '"""'].filter(Boolean);
      return parts.join('\n');
    })
    .join('\n\n');

  return [`On \`${filePath}\`:`, '', blocks].join('\n');
}

function formatReviewerSections(entries: FileFeedbackEntry[], claudeReview: string | null): string[] {
  interface OrderedFileComments {
    comments: FeedbackComment[];
    firstOrder: number;
  }

  interface OrderedReviewer {
    name: string;
    files: Map<string, OrderedFileComments>;
    firstOrder: number;
  }

  const reviewers = new Map<string, OrderedReviewer>();
  let fallbackOrder = 0;

  for (const entry of entries) {
    for (const comment of entry.comments) {
      const order = getFeedbackCommentPageOrder(comment) ?? fallbackOrder++;
      const name = comment.reviewer ?? 'Unknown reviewer';
      const key = name.toLowerCase();
      const reviewer = reviewers.get(key) ?? { name, files: new Map<string, OrderedFileComments>(), firstOrder: order };
      const file = reviewer.files.get(entry.filePath) ?? { comments: [], firstOrder: order };
      file.comments.push(comment);
      reviewer.files.set(entry.filePath, file);
      reviewers.set(key, reviewer);
    }
  }

  const sections = Array.from(reviewers.entries())
    .sort(([, left], [, right]) => left.firstOrder - right.firstOrder)
    .map(([key, reviewer]) => {
      const name = key === 'claude' ? 'claude' : reviewer.name;
      const files = Array.from(reviewer.files)
        .sort(([, left], [, right]) => left.firstOrder - right.firstOrder)
        .map(([filePath, file]) =>
          formatFileFeedback(
            filePath,
            file.comments.sort(
              (left, right) =>
                (getFeedbackCommentPageOrder(left) ?? Number.MAX_SAFE_INTEGER) -
                (getFeedbackCommentPageOrder(right) ?? Number.MAX_SAFE_INTEGER)
            )
          )
        );
      const parts = [`PR feedback from ${name}:`, '', files.join('\n\n')];
      if (key === 'claude' && claudeReview) {
        parts.push('', claudeReview.trim());
      }
      return parts.join('\n');
    });

  if (claudeReview && !reviewers.has('claude')) {
    sections.push(['PR feedback from claude:', '', claudeReview.trim()].join('\n'));
  }

  return sections;
}

export function formatFeedback(entries: FileFeedbackEntry[], claudeReview: string | null = null): string {
  const sections = formatReviewerSections(entries, claudeReview);
  debugLog({
    source: 'content',
    event: 'formatter:branch',
    detail: JSON.stringify({ inlineEntryCount: entries.length, hasClaudeReview: Boolean(claudeReview) })
  });

  return sections.length > 0 ? sections.join('\n\n') : 'No review feedback comments found on this PR page.';
}
