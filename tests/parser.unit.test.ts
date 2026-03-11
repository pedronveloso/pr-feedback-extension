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
        <div class="js-inline-comments-container">
          <div class="js-comment review-comment"><div class="js-comment-body"><p>First</p></div></div>
        </div>
      </details>
      <details class="review-thread-component">
        <summary><a class="text-mono">src/B.kt</a></summary>
        <div class="js-inline-comments-container">
          <div class="js-comment review-comment"><div class="js-comment-body"><p>Second</p></div></div>
        </div>
      </details>
      <details class="review-thread-component">
        <summary><a class="text-mono">src/A.kt</a></summary>
        <div class="js-inline-comments-container">
          <div class="js-comment review-comment"><div class="js-comment-body"><p>Third</p></div></div>
        </div>
      </details>
    `);

    const { entries } = extractFeedbackFromDocument(doc);

    expect(entries).toEqual([
      { filePath: 'src/A.kt', comments: ['First', 'Third'] },
      { filePath: 'src/B.kt', comments: ['Second'] }
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
});
