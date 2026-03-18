import {
  CONTENT_SCRIPT_READY_MESSAGE_TYPE,
  EXTRACT_FEEDBACK_MESSAGE_TYPE,
  isContentScriptReadyResponse,
  isExtractFeedbackResponse,
  type ContentScriptRequest,
  type ContentScriptResponse,
  type ExtractFeedbackDiagnostics,
  type ExtractFeedbackRequest,
  type ExtractFeedbackResponse
} from '../shared/messages';

interface PopupElements {
  output: HTMLTextAreaElement;
  status: HTMLParagraphElement;
  extractButton: HTMLButtonElement;
  copyButton: HTMLButtonElement;
}

interface TabsApi {
  query(queryInfo: chrome.tabs.QueryInfo): Promise<Array<Pick<chrome.tabs.Tab, 'id' | 'url'>>>;
  sendMessage(tabId: number, message: ContentScriptRequest): Promise<ContentScriptResponse>;
}

interface ClipboardApi {
  writeText(text: string): Promise<void>;
}

interface ScriptingApi {
  executeScript(injection: chrome.scripting.ScriptInjection<[], unknown>): Promise<unknown>;
}

export interface PopupDependencies {
  document: Document;
  tabsApi: TabsApi;
  scriptingApi?: ScriptingApi;
  clipboardApi?: ClipboardApi;
  fallbackCopy?: (output: HTMLTextAreaElement, doc: Document) => boolean;
  autoExtract?: boolean;
  wait?: (ms: number) => Promise<void>;
}

export interface PopupController {
  extractFeedback(): Promise<void>;
  copyOutput(): Promise<void>;
}

interface ActiveTabInfo {
  id: number | null;
  url: string | null;
}

interface PopupErrorDescriptor {
  code: string;
  heading: string;
  details: string[];
  status: string;
}

type ExtractionAttempt =
  | { kind: 'response'; response: ExtractFeedbackResponse }
  | { kind: 'error'; descriptor: PopupErrorDescriptor; error?: unknown };

function getPopupElements(doc: Document): PopupElements {
  const output = doc.querySelector<HTMLTextAreaElement>('#output');
  const status = doc.querySelector<HTMLParagraphElement>('#status');
  const extractButton = doc.querySelector<HTMLButtonElement>('#extract-button');
  const copyButton = doc.querySelector<HTMLButtonElement>('#copy-button');

  if (!output || !status || !extractButton || !copyButton) {
    throw new Error('Popup elements not found.');
  }

  return { output, status, extractButton, copyButton };
}

function createLegacyCopyFallback(doc: Document): (output: HTMLTextAreaElement) => boolean {
  return (output) => {
    output.focus();
    output.select();

    if (typeof doc.execCommand !== 'function') {
      return false;
    }

    return doc.execCommand('copy');
  };
}

function formatDiagnosticsReport(diagnostics: ExtractFeedbackDiagnostics, heading: string): string {
  const lines = [
    heading,
    '',
    ...(diagnostics.code ? [`Code: ${diagnostics.code}`] : []),
    `Review threads found: ${diagnostics.threadCount}`,
    `Extracted entries: ${diagnostics.entryCount}`,
    `Warnings: ${diagnostics.warningCount}`,
    `Formatted output length: ${diagnostics.outputLength}`
  ];

  if (diagnostics.reason) {
    lines.push(`Reason: ${diagnostics.reason}`);
  }

  if (diagnostics.warnings.length > 0) {
    lines.push('', 'Warnings:', ...diagnostics.warnings.map((warning) => `- ${warning}`));
  }

  return lines.join('\n');
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return null;
}

function formatPopupErrorReport(descriptor: PopupErrorDescriptor, error?: unknown): string {
  const lines = [descriptor.heading, '', `Code: ${descriptor.code}`, ...descriptor.details];
  const errorMessage = getErrorMessage(error);

  if (errorMessage) {
    lines.push('', `Browser detail: ${errorMessage}`);
  }

  return lines.join('\n');
}

function isGitHubPullRequestUrl(url: string | null): boolean {
  if (!url) {
    return false;
  }

  return /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[^/?#]+/.test(url);
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export function mountPopup({
  document,
  tabsApi,
  scriptingApi,
  clipboardApi,
  fallbackCopy,
  autoExtract = true,
  wait = defaultWait
}: PopupDependencies): PopupController {
  const elements = getPopupElements(document);
  const legacyCopy = fallbackCopy ?? ((output, doc) => createLegacyCopyFallback(doc)(output));

  const setStatus = (message: string): void => {
    elements.status.textContent = message;
  };

  const showPopupError = (descriptor: PopupErrorDescriptor, error?: unknown): void => {
    setStatus(descriptor.status);
    elements.output.value = formatPopupErrorReport(descriptor, error);
  };

  const renderExtractionResponse = (response: ExtractFeedbackResponse): void => {
    if (!isExtractFeedbackResponse(response)) {
      showPopupError({
        code: 'PRFE-POPUP-006',
        heading: 'Received an invalid response from the content script.',
        details: ['The extension could not read diagnostics for this page.'],
        status: 'Received an invalid response from the content script.'
      });
      return;
    }

    if (!response.ok) {
      const message = response.error === 'UNSUPPORTED_PAGE' ? 'Open a GitHub pull request page and try again.' : 'Could not extract feedback from this page.';
      setStatus(message);
      elements.output.value = response.diagnostics
        ? formatDiagnosticsReport(response.diagnostics, 'Extraction failed.')
        : `${message}\n\nNo diagnostics were returned by the content script.`;
      return;
    }

    if (response.diagnostics.entryCount === 0) {
      elements.output.value = formatDiagnosticsReport(response.diagnostics, 'No extractable feedback was found.');
      setStatus(
        response.warnings.length > 0
          ? `No extractable feedback found. ${response.warnings.length} warning(s) available below.`
          : 'No extractable feedback found on this page.'
      );
      return;
    }

    elements.output.value = response.output;
    setStatus(response.warnings.length > 0 ? `Extracted with ${response.warnings.length} warning(s).` : 'Extracted successfully.');
  };

  const getActiveTabInfo = async (): Promise<ActiveTabInfo> => {
    const tabs = await tabsApi.query({ active: true, currentWindow: true });
    return {
      id: tabs[0]?.id ?? null,
      url: tabs[0]?.url ?? null
    };
  };

  const requestExtraction = async (tabId: number): Promise<ExtractFeedbackResponse> => {
    return tabsApi.sendMessage(tabId, { type: EXTRACT_FEEDBACK_MESSAGE_TYPE } satisfies ExtractFeedbackRequest) as Promise<ExtractFeedbackResponse>;
  };

  const requestContentScriptReady = async (tabId: number): Promise<void> => {
    const response = await tabsApi.sendMessage(tabId, { type: CONTENT_SCRIPT_READY_MESSAGE_TYPE });

    if (!isContentScriptReadyResponse(response)) {
      throw new Error('Received an invalid readiness response from the content script.');
    }
  };

  const tryInjectContentScript = async (tabId: number): Promise<boolean> => {
    if (!scriptingApi) {
      return false;
    }

    await scriptingApi.executeScript({
      target: { tabId },
      files: ['content.js']
    });

    return true;
  };

  const waitForContentScriptReady = async (tabId: number): Promise<void> => {
    const retryDelaysMs = [0, 75, 150];
    let lastError: unknown;

    for (const delayMs of retryDelaysMs) {
      if (delayMs > 0) {
        await wait(delayMs);
      }

      try {
        await requestContentScriptReady(tabId);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error('Could not verify content-script readiness.');
  };

  const recoverExtractionResponse = async (activeTab: ActiveTabInfo, initialError: unknown): Promise<ExtractionAttempt> => {
    const isGitHubPr = isGitHubPullRequestUrl(activeTab.url);

    if (!isGitHubPr) {
      return {
        kind: 'error',
        descriptor: {
          code: 'PRFE-POPUP-002',
          heading: 'Open a GitHub pull request page and try again.',
          details: ['The active tab URL does not look like a supported GitHub pull request page.'],
          status: 'Open a GitHub pull request page and try again.'
        },
        error: initialError
      };
    }

    if (!scriptingApi) {
      return {
        kind: 'error',
        descriptor: {
          code: 'PRFE-POPUP-003',
          heading: 'Could not contact the content script.',
          details: [
            'The popup could not reach the current content script and script reinjection is unavailable.',
            'Likely causes:',
            '- The extension was reloaded after this tab was opened',
            '- The page needs a refresh so the content script can attach',
            'Try reloading the unpacked extension and refreshing the GitHub pull request tab.'
          ],
          status: 'Refresh the pull request page and try again.'
        },
        error: initialError
      };
    }

    try {
      await tryInjectContentScript(activeTab.id!);
    } catch (injectionError) {
      return {
        kind: 'error',
        descriptor: {
          code: 'PRFE-POPUP-004',
          heading: 'Could not inject the content script into this tab.',
          details: [
            'The popup tried to inject `content.js`, but the browser rejected the request.',
            'Refresh the GitHub pull request tab and rerun extraction.'
          ],
          status: 'Refresh the pull request page and try again.'
        },
        error: injectionError
      };
    }

    try {
      await waitForContentScriptReady(activeTab.id!);
      return { kind: 'response', response: await requestExtraction(activeTab.id!) };
    } catch (retryError) {
      return {
        kind: 'error',
        descriptor: {
          code: 'PRFE-POPUP-005',
          heading: 'Could not contact the content script after reinjection.',
          details: [
            'The popup retried extraction after injecting `content.js`, but the tab still did not answer.',
            'Refresh the GitHub pull request tab and rerun extraction.'
          ],
          status: 'Refresh the pull request page and try again.'
        },
        error: retryError
      };
    }
  };

  const requestExtractionWithRecovery = async (activeTab: ActiveTabInfo): Promise<ExtractionAttempt> => {
    try {
      return { kind: 'response', response: await requestExtraction(activeTab.id!) };
    } catch (initialError) {
      return recoverExtractionResponse(activeTab, initialError);
    }
  };

  const extractFeedback = async (): Promise<void> => {
    elements.extractButton.disabled = true;
    setStatus('Extracting...');

    try {
      const activeTab = await getActiveTabInfo();
      if (!activeTab.id) {
        showPopupError({
          code: 'PRFE-POPUP-001',
          heading: 'No active tab found.',
          details: ['The popup could not resolve an active browser tab to extract from.'],
          status: 'No active tab found.'
        });
        return;
      }

      const attempt = await requestExtractionWithRecovery(activeTab);
      if (attempt.kind === 'error') {
        showPopupError(attempt.descriptor, attempt.error);
        return;
      }

      renderExtractionResponse(attempt.response);
    } catch (error) {
      showPopupError({
        code: 'PRFE-POPUP-999',
        heading: 'Extraction failed unexpectedly inside the popup.',
        details: ['This is an unhandled popup-side failure. Check the popup extraction flow in `src/popup/app.ts`.'],
        status: 'Refresh the pull request page and try again.'
      }, error);
    } finally {
      elements.extractButton.disabled = false;
    }
  };

  const copyOutput = async (): Promise<void> => {
    if (!elements.output.value.trim()) {
      setStatus('Nothing to copy yet.');
      return;
    }

    try {
      if (!clipboardApi) {
        throw new Error('Clipboard API unavailable.');
      }

      await clipboardApi.writeText(elements.output.value);
      setStatus('Copied to clipboard.');
    } catch {
      if (!legacyCopy(elements.output, document)) {
        setStatus('Unable to copy to clipboard.');
        return;
      }

      setStatus('Copied to clipboard.');
    }
  };

  elements.extractButton.addEventListener('click', () => {
    void extractFeedback();
  });

  elements.copyButton.addEventListener('click', () => {
    void copyOutput();
  });

  if (autoExtract) {
    void extractFeedback();
  }

  return {
    extractFeedback,
    copyOutput
  };
}
