# Help System, Billing & Platform Misc

This area covers everything that supports the product around the core scheduling/checklist flows:
the in-app and public documentation system (articles, renderer, contextual help tips), Stripe
subscription billing (checkout, customer portal, webhook), the platform-admin tenant list, the
company-logo upload that brands client report emails, the brand mark / favicon set, and small
shared infrastructure (root layout, timezone singleton, the domain-types grab-bag) that no other
doc claims.

## Key files

| File | Role |
|---|---|
| `src/lib/docs/types.ts` | `DocArticle` type, `DocCategory` union + display order, `docAnchor()` slugifier |
| `src/lib/docs/articles.ts` | ALL help content — `DOC_ARTICLES`, 13 articles as template-literal strings (~1400 lines) |
| `src/components/docs/DocRenderer.tsx` | Markdown-lite parser + renderer (no external deps) |
| `src/components/HelpTip.tsx` | Hover/tap (i) popover with "Learn more" deep link into help |
| `src/app/dashboard/help/page.tsx` | Logged-in help hub (sidebar + article pane, search, deep links) |
| `src/app/help/page.tsx` | PUBLIC help hub — no login, staff-facing (`audience: 'all'`) articles only |
| `src/proxy.ts` + `src/lib/supabase/middleware.ts` | Next 16 middleware; `/help` is on the public-path allowlist |
| `src/app/api/stripe/checkout/route.ts` | Creates Stripe customer + subscription Checkout session (currently unwired) |
| `src/app/api/stripe/portal/route.ts` | Creates a Billing Portal session (called from Settings) |
| `src/app/api/stripe/webhook/route.ts` | Signature-verified webhook → writes `organizations.subscription_status` |
| `src/app/dashboard/settings/page.tsx` | Org settings incl. Subscription card and Company Logo upload |
| `src/app/admin/page.tsx` + `PageClient.tsx` | Platform-admin tenant overview (read-only) |
| `src/components/BrandMark.tsx` | `<BrandMark>` logo tile + `<RouteGlyph>` currentColor icon |
| `src/app/icon.svg`, `apple-icon.png`, `favicon.ico` | Next file-convention favicons (same geometry as BrandMark) |
| `src/app/layout.tsx` | Root layout: Inter font, site metadata |
| `src/app/page.tsx` | `/` → `redirect('/login')` — the login page is the landing page |
| `src/lib/timezone.ts` | App-wide timezone singleton + `TIMEZONE_OPTIONS` picker list |
| `src/lib/types.ts` | Domain-types grab-bag (scheduling state, team colors, checklist legacy types) |

## How it works

### Help content model

All documentation is **static TypeScript** — no CMS, no DB. `DOC_ARTICLES` in
`src/lib/docs/articles.ts` is an array of `DocArticle`:

```ts
{ id, title, category, description, content, featured?, audience? }
```

- `id` is the deep-link key. **Ids must stay stable** — `HelpTip` "Learn more" links and
  URLs pasted into client onboarding emails depend on them (the articles themselves contain
  `https://cleanroutepro.com.au/help?article=staff-onboarding-guide` links).
- `category` must be one of the `DocCategory` union; the sidebar/landing group articles in
  `DOC_CATEGORY_ORDER` order. Adding a category means extending both the union and the order array.
- `featured: true` puts the article in the "Start here" card grid on both landing pages.
- `audience` is `'all' | 'admin'`, defaulting to `'all'` when omitted.

Current articles (ids): `admin-onboarding-guide`, `staff-onboarding-guide`, `org-setup`,
`scheduling`, `templates`, `clients`, `roster-exports`, `checklist-workflow`,
`checklist-building`, `checklist-review`, `invites-and-access`, `payroll`, `troubleshooting`.
Only `staff-onboarding-guide`, `checklist-workflow` and `troubleshooting` are `audience: 'all'`.

### The markdown-lite dialect (DocRenderer)

`DocRenderer.tsx` implements exactly the dialect documented at the top of `src/lib/docs/types.ts`
— deliberately tiny, no external markdown library:

| Syntax | Renders as |
|---|---|
| `## Heading` | `<h2 id={docAnchor(text)}>` — anchored for deep links |
| `### Subheading` | `<h3 id={docAnchor(text)}>` — also anchored |
| `- item` | Bulleted list (dot markers) |
| `1. item` | Numbered list — **the number is ignored**; the badge shows `index + 1` |
| `> text` | Callout box; consecutive `> ` lines merge into one box |
| `**bold**` | `<strong>` (convention: used for button/UI labels) |
| `[label](https://url)` | External link, `target="_blank"`; **http(s) URLs only** |
| plain lines | Paragraph; consecutive plain lines join into one `<p>` |

Not supported: images, code blocks, tables, nested lists, internal/relative links, inline
formatting in headings (headings render raw text — a `**bold**` in a heading shows the asterisks).

**The list-continuation rule** is the one non-obvious part. Articles are written with a blank
line between every list item (for readability in the template literal). `collectList()` therefore
does NOT end a list at a blank line — it looks ahead past blank runs and only terminates when the
next non-blank line is not an item. Without this, every numbered step would become its own
single-item `<ol>` and render as "1." each time. Corollary: you **cannot** put two separate lists
back-to-back with only blank lines between them; they merge. Separate them with a paragraph or
heading.

`docAnchor()` (`lowercase, non-alphanumerics → '-', trim '-'`) is shared by the renderer and
anyone constructing `#anchor` links — keep them in sync through that one function.

The `doc-content` wrapper class has no CSS behind it today; it exists as a styling hook.

### The two help pages

`src/app/dashboard/help/page.tsx` (logged-in) and `src/app/help/page.tsx` (public) are close
siblings. Both: read `?article=<id>` via `useSearchParams` (hence the `Suspense` wrapper —
Next requires it for `useSearchParams` in a client page), scroll to `window.location.hash` inside
a `requestAnimationFrame` once the article renders, offer client-side substring search over
title + description + **full content**, and group results by category.

Differences:
- **Audience gating.** The dashboard page filters with
  `!isStaffRole || (a.audience ?? 'all') === 'all'` where `isStaffRole = profile?.role === 'staff'`.
  So owners, admins **and supervisors** all see admin articles; only the `staff` role is
  restricted. The public page shows strictly `audience === 'all'`.
- The dashboard page has a desktop sidebar (hidden on phones — mobile uses the landing list +
  back button); the public page is a single scrolling document with a sticky header and a
  "Sign in" button.
- The public page exists so owners can paste guide links into onboarding emails **before the
  staff member has an account**; the login page links it as "Read the guides" (`(auth)/login/page.tsx:68`).

Public access is granted in `src/lib/supabase/middleware.ts`:
`publicPaths = ['/', '/login', '/register', '/forgot-password', '/help']`, matched by **exact
pathname equality** — query strings are fine (`/help?article=x` still has pathname `/help`), but
any future `/help/something` sub-route would NOT be public without editing this list. Note the
middleware entry point is `src/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`).

### HelpTip

`<HelpTip tip="…" article="org-setup" anchor="…" align="right" />` renders a 13px (?) icon that:

- opens on `mouseEnter` / closes on `mouseLeave` of the wrapper span (desktop), and toggles on
  click with an outside-`mousedown`/`touchstart` listener to close (mobile);
- shows a dark popover with the `tip` text and, when `article` is set, a "Learn more" button that
  `router.push`es `/dashboard/help?article=<id>#<anchor>`.

The load-bearing detail (commented in the file): the gap between icon and popover is **padding on
the hover-continuous wrapper, not a margin** — a margin gap would fire `mouseleave` while the
cursor travels down, closing the popover before "Learn more" is clickable. Keep it that way.

`anchor` is supported end-to-end (help page scrolls to it) but **no current call site passes it**
— all ten HelpTips in the app link whole articles. HelpTips always link `/dashboard/help`, so they
are only used inside the app (schedule, completed, checklists, templates, staff, payroll,
settings pages).

### Adding an article — checklist

1. Append an object to `DOC_ARTICLES` with a unique, permanent, kebab-case `id`.
2. Pick a `DocCategory` (or extend the union + `DOC_CATEGORY_ORDER` together).
3. Write `content` in the dialect above. Blank line between every block; blank lines between list
   items are fine (encouraged). Only https links; bold the exact UI labels.
4. Set `audience: 'admin'` unless the article is safe/useful for cleaners — remember `'all'`
   articles are on the **public internet** at `/help`.
5. Add `<HelpTip article="your-id" …/>` next to the UI it explains.
6. Fact-check against the code — the header comment in `articles.ts` promises the content is
   "generated from the codebase and fact-checked against it". Keep that true; the articles state
   concrete behaviors (default $38/hr rate, invite-by-email matching, etc.) that rot fast.

### Stripe billing

Three service-role-adjacent API routes, all constructing Stripe with
`new Stripe(key, { apiVersion: '2026-04-22.dahlia' })` (stripe npm ^22.1.0). Env:
`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`.

- **`POST /api/stripe/checkout`** — authenticated (session cookie); reads
  `profiles → organizations(stripe_customer_id)`. Creates a Stripe customer on first use
  (`metadata.org_id`, email = user email) and stores `stripe_customer_id` on `organizations`
  via the **session client** (so RLS must allow that member to update their org row). Then
  creates a `mode: 'subscription'` Checkout session for `STRIPE_PRICE_ID`, success/cancel URLs
  pointing at `/dashboard/settings?success=true|canceled=true`. Returns `{ url }`.
  **No UI calls this route today** — it is fully built but orphaned, and the settings page never
  reads the `success`/`canceled` params.
- **`POST /api/stripe/portal`** — authenticated; 400 `"No Stripe customer"` unless
  `organizations.stripe_customer_id` is already set (i.e. checkout ran at least once, or the id
  was set manually in the DB). Returns a Billing Portal `{ url }`. Called from the Settings
  "Manage Subscription" button — note the button comment: the route is POST-only, so it must be
  `fetch(..., { method: 'POST' })` then `window.open(url)`, never a plain link.
- **`POST /api/stripe/webhook`** — `export const dynamic = 'force-dynamic'`; reads the **raw
  body** (`request.text()`) and verifies `stripe-signature` with `STRIPE_WEBHOOK_SECRET` before
  parsing. Uses a **service-role** Supabase client (no user session exists in a webhook; RLS is
  bypassed deliberately). Handles:
  - `customer.subscription.created|updated` → maps Stripe status to one of
    `active | trialing | past_due | canceled` and writes `subscription_status` +
    `stripe_subscription_id` on the org matched by `stripe_customer_id`;
  - `customer.subscription.deleted` → `subscription_status: 'canceled'`, null sub id.
  The middleware never intercepts `/api/*`, so the webhook is reachable unauthenticated; the
  signature check is the only gate. **Nothing ever writes `subscription_tier`** — it exists only
  as a DB default ('pro'), echoed by `useAuth` (which also defaults status to `'trialing'`).

Subscription state is **display-only** today: the Settings badge and the /admin tenant list show
it, but no feature is gated on `subscription_status` anywhere in the app. A canceled org keeps
working.

### Company logo upload (Settings, owner only)

The logo brands the checklist report emails (`/api/checklist/send-report` reads
`organizations.logo_url` and renders it ~160px wide at the top of the email). Flow in
`handleLogoPick`:

1. Client-side validation **mirrors** the `org-assets` bucket's server-side limits: 2 MB max,
   `image/png`/`image/jpeg` only. The mime allowlist is deliberate product policy, not a
   technical limit — SVG and WebP upload fine but render as broken images in Gmail/Outlook,
   which is where the reports land.
2. Upload to the public `org-assets` bucket at `${org_id}/logo-${Date.now()}.${ext}` (browser
   client, RLS/storage policies). The bucket was created directly in Supabase — its size/mime
   config is not in repo migrations.
3. `getPublicUrl` → update `organizations.logo_url` + `logo_path` (browser RLS write).
4. **Ordering matters**: if the row update fails, the just-uploaded file is removed (no orphan);
   the *previous* file is deleted only **after** the new row commits. `handleRemoveLogo` nulls
   the columns first, then removes the file. Keep this order — reversing it can leave an org
   pointing at a deleted file.

`logo_path` exists purely so replacement/removal can delete the old storage object;
`logo_url` is what consumers read. The section is wrapped in `effectiveRole === 'owner'` —
the Staff View preview (`staff-preview`) passes `overrideRole` into `SettingsPage` so the
preview hides owner-only cards exactly as the previewed role would see them.

### Platform admin (`/admin`)

A minimal cross-tenant dashboard, linked from Settings only when `profiles.is_platform_admin`.
`page.tsx` is a 3-line server wrapper (`force-dynamic`); `PageClient.tsx` does everything
client-side: check auth → check `is_platform_admin` (redirect to `/dashboard/schedule` if not) →
list every `organizations` row newest-first with per-tenant counts of profiles/teams/clients
(one `head: true` count query per table per org — N+1, fine at current scale). Read-only; there
are no mutations on this page.

Security note: the redirect is cosmetic. The page uses the **browser** client, so what it can
actually list is decided by RLS — platform admins need cross-org SELECT policies (see
`02-database-and-security.md`). A non-admin who bypassed the redirect would still only see rows
RLS grants them. Also, `checkAuth().then(() => loadTenants())` runs `loadTenants` even when the
auth check redirected — harmless for the same reason, but don't copy the pattern.

### Brand mark & icons

`src/components/BrandMark.tsx` exports:
- `<BrandMark size className>` — the logo: indigo gradient rounded tile (#6366F1 → #4338CA,
  `rx=14` on a 64 viewBox) with a white route curve from a start dot to a destination pin.
  Use it **wherever the app shows its own logo**: login, register, `DashboardShell`'s `Logo()`,
  the no-org dashboard landing.
- `<RouteGlyph>` — the route curve alone in `currentColor`, for icon slots that manage their own
  background/hover colors (used on the Settings → Platform Admin card).

The same geometry is duplicated in `src/app/icon.svg` (Next App Router file-convention favicon),
`apple-icon.png` (iOS home screen) and `favicon.ico` (legacy fallback) — there is **no shared
source**; a redesign must update all four by hand. The gradient `id="crp-mark-bg"` is fixed, so
multiple `<BrandMark>`s on one page share/collide on the same def — identical, so harmless, but
don't fork the gradient per-instance without renaming the id.

`src/app/layout.tsx` is deliberately thin: Inter via `next/font` (exposed as `--font-inter`),
site `metadata`, `<html lang="en">`. No theme switching — the app is light-only.

### Misc infrastructure not covered elsewhere

- **`src/app/page.tsx`**: `/` immediately redirects to `/login`. There is no marketing site in
  this repo.
- **`src/lib/timezone.ts`**: a module-level mutable singleton (`_timezone`). `useAuth` calls
  `setAppTimezone(org.timezone)` once the profile loads; everything else calls
  `getTodayInTimezone()` / `formatDateInTimezone()` / `getDayOfWeekInTimezone()`. Because it is
  module state, it is effectively **client-only** — server route handlers must not rely on it
  (they don't). Before the profile loads, it falls back to the browser timezone, so a
  first-paint date can differ from the org timezone for a moment.
- **`src/lib/types.ts`**: the domain-types grab-bag: scheduling state (`TeamSchedule`,
  `DaySchedule`, the `ScheduleAction` reducer union, `AppState`), `TEAM_COLORS` (8 fixed team
  palettes + `getNextColorIndex`), `CLIENT_COLORS` (20 manual tags), and layered checklist
  types — legacy `ChecklistItem`, the rich `FormField`/`normaliseField` form-builder types, and
  re-exports of the canonical checklist types from `src/components/checklist/types.ts`.
  Several members are `@deprecated` but kept because published DB rows still contain them
  (`driverStaffId`, legacy text items auto-upgraded to `yes_no` by `normaliseField`).
- **`src/proxy.ts` matcher** excludes `_next/static`, `_next/image`, `favicon.ico` and image
  extensions from middleware — everything else, including `/api`, passes through `updateSession`
  (which refreshes cookies but never blocks `/api/*` or `/auth/*`).

## Database touchpoints

| Object | Read/Write | Client |
|---|---|---|
| `organizations.stripe_customer_id` | R/W | checkout route (session client, RLS) |
| `organizations.subscription_status`, `stripe_subscription_id` | W | webhook (service role) |
| `organizations.subscription_status`, `subscription_tier` | R | `useAuth` (browser RLS), `/admin` |
| `organizations.name`, `timezone`, `default_fuel_*`, `default_per_km_rate`, `payroll_cycle_start_day` | R/W | Settings page (browser RLS) |
| `organizations.logo_url`, `logo_path` | R/W | Settings (browser RLS write); read by `send-report` route (service side) |
| `teams.fuel_efficiency`, `fuel_price`, `per_km_rate` | W | Settings "Save Defaults" propagates org defaults to **all existing teams** (browser RLS) |
| `profiles.is_platform_admin` | R | `/admin` gate, Settings card (browser RLS) |
| `profiles`, `teams`, `clients` counts + all `organizations` | R | `/admin` (browser RLS — needs platform-admin cross-org SELECT policies) |
| Storage bucket `org-assets` (public) | R/W | browser client upload/remove; public URLs embedded in report emails |

The help system touches **no database** — content ships in the JS bundle.

## Invariants & gotchas

- **Article ids are a public API.** They appear in emailed `cleanroutepro.com.au/help?article=…`
  links and in HelpTip deep links. Renaming one silently breaks both (unknown ids just show the
  landing page — no 404).
- **`audience: 'all'` means public internet.** Anything not marked `'admin'` is readable without
  login at `/help`. Also note the dashboard filter only restricts `role === 'staff'` —
  supervisors see admin articles. If that ever becomes wrong, fix the filter in
  `dashboard/help/page.tsx`, not the data.
- **The dialect renderer is exact-match.** `##Heading` (no space), `*italic*`, indented list
  items, or a non-https link render as literal text. The number in `1.` is cosmetic. Two
  adjacent lists separated only by blank lines merge into one (the continuation rule).
- **`docAnchor` is the contract** between headings and `#anchor` deep links. Changing a heading's
  wording changes its anchor.
- **HelpTip popover gap must stay padding**, not margin (hover continuity — see the in-file
  comment).
- **`/help` allowlist is exact-path.** Sub-paths under `/help/` would require login until added
  to `publicPaths` in `src/lib/supabase/middleware.ts`.
- **Webhook needs the raw body.** `request.text()` before `constructEvent` — switching to
  `request.json()` breaks signature verification. The Stripe `apiVersion` is pinned
  (`2026-04-22.dahlia`); bumping the npm package may force a version/typing migration.
- **Checkout is unwired.** `/api/stripe/checkout` and `STRIPE_PRICE_ID` exist but no button calls
  them, and the `?success=true` redirect target is never read. The production org almost
  certainly has no `stripe_customer_id`, so "Manage Subscription" currently alerts
  "No Stripe customer" — this is the known state, not a regression.
- **`subscription_tier` is never written by code.** Don't build logic that assumes the webhook
  maintains it.
- **Logo mime allowlist is product policy** (email-client rendering), and the
  upload → row-update → delete-old ordering in `handleLogoPick` prevents orphaned/danging files.
  The `org-assets` bucket limits live in Supabase config, not in repo migrations.
- **Brand geometry is duplicated four times** (BrandMark, icon.svg, apple-icon.png, favicon.ico).
- **`/admin` safety = RLS**, not the client-side redirect. Any future admin *mutations* must go
  through an API route that re-checks `is_platform_admin` server-side with the service-role key.
- **`timezone.ts` is a client-side singleton** — never import it expecting per-request server
  correctness.

## Extension points

- **Feature gating on subscription**: everything is in place except enforcement. Add a check on
  `profile.subscription_status` (from `useAuth`) or, properly, in the middleware/API routes;
  wire a "Subscribe" button in Settings to `POST /api/stripe/checkout`, and read the
  `?success/?canceled` params on return. Add `checkout.session.completed` handling to the
  webhook if you need tier assignment (`subscription_tier` from the price id).
- **More articles/categories**: pure data work in `articles.ts` (+ the category union). The
  search, sidebar, featured grid and public page all pick up new entries automatically.
- **HelpTip anchors**: the plumbing exists (`anchor` prop → `#hash` → `docAnchor` ids) — start
  passing `anchor={docAnchor('Heading text')}` for section-precise links.
- **Richer dialect**: extend `parseBlocks`/`renderInline` (e.g. images from a public bucket, or
  internal links). Keep the types.ts header comment — it is the format's documentation.
- **Admin capabilities**: tenant impersonation, tier switching, usage stats — add service-role
  API routes gated on `is_platform_admin`, never direct browser writes.
- **Public-help SEO**: `/help` is client-rendered; converting the article view to a server
  component with `generateMetadata` (per-article titles) would make emailed links unfurl nicely.
