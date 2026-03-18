import { describe, expect, it } from 'vitest';
import { isExtractFeedbackResponse } from '../src/shared/messages';

describe('isExtractFeedbackResponse', () => {
  it('returns false for error responses with null diagnostics', () => {
    expect(() =>
      isExtractFeedbackResponse({
        ok: false,
        error: 'EXTRACTION_FAILED',
        diagnostics: null
      })
    ).not.toThrow();

    expect(
      isExtractFeedbackResponse({
        ok: false,
        error: 'EXTRACTION_FAILED',
        diagnostics: null
      })
    ).toBe(false);
  });

  it('returns false for error responses with primitive diagnostics', () => {
    expect(
      isExtractFeedbackResponse({
        ok: false,
        error: 'EXTRACTION_FAILED',
        diagnostics: 42
      })
    ).toBe(false);
  });
});
