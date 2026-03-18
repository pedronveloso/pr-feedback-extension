import type { FeedbackComment, FileFeedbackEntry, LineRange } from './types';
import { commentBodyToMarkdown } from './markdown';

const THREAD_SELECTORS = ['details.review-thread-component', '[id^="discussion_r"]'];
const FILE_PATH_SELECTORS = ['summary a.text-mono', 'summary [data-path]', '[data-path]', 'summary a[title]'];
const COMMENT_BODY_SELECTORS = [
  '.js-inline-comments-container .js-comment.review-comment .js-comment-body',
  '.js-comment.review-comment .js-comment-body'
];
const AUTOMATED_COMMENT_SELECTORS = [
  'react-partial[partial-name="automated-review-comment"] script[data-target="react-partial.embeddedData"]',
  'script[data-target="react-partial.embeddedData"]'
];

interface AutomatedCommentData {
  props?: {
    comment?: {
      bodyHTML?: string;
      body?: string;
      automatedComment?: {
        message?: string;
      };
      suggestion?: {
        diffEntries?: Array<{
          path?: string;
          diffLines?: Array<{
            left?: number | null;
            right?: number | null;
            type?: string;
          }>;
        }>;
      };
    };
  };
}

interface AutomatedMetadata {
  filePath: string | null;
  lineRange: LineRange | null;
}

export interface ThreadExtraction {
  filePath: string | null;
  lineRange: LineRange;
  comments: FeedbackComment[];
}

function queryFirst(root: ParentNode, selectors: string[]): Element | null {
  for (const selector of selectors) {
    const match = root.querySelector(selector);
    if (match) {
      return match;
    }
  }

  return null;
}

function queryAll(root: ParentNode, selectors: string[]): Element[] {
  const seen = new Set<Element>();

  for (const selector of selectors) {
    for (const match of Array.from(root.querySelectorAll(selector))) {
      seen.add(match);
    }
  }

  return Array.from(seen).sort((left, right) => {
    if (left === right) {
      return 0;
    }

    return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
}

function parseLineNumber(text: string | null | undefined): number | null {
  if (!text) {
    return null;
  }

  const digits = text.replace(/[^\d]/g, '');
  if (!digits) {
    return null;
  }

  const line = Number.parseInt(digits, 10);
  return Number.isFinite(line) ? line : null;
}

function parseLineNumberAttribute(thread: Element, attributeName: string): number | null {
  const directValue = parseLineNumber(thread.getAttribute(attributeName));
  if (directValue !== null) {
    return directValue;
  }

  const descendant = thread.querySelector<HTMLElement>(`[${attributeName}]`);
  return parseLineNumber(descendant?.getAttribute(attributeName));
}

function formatAutomatedCommentBody(thread: Element, data: AutomatedCommentData): string | null {
  const bodyHtml = data.props?.comment?.bodyHTML ?? data.props?.comment?.automatedComment?.message ?? null;
  if (bodyHtml) {
    const container = thread.ownerDocument.createElement('div');
    container.innerHTML = bodyHtml;
    return commentBodyToMarkdown(container).trim();
  }

  return data.props?.comment?.body?.trim() ?? null;
}

function parseAutomatedCommentData(script: Element): AutomatedCommentData | null {
  const raw = script.textContent?.trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AutomatedCommentData;
  } catch {
    return null;
  }
}

function getAutomatedCommentPayloads(thread: Element): AutomatedCommentData[] {
  return queryAll(thread, AUTOMATED_COMMENT_SELECTORS)
    .map((script) => parseAutomatedCommentData(script))
    .filter((data): data is AutomatedCommentData => data !== null);
}

function extractAutomatedMetadataFromPayloads(payloads: AutomatedCommentData[]): AutomatedMetadata {
  for (const data of payloads) {
    const diffEntry = data.props?.comment?.suggestion?.diffEntries?.[0];
    const filePath = diffEntry?.path?.trim() || null;
    const rightLines =
      diffEntry?.diffLines
        ?.filter((line) => line.type !== 'HUNK')
        .map((line) => line.right)
        .filter((line): line is number => typeof line === 'number' && Number.isFinite(line)) ?? [];

    if (!filePath && rightLines.length === 0) {
      continue;
    }

    return {
      filePath,
      lineRange:
        rightLines.length > 0
          ? {
              startLine: rightLines[0],
              endLine: rightLines[rightLines.length - 1]
            }
          : null
    };
  }

  return { filePath: null, lineRange: null };
}

export function findReviewThreads(doc: Document): Element[] {
  return queryAll(doc, THREAD_SELECTORS).filter((thread) => !isResolvedThread(thread) && !isNestedDiscussionWrapper(thread));
}

function isResolvedThread(thread: Element): boolean {
  return thread.matches('details.review-thread-component[data-resolved="true"]');
}

function isNestedDiscussionWrapper(thread: Element): boolean {
  return thread.id.startsWith('discussion_r') && Boolean(thread.closest('details.review-thread-component'));
}

export function extractFilePath(thread: Element): string | null {
  return extractThreadData(thread).filePath;
}

function extractFilePathFromThread(thread: Element, automatedMetadata: AutomatedMetadata): string | null {
  const fileElement = queryFirst(thread, FILE_PATH_SELECTORS);

  const fromAttribute = fileElement?.getAttribute('data-path')?.trim();
  if (fromAttribute) {
    return fromAttribute;
  }

  const fromTitle = fileElement?.getAttribute('title')?.trim();
  if (fromTitle) {
    return fromTitle;
  }

  const fromText = fileElement?.textContent?.trim() ?? '';
  if (fromText) {
    return fromText;
  }

  return automatedMetadata.filePath;
}

export function extractLineRange(thread: Element): LineRange {
  return extractThreadData(thread).lineRange;
}

function extractLineRangeFromThread(thread: Element, automatedMetadata: AutomatedMetadata): LineRange {
  const startLine =
    parseLineNumber(thread.querySelector('.js-multi-line-preview-start')?.textContent) ??
    parseLineNumberAttribute(thread, 'data-start-line');
  const endLine =
    parseLineNumber(thread.querySelector('.js-multi-line-preview-end')?.textContent) ??
    parseLineNumberAttribute(thread, 'data-end-line');

  if (startLine !== null || endLine !== null) {
    return {
      startLine,
      endLine: endLine ?? startLine
    };
  }

  const visibleLineNumbers = Array.from(thread.querySelectorAll('[data-line-number]'))
    .map((node) => parseLineNumber(node.getAttribute('data-line-number')))
    .filter((line): line is number => line !== null);

  if (visibleLineNumbers.length === 0) {
    return automatedMetadata.lineRange ?? { startLine: null, endLine: null };
  }

  return {
    startLine: visibleLineNumbers[0],
    endLine: visibleLineNumbers[visibleLineNumbers.length - 1]
  };
}

export function extractCommentBlocks(thread: Element, lineRange: LineRange = extractLineRange(thread)): FeedbackComment[] {
  return extractCommentBlocksFromThread(thread, lineRange, getAutomatedCommentPayloads(thread));
}

function extractCommentBlocksFromThread(
  thread: Element,
  lineRange: LineRange,
  automatedPayloads: AutomatedCommentData[]
): FeedbackComment[] {
  const inlineComments = queryAll(thread, COMMENT_BODY_SELECTORS)
    .map((comment) => commentBodyToMarkdown(comment))
    .map((comment) => comment.trim())
    .filter(Boolean)
    .map((body) => ({ ...lineRange, body }));

  const automatedComments = automatedPayloads
    .map((data) => formatAutomatedCommentBody(thread, data))
    .filter((comment): comment is string => Boolean(comment))
    .map((body) => ({ ...lineRange, body }));

  const deduped = new Map<string, FileFeedbackEntry['comments'][number]>();

  for (const comment of [...inlineComments, ...automatedComments]) {
    const key = `${comment.startLine ?? ''}:${comment.endLine ?? ''}:${comment.body}`;
    deduped.set(key, comment);
  }

  return Array.from(deduped.values());
}

export function extractThreadData(thread: Element): ThreadExtraction {
  const automatedPayloads = getAutomatedCommentPayloads(thread);
  const automatedMetadata = extractAutomatedMetadataFromPayloads(automatedPayloads);
  const filePath = extractFilePathFromThread(thread, automatedMetadata);
  const lineRange = extractLineRangeFromThread(thread, automatedMetadata);

  return {
    filePath,
    lineRange,
    comments: extractCommentBlocksFromThread(thread, lineRange, automatedPayloads)
  };
}
