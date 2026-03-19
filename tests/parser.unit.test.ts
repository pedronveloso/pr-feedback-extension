import { describe, expect, it } from 'vitest';
import { extractFeedbackFromDocument, commentBodyToMarkdown } from '../src/core/parser';
import { extractCommentBlocks } from '../src/core/github';

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

  it('preserves headings, dividers, fenced code blocks, and code mentions', () => {
    const doc = createDocument(`
      <div class="js-comment-body">
        <h2>Code Review</h2>
        <hr>
        <h3>Bug Risk: <code>thing()</code></h3>
        <p>Use <code>otherThing()</code>.</p>
        <div><pre><code>const value = thing();</code></pre></div>
      </div>
    `);
    const body = doc.querySelector('.js-comment-body');
    expect(body).not.toBeNull();

    const markdown = commentBodyToMarkdown(body!);
    expect(markdown).toBe(
      '## Code Review\n\n- - -\n\n### Bug Risk: `thing()`\n\nUse `otherThing()`.\n\n```\nconst value = thing();\n```'
    );
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

  it('falls back to automated review JSON metadata when file path and line range are not exposed in the thread header', () => {
    const doc = createDocument(`
      <div id="discussion_r123">
        <react-partial partial-name="automated-review-comment">
          <script type="application/json" data-target="react-partial.embeddedData">
            {
              "props": {
                "comment": {
                  "automatedComment": {
                    "message": "<p>Reuse <code>Constants.WEBSITE_URL</code> here.</p>"
                  },
                  "suggestion": {
                    "diffEntries": [
                      {
                        "path": "app/src/main/java/app/altsea/AboutActivity.kt",
                        "diffLines": [
                          { "type": "HUNK", "right": 210 },
                          { "type": "CONTEXT", "right": 211 },
                          { "type": "CONTEXT", "right": 212 },
                          { "type": "ADDITION", "right": 213 },
                          { "type": "ADDITION", "right": 214 }
                        ]
                      }
                    ]
                  }
                }
              }
            }
          </script>
        </react-partial>
      </div>
    `);

    const { entries, warnings } = extractFeedbackFromDocument(doc);

    expect(entries).toEqual([
      {
        filePath: 'app/src/main/java/app/altsea/AboutActivity.kt',
        comments: [
          {
            startLine: 211,
            endLine: 214,
            body: 'Reuse `Constants.WEBSITE_URL` here.'
          }
        ]
      }
    ]);
    expect(warnings).toEqual([]);
  });

  it('warns when no review threads are present', () => {
    const doc = createDocument('<main><p>No inline comments.</p></main>');

    const result = extractFeedbackFromDocument(doc);

    expect(result.entries).toEqual([]);
    expect(result.claudeReview).toBeNull();
    expect(result.warnings).toContain('No review threads found. GitHub DOM may have changed or the PR has no inline feedback.');
  });

  it('does not surface resolved review threads', () => {
    const doc = createDocument(`
      <details class="review-thread-component" data-resolved="true">
        <summary><a class="text-mono">src/resolved.ts</a></summary>
        <div><span class="js-multi-line-preview-start">+10</span> to <span class="js-multi-line-preview-end">+12</span></div>
        <div class="js-inline-comments-container">
          <div class="js-comment review-comment"><div class="js-comment-body"><p>This should stay hidden.</p></div></div>
        </div>
      </details>
    `);

    const result = extractFeedbackFromDocument(doc);

    expect(result.entries).toEqual([]);
    expect(result.claudeReview).toBeNull();
    expect(result.warnings).toContain('No review threads found. GitHub DOM may have changed or the PR has no inline feedback.');
  });

  it('extracts and cleans a Claude bot review comment', () => {
    const doc = createDocument(`
      <div class="timeline-comment">
        <div class="timeline-comment-header">
          <strong>
            <a class="author" href="https://github.com/apps/claude">claude</a>
            <span class="Label">bot</span>
          </strong>
        </div>
        <div class="js-comment-body">
          <h2>Code Review</h2>
          <p>Overall this is a solid PR with good test coverage and meaningful improvements. A few things to address:</p>
          <hr>
          <h3>Bug Risk: <code>thing()</code></h3>
          <p>Use <code>otherThing()</code>.</p>
          <div><pre><code>const value = thing();</code></pre></div>
          <hr>
          <h3>Positives</h3>
          <ul><li><code>thing()</code> is nice.</li></ul>
        </div>
      </div>
    `);

    const result = extractFeedbackFromDocument(doc);

    expect(result.entries).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.claudeReview).toBe(
      '### Bug Risk: `thing()`\n\nUse `otherThing()`.\n\n```\nconst value = thing();\n```'
    );
  });

  it('accepts Claude app links rendered as relative GitHub paths', () => {
    const doc = createDocument(`
      <div class="timeline-comment">
        <div class="timeline-comment-header">
          <strong>
            <a class="author" href="/apps/claude">claude</a>
            <span class="Label">bot</span>
          </strong>
        </div>
        <div class="js-comment-body">
          <h2>Code Review</h2>
          <p>Overall this is a solid PR with good test coverage and meaningful improvements. A few things to address:</p>
          <hr>
          <h3>Minor</h3>
          <p>Check <code>value</code>.</p>
        </div>
      </div>
    `);

    const result = extractFeedbackFromDocument(doc);

    expect(result.claudeReview).toBe('### Minor\n\nCheck `value`.');
  });
});

describe('extractCommentBlocks', () => {
  it('preserves DOM order when multiple selectors match in different selector order', () => {
    const doc = createDocument(`
      <details class="review-thread-component">
        <summary><a class="text-mono">src/order.ts</a></summary>
        <div><span class="js-multi-line-preview-start">+1</span> to <span class="js-multi-line-preview-end">+2</span></div>
        <div class="js-comment review-comment">
          <div class="js-comment-body"><p>First in DOM</p></div>
        </div>
        <div class="js-inline-comments-container">
          <div class="js-comment review-comment"><div class="js-comment-body"><p>Second in DOM</p></div></div>
        </div>
      </details>
    `);

    const thread = doc.querySelector('.review-thread-component');
    expect(thread).not.toBeNull();

    const comments = extractCommentBlocks(thread!);

    expect(comments.map((comment) => comment.body)).toEqual(['First in DOM', 'Second in DOM']);
  });
});
