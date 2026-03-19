import { debugLog } from './debug';
import type { FileFeedbackEntry } from './types';

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

function formatInlineFeedback(entries: FileFeedbackEntry[]): string {
  if (entries.length === 0) {
    return 'No review feedback comments found on this PR page.';
  }

  return entries
    .map((entry) => {
      const blocks = entry.comments
        .map((comment) => {
          const lineRange = formatLineRange(comment.startLine, comment.endLine);
          const parts = [lineRange, '"""', comment.body.trim(), '"""'].filter(Boolean);
          return parts.join('\n');
        })
        .join('\n\n');

      return [`On \`${entry.filePath}\`:`, '', blocks].join('\n');
    })
    .join('\n\n');
}

export function formatFeedback(entries: FileFeedbackEntry[], claudeReview: string | null = null): string {
  const inlineFeedback = formatInlineFeedback(entries);
  debugLog({
    source: 'content',
    event: 'formatter:branch',
    detail: JSON.stringify({ inlineEntryCount: entries.length, hasClaudeReview: Boolean(claudeReview) })
  });

  if (!claudeReview) {
    return inlineFeedback;
  }

  if (entries.length === 0) {
    return ['PR feedback from second reviewer:', '', claudeReview.trim()].join('\n');
  }

  return [
    'PR feedback from first reviewer:',
    '',
    inlineFeedback,
    '',
    'PR feedback from second reviewer:',
    '',
    claudeReview.trim()
  ].join('\n');
}
