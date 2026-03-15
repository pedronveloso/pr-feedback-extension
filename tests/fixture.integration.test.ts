import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractFeedbackFromDocument } from '../src/core/parser';
import { formatFeedback } from '../src/core/formatter';

describe('fixture integration', () => {
  it('extracts feedback from PR with suggested changes, filtering out suggestion blocks', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'examples/Fix_several fixes march 10 2026 by pedronveloso · Pull Request #32 · pedronveloso_altsea.html'),
      'utf8'
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const result = extractFeedbackFromDocument(doc);
    const output = formatFeedback(result.entries);

    // Should contain the two file paths
    expect(output).toContain('AccountActivity.kt');
    expect(output).toContain('AccountPullToRefresh.kt');

    // Should contain reviewer prose
    expect(output).toContain('auto-dismiss timer');
    expect(output).toContain('Result<Unit>');
    expect(output).toContain('From lines');

    // Should NOT contain suggested-change content
    expect(output).not.toContain('Suggested change');
    expect(output).not.toContain('overwriteResult.fold(');
  });

  it('extracts expected feedback groups from exported GitHub PR page', () => {
    const html = readFileSync(resolve(process.cwd(), 'examples/github-pr-feedback-entire-page.html'), 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const result = extractFeedbackFromDocument(doc);
    const output = formatFeedback(result.entries);

    expect(result.entries.length).toBeGreaterThanOrEqual(3);
    expect(output).toContain('On `app/src/main/java/app/altsea/ui/onboarding/OnboardingFlow.kt`:');
    expect(output).toContain('On `app/src/main/java/app/altsea/ui/onboarding/FastModeNotificationPermissionScreen.kt`:');
    expect(output).toContain('On `app/src/androidTest/java/app/altsea/OnboardingE2ETest.kt`:');
    expect(output).toContain('From lines');
    expect(output).toContain('`pages` is built from `shouldShowFastModeNotificationPermission`');
    expect(output).toContain('`onNext()` can be triggered twice');
    expect(output).toContain('This helper clicks the notifications-allow CTA');
  });

  it('extracts automated review feedback from the newer GitHub files UI export', () => {
    const html = readFileSync(
      resolve(
        process.cwd(),
        'examples/Feedback submission function by pedronveloso · Pull Request #7 · pedronveloso_altsea-supabase.html'
      ),
      'utf8'
    );
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
