# Database & Security Model

Everything in CleanRoute Pro sits on one Supabase Postgres database (project `gwrwxykfuqnorkqvzjwt`).
The security model has two layers: **RLS is the tenant boundary** (browser and server-session clients
use the anon key, and every org-scoped table hides rows outside `get_my_org_id()`), and **API routes
are the privilege boundary** (anything a session must not be able to do — role changes, org linking,
report provenance, corrections to submitted checklists — happens in `src/app/api/**` with the
service-role key after an explicit role check). A small set of triggers and one SECURITY DEFINER RPC
enforce integrity rules that even the service role cannot casually bypass.

## Key files

| File | Role |
|---|---|
| `src/lib/supabase/client.ts` | Browser singleton client (anon key, RLS applies, carries the user's session) |
| `src/lib/supabase/server.ts` | Per-request server client for RSC/API routes (anon key + auth cookies, RLS applies) |
| `src/lib/supabase/middleware.ts` | `updateSession()` — session refresh + auth/role route guards |
| `src/proxy.ts` | Next 16's replacement for root `middleware.ts`; delegates every request to `updateSession()` |
| `src/app/api/**/route.ts` | The ONLY code that touches `SUPABASE_SERVICE_ROLE_KEY` (13 routes, listed below) |
| `supabase/migrations/*.sql` | Three additive column migrations — NOT the full schema history (see "Where truth lives") |
| `src/app/api/checklist/admin-edit/route.ts` | Sole caller of the `admin_edit_completion` RPC |

## How it works

### The three clients

- **`client.ts`** — `createBrowserClient` memoized in a module global. All dashboard pages use this;
  every query is RLS-filtered by the logged-in user's JWT. This is deliberate: pages can be written
  naively (`.from('schedules').select()`) and multi-tenancy still holds.
- **`server.ts`** — `createServerClient` bound to `next/headers` cookies. Used by API routes to answer
  "who is calling and what is their role" (`auth.getUser()` + a `profiles` read) *before* deciding
  whether to escalate to the service role.
- **`middleware.ts`** — runs on every request via `src/proxy.ts` (Next 16 renamed root middleware to
  `proxy`). Refreshes the auth cookie, then enforces route-level access: unauthenticated → `/login`;
  no `org_id` → only `/dashboard` and `/dashboard/account`; payroll = owner only; templates/settings/
  staff/onboarding = owner+admin; supervisors and staff are pushed to their own views. **These
  redirects are UX, not security** — the data boundary is RLS, so a staff user hitting an admin API
  or table directly still only sees what policies allow.

Service-role clients are constructed inline (`createClient(url, SUPabase_SERVICE_ROLE_KEY)`) inside:
`checklist/admin-edit`, `checklist/pdf`, `checklist/send-report`, `invite/pending`, `invite/respond`,
`org/create`, `org/delete`, `org/switch`, `staff/change-role`, `staff/invite`,
`staff/remove-org-member`, `staff/remove`, `stripe/webhook`. Nothing else may import that key.

### `get_my_org_id()` — the tenancy primitive

Every org-scoped policy is a variation of `org_id = get_my_org_id()`. The function (public schema,
returns `uuid`) resolves the caller's **active** org from `profiles.org_id` for `auth.uid()`. It must
run as definer/RLS-exempt — the `profiles_select` policy itself calls it
(`id = auth.uid() OR org_id = get_my_org_id()`), which would infinitely recurse if the function's own
read of `profiles` were policy-checked. Note the "active org" subtlety: a user can belong to several
orgs (`org_members`), but RLS only ever shows the one currently written into `profiles.org_id`.
Switching orgs (`/api/org/switch`) verifies an **accepted** membership with the session client, then
rewrites `profiles.org_id` + `profiles.role` with the service role.

### `handle_new_user` — profile bootstrap

Trigger `on_auth_user_created` on `auth.users` calls `public.handle_new_user()`. The app never
inserts into `profiles` at signup (`register/page.tsx` only calls `supabase.auth.signUp`), so this
trigger is what guarantees the `profiles` row that `middleware.ts` and `dashboard/layout.tsx` read on
first login. It creates the row with `org_id NULL` (the "no org yet" onboarding state) and the
column defaults (`role 'admin'`, `onboarding_completed false`). Its exact body lives only in the
live DB — read it with `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='handle_new_user'`.

### `lock_submitted_completions` — the submitted wall

`trg_lock_submitted` (BEFORE UPDATE on `checklist_completions`) enforces two rules, and — crucially —
**triggers fire for every role including `service_role`**, so server code is bound by them too:

```sql
IF current_setting('app.admin_edit', true) = 'on' THEN RETURN NEW; END IF;   -- the only door
IF current_user = 'authenticated' AND (NEW.original_items IS DISTINCT FROM OLD.original_items
   OR ... admin_edited_at/by, report_status, report_sent_at/to/by/via ...) THEN
  RAISE EXCEPTION 'protected_columns: ...';                                  -- browser can't fake audit/report data
END IF;
IF OLD.status = 'submitted' AND (NEW.items IS DISTINCT FROM OLD.items OR ... notes,
   media_urls, status, submitted_at, completed_at, completed_by ...) THEN
  RAISE EXCEPTION 'submitted_locked: ...';                                   -- content is frozen after submit
END IF;
```

- The **content lock** (second IF) applies to *everyone*: once staff submit, an owner may already have
  reviewed/emailed the report, so items/notes/media/status/timestamps/authorship are immutable.
  `StaffChecklistView.tsx` catches the `submitted_locked` message string to lock the UI.
- The **protected-columns check** (first IF) keys on `current_user = 'authenticated'`: browser
  sessions can never write audit (`original_*`, `admin_edited_*`) or report provenance (`report_*`)
  columns, while service-role routes (send-report) write `report_*` freely.
- The **GUC bypass** `app.admin_edit` is transaction-local (`set_config(..., true)`); only
  `admin_edit_completion()` sets it, and PostgREST wraps each request in its own transaction, so the
  flag can never leak into other statements.

### `admin_edit_completion` RPC — the one door through the wall

`public.admin_edit_completion(p_completion_id uuid, p_editor uuid, p_toggles jsonb, p_notes text,
p_set_notes boolean)` — plpgsql, `SECURITY DEFINER`, `SET search_path = public`. EXECUTE is revoked
from PUBLIC/anon/authenticated and granted **only to `service_role`** — the browser cannot call it
even though PostgREST exposes it. Behavior:

1. `set_config('app.admin_edit','on',true)` — opens the trigger for this transaction only.
2. `SELECT ... FOR UPDATE` on the completion row — toggle merges from two concurrent admins serialize
   instead of read-merge-write clobbering each other.
3. First edit snapshots the originals (`original_items := COALESCE(original_items, items)` — never
   overwritten later), preserving the audit trail.
4. Merges toggles into the `items` jsonb array. Two toggle shapes: plain checkbox
   `{fieldId, value}` and multi-select option `{fieldId, option, selected}` (adds/removes one option
   string inside the field's value array). Legacy double-encoded JSON strings are unwrapped first.
5. Only `items`/`notes`/`admin_edited_at`/`admin_edited_by` ever change — status, timestamps and
   authorship stay frozen.

The calling route (`api/checklist/admin-edit`) authorizes first (session user must be owner/admin of
the completion's org, completion must be `submitted`) and validates toggles against the **template**
(`client_checklists.sections`): only real checkbox fields and real options of multiselect/
multidropdown fields may be toggled — typed answers can't be altered through this path.

### `profiles` column-level grants — the role self-escalation fix

The `profiles_update` RLS policy only checks `id = auth.uid()`, so originally any logged-in user
could PATCH their own row via PostgREST and set `role='owner'`, `is_platform_admin=true`, or jump
`org_id` into someone else's org. Fixed (live migration `harden_profiles_and_admin_edit`) with
column-level grants, which Postgres checks *before* RLS:

```sql
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (full_name, onboarding_completed) ON public.profiles TO authenticated;
```

The browser legitimately writes only those two columns (account page, onboarding). Every role/org
change goes through service-role API routes. Consequence: the `profiles_insert` RLS policy is dead
code — `authenticated` has no INSERT grant at all; rows are created solely by `handle_new_user`.

### Storage buckets

All three buckets are **public-read** (verified live):

| Bucket | Limits | Policies (on `storage.objects`) | Written by |
|---|---|---|---|
| `client-media` | 50 MB, image/video mime allowlist | public SELECT; `authenticated` INSERT + DELETE (bucket-wide) | `ClientProfileView.tsx` (client photos), `ChecklistFieldInput.tsx` (photo fields; also inserts a `checklist_completion_media` row) |
| `checklist-media` | none | public SELECT; `authenticated` INSERT (no UPDATE/DELETE policy) | `StaffChecklistView.tsx` (`upload(path, file, { upsert: true })`) |
| `org-assets` | 2 MB, image mimes incl. SVG | public SELECT; INSERT/UPDATE/DELETE only inside the caller's own folder: `(storage.foldername(name))[1] = get_my_org_id()::text` | `dashboard/settings/page.tsx` (company logo; key stored in `organizations.logo_path`, public URL in `logo_url`) |

Public-read is deliberate for `org-assets` and `checklist-media`: report emails embed logo and photo
URLs, and email clients (Gmail image proxy, Outlook) fetch images anonymously — signed URLs would
render broken. The `client-media`/`checklist-media` write policies are **not org-scoped** (any
authenticated user of any org can write; `client-media` DELETE is bucket-wide) — a known laxity,
mitigated only by unguessable UUID paths. `org-assets` shows the tightened pattern to copy.

### Realtime

The `supabase_realtime` publication carries `checklist_completions` — the only table the app
subscribes to, in three places, all `postgres_changes` on `event: '*'`:

- `StaffChecklistView.tsx` — `checklist:{scheduleJobId}` filtered `schedule_job_id=eq.{id}`:
  collaborative editing between teammates on one job + submit-lock echo.
- `dashboard/completed/page.tsx` — `completed-org:{orgId}` filtered `org_id=eq.{orgId}` (live job
  cards) and `admin-cl:{jobId}` (the open review panel).

Events are delivered subject to the subscriber's RLS. If you add realtime to another table you must
both add it to the publication *and* have a SELECT policy that admits the subscriber.

### Where schema truth lives (migrations)

**The repo does NOT contain the DDL history.** `supabase/migrations/` holds exactly three additive
`ALTER TABLE ... ADD COLUMN` files (total_travel_minutes, payroll_cycle_start_day,
return_arrival_time) that were applied by hand — there is no `supabase db push` pipeline, no CLI
link, and no initial-schema file. Everything else (all tables, all policies, all functions) was
applied directly to the live DB via the Supabase dashboard SQL editor or the Supabase MCP
`apply_migration` tool during development sessions. Named live migrations known from session records:
`completion_integrity_for_reports`, `admin_edit_submitted_checklists`,
`harden_profiles_and_admin_edit`, `admin_edit_option_toggles`, `org_logo_for_reports`.

**Truth is the live database.** Inspect it with the dashboard SQL editor or MCP `execute_sql`
(`information_schema.columns`, `pg_policy`, `pg_trigger`, `pg_get_functiondef`,
`pg_publication_tables`, `supabase_migrations.schema_migrations`). At the time of writing the local
MCP server is authenticated against a *different* Supabase account (it lists only an unrelated "Rts
Server" project) — re-authenticate it against the account owning `gwrwxykfuqnorkqvzjwt` before
relying on it. A worthwhile chore: `supabase db pull` the full schema into the repo so history stops
living only in production.

## Database touchpoints

All 20 public tables, verified live (RLS confirmed ENABLED on every one: anon sees 0 rows on all,
service role sees data). "Browser" = anon-key session under RLS; "server" = service-role API route.

| Table | Purpose / key columns | Written by |
|---|---|---|
| `organizations` | Tenant root. `name`, Stripe fields (`subscription_status` default `trialing`, `stripe_customer_id/subscription_id`), org-wide payroll defaults (`default_hourly_rate`, `default_fuel_*`, `default_per_km_rate`, `payroll_cycle_start_day`), `logo_path`/`logo_url`, `timezone` | Browser (org create inserts via session; settings updates). Server: `stripe/webhook`, `org/delete` |
| `profiles` | 1:1 with `auth.users`. **Active** `org_id`, **active** `role` (`owner`/`admin`/`supervisor`/`staff`; column default `'admin'`), `is_platform_admin` (gates `/admin`), `onboarding_completed` | Created by `handle_new_user` trigger. Browser may update ONLY `full_name`, `onboarding_completed` (column grants). Server: `org/create`, `org/switch`, `staff/change-role`, `invite/respond`, `org/delete` write `org_id`/`role` |
| `org_members` | Membership list (multi-org). `user_id`, `org_id`, `role`, `status` (`pending`/`accepted`), `staff_member_id` link to roster row | Browser (own membership on org create). Server: `staff/invite` (pending rows), `invite/respond`, `staff/remove-org-member` |
| `teams` | Route teams. Base/return addresses + lat/lng/place_id, `day_start_time`, per-team cost knobs (`hourly_rate`, `fuel_*`, `per_km_rate`, `calculate_fuel`), `crew_size`, `sort_order`, `color_index` | Browser |
| `staff_members` | Roster (exists independent of login). `name`, `email`, `hourly_rate`, `available_days` jsonb, `user_id` + `invite_status` (link to a real account), `archived` | Browser; server during invite linking (`staff/invite`, `invite/respond`, `staff/remove`) |
| `staff_assignments` | Per-date team assignment / availability: `staff_id`, `team_id`, `assignment_date`, `is_available` | Browser |
| `clients` | Client sites. Address + geocode, `default_duration_minutes`, `default_staff_count`, `color`, `rate`, report routing (`email`, `report_use_override`, `report_override_email`), legacy `checklist_template_id` | Browser |
| `client_media` | Metadata rows for `client-media` uploads (`file_path`, `file_type`, `caption`, `uploaded_by`) | Browser |
| `checklist_masters` | Org-level master checklist templates (`sections` jsonb) copied onto clients | Browser |
| `client_checklists` | Per-client checklists — **the live checklist authority** (`sections` jsonb, `is_default`, `source_template_id` → masters) | Browser |
| `checklist_templates` | **Legacy, empty** predecessor of `client_checklists`; still read in two pages and deleted in `org/delete` | — |
| `schedules` | One team-day. `team_id`+`schedule_date`, `is_published`, `needs_republish`, base/return snapshot columns, `driver_staff_id`, `staff_ids text[]`, computed `total_travel_minutes`, `total_distance_km`, `base_departure_time`, `return_arrival_time` | Browser (schedule builder) |
| `schedule_jobs` | Working jobs of a schedule: `position`, geocoded address, times as `text` "HH:MM", `assigned_staff_ids uuid[]`, `is_break`, `is_locked`, `fixed_start_time`, `checklist_id` → client_checklists, `checklist_override` jsonb | Browser |
| `published_jobs` | Immutable snapshot of `schedule_jobs` taken at publish; same shape. What staff-view and payroll read | Browser (publish action) |
| `schedule_templates` | Saved week templates (`week_data` jsonb, `label`) | Browser |
| `weekly_team_configs` | Per-week team rename/recolor overrides (`team_id`, `week_start`, `name`, `color_index`) | Browser |
| `week_labels` | Free-text label per org-week (`week_start`, `label`) | Browser |
| `checklist_completions` | One row per job's checklist run (partial unique index `checklist_completions_job_unique` on `schedule_job_id`). `items` jsonb answers, `notes`, `status` (`in_progress`/`submitted`), `submitted_at`, `media_urls` jsonb, `pre_fill`, report provenance `report_*`, audit `admin_edited_at/by` + `original_items/notes`. Both `checklist_template_id` and `checklist_id` FK → `client_checklists` | Browser (staff save/submit — blocked after submit by trigger). Server: `send-report` (`report_*`), `admin_edit_completion` RPC (corrections) |
| `checklist_completion_media` | Per-item photo rows (`completion_id`, `item_id`, `file_path`) | Browser |
| `portfolio_contact_messages` | Not used by this app — contact-form rows from the developer's portfolio site sharing the DB | external |
| RPCs | `get_my_org_id()` (tenancy primitive, exposed to all roles) · `admin_edit_completion(...)` (service_role-only) | — |

## Invariants & gotchas

- **The service role bypasses RLS but NOT triggers.** Server code editing a submitted completion's
  content will hit `submitted_locked` like everyone else; the only sanctioned path is the RPC. Never
  "fix" this by adding `service_role` exemptions to the trigger — the wall is the feature.
- **Never call `set_config('app.admin_edit','on', false)`** (session-scoped) anywhere. The `true`
  (transaction-local) flag inside the RPC is the entire safety argument.
- The protected-columns check matches `current_user = 'authenticated'` — if you ever add another
  Postgres role for clients, it silently won't be covered.
- **Column grants on `profiles` are load-bearing security.** A well-meaning
  `GRANT UPDATE ON profiles TO authenticated` (or recreating the table without re-applying grants)
  reopens role self-escalation. Test after any change: as `authenticated`, `UPDATE profiles SET
  role='admin'` must fail with `insufficient_privilege`, `SET full_name=...` must succeed.
- `profiles.role` vs `org_members.role`: profiles holds the **active** org's role, org_members holds
  the per-org truth. `org/switch` copies the membership role into profiles. Authorize API routes off
  `profiles` (active org) — but remember it changes when the user switches orgs.
- `profiles.role` **defaults to `'admin'`** for brand-new signups (org-less). Harmless today because
  every guard also checks `org_id`, but don't drop those org checks.
- Middleware redirects are cosmetic; RLS is the boundary. Conversely, RLS is org-scoped, not
  role-scoped — a `staff`-role session can read *and write* most org tables via PostgREST directly
  (schedules, clients, ...). The UI hides it; the DB does not. Tighten with per-role policies if
  this ever matters.
- **One completion per job** is enforced by the partial unique index, added after a check-then-insert
  race produced duplicates that poisoned every `maybeSingle()` read. `StaffChecklistView` handles
  unique-violation by re-selecting. Don't remove the index.
- `checklist_completions` has two FK columns to `client_checklists` (`checklist_template_id` and
  `checklist_id`) for historical reasons; `admin-edit` reads `checklist_template_id`. Keep both
  populated the way the save path does.
- UUID defaults are mixed: older tables `extensions.uuid_generate_v4()`, newer `gen_random_uuid()`.
  Both fine; don't assume one namespace.
- Times are stored as `text` "HH:MM" (`start_time`, `fixed_start_time`, `day_start_time`, ...);
  `schedules.staff_ids` is `text[]` while `*_jobs.assigned_staff_ids` is `uuid[]`. Casting
  carelessly in SQL will bite.
- **`org/delete` deletes per-table manually and misses several org-scoped tables**
  (`published_jobs`, `client_checklists`, `client_media`, `checklist_masters`, `schedule_templates`,
  `staff_assignments`, `weekly_team_configs`, `week_labels`, `checklist_completion_media`) — deleting
  an org likely orphans rows, or fails outright on the `published_jobs.schedule_id` FK unless it
  cascades. Verify FK delete rules in the live DB before relying on this route.
- `checklist-media` has no UPDATE policy, yet `StaffChecklistView` uploads with `upsert: true` —
  overwriting an existing object path would be rejected; it works because paths are unique per
  upload. Keep them unique.
- Realtime payloads bypass nothing, but the UI must handle its own echo: the completed page and
  StaffChecklistView deliberately ignore stale/echoed notes updates (this was the "character limit
  that deletes text" bug — see comments around `StaffChecklistView.tsx:615`).
- Buckets are public-read on purpose (email rendering). Don't flip them private without replacing
  every embedded URL in reports with signed URLs.

## Extension points

- **New org-scoped table**: `org_id uuid NOT NULL REFERENCES organizations(id)`, enable RLS, one
  policy per verb with `USING/WITH CHECK (org_id = get_my_org_id())` — copy the shape from any
  existing table. Add to `supabase_realtime` publication only if subscribed. Apply via a named
  migration and *also* commit the SQL under `supabase/migrations/` to start rebuilding repo history.
- **Per-role authorization in the DB**: add a `get_my_role()` twin of `get_my_org_id()` and use it
  in write policies (e.g. staff can only write `checklist_completions`); today role enforcement
  lives solely in middleware + API routes.
- **Org-scoped media**: migrate `client-media`/`checklist-media` writes to the `org-assets` folder
  pattern (`(storage.foldername(name))[1] = get_my_org_id()::text`) — the upload paths already start
  with ids, so this is mostly a policy change.
- **Full audit trail**: `original_items`/`original_notes` keep only the first pre-edit snapshot. For
  edit-by-edit history, insert a row into a new `completion_edits` table inside
  `admin_edit_completion()` (it already has everything in scope, atomically).
- **Restoring schema history**: link the Supabase CLI, `supabase db pull`, commit the generated
  baseline migration, and from then on require every DDL change to land in `supabase/migrations/`
  as well as the live DB.
