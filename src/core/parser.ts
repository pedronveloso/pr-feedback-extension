import type { FeedbackExtractionResult, FileFeedbackEntry } from './types';

function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === 3) {
    return node.textContent ?? '';
  }

  if (node.nodeType !== 1) {
    return '';
  }

  const element = node as Element;

  const children = Array.from(element.childNodes).map(nodeToMarkdown).join('');

  switch (element.tagName.toLowerCase()) {
    case 'p':
      return `${children.trim()}\n\n`;
    case 'br':
      return '\n';
    case 'code': {
      if (element.parentElement?.tagName.toLowerCase() === 'pre') {
        return children;
      }
      return `\`${(element.textContent ?? '').trim()}\``;
    }
    case 'pre': {
      const text = element.textContent?.trim() ?? '';
      if (!text) return '';
      return `\n\`\`\`\n${text}\n\`\`\`\n\n`;
    }
    case 'a': {
      const label = children.trim() || (element.textContent ?? '').trim();
      const href = element.getAttribute('href');
      if (!href) return label;
      return `[${label}](${href})`;
    }
    case 'strong':
    case 'b':
      return `**${children.trim()}**`;
    case 'em':
    case 'i':
      return `*${children.trim()}*`;
    case 'ul': {
      const items = Array.from(element.querySelectorAll(':scope > li'))
        .map((li) => `- ${normalizeWhitespace(li.textContent ?? '')}`)
        .join('\n');
      return `${items}\n\n`;
    }
    case 'ol': {
      const items = Array.from(element.querySelectorAll(':scope > li'))
        .map((li, idx) => `${idx + 1}. ${normalizeWhitespace(li.textContent ?? '')}`)
        .join('\n');
      return `${items}\n\n`;
    }
    case 'blockquote': {
      const lines = normalizeWhitespace(element.textContent ?? '')
        .split('\n')
        .filter(Boolean)
        .map((line) => `> ${line}`)
        .join('\n');
      return `${lines}\n\n`;
    }
    default:
      return children;
  }
}

export function commentBodyToMarkdown(commentBody: Element): string {
  const clone = commentBody.cloneNode(true) as Element;
  clone.querySelectorAll('.js-suggested-changes-blob').forEach((el) => el.remove());
  const markdown = Array.from(clone.childNodes).map(nodeToMarkdown).join('');
  return normalizeWhitespace(markdown);
}

function extractFilePath(thread: Element): string | null {
  const fileLink = thread.querySelector('summary a.text-mono');
  const filePath = fileLink?.textContent?.trim() ?? '';
  return filePath || null;
}

function parseLineNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;
  const line = Number.parseInt(digits, 10);
  return Number.isFinite(line) ? line : null;
}

function extractLineRange(thread: Element): { startLine: number | null; endLine: number | null } {
  const startLine = parseLineNumber(thread.querySelector('.js-multi-line-preview-start')?.textContent);
  const endLine = parseLineNumber(thread.querySelector('.js-multi-line-preview-end')?.textContent);

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

function extractCommentBlocks(thread: Element): FileFeedbackEntry['comments'] {
  const lineRange = extractLineRange(thread);

  const comments = Array.from(thread.querySelectorAll('.js-inline-comments-container .js-comment.review-comment .js-comment-body'))
    .map((comment) => commentBodyToMarkdown(comment))
    .map((comment) => comment.trim())
    .filter(Boolean)
    .map((body) => ({ ...lineRange, body }));

  const automatedComments = Array.from(
    thread.querySelectorAll('react-partial[partial-name="automated-review-comment"] script[data-target="react-partial.embeddedData"]')
  )
    .map((script) => {
      const raw = script.textContent?.trim();
      if (!raw) return null;

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

        const bodyHtml =
          data.props?.comment?.bodyHTML ??
          data.props?.comment?.automatedComment?.message ??
          null;

        if (bodyHtml) {
          const container = thread.ownerDocument.createElement('div');
          container.innerHTML = bodyHtml;
          return commentBodyToMarkdown(container).trim();
        }

        return data.props?.comment?.body?.trim() ?? null;
      } catch {
        return null;
      }
    })
    .filter((comment): comment is string => Boolean(comment))
    .map((body) => ({ ...lineRange, body }));

  const deduped = new Map<string, FileFeedbackEntry['comments'][number]>();

  for (const comment of [...comments, ...automatedComments]) {
    const key = `${comment.startLine ?? ''}:${comment.endLine ?? ''}:${comment.body}`;
    deduped.set(key, comment);
  }

  return Array.from(deduped.values());
}

export function extractFeedbackFromDocument(doc: Document): FeedbackExtractionResult {
  const warnings: string[] = [];
  const grouped = new Map<string, FileFeedbackEntry>();
  const orderedFilePaths: string[] = [];

  const threads = Array.from(doc.querySelectorAll('details.review-thread-component'));

  for (const thread of threads) {
    const filePath = extractFilePath(thread);
    if (!filePath) {
      warnings.push('Skipped thread without file path.');
      continue;
    }

    const comments = extractCommentBlocks(thread);
    if (comments.length === 0) {
      continue;
    }

    if (!grouped.has(filePath)) {
      grouped.set(filePath, { filePath, comments: [] });
      orderedFilePaths.push(filePath);
    }

    grouped.get(filePath)!.comments.push(...comments);
  }

  return {
    entries: orderedFilePaths.map((filePath) => grouped.get(filePath)!).filter((entry) => entry.comments.length > 0),
    warnings
  };
}
