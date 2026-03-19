import {
  CLEAR_DEBUG_LOGS_MESSAGE_TYPE,
  CONTENT_SCRIPT_READY_MESSAGE_TYPE,
  DEBUG_LOG_MESSAGE_TYPE,
  GET_DEBUG_LOGS_MESSAGE_TYPE,
  EXTRACT_FEEDBACK_MESSAGE_TYPE,
  isContentScriptReadyResponse,
  isExtractFeedbackResponse,
  type DebugLogEntry,
  type DebugRuntimeResponse,
  type ContentScriptRequest,
  type ContentScriptResponse,
  type ExtractFeedbackDiagnostics,
  type ExtractFeedbackRequest,
  type ExtractFeedbackResponse
} from '../shared/messages';

interface PopupElements {
  outputTab: HTMLButtonElement;
  logsTab: HTMLButtonElement;
  logsActions: HTMLDivElement;
  copyLogsButton: HTMLButtonElement;
  clearLogsButton: HTMLButtonElement;
  logsPanel: HTMLElement;
  logsOutput: HTMLTextAreaElement;
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

interface RuntimeApi {
  sendMessage(message: unknown): Promise<DebugRuntimeResponse>;
}

interface ManagementApi {
  getSelf(): Promise<{ installType: string }>;
}

interface ScriptingApi {
  executeScript(injection: chrome.scripting.ScriptInjection<[], unknown>): Promise<unknown>;
}

export interface PopupDependencies {
  document: Document;
  tabsApi: TabsApi;
  runtimeApi?: RuntimeApi;
  managementApi?: ManagementApi;
  scriptingApi?: ScriptingApi;
  clipboardApi?: ClipboardApi;
  fallbackCopy?: (output: HTMLTextAreaElement, doc: Document) => boolean;
  autoExtract?: boolean;
  wait?: (ms: number) => Promise<void>;
}

export interface PopupController {
  extractFeedback(): Promise<void>;
  copyOutput(): Promise<void>;
  refreshLogs(): Promise<void>;
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
  const outputTab = doc.querySelector<HTMLButtonElement>('#output-tab');
  const logsTab = doc.querySelector<HTMLButtonElement>('#logs-tab');
  const logsActions = doc.querySelector<HTMLDivElement>('#logs-actions');
  const copyLogsButton = doc.querySelector<HTMLButtonElement>('#copy-logs-button');
  const clearLogsButton = doc.querySelector<HTMLButtonElement>('#clear-logs-button');
  const logsPanel = doc.querySelector<HTMLElement>('#logs-panel');
  const logsOutput = doc.querySelector<HTMLTextAreaElement>('#logs-output');
  const output = doc.querySelector<HTMLTextAreaElement>('#output');
  const status = doc.querySelector<HTMLParagraphElement>('#status');
  const extractButton = doc.querySelector<HTMLButtonElement>('#extract-button');
  const copyButton = doc.querySelector<HTMLButtonElement>('#copy-button');

  if (!outputTab || !logsTab || !logsActions || !copyLogsButton || !clearLogsButton || !logsPanel || !logsOutput || !output || !status || !extractButton || !copyButton) {
    throw new Error('Popup elements not found.');
  }

  return {
    outputTab,
    logsTab,
    logsActions,
    copyLogsButton,
    clearLogsButton,
    logsPanel,
    logsOutput,
    output,
    status,
    extractButton,
    copyButton
  };
}

function formatDebugLogs(logs: DebugLogEntry[]): string {
  if (logs.length === 0) {
    return 'No debug logs captured yet.';
  }

  return logs
    .map((log) => {
      const parts = [log.timestamp, `[${log.source}]`, log.level.toUpperCase(), log.event];
      if (log.detail) {
        parts.push(log.detail);
      }

      return parts.join(' ');
    })
    .join('\n');
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
  runtimeApi,
  managementApi,
  scriptingApi,
  clipboardApi,
  fallbackCopy,
  autoExtract = true,
  wait = defaultWait
}: PopupDependencies): PopupController {
  const elements = getPopupElements(document);
  const legacyCopy = fallbackCopy ?? ((output, doc) => createLegacyCopyFallback(doc)(output));
  let logsEnabled = false;

  const setStatus = (message: string): void => {
    elements.status.textContent = message;
  };

  const logPopupEvent = (event: string, detail?: string): void => {
    if (!runtimeApi) {
      return;
    }

    void runtimeApi.sendMessage({
      type: DEBUG_LOG_MESSAGE_TYPE,
      entry: {
        timestamp: new Date().toISOString(),
        source: 'popup',
        level: 'info',
        event,
        detail
      }
    }).catch(() => undefined);
  };

  const setActivePanel = (panel: 'output' | 'logs'): void => {
    const showLogs = panel === 'logs' && logsEnabled;
    elements.outputTab.setAttribute('aria-selected', String(!showLogs));
    elements.logsTab.setAttribute('aria-selected', String(showLogs));
    elements.output.hidden = showLogs;
    elements.logsPanel.hidden = !showLogs;
    elements.logsActions.hidden = !showLogs;
  };

  const refreshLogs = async (): Promise<void> => {
    if (!logsEnabled || !runtimeApi) {
      elements.logsOutput.value = 'Debug logs are unavailable in this build.';
      return;
    }

    const response = await runtimeApi.sendMessage({ type: GET_DEBUG_LOGS_MESSAGE_TYPE });
    if ('ok' in response && response.ok === false) {
      throw new Error(response.error);
    }

    if (!('logs' in response) || !Array.isArray(response.logs)) {
      throw new Error('Received an invalid debug logs response.');
    }

    elements.logsOutput.value = formatDebugLogs(response.logs);
  };

  const showPopupError = (descriptor: PopupErrorDescriptor, error?: unknown): void => {
    setStatus(descriptor.status);
    elements.output.value = formatPopupErrorReport(descriptor, error);
  };

  const showLogsError = (status: string, error?: unknown): void => {
    setStatus(status);
    const errorMessage = getErrorMessage(error);
    elements.logsOutput.value = errorMessage ? `${status}\n\nBrowser detail: ${errorMessage}` : status;
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

  const requestExtraction = async (tabId: number): Promise<ContentScriptResponse> => {
    return tabsApi.sendMessage(tabId, { type: EXTRACT_FEEDBACK_MESSAGE_TYPE } satisfies ExtractFeedbackRequest);
  };

  const toExtractionAttempt = (response: ContentScriptResponse): ExtractionAttempt => {
    if (!isExtractFeedbackResponse(response)) {
      return {
        kind: 'error',
        descriptor: {
          code: 'PRFE-POPUP-006',
          heading: 'Received an invalid response from the content script.',
          details: ['The extension could not read diagnostics for this page.'],
          status: 'Received an invalid response from the content script.'
        }
      };
    }

    return { kind: 'response', response };
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
      return toExtractionAttempt(await requestExtraction(activeTab.id!));
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
      return toExtractionAttempt(await requestExtraction(activeTab.id!));
    } catch (initialError) {
      return recoverExtractionResponse(activeTab, initialError);
    }
  };

  const extractFeedback = async (): Promise<void> => {
    elements.extractButton.disabled = true;
    setStatus('Extracting...');
    logPopupEvent('popup:extract-clicked');

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
        await refreshLogs().catch(() => undefined);
        return;
      }

      renderExtractionResponse(attempt.response);
      await refreshLogs().catch(() => undefined);
    } catch (error) {
      showPopupError({
        code: 'PRFE-POPUP-999',
        heading: 'Extraction failed unexpectedly inside the popup.',
        details: ['This is an unhandled popup-side failure. Check the popup extraction flow in `src/popup/app.ts`.'],
        status: 'Refresh the pull request page and try again.'
      }, error);
      await refreshLogs().catch(() => undefined);
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

  const copyLogs = async (): Promise<void> => {
    if (!elements.logsOutput.value.trim()) {
      setStatus('No logs to copy yet.');
      return;
    }

    try {
      if (!clipboardApi) {
        throw new Error('Clipboard API unavailable.');
      }

      await clipboardApi.writeText(elements.logsOutput.value);
      setStatus('Copied logs to clipboard.');
    } catch {
      if (!legacyCopy(elements.logsOutput, document)) {
        setStatus('Unable to copy logs.');
        return;
      }

      setStatus('Copied logs to clipboard.');
    }
  };

  const clearLogs = async (): Promise<void> => {
    if (!logsEnabled || !runtimeApi) {
      return;
    }

    try {
      const response = await runtimeApi.sendMessage({ type: CLEAR_DEBUG_LOGS_MESSAGE_TYPE });
      if ('ok' in response && response.ok === false) {
        throw new Error(response.error);
      }

      if (!('ok' in response) || response.ok !== true) {
        throw new Error('Received an invalid clear-logs response.');
      }

      await refreshLogs();
      setStatus('Debug logs cleared.');
    } catch (error) {
      showLogsError('Could not clear debug logs.', error);
    }
  };

  elements.extractButton.addEventListener('click', () => {
    void extractFeedback();
  });

  elements.copyButton.addEventListener('click', () => {
    void copyOutput();
  });

  elements.outputTab.addEventListener('click', () => {
    setActivePanel('output');
  });

  elements.logsTab.addEventListener('click', async () => {
    if (!logsEnabled) {
      return;
    }

    try {
      await refreshLogs();
      setActivePanel('logs');
    } catch (error) {
      showLogsError('Could not load debug logs.', error);
      setActivePanel('logs');
    }
  });

  elements.copyLogsButton.addEventListener('click', () => {
    void copyLogs();
  });

  elements.clearLogsButton.addEventListener('click', () => {
    void clearLogs();
  });

  const initializeDeveloperUi = async (): Promise<void> => {
    if (!managementApi) {
      elements.logsTab.hidden = true;
      elements.logsActions.hidden = true;
      elements.logsPanel.hidden = true;
      return;
    }

    try {
      const self = await managementApi.getSelf();
      logsEnabled = self.installType === 'development';
    } catch {
      logsEnabled = false;
    }

    elements.logsTab.hidden = !logsEnabled;
    elements.logsActions.hidden = true;
    elements.logsPanel.hidden = true;
    if (logsEnabled) {
      await refreshLogs().catch(() => undefined);
      logPopupEvent('popup:developer-ui-enabled');
    }
  };

  setActivePanel('output');
  void initializeDeveloperUi();

  if (autoExtract) {
    void extractFeedback();
  }

  return {
    extractFeedback,
    copyOutput,
    refreshLogs
  };
}
