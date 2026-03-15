import type { FeedbackComment, FileFeedbackEntry, LineRange } from './types';
import { commentBodyToMarkdown } from './markdown';

const THREAD_SELECTORS = ['details.review-thread-component'];
const FILE_PATH_SELECTORS = ['summary a.text-mono', 'summary [data-path]', '[data-path]', 'summary a[title]'];
const COMMENT_BODY_SELECTORS = [
  '.js-inline-comments-container .js-comment.review-comment .js-comment-body',
  '.js-comment.review-comment .js-comment-body'
];
const AUTOMATED_COMMENT_SELECTORS = [
  'react-partial[partial-name="automated-review-comment"] script[data-target="react-partial.embeddedData"]',
  'script[data-target="react-partial.embeddedData"]'
];

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

  return Array.from(seen);
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

function parseAutomatedCommentBody(thread: Element, script: Element): string | null {
  const raw = script.textContent?.trim();
  if (!raw) {
    return null;
  }

  try {
    const data = JSON.parse(raw) as {
      props?: {
        comment?: {
          bodyHTML?: string;
          body?: string;
          automatedComment?: {
            message?: string;
          };
        };
      };
    };

    const bodyHtml = data.props?.comment?.bodyHTML ?? data.props?.comment?.automatedComment?.message ?? null;
    if (bodyHtml) {
      const container = thread.ownerDocument.createElement('div');
      container.innerHTML = bodyHtml;
      return commentBodyToMarkdown(container).trim();
    }

    return data.props?.comment?.body?.trim() ?? null;
  } catch {
    return null;
  }
}

export function findReviewThreads(doc: Document): Element[] {
  return queryAll(doc, THREAD_SELECTORS);
}

export function extractFilePath(thread: Element): string | null {
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
  return fromText || null;
}

export function extractLineRange(thread: Element): LineRange {
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
    return { startLine: null, endLine: null };
  }

  return {
    startLine: visibleLineNumbers[0],
    endLine: visibleLineNumbers[visibleLineNumbers.length - 1]
  };
}

export function extractCommentBlocks(thread: Element): FeedbackComment[] {
  const lineRange = extractLineRange(thread);

  const inlineComments = queryAll(thread, COMMENT_BODY_SELECTORS)
    .map((comment) => commentBodyToMarkdown(comment))
    .map((comment) => comment.trim())
    .filter(Boolean)
    .map((body) => ({ ...lineRange, body }));

  const automatedComments = queryAll(thread, AUTOMATED_COMMENT_SELECTORS)
    .map((script) => parseAutomatedCommentBody(thread, script))
    .filter((comment): comment is string => Boolean(comment))
    .map((body) => ({ ...lineRange, body }));

  const deduped = new Map<string, FileFeedbackEntry['comments'][number]>();

  for (const comment of [...inlineComments, ...automatedComments]) {
    const key = `${comment.startLine ?? ''}:${comment.endLine ?? ''}:${comment.body}`;
    deduped.set(key, comment);
  }

  return Array.from(deduped.values());
}
