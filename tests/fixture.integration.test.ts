import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractFeedbackFromDocument } from '../src/core/parser';
import { formatFeedback } from '../src/core/formatter';

describe('fixture integration', () => {
  it('extracts expected feedback groups from exported GitHub PR page', () => {
    const html = readFileSync(resolve(process.cwd(), 'examples/github-pr-feedback-entire-page.html'), 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const result = extractFeedbackFromDocument(doc);
    const output = formatFeedback(result.entries);

    expect(result.entries.length).toBeGreaterThanOrEqual(3);
    expect(output).toContain('On `app/src/main/java/app/altsea/ui/onboarding/OnboardingFlow.kt`:');
    expect(output).toContain('On `app/src/main/java/app/altsea/ui/onboarding/FastModeNotificationPermissionScreen.kt`:');
    expect(output).toContain('On `app/src/androidTest/java/app/altsea/OnboardingE2ETest.kt`:');
    expect(output).toContain('`pages` is built from `shouldShowFastModeNotificationPermission`');
    expect(output).toContain('`onNext()` can be triggered twice');
    expect(output).toContain('This helper clicks the notifications-allow CTA');
  });
});
