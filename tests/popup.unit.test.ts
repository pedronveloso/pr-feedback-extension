import { describe, expect, it, vi } from 'vitest';
import { mountPopup } from '../src/popup/app';
import {
  CONTENT_SCRIPT_READY_MESSAGE_TYPE,
  EXTRACT_FEEDBACK_MESSAGE_TYPE,
  type ContentScriptResponse,
  type ExtractFeedbackResponse
} from '../src/shared/messages';

function createPopupDocument(): Document {
  return new DOMParser().parseFromString(
    `
      <!doctype html>
      <html>
        <body>
          <main>
            <button id="extract-button" type="button">Extract</button>
            <button id="copy-button" type="button">Copy</button>
            <p id="status"></p>
            <textarea id="output"></textarea>
          </main>
        </body>
      </html>
    `,
    'text/html'
  );
}

function createTabsApi(response: ExtractFeedbackResponse, tabId = 1) {
  return {
    query: vi.fn(async () => (tabId ? [{ id: tabId, url: 'https://github.com/example/repo/pull/1' }] : [])),
    sendMessage: vi.fn(async () => response)
  };
}

function createContentScriptTabsApi(response: ContentScriptResponse, tabId = 1) {
  return {
    query: vi.fn(async () => (tabId ? [{ id: tabId, url: 'https://github.com/example/repo/pull/1' }] : [])),
    sendMessage: vi.fn(async () => response)
  };
}

describe('mountPopup', () => {
  it('extracts feedback and updates the UI status', async () => {
    const doc = createPopupDocument();
    const tabsApi = createTabsApi({
      ok: true,
      output: 'Formatted output',
      warnings: ['Skipped one thread.'],
      diagnostics: {
        threadCount: 2,
        entryCount: 1,
        warningCount: 1,
        outputLength: 16,
        warnings: ['Skipped one thread.']
      }
    });

    const controller = mountPopup({
      document: doc,
      tabsApi,
      scriptingApi: { executeScript: vi.fn(async () => undefined) },
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(tabsApi.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(tabsApi.sendMessage).toHaveBeenCalledWith(1, { type: EXTRACT_FEEDBACK_MESSAGE_TYPE });
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toBe('Formatted output');
    expect(doc.querySelector('#status')?.textContent).toBe('Extracted with 1 warning(s).');
  });

  it('shows an invalid-response status for malformed content-script replies', async () => {
    const doc = createPopupDocument();
    const tabsApi = createContentScriptTabsApi({ ok: true, warnings: [] } as unknown as ContentScriptResponse);

    const controller = mountPopup({
      document: doc,
      tabsApi,
      scriptingApi: { executeScript: vi.fn(async () => undefined) },
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(doc.querySelector('#status')?.textContent).toBe('Received an invalid response from the content script.');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Code: PRFE-POPUP-006');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('could not read diagnostics');
  });

  it('shows an invalid-response status when extraction receives a readiness reply', async () => {
    const doc = createPopupDocument();
    const tabsApi = createContentScriptTabsApi({ ready: true });

    const controller = mountPopup({
      document: doc,
      tabsApi,
      scriptingApi: { executeScript: vi.fn(async () => undefined) },
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(doc.querySelector('#status')?.textContent).toBe('Received an invalid response from the content script.');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Code: PRFE-POPUP-006');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('could not read diagnostics');
  });

  it('falls back to legacy copy when the clipboard API fails', async () => {
    const doc = createPopupDocument();
    const tabsApi = createTabsApi({
      ok: true,
      output: 'Formatted output',
      warnings: [],
      diagnostics: {
        threadCount: 1,
        entryCount: 1,
        warningCount: 0,
        outputLength: 16,
        warnings: []
      }
    });
    const fallbackCopy = vi.fn(() => true);

    const controller = mountPopup({
      document: doc,
      tabsApi,
      scriptingApi: { executeScript: vi.fn(async () => undefined) },
      clipboardApi: { writeText: vi.fn(async () => Promise.reject(new Error('no clipboard'))) },
      fallbackCopy,
      autoExtract: false
    });

    doc.querySelector<HTMLTextAreaElement>('#output')!.value = 'Copy me';
    await controller.copyOutput();

    expect(fallbackCopy).toHaveBeenCalledOnce();
    expect(doc.querySelector('#status')?.textContent).toBe('Copied to clipboard.');
  });

  it('shows a page guidance message when there is no active tab', async () => {
    const doc = createPopupDocument();
    const tabsApi = createTabsApi(
      {
        ok: true,
        output: 'Formatted output',
        warnings: [],
        diagnostics: {
          threadCount: 1,
          entryCount: 1,
          warningCount: 0,
          outputLength: 16,
          warnings: []
        }
      },
      0
    );

    const controller = mountPopup({
      document: doc,
      tabsApi,
      scriptingApi: { executeScript: vi.fn(async () => undefined) },
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(doc.querySelector('#status')?.textContent).toBe('No active tab found.');
    expect(tabsApi.sendMessage).not.toHaveBeenCalled();
  });

  it('shows diagnostics in the output box when extraction fails', async () => {
    const doc = createPopupDocument();
    const tabsApi = createTabsApi({
      ok: false,
      error: 'EXTRACTION_FAILED',
      diagnostics: {
        threadCount: 3,
        entryCount: 0,
        warningCount: 1,
        outputLength: 0,
        warnings: ['Skipped thread 2 without file path.'],
        code: 'PRFE-CONTENT-001',
        reason: 'Unexpected DOM shape.'
      }
    });

    const controller = mountPopup({
      document: doc,
      tabsApi,
      scriptingApi: { executeScript: vi.fn(async () => undefined) },
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(doc.querySelector('#status')?.textContent).toBe('Could not extract feedback from this page.');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Extraction failed.');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Code: PRFE-CONTENT-001');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Review threads found: 3');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Reason: Unexpected DOM shape.');
  });

  it('shows diagnostics when extraction finds no usable feedback', async () => {
    const doc = createPopupDocument();
    const tabsApi = createTabsApi({
      ok: true,
      output: 'No review feedback comments found on this PR page.',
      warnings: ['No review threads found. GitHub DOM may have changed or the PR has no inline feedback.'],
      diagnostics: {
        threadCount: 0,
        entryCount: 0,
        warningCount: 1,
        outputLength: 47,
        warnings: ['No review threads found. GitHub DOM may have changed or the PR has no inline feedback.']
      }
    });

    const controller = mountPopup({
      document: doc,
      tabsApi,
      scriptingApi: { executeScript: vi.fn(async () => undefined) },
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(doc.querySelector('#status')?.textContent).toBe('No extractable feedback found. 1 warning(s) available below.');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('No extractable feedback was found.');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Review threads found: 0');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Warnings:');
  });

  it('injects the content script and retries when messaging fails on a GitHub PR tab', async () => {
    const doc = createPopupDocument();
    const wait = vi.fn(async () => undefined);
    const tabsApi = {
      query: vi.fn(async () => [{ id: 1, url: 'https://github.com/example/repo/pull/1' }]),
      sendMessage: vi
        .fn()
        .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
        .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
        .mockResolvedValueOnce({ ready: true })
        .mockResolvedValueOnce({
          ok: true,
          output: 'Recovered output',
          warnings: [],
          diagnostics: {
            threadCount: 1,
            entryCount: 1,
            warningCount: 0,
            outputLength: 16,
            warnings: []
          }
        } satisfies ExtractFeedbackResponse)
    };
    const scriptingApi = { executeScript: vi.fn(async () => undefined) };

    const controller = mountPopup({
      document: doc,
      tabsApi,
      scriptingApi,
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      wait,
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(scriptingApi.executeScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ['content.js']
    });
    expect(tabsApi.sendMessage).toHaveBeenCalledTimes(4);
    expect(tabsApi.sendMessage).toHaveBeenNthCalledWith(2, 1, { type: CONTENT_SCRIPT_READY_MESSAGE_TYPE });
    expect(tabsApi.sendMessage).toHaveBeenNthCalledWith(3, 1, { type: CONTENT_SCRIPT_READY_MESSAGE_TYPE });
    expect(tabsApi.sendMessage).toHaveBeenNthCalledWith(4, 1, { type: EXTRACT_FEEDBACK_MESSAGE_TYPE });
    expect(wait).toHaveBeenCalledOnce();
    expect(doc.querySelector('#status')?.textContent).toBe('Extracted successfully.');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toBe('Recovered output');
  });

  it('shows recovery guidance when messaging fails on a GitHub PR tab and reinjection is unavailable', async () => {
    const doc = createPopupDocument();
    const tabsApi = {
      query: vi.fn(async () => [{ id: 1, url: 'https://github.com/example/repo/pull/1' }]),
      sendMessage: vi.fn(async () => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')))
    };

    const controller = mountPopup({
      document: doc,
      tabsApi,
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(doc.querySelector('#status')?.textContent).toBe('Refresh the pull request page and try again.');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Code: PRFE-POPUP-003');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('The extension was reloaded after this tab was opened');
  });

  it('shows unsupported-page guidance when messaging fails on a non-GitHub tab', async () => {
    const doc = createPopupDocument();
    const tabsApi = {
      query: vi.fn(async () => [{ id: 1, url: 'https://example.com/page' }]),
      sendMessage: vi.fn(async () => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')))
    };

    const controller = mountPopup({
      document: doc,
      tabsApi,
      scriptingApi: { executeScript: vi.fn(async () => undefined) },
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(doc.querySelector('#status')?.textContent).toBe('Open a GitHub pull request page and try again.');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Code: PRFE-POPUP-002');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('does not look like a supported GitHub pull request page');
  });

  it('shows a distinct code when reinjection succeeds but the retry still fails', async () => {
    const doc = createPopupDocument();
    const wait = vi.fn(async () => undefined);
    const tabsApi = {
      query: vi.fn(async () => [{ id: 1, url: 'https://github.com/example/repo/pull/1' }]),
      sendMessage: vi
        .fn()
        .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
        .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
        .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
        .mockRejectedValueOnce(new Error('The message port closed before a response was received.'))
    };
    const scriptingApi = { executeScript: vi.fn(async () => undefined) };

    const controller = mountPopup({
      document: doc,
      tabsApi,
      scriptingApi,
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      wait,
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(scriptingApi.executeScript).toHaveBeenCalledOnce();
    expect(wait).toHaveBeenCalledTimes(2);
    expect(doc.querySelector('#status')?.textContent).toBe('Refresh the pull request page and try again.');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Code: PRFE-POPUP-005');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('The message port closed before a response was received.');
  });

  it('shows a distinct code when content-script injection itself fails', async () => {
    const doc = createPopupDocument();
    const tabsApi = {
      query: vi.fn(async () => [{ id: 1, url: 'https://github.com/example/repo/pull/1' }]),
      sendMessage: vi.fn(async () => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')))
    };
    const scriptingApi = {
      executeScript: vi.fn(async () => Promise.reject(new Error('Cannot access contents of url "https://github.com/...".')))
    };

    const controller = mountPopup({
      document: doc,
      tabsApi,
      scriptingApi,
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(doc.querySelector('#status')?.textContent).toBe('Refresh the pull request page and try again.');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Code: PRFE-POPUP-004');
    expect(doc.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('Cannot access contents of url');
  });
});
