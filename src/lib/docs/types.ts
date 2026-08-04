// ─── In-app documentation types ───────────────────────────────────────────────
//
// Articles are written in a small markdown dialect rendered by DocRenderer:
//   ## Heading        → section heading (gets an anchor id for deep links)
//   ### Subheading    → sub-section heading
//   - item            → bulleted list
//   1. item           → numbered list (any number + dot)
//   **bold**          → bold (used for button / UI labels)
//   > text            → callout box (tips, warnings)
//   plain lines      → paragraphs
// Blank lines separate blocks.

export interface DocArticle {
  id: string;
  title: string;
  category: DocCategory;
  /** One-line summary shown in the sidebar + landing cards */
  description: string;
  /** Markdown-lite body (see dialect above) */
  content: string;
  /** Featured guides appear as big cards on the Help landing page */
  featured?: boolean;
  /** Restrict visibility: 'admin' hides it from staff accounts */
  audience?: 'all' | 'admin';
}

export type DocCategory =
  | 'Getting Started'
  | 'Daily Operations'
  | 'Checklists'
  | 'Staff & Access'
  | 'Payroll'
  | 'Troubleshooting';

export const DOC_CATEGORY_ORDER: DocCategory[] = [
  'Getting Started',
  'Daily Operations',
  'Checklists',
  'Staff & Access',
  'Payroll',
  'Troubleshooting',
];

/** Slugify a heading for anchor ids — must match DocRenderer's behaviour */
export function docAnchor(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
