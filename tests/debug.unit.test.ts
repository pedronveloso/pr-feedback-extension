import { describe, expect, it } from 'vitest';
import { sanitizeDebugDetail } from '../src/core/debug';

describe('sanitizeDebugDetail', () => {
  it('redacts full URLs from debug detail', () => {
    expect(sanitizeDebugDetail('Loaded https://github.com/example/repo/pull/1 for extraction.')).toBe(
      'Loaded [redacted-url] for extraction.'
    );
  });

  it('truncates oversized debug detail payloads', () => {
    const detail = `prefix ${'a'.repeat(600)}`;
    const sanitized = sanitizeDebugDetail(detail);

    expect(sanitized).toContain('...[truncated]');
    expect(sanitized!.length).toBeLessThanOrEqual(500);
  });
});
