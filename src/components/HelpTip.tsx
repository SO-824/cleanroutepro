'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ─── Contextual help icon ─────────────────────────────────────────────────────
// A small (i) button that reveals a short explanation and a "Learn more" link
// into the in-app documentation (/dashboard/help?article=<id>#<anchor>).
// Works on hover (desktop) and tap (mobile).

export default function HelpTip({
  tip,
  article,
  anchor,
  align = 'left',
}: {
  /** One or two short sentences explaining the control */
  tip: string;
  /** Doc article id to link to (omit for tip-only) */
  article?: string;
  /** Optional heading anchor within the article */
  anchor?: string;
  /** Which edge of the icon the popover aligns to */
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Close on outside tap (mobile)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const href = article
    ? `/dashboard/help?article=${article}${anchor ? `#${anchor}` : ''}`
    : null;

  return (
    <span ref={wrapRef} className="relative inline-flex shrink-0"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label="Help"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="w-4 h-4 rounded-full flex items-center justify-center text-text-tertiary hover:text-primary transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>

      {open && (
        // The visual gap below the icon is PADDING on this hover-continuous
        // wrapper, not a margin — a margin gap would fire mouseleave while the
        // cursor travels to the popover, closing it before "Learn more" is
        // clickable.
        <span
          className={`absolute top-full z-[70] pt-1.5 ${align === 'right' ? 'right-0' : 'left-0'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block w-60 rounded-xl bg-gray-900 text-white shadow-xl px-3.5 py-3">
            <span className="block text-[11px] leading-relaxed text-white/90">{tip}</span>
            {href && (
              <button
                type="button"
                onClick={() => { setOpen(false); router.push(href); }}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-white hover:underline"
              >
                Learn more
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
