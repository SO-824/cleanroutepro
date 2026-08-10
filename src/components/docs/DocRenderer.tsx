'use client';

import React from 'react';
import { docAnchor } from '@/lib/docs/types';

// ─── Markdown-lite renderer for in-app documentation ─────────────────────────
// Supports exactly the dialect described in src/lib/docs/types.ts:
// ## / ### headings (anchored), - bullets, 1. numbered lists, > callouts,
// **bold**, and plain paragraphs. Deliberately tiny — no external deps.

function renderBold(text: string, keyPrefix: string): React.ReactNode[] {
  // **bold** spans
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`} className="font-semibold text-text-primary">{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
  });
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // [label](https://url) links first, then **bold** within the rest
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (m) {
      return (
        <a key={`${keyPrefix}-l${i}`} href={m[2]} target="_blank" rel="noopener noreferrer"
          className="font-semibold text-primary underline underline-offset-2 hover:opacity-80 break-all">
          {m[1]}
        </a>
      );
    }
    return <React.Fragment key={`${keyPrefix}-${i}`}>{renderBold(part, `${keyPrefix}-b${i}`)}</React.Fragment>;
  });
}

type Block =
  | { type: 'h2' | 'h3' | 'p' | 'callout'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

// Articles separate list items with blank lines, so a list only ends when the
// next non-blank line is NOT an item — otherwise every numbered step would
// become its own single-item list and render as "1." every time.
function collectList(
  lines: string[], start: number,
  isItem: (t: string) => boolean, strip: (t: string) => string,
  setIndex: (n: number) => void,
): string[] {
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (isItem(t)) { items.push(strip(t)); i++; continue; }
    if (t === '') {
      let j = i;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && isItem(lines[j].trim())) { i = j; continue; }
    }
    break;
  }
  setIndex(i);
  return items;
}

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') { i++; continue; }

    if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(3).trim() });
      i++;
    } else if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.slice(4).trim() });
      i++;
    } else if (trimmed.startsWith('> ')) {
      // Consecutive callout lines merge into one box
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        parts.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push({ type: 'callout', text: parts.join(' ') });
    } else if (trimmed.startsWith('- ')) {
      blocks.push({ type: 'ul', items: collectList(lines, i, t => t.startsWith('- '), t => t.slice(2), n => { i = n; }) });
    } else if (/^\d+\.\s/.test(trimmed)) {
      blocks.push({ type: 'ol', items: collectList(lines, i, t => /^\d+\.\s/.test(t), t => t.replace(/^\d+\.\s/, ''), n => { i = n; }) });
    } else {
      // Paragraph — consume consecutive plain lines
      const parts: string[] = [trimmed];
      i++;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '' || t.startsWith('## ') || t.startsWith('### ') || t.startsWith('- ') || t.startsWith('> ') || /^\d+\.\s/.test(t)) break;
        parts.push(t);
        i++;
      }
      blocks.push({ type: 'p', text: parts.join(' ') });
    }
  }
  return blocks;
}

export default function DocRenderer({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className="doc-content">
      {blocks.map((block, bi) => {
        switch (block.type) {
          case 'h2':
            return (
              <h2 key={bi} id={docAnchor(block.text)}
                className="text-lg font-bold text-text-primary mt-8 mb-3 pb-2 border-b border-border-light scroll-mt-20">
                {block.text}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={bi} id={docAnchor(block.text)}
                className="text-[15px] font-bold text-text-primary mt-6 mb-2 scroll-mt-20">
                {block.text}
              </h3>
            );
          case 'callout':
            return (
              <div key={bi} className="my-4 px-4 py-3 rounded-xl bg-primary-light/60 border border-primary/15 text-sm text-text-primary leading-relaxed flex gap-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <span>{renderInline(block.text, `co-${bi}`)}</span>
              </div>
            );
          case 'ul':
            return (
              <ul key={bi} className="my-3 space-y-1.5 pl-1">
                {block.items.map((item, ii) => (
                  <li key={ii} className="flex gap-2.5 text-sm text-text-secondary leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0 mt-[7px]" />
                    <span>{renderInline(item, `ul-${bi}-${ii}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={bi} className="my-3 space-y-2 pl-1">
                {block.items.map((item, ii) => (
                  <li key={ii} className="flex gap-3 text-sm text-text-secondary leading-relaxed">
                    <span className="w-5 h-5 rounded-full bg-primary-light text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {ii + 1}
                    </span>
                    <span className="pt-0.5">{renderInline(item, `ol-${bi}-${ii}`)}</span>
                  </li>
                ))}
              </ol>
            );
          default:
            return (
              <p key={bi} className="my-3 text-sm text-text-secondary leading-relaxed">
                {renderInline(block.text, `p-${bi}`)}
              </p>
            );
        }
      })}
    </div>
  );
}
