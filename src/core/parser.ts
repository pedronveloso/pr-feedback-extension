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

function extractCommentBlocks(thread: Element): string[] {
  const comments = Array.from(thread.querySelectorAll('.js-inline-comments-container .js-comment.review-comment .js-comment-body'));
  return comments
    .map((comment) => commentBodyToMarkdown(comment))
    .map((comment) => comment.trim())
    .filter(Boolean);
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
