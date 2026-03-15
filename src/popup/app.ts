import {
  EXTRACT_FEEDBACK_MESSAGE_TYPE,
  isExtractFeedbackResponse,
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
  query(queryInfo: chrome.tabs.QueryInfo): Promise<Array<Pick<chrome.tabs.Tab, 'id'>>>;
  sendMessage(tabId: number, message: ExtractFeedbackRequest): Promise<ExtractFeedbackResponse>;
}

interface ClipboardApi {
  writeText(text: string): Promise<void>;
}

export interface PopupDependencies {
  document: Document;
  tabsApi: TabsApi;
  clipboardApi?: ClipboardApi;
  fallbackCopy?: (output: HTMLTextAreaElement, doc: Document) => boolean;
  autoExtract?: boolean;
}

export interface PopupController {
  extractFeedback(): Promise<void>;
  copyOutput(): Promise<void>;
}

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

export function mountPopup({
  document,
  tabsApi,
  clipboardApi,
  fallbackCopy,
  autoExtract = true
}: PopupDependencies): PopupController {
  const elements = getPopupElements(document);
  const legacyCopy = fallbackCopy ?? ((output, doc) => createLegacyCopyFallback(doc)(output));

  const setStatus = (message: string): void => {
    elements.status.textContent = message;
  };

  const getActiveTabId = async (): Promise<number | null> => {
    const tabs = await tabsApi.query({ active: true, currentWindow: true });
    return tabs[0]?.id ?? null;
  };

  const extractFeedback = async (): Promise<void> => {
    elements.extractButton.disabled = true;
    setStatus('Extracting...');

    try {
      const tabId = await getActiveTabId();
      if (!tabId) {
        setStatus('No active tab found.');
        return;
      }

      const response = await tabsApi.sendMessage(tabId, { type: EXTRACT_FEEDBACK_MESSAGE_TYPE });
      if (!isExtractFeedbackResponse(response)) {
        setStatus('Received an invalid response from the content script.');
        return;
      }

      if (!response.ok) {
        setStatus(response.error === 'UNSUPPORTED_PAGE' ? 'Open a GitHub pull request page and try again.' : 'Failed to extract feedback from page.');
        return;
      }

      elements.output.value = response.output;
      setStatus(response.warnings.length > 0 ? `Extracted with ${response.warnings.length} warning(s).` : 'Extracted successfully.');
    } catch {
      setStatus('Open a GitHub pull request page and try again.');
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
