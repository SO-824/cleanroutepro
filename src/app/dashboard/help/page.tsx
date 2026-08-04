'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/hooks/useAuth';
import { DOC_ARTICLES } from '@/lib/docs/articles';
import { DOC_CATEGORY_ORDER, DocArticle } from '@/lib/docs/types';
import DocRenderer from '@/components/docs/DocRenderer';

// ─── Help & Documentation hub ─────────────────────────────────────────────────
// Deep-linkable: /dashboard/help?article=<id>#<heading-anchor>
// Staff accounts see audience 'all' articles; admins see everything.

function HelpContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isStaffRole = profile?.role === 'staff';

  const visibleArticles = useMemo(
    () => DOC_ARTICLES.filter(a => !isStaffRole || (a.audience ?? 'all') === 'all'),
    [isStaffRole]
  );

  const requestedId = searchParams.get('article');
  const activeArticle = useMemo(
    () => visibleArticles.find(a => a.id === requestedId) || null,
    [visibleArticles, requestedId]
  );

  const [search, setSearch] = useState('');

  // Scroll to the hash anchor once the article is rendered
  useEffect(() => {
    if (!activeArticle) return;
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (hash) {
      // Wait a frame for the article DOM to exist
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      document.getElementById('help-scroll-pane')?.scrollTo({ top: 0 });
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
    router.push(`/dashboard/help?article=${id}`, { scroll: false });
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Sidebar — desktop only; phones use the landing list + back button ── */}
      <div className="hidden md:flex w-72 shrink-0 flex-col border-r border-border-light bg-surface-elevated/40">
        <div className="shrink-0 p-3 border-b border-border-light space-y-2">
          <button onClick={() => router.push('/dashboard/help', { scroll: false })}
            className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <div className="w-8 h-8 rounded-xl bg-primary-light flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary leading-tight">Help &amp; Documentation</p>
              <p className="text-[10px] text-text-tertiary">How CleanRoute Pro works</p>
            </div>
          </button>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search help…" className="input-field text-sm w-full py-2"
              style={{ paddingLeft: '2.25rem' }} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
          {DOC_CATEGORY_ORDER.map(cat => {
            const articles = byCategory.get(cat) || [];
            if (articles.length === 0) return null;
            return (
              <div key={cat}>
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">{cat}</p>
                <div className="space-y-0.5">
                  {articles.map(a => (
                    <button key={a.id} onClick={() => openArticle(a.id)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors ${
                        activeArticle?.id === a.id
                          ? 'bg-primary-light text-primary'
                          : 'hover:bg-surface-hover text-text-secondary'
                      }`}>
                      <p className={`text-[13px] font-semibold leading-snug ${activeArticle?.id === a.id ? 'text-primary' : 'text-text-primary'}`}>
                        {a.title}
                      </p>
                      <p className="text-[11px] text-text-tertiary leading-snug mt-0.5 line-clamp-2">{a.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-text-tertiary">No articles match your search.</p>
          )}
        </div>
      </div>

      {/* ── Content pane ── */}
      <div id="help-scroll-pane" className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {activeArticle ? (
          <motion.div key={activeArticle.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto px-5 lg:px-10 py-6 md:py-8 pb-24">
            {/* Mobile back button — the sidebar is hidden on phones */}
            <button onClick={() => router.push('/dashboard/help', { scroll: false })}
              className="md:hidden flex items-center gap-1.5 text-sm text-primary font-semibold mb-4 active:scale-95 transition-transform">
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
              <button onClick={() => router.push('/dashboard/help', { scroll: false })}
                className="text-xs font-semibold text-primary hover:underline">← All help topics</button>
              <p className="text-[11px] text-text-tertiary">Can&apos;t find what you need? Contact your administrator.</p>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="max-w-4xl mx-auto px-5 lg:px-10 py-8 md:py-10 pb-24">
            <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">How can we help?</h1>
            <p className="text-sm text-text-secondary mt-2 max-w-xl">
              Guides and instructions for everything in CleanRoute Pro — from onboarding staff to
              publishing schedules, running checklists and processing payroll.
            </p>

            {/* Mobile search — the sidebar (with its search box) is hidden on phones */}
            <div className="md:hidden relative mt-5">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search help…" className="input-field w-full py-2.5"
                style={{ paddingLeft: '2.5rem' }} />
            </div>

            {featured.length > 0 && (
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
                const articles = (byCategory.get(cat) || []);
                if (articles.length === 0) return null;
                return (
                  <div key={cat}>
                    <p className="text-sm font-bold text-text-primary mb-2">{cat}</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {articles.map(a => (
                        <button key={a.id} onClick={() => openArticle(a.id)}
                          className="text-left px-4 py-3 rounded-xl border border-border-light bg-white hover:border-primary/40 transition-colors">
                          <p className="text-[13px] font-semibold text-text-primary">{a.title}</p>
                          <p className="text-[11px] text-text-tertiary mt-0.5 line-clamp-1">{a.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <Suspense fallback={<div className="h-full shimmer" />}>
      <HelpContent />
    </Suspense>
  );
}
