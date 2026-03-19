import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLEAR_DEBUG_LOGS_MESSAGE_TYPE,
  DEBUG_LOG_MESSAGE_TYPE,
  GET_DEBUG_LOGS_MESSAGE_TYPE,
  type DebugLogEntry
} from '../src/shared/messages';

type HandleDebugRuntimeMessage = typeof import('../src/background/service-worker')['handleDebugRuntimeMessage'];

describe('handleDebugRuntimeMessage', () => {
  let handleDebugRuntimeMessage: HandleDebugRuntimeMessage;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('chrome', {
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() }
      },
      storage: {
        session: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined)
        }
      }
    });

    ({ handleDebugRuntimeMessage } = await import('../src/background/service-worker'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an error response when appending a debug log fails', async () => {
    const sendResponse = vi.fn();
    const entry: DebugLogEntry = {
      timestamp: '2026-03-19T08:00:00.000Z',
      source: 'content',
      level: 'info',
      event: 'content:extract-request'
    };

    const handled = handleDebugRuntimeMessage(
      { type: DEBUG_LOG_MESSAGE_TYPE, entry },
      sendResponse,
      {
        appendLog: vi.fn(async () => Promise.reject(new Error('quota exceeded'))),
        hydrateLogs: vi.fn(async () => undefined),
        clearLogs: vi.fn(async () => undefined),
        getLogs: vi.fn(() => [])
      }
    );

    expect(handled).toBe(true);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'quota exceeded' });
  });

  it('returns an error response when loading debug logs fails', async () => {
    const sendResponse = vi.fn();

    const handled = handleDebugRuntimeMessage(
      { type: GET_DEBUG_LOGS_MESSAGE_TYPE },
      sendResponse,
      {
        appendLog: vi.fn(async () => undefined),
        hydrateLogs: vi.fn(async () => Promise.reject(new Error('session unavailable'))),
        clearLogs: vi.fn(async () => undefined),
        getLogs: vi.fn(() => [])
      }
    );

    expect(handled).toBe(true);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'session unavailable' });
  });

  it('returns an error response when clearing debug logs fails', async () => {
    const sendResponse = vi.fn();

    const handled = handleDebugRuntimeMessage(
      { type: CLEAR_DEBUG_LOGS_MESSAGE_TYPE },
      sendResponse,
      {
        appendLog: vi.fn(async () => undefined),
        hydrateLogs: vi.fn(async () => undefined),
        clearLogs: vi.fn(async () => Promise.reject(new Error('storage unavailable'))),
        getLogs: vi.fn(() => [])
      }
    );

    expect(handled).toBe(true);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'storage unavailable' });
  });
});
