import { describe, expect, it } from 'vitest';
import { formatFeedback } from '../src/core/formatter';

describe('formatFeedback', () => {
  it('formats grouped output with triple quotes', () => {
    const output = formatFeedback([
      {
        filePath: 'src/A.kt',
        comments: [
          { startLine: 10, endLine: 12, body: 'One' },
          { startLine: 18, endLine: 18, body: 'Two' }
        ]
      }
    ]);

    expect(output).toContain('On `src/A.kt`:');
    expect(output).toContain('From lines 10 to 12:\n"""\nOne\n"""');
    expect(output).toContain('From line 18:\n"""\nTwo\n"""');
  });

  it('returns empty-state message', () => {
    expect(formatFeedback([])).toBe('No review feedback comments found on this PR page.');
  });
});
