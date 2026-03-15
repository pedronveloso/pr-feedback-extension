function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as Element;
  const children = Array.from(element.childNodes).map(nodeToMarkdown).join('');

  switch (element.tagName.toLowerCase()) {
    case 'p':
      return `${children.trim()}\n\n`;
    case 'br':
      return '\n';
    case 'code':
      if (element.parentElement?.tagName.toLowerCase() === 'pre') {
        return children;
      }
      return `\`${(element.textContent ?? '').trim()}\``;
    case 'pre': {
      const text = element.textContent?.trim() ?? '';
      return text ? `\n\`\`\`\n${text}\n\`\`\`\n\n` : '';
    }
    case 'a': {
      const label = children.trim() || (element.textContent ?? '').trim();
      const href = element.getAttribute('href');
      return href ? `[${label}](${href})` : label;
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
  clone.querySelectorAll('.js-suggested-changes-blob').forEach((element) => element.remove());
  const markdown = Array.from(clone.childNodes).map(nodeToMarkdown).join('');
  return normalizeWhitespace(markdown);
}

