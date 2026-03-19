import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractFeedbackFromDocument } from '../src/core/parser';
import { formatFeedback } from '../src/core/formatter';

function loadFixture(name: string): string {
  const testFixturePath = resolve(process.cwd(), 'tests/fixtures', name);
  const sharedFixturePath = resolve(process.cwd(), 'fixtures', name);
  const fixturePath = existsSync(testFixturePath) ? testFixturePath : sharedFixturePath;

  return readFileSync(fixturePath, 'utf8');
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

  it('extracts automated review feedback from the better contacts example shape', () => {
    const html = loadFixture('better-contacts-automated-review.html');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const result = extractFeedbackFromDocument(doc);
    const output = formatFeedback(result.entries);

    expect(result.entries).toEqual([
      {
        filePath: 'app/src/main/java/app/altsea/AboutActivity.kt',
        comments: [
          expect.objectContaining({
            startLine: 211,
            endLine: 216,
            body: expect.stringContaining('`Constants.WEBSITE_URL`')
          }),
          expect.objectContaining({
            startLine: 222,
            endLine: 227,
            body: expect.stringContaining('`ALTSEA_DISCORD_URL`')
          })
        ]
      }
    ]);
    expect(output).toContain('On `app/src/main/java/app/altsea/AboutActivity.kt`:');
    expect(output).toContain('From lines 211 to 216:');
    expect(output).toContain('From lines 222 to 227:');
  });

  it('extracts automated review feedback from the Several March fixes export', () => {
    const html = loadFixture('Several March fixes (16 & 17) by pedronveloso · Pull Request #46 · pedronveloso_altsea.html');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const result = extractFeedbackFromDocument(doc);
    const output = formatFeedback(result.entries);

    expect(result.warnings).toEqual([]);
    expect(result.entries.length).toBe(2);
    expect(output).toContain('On `app/src/main/java/app/altsea/ui/onboarding/OnboardingComponents.kt`:');
    expect(output).toContain('On `app/src/main/java/app/altsea/ui/components/PreviewCard.kt`:');
    expect(output).toContain('Modifier.weight(1f)');
    expect(output).toContain('androidx.compose.foundation.Image');
  });

  it('combines inline PR feedback with the Claude bot review block', () => {
    const html = loadFixture('example-with-claude-code-review.html');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const result = extractFeedbackFromDocument(doc);
    const output = formatFeedback(result.entries, result.claudeReview);

    expect(result.warnings).toEqual([]);
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.claudeReview).not.toContain('## Code Review');
    expect(result.claudeReview).toContain('```');
    expect(result.claudeReview).toContain('`Base64.getDecoder()`');
    expect(result.claudeReview).not.toContain('Overall this is a solid PR with good test coverage and meaningful improvements.');
    expect(result.claudeReview).not.toContain('### Positives');

    expect(output).toContain('PR feedback from first reviewer:');
    expect(output).toContain('PR feedback from second reviewer:');
    expect(output).toContain('On `app/src/main/java/app/altsea/util/UrlCleanupUtil.kt`:');
    expect(output).toContain('### Bug Risk: `Base64.getDecoder()` vs `Base64.getUrlDecoder()`');
  });
});
