# CleanRoute Pro — Developer Handover: Overview & Operations

CleanRoute Pro is a route-scheduling and job-checklist platform for cleaning companies. An
owner/admin builds weekly schedules for teams (with Google-Maps drive times and payroll-grade
timekeeping), publishes them, and staff see their runs on their phones. On site, staff complete
per-client checklists (photos, conditional questions, collaborative live editing); the office
reviews submitted checklists, corrects tick-boxes/notes where needed, and emails a branded report
to the end client. Payroll turns the published schedules into per-staff hours, travel and
kilometre allowances, exported as spreadsheets.

It is built multi-tenant (`org_id` on every table, RLS-enforced) but currently serves one
production customer: **The Cleaning CO Shellharbour**. The project has been handed over into the
customer's own accounts (Vercel, Resend); development continues in this repo.

## Reading order for this documentation

| Doc | Covers |
|---|---|
| `01-overview-and-operations.md` | This file — architecture, environments, running, deploying |
| `02-database-and-security.md` | Schema, RLS, triggers, RPCs, storage, the security model |
| `03-auth-accounts-and-access.md` | Login, roles, the three identity layers, invites, org switching |
| `04-scheduling-engine.md` | The schedule builder, route engine, publishing, templates |
| `05-clients-and-checklist-builder.md` | Clients, checklist templates, the conditional-logic engine |
| `06-staff-experience.md` | The mobile staff portal and the checklist completion machinery |
| `07-completed-review-and-reporting.md` | Live review, admin corrections, client report emails |
| `08-payroll-and-exports.md` | Payroll math and every XLSX export |
| `09-help-billing-and-misc.md` | In-app help system, Stripe billing, branding, leftovers |
| `10-known-issues-and-debt.md` | Consolidated register of known bugs, debt and dead code |

## Stack

- **Next.js 16** (App Router, Turbopack dev server). **Important:** this version has breaking
  changes vs what most tooling (and most AI assistants) assume — check
  `node_modules/next/dist/docs/` before trusting memory of an API. `src/proxy.ts` is this
  version's replacement for `middleware.ts` at the project root; it delegates to
  `src/lib/supabase/middleware.ts`.
- **Supabase** — Postgres (with RLS as the real security boundary), Auth, Realtime
  (`postgres_changes`), Storage. Project id: `gwrwxykfuqnorkqvzjwt`.
- **Tailwind CSS** with semantic tokens (`text-text-primary`, `bg-surface-elevated`,
  `card-elevated`, `btn-primary`, `input-field` — defined in `src/app/globals.css`).
- **framer-motion** for all animation; **@dnd-kit** for schedule drag-and-drop;
  **@vis.gl/react-google-maps** + Google Routes for drive times; **exceljs** for exports;
  **Stripe** for subscriptions; **Resend** (REST API, no SDK) for report emails.

## Repo layout

```
src/
  proxy.ts                  Next 16 middleware entry → supabase session + route guards
  app/
    (auth)/                 login / register / forgot-password (public)
    help/                   PUBLIC help hub (no login) — staff-facing guides only
    dashboard/              the app; layout enforces auth, DashboardShell renders role nav
      schedule/             week builder (largest page)
      completed/            review + admin corrections + report sending (second largest)
      checklists/           the "Clients" nav tab (clients + their checklists)
      staff/                roster, invites; staff/payroll = payroll page
      staff-view/           staff "My Schedule" (mobile-first)
      staff-preview/        admin "Staff View" impersonation tool
      templates/            week templates
      settings/             org settings incl. company logo upload
      help/                 in-app help (all articles incl. admin ones)
    api/                    server routes — the ONLY place the service-role key is used
  components/               shared UI; checklist/ holds the builder + logic engine
  lib/                      supabase clients, docs content, exports, route engine, utils
docs/dev/                   this documentation
supabase/migrations/        PARTIAL history only — see "Migrations" below
```

## Environments & configuration

`.env.local` (gitignored — never commit, never echo into docs or logs):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + session clients (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | API routes only — bypasses RLS (but NOT triggers) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps rendering + route engine |
| `RESEND_API_KEY` | Client report emails (Resend account belongs to the customer) |
| `REPORT_FROM_EMAIL` | Report sender, e.g. `The Cleaning CO Shellharbour <reports@cleanroutepro.com.au>` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Billing API + webhook signature |
| `STRIPE_PRICE_ID` | The subscription price used by the (currently un-wired) checkout route |
| `NEXT_PUBLIC_APP_URL` | Absolute origin used for Stripe success/cancel/portal return URLs |

Vercel gotcha that has bitten twice: the env dashboard stores values **literally**. Do not paste
surrounding quotes (fine in `.env.local`, fatal in Vercel), and remember env edits only take
effect on the **next deploy**. The send-report route defends with `cleanFromAddress()`, but keep
values clean anyway.

## Running locally

```bash
npm run dev -- -p 3002        # 3002 is the convention used throughout
```

- Phone testing: same Wi-Fi, `http://<lan-ip>:3002`.
- **The Turbopack stale-bundle wedge** (recurring): after certain mid-edit parse errors the dev
  server can serve stale compiled bundles — symptoms are runtime errors pointing at code that no
  longer exists (`X is not defined` for something clearly defined). Fix: stop the server,
  `rm -rf .next`, restart, and hard-refresh browser tabs (they cache old chunks too).
- Local dev talks to the **production** Supabase project. There is no seed/staging database.
  Be deliberate: anything you write locally is live data.

## Database changes (migrations)

Live schema changes are applied directly to the Supabase project (historically via the Supabase
MCP `apply_migration`, which records them in the project's migration table).
`supabase/migrations/` in the repo holds only a **partial** early history — **the live database
is the source of truth for DDL**. Before touching schema, introspect the live DB
(`information_schema`, `pg_policy`, `pg_trigger`, `pg_get_functiondef`). Doc
`02-database-and-security.md` contains the current full picture.

## Testing conventions

There is no unit-test suite. The working conventions are:

1. **Live-data simulation scripts** — a `*.tmp.ts` script written to the repo root (so `npx tsx`
   resolves `node_modules`), reading `.env.local` for the service key, run once, then deleted.
   Used for payroll math differentials, completion-integrity assertions (insert throwaway rows,
   verify triggers/RPCs, delete), and export round-trips. Always clean up throwaway rows.
2. **`npx tsc --noEmit`** after every change — the codebase is kept strictly type-clean.
3. **Browser verification** against localhost:3002 for UI work.

## Deploying

Push to `main` on GitHub (`rileykenn/cleanroutepro`) → Vercel auto-deploys to
`cleanroutepro.com.au` (project lives in the customer's Vercel account; the old
`cleanroutepro.vercel.app` URL still serves). There is no staging environment: the path is
localhost → production. Schema changes must be applied to the live DB *before* pushing code that
depends on them (the app and DB share one Supabase project, so order matters).

## Cross-cutting principles (read before changing anything)

1. **RLS is the security boundary; API routes are the privilege boundary.** Browser code uses the
   anon-key client and can only do what RLS allows. Anything privileged (role changes, org
   linking, report sending, admin corrections) lives in `src/app/api/**` behind explicit
   session-role checks, using the service-role client. The service role bypasses RLS but **not
   triggers** — the database triggers are deliberate last-line defenses.
2. **Submitted checklists are locked.** A database trigger rejects content changes to submitted
   completions from *anyone*. The only door is the `admin_edit_completion` RPC (see docs 02/07).
   Do not "fix" a blocked write by weakening the trigger.
3. **`profiles` privileged columns are server-only.** Column-level grants stop a logged-in user
   updating their own `role`/`org_id`/`is_platform_admin` (a real escalation hole that was
   closed). Browser may only write `full_name` and `onboarding_completed`.
4. **Published data is a snapshot.** `published_jobs` is copied from draft `schedule_jobs` at
   publish time (same ids). Checklist completions key on the published job id. Editing a draft
   after publishing sets `needs_republish` — it does not silently change what staff see.
5. **Timezone**: all business times run through `src/lib/timezone.ts` (org-configured, default
   Australia/Sydney). Never use bare `new Date()` formatting for schedule times.
6. **Email HTML is written for Outlook/Gmail**, not browsers: nested tables, width attributes,
   no flex/max-width, PNG/JPG logos only. Test with images off before changing the template.
7. **Server-resolved recipients.** The report email recipient is resolved server-side from the
   clients table (including the per-client test override) so a stale/spoofed browser can't
   redirect a report.
8. **In-app user docs are a product feature** (`src/lib/docs/articles.ts`, rendered at
   `/dashboard/help` and publicly at `/help`). When you change user-facing behaviour, update the
   articles — the customer's staff genuinely use them.

## Known sharp edges

- `completed/page.tsx` (~2000 lines) and `schedule/page.tsx` (~2840 lines) are the two monoliths.
  They are internally well-commented but resist casual edits — read the whole relevant `useMemo`
  or handler before patching, and keep the realtime paths (org channel + per-job channel +
  optimistic local patches) in sync when you add state.
- Legacy data shapes exist: `checklist_completions.items` can be a double-encoded JSON string on
  old rows; checklist sections predating the builder rewrite go through `migrateOldSection`.
  Every reader must tolerate both.
- The staff checklist autosave has hard-won recovery paths (admin-reset detection, duplicate-row
  adoption, per-field echo guards). Read doc 06 fully before touching `StaffChecklistView.tsx`.
- Payroll travel is computed **per team run** — someone on two runs in one day must never have
  the idle gap counted. There are live-data differential scripts in doc 08's history if you
  change this math.
