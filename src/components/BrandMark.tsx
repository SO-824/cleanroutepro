import React from 'react';

// ─── CleanRoute Pro brand mark ────────────────────────────────────────────────
// Same geometry as the favicon (src/app/icon.svg): indigo gradient tile with a
// white route from a start dot to a destination pin. Use <BrandMark> wherever
// the app shows its own logo; use <RouteGlyph> for a currentColor inline icon.

export default function BrandMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className}
      role="img" aria-label="CleanRoute Pro">
      <defs>
        <linearGradient id="crp-mark-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#crp-mark-bg)" />
      <path d="M20 44 C20 30 44 34 44 20" fill="none" stroke="#FFFFFF" strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="20" cy="44" r="4" fill="#FFFFFF" />
      <circle cx="44" cy="20" r="6" fill="#FFFFFF" />
      <circle cx="44" cy="20" r="2.4" fill="#4F46E5" />
    </svg>
  );
}

// The route curve alone, drawn in currentColor — for icon slots that manage
// their own background and hover colors.
export function RouteGlyph({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7.5 16.5 C7.5 11.25 16.5 12.75 16.5 7.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="7.5" cy="16.5" r="1.6" fill="currentColor" />
      <circle cx="16.5" cy="7.5" r="2.3" fill="currentColor" />
    </svg>
  );
}
