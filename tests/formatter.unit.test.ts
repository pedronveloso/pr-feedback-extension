import { describe, expect, it } from 'vitest';
import { formatFeedback } from '../src/core/formatter';

describe('formatFeedback', () => {
  it('formats grouped output with triple quotes', () => {
    const output = formatFeedback([
      {
        filePath: 'src/A.kt',
        comments: [
          { startLine: 10, endLine: 12, body: 'One', reviewer: 'octocat' },
          { startLine: 18, endLine: 18, body: 'Two', reviewer: 'octocat' }
        ]
      }
    ]);

    expect(output).toContain('On `src/A.kt`:');
    expect(output).toContain('PR feedback from octocat:');
    expect(output).toContain('From lines 10 to 12:\n"""\nOne\n"""');
    expect(output).toContain('From line 18:\n"""\nTwo\n"""');
  });

  it('returns empty-state message', () => {
    expect(formatFeedback([])).toBe('No review feedback comments found on this PR page.');
  });

  it('preserves unattributed comments in one unknown-reviewer section', () => {
    const output = formatFeedback([
      {
        filePath: 'src/unknown.ts',
        comments: [
          { startLine: 1, endLine: 1, body: 'First unknown', reviewer: null },
          { startLine: 2, endLine: 2, body: 'Second unknown', reviewer: null }
        ]
      }
    ]);

    expect(output.match(/PR feedback from Unknown reviewer:/g)).toHaveLength(1);
    expect(output).toContain('First unknown');
    expect(output).toContain('Second unknown');
  });

  it('uses named reviewer sections when Claude feedback is present', () => {
    const output = formatFeedback(
      [
        {
          filePath: 'src/A.kt',
          comments: [{ startLine: 10, endLine: 12, body: 'One', reviewer: 'coderabbitai' }]
        }
      ],
      '## Code Review\n\n- - -\n\n### Bug Risk'
    );

    expect(output).toContain('PR feedback from coderabbitai:');
    expect(output).toContain('On `src/A.kt`:');
    expect(output).toContain('PR feedback from claude:');
    expect(output).toContain('## Code Review');
  });

  it('returns only the Claude section when no inline feedback exists', () => {
    const output = formatFeedback([], '## Code Review');

    expect(output).toBe('PR feedback from claude:\n\n## Code Review');
  });

  it('groups comments by reviewer and then file in first-seen order', () => {
    const output = formatFeedback([
      {
        filePath: 'src/A.kt',
        comments: [
          { startLine: 1, endLine: 1, body: 'Rabbit on A', reviewer: 'coderabbitai' },
          { startLine: 2, endLine: 2, body: 'Human on A', reviewer: 'pedronveloso' }
        ]
      },
      {
        filePath: 'src/B.kt',
        comments: [{ startLine: 3, endLine: 3, body: 'Rabbit on B', reviewer: 'coderabbitai' }]
      }
    ]);

    expect(output.indexOf('PR feedback from coderabbitai:')).toBeLessThan(output.indexOf('PR feedback from pedronveloso:'));
    expect(output.indexOf('On `src/A.kt`:')).toBeLessThan(output.indexOf('On `src/B.kt`:'));
    expect(output.match(/PR feedback from coderabbitai:/g)).toHaveLength(1);
  });

  it('merges Claude inline and summary feedback into one named section', () => {
    const output = formatFeedback(
      [
        {
          filePath: 'src/A.kt',
          comments: [{ startLine: 1, endLine: 1, body: 'Inline Claude note', reviewer: 'Claude' }]
        }
      ],
      'Summary Claude note'
    );

    expect(output.match(/PR feedback from claude:/g)).toHaveLength(1);
    expect(output).toContain('Inline Claude note');
    expect(output).toContain('Summary Claude note');
  });
});
