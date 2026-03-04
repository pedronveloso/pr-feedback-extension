import type { FileFeedbackEntry } from './types';

export function formatFeedback(entries: FileFeedbackEntry[]): string {
  if (entries.length === 0) {
    return 'No review feedback comments found on this PR page.';
  }

  return entries
    .map((entry) => {
      const blocks = entry.comments
        .map((comment) => ['"""', comment.trim(), '"""'].join('\n'))
        .join('\n\n');

      return [`On \`${entry.filePath}\`:`, '', blocks].join('\n');
    })
    .join('\n\n');
}
