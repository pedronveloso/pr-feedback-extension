import { describe, expect, it } from 'vitest';
import { extractFeedbackFromDocument, commentBodyToMarkdown } from '../src/core/parser';

function createDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('commentBodyToMarkdown', () => {
  it('strips suggested-change blocks from comment body', () => {
    const doc = createDocument(`
      <div class="js-comment-body">
        <p>Consider checking the returned <code>Result</code>.</p>
        <div class="my-2 border rounded-2 js-suggested-changes-blob diff-view">
          <div class="f6 p-2">Suggested change</div>
          <table><tbody>
            <tr><td class="blob-code-deletion">old code</td></tr>
            <tr><td class="blob-code-addition">return overwriteResult.fold(</td></tr>
          </tbody></table>
        </div>
      </div>
    `);
    const body = doc.querySelector('.js-comment-body');
    expect(body).not.toBeNull();

    const markdown = commentBodyToMarkdown(body!);
    expect(markdown).toBe('Consider checking the returned `Result`.');
    expect(markdown).not.toContain('Suggested change');
    expect(markdown).not.toContain('overwriteResult.fold');
  });

  it('preserves paragraphs and inline code', () => {
    const doc = createDocument('<div class="js-comment-body"><p>Hello <code>world</code>.</p><p>Second para.</p></div>');
    const body = doc.querySelector('.js-comment-body');
    expect(body).not.toBeNull();

    const markdown = commentBodyToMarkdown(body!);
    expect(markdown).toBe('Hello `world`.\n\nSecond para.');
  });
});

describe('extractFeedbackFromDocument', () => {
  it('groups comments by file path and preserves order', () => {
    const doc = createDocument(`
      <details class="review-thread-component">
        <summary><a class="text-mono">src/A.kt</a></summary>
        <div><span class="js-multi-line-preview-start">+10</span> to <span class="js-multi-line-preview-end">+12</span></div>
        <div class="js-inline-comments-container">
          <div class="js-comment review-comment"><div class="js-comment-body"><p>First</p></div></div>
        </div>
      </details>
      <details class="review-thread-component">
        <summary><a class="text-mono">src/B.kt</a></summary>
        <div><span class="js-multi-line-preview-start">+14</span> to <span class="js-multi-line-preview-end">+16</span></div>
        <div class="js-inline-comments-container">
          <div class="js-comment review-comment"><div class="js-comment-body"><p>Second</p></div></div>
        </div>
      </details>
      <details class="review-thread-component">
        <summary><a class="text-mono">src/A.kt</a></summary>
        <div><span class="js-multi-line-preview-start">+20</span> to <span class="js-multi-line-preview-end">+20</span></div>
        <div class="js-inline-comments-container">
          <div class="js-comment review-comment"><div class="js-comment-body"><p>Third</p></div></div>
        </div>
      </details>
    `);

    const { entries } = extractFeedbackFromDocument(doc);

    expect(entries).toEqual([
      {
        filePath: 'src/A.kt',
        comments: [
          { startLine: 10, endLine: 12, body: 'First' },
          { startLine: 20, endLine: 20, body: 'Third' }
        ]
      },
      {
        filePath: 'src/B.kt',
        comments: [{ startLine: 14, endLine: 16, body: 'Second' }]
      }
    ]);
  });

  it('ignores threads with no comment bodies', () => {
    const doc = createDocument(`
      <details class="review-thread-component">
        <summary><a class="text-mono">src/A.kt</a></summary>
      </details>
    `);

    const { entries } = extractFeedbackFromDocument(doc);
    expect(entries).toHaveLength(0);
  });

  it('extracts automated review comments embedded in react partial JSON', () => {
    const doc = createDocument(`
      <details class="review-thread-component">
        <summary><a class="text-mono">src/server.ts</a></summary>
        <div><span class="js-multi-line-preview-start">+27</span> to <span class="js-multi-line-preview-end">+30</span></div>
        <div class="js-inline-comments-container">
          <react-partial partial-name="automated-review-comment">
            <script type="application/json" data-target="react-partial.embeddedData">
              {"props":{"comment":{"bodyHTML":"<p>Guard <code>payload.name</code> length before sending.</p>"}}}
            </script>
          </react-partial>
        </div>
      </details>
    `);

    const { entries } = extractFeedbackFromDocument(doc);

    expect(entries).toEqual([
      {
        filePath: 'src/server.ts',
        comments: [
          {
            startLine: 27,
            endLine: 30,
            body: 'Guard `payload.name` length before sending.'
          }
        ]
      }
    ]);
  });

  it('uses file-path and line-range fallback attributes when GitHub markup differs', () => {
    const doc = createDocument(`
      <details class="review-thread-component" data-start-line="44" data-end-line="48">
        <summary><span data-path="src/feature.ts"></span></summary>
        <div class="js-comment review-comment">
          <div class="js-comment-body"><p>Fallback selectors still work.</p></div>
        </div>
      </details>
    `);

    const { entries, warnings } = extractFeedbackFromDocument(doc);

    expect(entries).toEqual([
      {
        filePath: 'src/feature.ts',
        comments: [{ startLine: 44, endLine: 48, body: 'Fallback selectors still work.' }]
      }
    ]);
    expect(warnings).toEqual([]);
  });

  it('warns when no review threads are present', () => {
    const doc = createDocument('<main><p>No inline comments.</p></main>');

    const result = extractFeedbackFromDocument(doc);

    expect(result.entries).toEqual([]);
    expect(result.warnings).toContain('No review threads found. GitHub DOM may have changed or the PR has no inline feedback.');
  });
});
