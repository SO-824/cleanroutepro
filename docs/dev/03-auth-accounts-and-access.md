# Auth, Accounts & Access Control

This subsystem decides who can log in, which organisation (tenant) they are acting in, and what they can see and do there. It spans Supabase cookie-based auth sessions, a three-layer identity model (`profiles` / `org_members` / `staff_members`), an in-app invitation flow (no email is ever sent), role-based route guards in the proxy/middleware, and a set of service-role API routes that are the **only** writers of `profiles.role` and `profiles.org_id`.

## Key files

| File | Role |
|---|---|
| `src/proxy.ts` | Next 16 replacement for `middleware.ts` — runs `updateSession` on every non-static request |
| `src/lib/supabase/middleware.ts` | Session refresh + the whole redirect matrix (auth, no-org, role guards, default landing) |
| `src/lib/supabase/client.ts` | Browser Supabase client (singleton, anon key, RLS applies) |
| `src/lib/supabase/server.ts` | Per-request server client (cookies, anon key, RLS applies) |
| `src/lib/hooks/useAuth.tsx` | `AuthProvider` + `useAuth()` — client-side profile context, hydrated from the server |
| `src/app/dashboard/layout.tsx` | Server component that builds `serverProfile` and passes it to `DashboardShell` |
| `src/app/dashboard/DashboardShell.tsx` | Role-based nav, org switcher menu, invite bell/modal, mobile redirect |
| `src/app/(auth)/login/page.tsx`, `register/page.tsx` | Password sign-in / sign-up (`signInWithPassword` / `signUp`) |
| `src/app/(auth)/forgot-password/page.tsx` | 3-step in-page recovery: email → 8-digit OTP → new password |
| `src/app/auth/confirm/route.ts`, `auth/callback/route.ts` | PKCE / code-exchange endpoints; role-aware post-login redirect |
| `src/app/dashboard/page.tsx` | No-org welcome screen: create-org wizard, "join" info, pending invites |
| `src/app/dashboard/onboarding/page.tsx` | Post-creation wizard (business name, first team, first client) |
| `src/app/dashboard/account/page.tsx` | Self-service: display name, password change (browser client) |
| `src/app/api/org/create/route.ts` | Creates org, links creator as owner (service-role for profile write) |
| `src/app/api/org/switch/route.ts` | Repoints `profiles.org_id`/`role` after verifying accepted membership |
| `src/app/api/org/delete/route.ts` | Owner-only cascade delete of all org data |
| `src/app/api/invite/pending/route.ts` | Lists the current user's pending invites (service-role read) |
| `src/app/api/invite/respond/route.ts` | Accept/decline an invite — the only way an invite becomes access |
| `src/app/api/staff/invite/route.ts` | Creates a pending in-app invite for an existing account |
| `src/app/api/staff/remove/route.ts` | Removes roster member and/or revokes their login's access |
| `src/app/api/staff/remove-org-member/route.ts` | Revokes access by `org_members.id` (Accounts & Access tab) |
| `src/app/api/staff/change-role/route.ts` | Owner changes a member's role (both tables, with a cross-org guard) |
| `src/lib/permissions.ts` | Role constants, `PERMISSIONS` map, `can()` helper (UI-level checks) |
| `src/app/dashboard/staff/page.tsx` | Roster + "Accounts & Access" tab — main consumer of the staff APIs |
| `src/app/admin/PageClient.tsx` | Platform-admin tenant list (gated by `profiles.is_platform_admin`) |

## How it works

### Session plumbing

Supabase auth cookies are managed by `@supabase/ssr`. `src/proxy.ts` (this Next.js version uses `proxy.ts`, not `middleware.ts`) calls `updateSession(request)` for every request except static assets — that both refreshes the session cookie and applies the redirect matrix below. Three client factories exist:

- `lib/supabase/client.ts` — browser singleton, anon key. All reads/writes obey RLS.
- `lib/supabase/server.ts` — per-request server client (Server Components, API routes). Also anon key + RLS; used to *authenticate and authorize*.
- Ad-hoc `createAdminClient(url, SUPABASE_SERVICE_ROLE_KEY)` inside API routes — bypasses RLS; used only for the specific writes RLS forbids.

`AuthProvider` (`useAuth.tsx`) is mounted by `DashboardShell` with `serverProfile` pre-fetched in `dashboard/layout.tsx`. That hydration is deliberate: without it, every page refresh flashed a loading state while the client refetched the profile. A `profileLoadedFor` ref prevents the client `onAuthStateChange` listener from re-fetching what the server already provided. `refreshProfile()` clears the ref and refetches — call it after any API route that changes `org_id`/`role`.

`UserProfile` merges `profiles` columns with the active org's `name`, `subscription_status`, `subscription_tier`. Note: the client-side `loadProfile` always sets `timezone: null` (it calls `setAppTimezone(orgData.timezone)` as a side effect instead); only the server-built profile carries the real timezone value.

### The three identity layers (read this twice)

1. **`profiles`** — exactly one row per auth user (created DB-side on signup; **no application code ever inserts a profiles row** — if the trigger is missing, everything downstream breaks). Columns this subsystem cares about: `org_id` (the **currently active** org — a pointer, not membership truth), `role` (the user's role **in that active org** — a cached copy), `is_platform_admin`, `onboarding_completed`, `full_name`, `email`.
2. **`org_members`** — the **membership source of truth**. One row per (user, org): `user_id`, `org_id`, `role`, `status` (`'pending'` | `'accepted'`), `staff_member_id` (nullable link to the roster). The Accounts & Access tab, the org switcher, and the invite flow are all driven from here.
3. **`staff_members`** — the **workforce roster**, one row per cleaner per org. A roster row may have **no login at all** (most cleaners are just names for scheduling). Its `role` column is a *job title* (`'cleaner'`, …), **not** an access role. Login linkage lives in `user_id` + `invite_status` (`null`/`'none'` = no account, `'pending'`, `'accepted'`).

The recurring confusion: "role" appears in three places with three meanings. `org_members.role` is the truth per org; `profiles.role` is a cache of it for the *active* org; `staff_members.role` is a job title. Similarly a person can exist in `staff_members` without `org_members` (roster only), in `org_members` without `staff_members` (admins invited from Accounts & Access), or in both (invited cleaners).

### Sign-up, login, recovery

- Register: `supabase.auth.signUp` then push `/dashboard`. New users have no org, so middleware lets them onto `/dashboard`, which renders the no-org welcome (create wizard / "join" instructions / pending invites).
- Login: `signInWithPassword`, then blind push to `/dashboard/schedule` — middleware bounces non-admin roles to the right landing, so don't "fix" the blind push in the page.
- Forgot password (`forgot-password/page.tsx`): fully in-page — `resetPasswordForEmail(email)` → user types the **8-digit** OTP (`verifyOtp({ type: 'recovery' })`, auto-submit on 8th digit or paste) → `updateUser({ password })`. No magic-link roundtrip. 60s resend cooldown.
- `/auth/confirm` handles PKCE `token_hash` and code flows, then redirects by profile state (no org → `/dashboard`, staff → `/dashboard/staff-view`, else `/dashboard/schedule`). It deliberately no longer auto-accepts invites from auth metadata — accepting is exclusively `/api/invite/respond` (see the comment block in the route explaining the RLS bug that motivated this).

### Org creation, onboarding, deletion

`/api/org/create` (used by both the no-org wizard on `dashboard/page.tsx` and `CreateOrgModal` from the org menu): session client inserts `organizations`, then the **service-role** client sets `profiles.{org_id, role:'owner', onboarding_completed:true}` (those columns are locked against session clients), then session client inserts the owner's `org_members` row (`status:'accepted'`). Each linking write is checked and manually rolled back on failure — an unchecked failure here is what used to produce accounts that "have an org" with no membership row (invisible in Accounts & Access, unrevokable). Optional `staff`/`clients` arrays seed the roster.

`dashboard/onboarding/page.tsx` is a separate wizard (business name, first team + base address, first client) writing via the **browser** client — legitimate because it only touches `organizations.name`, `teams`, `clients`, and `profiles.onboarding_completed` (which is *not* a locked column).

`/api/org/delete`: owner-only, requires `confirmText === 'delete my organisation'`, then service-role deletes org data table-by-table in FK order (`checklist_completions` → … → `organizations`), nulls affected `profiles.org_id`, and auto-switches the caller into another accepted org if they have one. Not transactional — a crash mid-way leaves partial data.

### The invite lifecycle (no email is sent — ever)

There is deliberately **no invitation email**. Supabase's `inviteUserByEmail` only works for brand-new addresses and errors with `email_exists` otherwise — and the invite flow only targets existing accounts. The invite is delivered **in-app**: a bell badge + modal in `DashboardShell`, and inline cards on the no-org welcome page, both fed by `GET /api/invite/pending` (service-role read, because the invitee can't see orgs they haven't joined under RLS). Do not write UI copy claiming an email was sent.

Exact state transitions:

| Step | `staff_members.invite_status` / `user_id` | `org_members` | `profiles` |
|---|---|---|---|
| Roster row added | `null` / `null` | — | — |
| Invitee self-registers | unchanged | — | row exists, `org_id null` |
| `POST /api/staff/invite` | `'pending'` / their id | insert `{status:'pending', role:'staff', staff_member_id}` | untouched |
| Accept (`/api/invite/respond`) | `'accepted'` / their id | `status → 'accepted'` (conditional) | `org_id`+`role` repointed |
| Decline | `'none'` / `null` | row deleted | detached if pointing at that org |
| Revoke (`/api/staff/remove*`) | `null` / `null` | row deleted | detached or auto-switched |

Ordering and guards worth knowing before you touch this code:

- **Invite**: the target must already have a `profiles` row (looked up by email, service role) — otherwise 404 "ask them to create an account first". The `staff_members` link is written *first* so a failed `org_members` insert leaves nothing half-created (and is rolled back if it does fail). Re-inviting someone with a pending membership is treated as a resend (refreshes the link, returns success) — the old code made "Resend invite" always fail.
- **Accept** runs entirely under the service role because at accept time the invitee's profile isn't in the inviting org yet, so RLS would silently 0-row their update of the org's `staff_members` row. It: (1) verifies the membership belongs to the caller via the RLS-scoped client; (2) rejects if the linked roster row was archived/deleted since the invite (deletes the invite, returns **410**); (3) flips `pending → accepted` **conditionally on still being pending** and asserts on returned rows (returns **409** if withdrawn — a 0-row update raises no error, so the assert is load-bearing); (4) links the roster row; (5) repoints `profiles`. Steps 4–5 roll everything back on failure so the invite reappears. The UI (`DashboardShell.handleRespondInvite`, `dashboard/page.tsx`) drops the invite from state on 409/410 but restores it on other failures.
- **Revoke** (`/api/staff/remove` with `revokeAccountOnly`, or `/api/staff/remove-org-member` by membership id): deletes membership row(s), resets roster invite fields, then repoints the target's `profiles` — but **only if their active org is this org** — either detaching (`org_id: null`, role untouched) or auto-switching to another **accepted** membership (pending ones must not count). `remove` resolves the linked login three ways (roster `user_id`, then `org_members`, then profile-email match) because half-completed invites can leave the link in any of them; missing it leaves the person with full org access. Archiving a roster member with any account link also triggers the revoke path (`staff/page.tsx` `handleToggleArchive`).

### Role semantics

Roles (`lib/permissions.ts`): `owner` > `admin` > `supervisor` > `staff`. Owner is immutable — assigned at org creation, excluded from `ASSIGNABLE_ROLES`, and both `change-role` and `remove-org-member` refuse self-targeting, so the owner can neither demote nor revoke themselves. `PERMISSIONS` + `can(role, permission)` is a **UI-level** map (financials/payroll/rates are owner-only; admin is "management minus money"; supervisor sees published schedules + completed checklists; staff sees only their own day). Real enforcement is middleware (routes) + RLS + per-route role checks in the API handlers — `can()` gates rendering only.

`profiles.is_platform_admin` is orthogonal to org roles: a global flag that reveals the Platform Admin card in Settings and gates `/admin` (tenant list). The `/admin` gate is **client-side** (`PageClient.checkAuth` redirects non-admins); data exposure is limited only by RLS, so treat any RLS policy change on `organizations` with that in mind.

### Org switching

`DashboardShell` renders its own inline org menu when the user has >1 **accepted** membership (note: `components/OrgSwitcher.tsx`'s default export is dead code — only its named `DeleteOrgModal` export is used). Switching calls `POST /api/org/switch`, which verifies an **accepted** membership exists (a pending invite must not be activatable by switching), then service-role repoints `profiles.{org_id, role}` from the membership row. The client then `refreshProfile()` + `router.refresh()` and lands on schedule or staff-view by role.

`change-role` updates `org_members.role` unconditionally but `profiles.role` **only where `profiles.org_id` matches that org** — `profiles.role` is global, so writing it while the member is active in another org would grant them the new role *there* (cross-org privilege escalation). The re-sync happens naturally when they next switch/accept into this org.

### Why ALL role/org_id writes go through service-role API routes

`profiles.role` and `profiles.org_id` are column-locked in the database against session clients (see comments in `org/create` and `org/switch`). Two reasons: (1) a browser client that could write its own `role` is self-service privilege escalation; (2) several legitimate writes cross tenant boundaries where RLS silently no-ops (an invitee touching the inviting org's rows, an owner detaching another user's profile). The pattern every route follows: **authenticate + authorize with the session client, mutate with the admin client, and assert affected rows on any write whose failure must not be silent.**

### Middleware redirect matrix (`lib/supabase/middleware.ts`)

| Who | Path | Result |
|---|---|---|
| Anyone | `/`, `/login`, `/register`, `/forgot-password`, `/help` (exact match), `/api/*`, `/auth/*` | pass through |
| No session | any other path | → `/login` |
| Session | `/login`, `/register` | → `/dashboard` |
| Session, no `org_id` | `/dashboard`, `/dashboard/account` | pass; anything else under `/dashboard` → `/dashboard` |
| Not owner | `/dashboard/staff/payroll*` | → staff-view / completed / schedule by role |
| supervisor or staff | `/dashboard/templates|settings|staff|onboarding` (+subpaths) | → staff-view (staff) / schedule |
| supervisor | `/dashboard/schedule|checklists|staff-preview|clients` | → `/dashboard/completed` |
| staff | `/dashboard/schedule|completed|checklists|clients|staff-preview` | → `/dashboard/staff-view` |
| owner/admin | `/dashboard` | → `/dashboard/schedule` |
| supervisor/staff | `/dashboard` | → `/dashboard/staff-view` |

API routes are passed through untouched — each API handler does its own `getUser()` + role check. `/admin` is login-gated here but role-gated only client-side.

### DashboardShell nav + mobile behaviour

`getNavForRole(role)` builds the desktop nav (owner and admin currently get identical items; payroll lives *inside* the Staff page, guarded by middleware). Mobile is detected by **user agent**, not viewport width (deliberate: desktop split-screen must not force mobile view). On a mobile device with an org, everything except `staff-view`, `account`, `checklist*`, `help`, and `/dashboard` is `router.replace`d to `/dashboard/staff-view`, and the nav is always `MOBILE_STAFF_NAV` regardless of role. The bottom tab bar renders only for `!isMobile && role !== 'staff'` with `lg:hidden` — i.e. it exists for *narrow desktop windows*, not phones.

## Database touchpoints

| Table | Reads | Writes (and which client) |
|---|---|---|
| `profiles` | middleware (role/org_id per request), `dashboard/layout`, `useAuth`, every API route's authz check | `full_name` — browser (account page); `onboarding_completed` — browser (onboarding); **`org_id`, `role` — service-role only** (`org/create`, `org/switch`, `org/delete`, `invite/respond`, `staff/remove`, `staff/remove-org-member`, `staff/change-role`) |
| `org_members` | browser: accepted memberships (org menu), Accounts & Access tab; service-role: `invite/pending` | owner's own row — session client (`org/create`); everything else (pending inserts, accept flips, deletes, role changes) — service-role |
| `staff_members` | browser: roster page; API routes for validation | roster CRUD + the `invite_status` self-heal — browser (staff page, RLS-scoped); `user_id`/`invite_status` link fields — service-role (invite, respond, remove) |
| `organizations` | `useAuth`/layout (name, subscription, timezone); admin page (all orgs — needs platform-admin RLS) | insert + name update — browser/session; cascade delete — service-role |
| `teams`, `clients`, `schedules`, `schedule_jobs`, `checklist_*`, `staff_assignments` | — | seeded by onboarding/create (browser/session); bulk-deleted by `org/delete` (service-role) |

No RPCs, no storage buckets in this subsystem. Auth email (OTP) delivery is Supabase's own, not Resend.

## Invariants & gotchas

- **`profiles.role`/`org_id` must never be written from a session client** — they are column-locked; a "fix" that moves these writes client-side will just silently 0-row.
- **`profiles.role` is NOT NULL.** Writing `{ org_id: null, role: null }` aborts the whole update and — because Supabase raises no error visible to a fire-and-forget caller — silently leaves a revoked user with full access. This shipped once; the comments in both remove routes memorialize it. Detach by clearing `org_id` only.
- **0-row updates raise no error.** Anywhere correctness depends on a write landing (invite accept, revocation), `.select()` the result and assert, as `invite/respond` does. Copy that pattern.
- **`profiles.role` is global, not per-org.** Any new code that writes it must scope on `.eq('org_id', …)` like `change-role` does, or you build a cross-org escalation.
- **No invite email exists.** Toasts and API messages say "they will see the invite when they log in" — keep it that way unless you actually build the email (see below).
- Invitees must **register before being invited**; the invite route 404s otherwise. Invites are always created with `role: 'staff'` (hardcoded) — role is adjusted afterwards via change-role.
- `publicPaths` in middleware is **exact match**. `/help` is a single page today; adding `/help/[slug]` routes will silently lock them behind login until you switch that check to a prefix.
- Auto-switch on revoke must only consider `status = 'accepted'` memberships; counting pending ones drops users into orgs they never accepted.
- Accepting checks the roster row is still live (not archived/deleted) — removing that check lets an "archived" member in with full access.
- `org/delete` and the revoke flows are **sequential, non-transactional** service-role writes with manual rollback. `org/delete` lists tables explicitly — a new org-scoped table must be added there or it becomes orphaned data.
- The staff page "self-heals" stale `invite_status` values from the browser on load — another writer of `staff_members` link fields to keep in mind.
- `useAuth`'s client-loaded profile always has `timezone: null`; the timezone is applied via the `setAppTimezone` side effect. Don't read `profile.timezone` on the client and expect the org timezone.
- Owner/admin currently see identical navs and `login`/`forgot-password` push everyone at `/dashboard/schedule`; middleware is what makes this correct for other roles. Nav and middleware must be changed **together**.
- `components/OrgSwitcher.tsx` default export is unused (DashboardShell has its own inline menu); only `DeleteOrgModal` from that file is live.

## Extension points

- **Invite emails**: Resend is already wired for client reports (`reports@cleanroutepro.com.au`). Send a notification (not a magic link) from `/api/staff/invite` after the membership insert succeeds; the in-app accept flow stays the source of truth.
- **Invite people without accounts**: pre-provision via Supabase admin `createUser`/`inviteUserByEmail` for genuinely new addresses (the currently dead branch), then reuse the existing pending-membership machinery.
- **Invite with a chosen role**: thread a validated `role` (from `ASSIGNABLE_ROLES`) through `/api/staff/invite` instead of the hardcoded `'staff'`.
- **Ownership transfer**: a new owner-only service-role route swapping `org_members.role` for both parties and re-syncing both profiles where active; today owner is deliberately immutable.
- **Removing the global-role trap**: derive role from `org_members` per request (middleware already queries the DB) instead of caching on `profiles`; this deletes the cross-org escalation class entirely but touches every `profile.role` consumer.
- **New protected page**: add the route guard to `lib/supabase/middleware.ts`, the nav item to `getNavForRole`, and a `PERMISSIONS` entry — all three, or role behaviour drifts.
