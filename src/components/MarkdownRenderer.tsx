import React from 'react';

function renderInline(text: string): React.ReactNode[] {
  // Safely handle **bold**, `code`, and [label](https://...) without dangerouslySetInnerHTML
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={key++} className="font-semibold text-[#0F213E]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code
          key={key++}
          className="rounded bg-[#F1EDE4] px-1.5 py-0.5 font-mono text-[13px] text-[#0F213E]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const m = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (m) {
        tokens.push(
          <a
            key={key++}
            href={m[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1E40AF] underline underline-offset-2 hover:text-[#0F213E]"
          >
            {m[1]}
          </a>
        );
      } else {
        tokens.push(token);
      }
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const lines = (content || '').split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let orderedItems: string[] = [];
  let key = 0;

  const flushLists = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="my-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#334155]">
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
    if (orderedItems.length > 0) {
      elements.push(
        <ol key={key++} className="my-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-[#334155]">
          {orderedItems.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      orderedItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushLists();
      continue;
    }
    if (line.startsWith('### ')) {
      flushLists();
      elements.push(
        <h4 key={key++} className="mt-4 mb-1.5 text-sm font-semibold text-[#0F213E]">
          {renderInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      flushLists();
      elements.push(
        <h3 key={key++} className="mt-5 mb-2 text-base font-semibold text-[#0F213E]">
          {renderInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      flushLists();
      elements.push(
        <h2 key={key++} className="font-display mb-3 text-xl font-semibold text-[#0F213E]">
          {renderInline(line.slice(2))}
        </h2>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (orderedItems.length > 0) flushLists();
      listItems.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      if (listItems.length > 0) flushLists();
      orderedItems.push(line.replace(/^\d+\.\s/, ''));
    } else {
      flushLists();
      elements.push(
        <p key={key++} className="my-2 text-sm leading-relaxed text-[#334155]">
          {renderInline(line)}
        </p>
      );
    }
  }
  flushLists();

  return <div className="space-y-1">{elements}</div>;
};
