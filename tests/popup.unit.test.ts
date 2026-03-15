import { describe, expect, it, vi } from 'vitest';
import { mountPopup } from '../src/popup/app';
import { EXTRACT_FEEDBACK_MESSAGE_TYPE, type ExtractFeedbackResponse } from '../src/shared/messages';

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
    query: vi.fn(async () => (tabId ? [{ id: tabId }] : [])),
    sendMessage: vi.fn(async () => response)
  };
}

describe('mountPopup', () => {
  it('extracts feedback and updates the UI status', async () => {
    const doc = createPopupDocument();
    const tabsApi = createTabsApi({
      ok: true,
      output: 'Formatted output',
      warnings: ['Skipped one thread.']
    });

    const controller = mountPopup({
      document: doc,
      tabsApi,
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
    const tabsApi = {
      query: vi.fn(async () => [{ id: 1 }]),
      sendMessage: vi.fn(async () => ({ ok: true, warnings: [] } as unknown as ExtractFeedbackResponse))
    };

    const controller = mountPopup({
      document: doc,
      tabsApi,
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(doc.querySelector('#status')?.textContent).toBe('Received an invalid response from the content script.');
  });

  it('falls back to legacy copy when the clipboard API fails', async () => {
    const doc = createPopupDocument();
    const tabsApi = createTabsApi({
      ok: true,
      output: 'Formatted output',
      warnings: []
    });
    const fallbackCopy = vi.fn(() => true);

    const controller = mountPopup({
      document: doc,
      tabsApi,
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
        warnings: []
      },
      0
    );

    const controller = mountPopup({
      document: doc,
      tabsApi,
      clipboardApi: { writeText: vi.fn(async () => undefined) },
      autoExtract: false
    });

    await controller.extractFeedback();

    expect(doc.querySelector('#status')?.textContent).toBe('No active tab found.');
    expect(tabsApi.sendMessage).not.toHaveBeenCalled();
  });
});
