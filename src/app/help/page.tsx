'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { DOC_ARTICLES } from '@/lib/docs/articles';
import { DOC_CATEGORY_ORDER, DocArticle } from '@/lib/docs/types';
import DocRenderer from '@/components/docs/DocRenderer';

// ─── Public Help & Documentation ──────────────────────────────────────────────
// No login required — this is what owners link in onboarding emails to staff
// who don't have a CleanRoute account yet. Deep-linkable: /help?article=<id>.
// Only audience 'all' articles are listed; admin guides stay behind login.

function PublicHelpContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const visibleArticles = useMemo(
    () => DOC_ARTICLES.filter(a => (a.audience ?? 'all') === 'all'),
    []
  );

  const requestedId = searchParams.get('article');
  const activeArticle = useMemo(
    () => visibleArticles.find(a => a.id === requestedId) || null,
    [visibleArticles, requestedId]
  );

  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!activeArticle) return;
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (hash) {
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [activeArticle]);

  const filtered = useMemo(() => {
    if (!search.trim()) return visibleArticles;
    const q = search.toLowerCase();
    return visibleArticles.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.content.toLowerCase().includes(q)
    );
  }, [visibleArticles, search]);

  const byCategory = useMemo(() => {
    const m = new Map<string, DocArticle[]>();
    for (const cat of DOC_CATEGORY_ORDER) m.set(cat, []);
    for (const a of filtered) m.get(a.category)?.push(a);
    return m;
  }, [filtered]);

  const featured = useMemo(() => visibleArticles.filter(a => a.featured), [visibleArticles]);

  const openArticle = (id: string) => {
    router.push(`/help?article=${id}`, { scroll: false });
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border-light">
        <div className="max-w-4xl mx-auto px-5 lg:px-10 h-14 flex items-center justify-between">
          <button onClick={() => router.push('/help', { scroll: false })} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary-light flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-text-primary leading-tight">CleanRoute Pro</p>
              <p className="text-[10px] text-text-tertiary">Help &amp; Documentation</p>
            </div>
          </button>
          <a href="/login" className="btn-secondary text-xs px-3.5 py-1.5">Sign in</a>
        </div>
      </header>

      {activeArticle ? (
        <motion.div key={activeArticle.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl mx-auto px-5 lg:px-10 py-6 md:py-8 pb-24">
          <button onClick={() => router.push('/help', { scroll: false })}
            className="flex items-center gap-1.5 text-sm text-primary font-semibold mb-4 active:scale-95 transition-transform">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            All help topics
          </button>
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary mb-1">{activeArticle.category}</p>
          <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">{activeArticle.title}</h1>
          <p className="text-sm text-text-tertiary mt-1.5">{activeArticle.description}</p>
          <div className="mt-2">
            <DocRenderer content={activeArticle.content} />
          </div>
          <div className="mt-12 pt-5 border-t border-border-light flex items-center justify-between">
            <button onClick={() => router.push('/help', { scroll: false })}
              className="text-xs font-semibold text-primary hover:underline">← All help topics</button>
            <p className="text-[11px] text-text-tertiary">Can&apos;t find what you need? Ask your administrator.</p>
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="max-w-4xl mx-auto px-5 lg:px-10 py-8 md:py-10 pb-24">
          <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">How can we help?</h1>
          <p className="text-sm text-text-secondary mt-2 max-w-xl">
            Guides for using CleanRoute Pro — joining your company, finding your schedule on your
            phone and completing checklists. No account needed to read these.
          </p>

          <div className="relative mt-5 max-w-sm">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search help…" className="input-field w-full py-2.5"
              style={{ paddingLeft: '2.5rem' }} />
          </div>

          {featured.length > 0 && !search.trim() && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mt-10 mb-3">Start here</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {featured.map(a => (
                  <button key={a.id} onClick={() => openArticle(a.id)}
                    className="text-left card-elevated p-5 hover:border-primary/40 hover:shadow-md transition-all group">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1.5">{a.category}</p>
                    <p className="text-[15px] font-bold text-text-primary group-hover:text-primary transition-colors">{a.title}</p>
                    <p className="text-xs text-text-tertiary mt-1.5 leading-relaxed">{a.description}</p>
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mt-10 mb-3">All topics</p>
          <div className="space-y-6">
            {DOC_CATEGORY_ORDER.map(cat => {
              const articles = byCategory.get(cat) || [];
              if (articles.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="text-xs font-bold text-text-secondary mb-2">{cat}</p>
                  <div className="space-y-1.5">
                    {articles.map(a => (
                      <button key={a.id} onClick={() => openArticle(a.id)}
                        className="w-full text-left px-4 py-3 rounded-xl border border-border-light bg-surface-elevated hover:border-primary/40 transition-colors">
                        <p className="text-[13px] font-semibold text-text-primary">{a.title}</p>
                        <p className="text-[11px] text-text-tertiary mt-0.5">{a.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-xs text-text-tertiary">No articles match your search.</p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default function PublicHelpPage() {
  return (
    <Suspense fallback={null}>
      <PublicHelpContent />
    </Suspense>
  );
}
