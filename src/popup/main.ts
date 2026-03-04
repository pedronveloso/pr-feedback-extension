import '../popup/styles.css';

interface ExtractResponse {
  ok: boolean;
  output: string;
  warnings: string[];
}

const outputEl = document.querySelector<HTMLTextAreaElement>('#output');
const statusEl = document.querySelector<HTMLParagraphElement>('#status');
const extractButton = document.querySelector<HTMLButtonElement>('#extract-button');
const copyButton = document.querySelector<HTMLButtonElement>('#copy-button');

if (!outputEl || !statusEl || !extractButton || !copyButton) {
  throw new Error('Popup elements not found.');
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

async function getActiveTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id ?? null;
}

async function extractFeedback(): Promise<void> {
  extractButton.disabled = true;
  setStatus('Extracting...');

  try {
    const tabId = await getActiveTabId();
    if (!tabId) {
      setStatus('No active tab found.');
      return;
    }

    const response = (await chrome.tabs.sendMessage(tabId, {
      type: 'EXTRACT_FEEDBACK'
    })) as ExtractResponse;

    if (!response?.ok) {
      setStatus('Failed to extract feedback from page.');
      return;
    }

    outputEl.value = response.output;
    setStatus(response.warnings.length > 0 ? `Extracted with ${response.warnings.length} warning(s).` : 'Extracted successfully.');
  } catch {
    setStatus('Open a GitHub pull request page and try again.');
  } finally {
    extractButton.disabled = false;
  }
}

async function copyOutput(): Promise<void> {
  if (!outputEl.value.trim()) {
    setStatus('Nothing to copy yet.');
    return;
  }

  try {
    await navigator.clipboard.writeText(outputEl.value);
    setStatus('Copied to clipboard.');
  } catch {
    outputEl.select();
    document.execCommand('copy');
    setStatus('Copied to clipboard.');
  }
}

extractButton.addEventListener('click', () => {
  void extractFeedback();
});

copyButton.addEventListener('click', () => {
  void copyOutput();
});

void extractFeedback();
