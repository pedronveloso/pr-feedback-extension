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

  it('prefixes both reviewers when Claude feedback is present', () => {
    const output = formatFeedback(
      [
        {
          filePath: 'src/A.kt',
          comments: [{ startLine: 10, endLine: 12, body: 'One' }]
        }
      ],
      '## Code Review\n\n- - -\n\n### Bug Risk'
    );

    expect(output).toContain('PR feedback from first reviewer:');
    expect(output).toContain('On `src/A.kt`:');
    expect(output).toContain('PR feedback from second reviewer:');
    expect(output).toContain('## Code Review');
  });

  it('returns only the Claude section when no inline feedback exists', () => {
    const output = formatFeedback([], '## Code Review');

    expect(output).toBe('PR feedback from second reviewer:\n\n## Code Review');
  });
});
