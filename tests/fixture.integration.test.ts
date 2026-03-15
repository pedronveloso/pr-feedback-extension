import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractFeedbackFromDocument } from '../src/core/parser';
import { formatFeedback } from '../src/core/formatter';

function loadFixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf8');
}

describe('fixture integration', () => {
  it('extracts feedback from PR with suggested changes, filtering out suggestion blocks', () => {
    const html = loadFixture('suggested-changes.html');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const result = extractFeedbackFromDocument(doc);
    const output = formatFeedback(result.entries);

    expect(output).toContain('src/notifications/timer.ts');
    expect(output).toContain('src/notifications/pull-to-refresh.ts');

    expect(output).toContain('auto-dismiss timer');
    expect(output).toContain('Result<Unit>');
    expect(output).toContain('From lines');

    expect(output).not.toContain('Suggested change');
    expect(output).not.toContain('overwriteResult.fold(');
  });

  it('extracts expected feedback groups from exported GitHub PR page', () => {
    const html = loadFixture('grouped-feedback.html');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const result = extractFeedbackFromDocument(doc);
    const output = formatFeedback(result.entries);

    expect(result.entries.length).toBeGreaterThanOrEqual(3);
    expect(output).toContain('On `src/onboarding/flow.ts`:');
    expect(output).toContain('On `src/onboarding/notifications-screen.ts`:');
    expect(output).toContain('On `tests/onboarding.e2e.ts`:');
    expect(output).toContain('From lines');
    expect(output).toContain('`pages` is built from `shouldShowNotificationsPrompt`');
    expect(output).toContain('`onNext()` can be triggered twice');
    expect(output).toContain('This helper clicks the notifications-allow CTA');
  });

  it('extracts automated review feedback from the newer GitHub files UI export', () => {
    const html = loadFixture('automated-review.html');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const result = extractFeedbackFromDocument(doc);
    const output = formatFeedback(result.entries);

    expect(result.entries).toEqual([
      expect.objectContaining({
        filePath: 'supabase/functions/feedback-submit/logic.ts',
        comments: expect.arrayContaining([
          expect.objectContaining({
            startLine: 191,
            endLine: 194,
            body: expect.stringContaining('`safeAttachmentName` is produced by `sanitizeAttachmentName()`')
          }),
          expect.objectContaining({
            startLine: 195,
            endLine: 199,
            body: expect.stringContaining('attachment MIME type validation is overly strict')
          }),
          expect.objectContaining({
            startLine: 242,
            endLine: 252,
            body: expect.stringContaining('`allowed_mentions`')
          }),
          expect.objectContaining({
            startLine: 258,
            endLine: 272,
            body: expect.stringContaining('strict per-field size limits')
          })
        ])
      })
    ]);
    expect(output).toContain('On `supabase/functions/feedback-submit/logic.ts`:');
    expect(output).toContain('From lines 195 to 199:');
    expect(output).toContain('`allowed_mentions`');
    expect(output).toContain('strict per-field size limits');
  });
});
