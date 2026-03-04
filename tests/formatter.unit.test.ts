import { describe, expect, it } from 'vitest';
import { formatFeedback } from '../src/core/formatter';

describe('formatFeedback', () => {
  it('formats grouped output with triple quotes', () => {
    const output = formatFeedback([
      {
        filePath: 'src/A.kt',
        comments: ['One', 'Two']
      }
    ]);

    expect(output).toContain('On `src/A.kt`:');
    expect(output).toContain('"""\nOne\n"""');
    expect(output).toContain('"""\nTwo\n"""');
  });

  it('returns empty-state message', () => {
    expect(formatFeedback([])).toBe('No review feedback comments found on this PR page.');
  });
});
