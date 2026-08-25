# Completed page, review & client reports

This subsystem is the admin's end of the checklist lifecycle: a week-by-week grid of every published job, live-updating progress as staff fill checklists in the field, a read-only (but admin-correctable) panel showing every answer with who gave it, and the "Review & send reports" workflow that turns a submitted checklist into a branded HTML email delivered to the client via Resend — with a mailto fallback when no email provider is configured. It is where the business owner verifies work happened and proves it to the customer.

## Key files

| File | Role |
|---|---|
| `src/app/dashboard/completed/page.tsx` | Entire admin UI: week grid, review inbox, `ChecklistPanel`, send dialog, both realtime channels, admin-correction plumbing (~2000 lines, client component) |
| `src/app/api/checklist/send-report/route.ts` | Service-role route: renders the report email HTML, previews it, sends via Resend, records send tracking |
| `src/app/api/checklist/admin-edit/route.ts` | Service-role route: validated admin corrections on a *submitted* completion, delegating the write to the `admin_edit_completion` RPC |
| `src/app/api/checklist/pdf/route.tsx` | **Legacy/orphaned** PDF renderer (`@react-pdf/renderer`). Referenced nowhere in the codebase and reads columns/keys that no longer match reality — see gotchas |
| `src/components/checklist/types.ts` | `ChecklistSection`/`ChecklistField`, `migrateOldSection` (old `items`/`text` shape → fields), `buildVisibilityMap` (conditional-logic evaluation) |
| `src/components/StaffChecklistView.tsx` | The staff side that *writes* completions; this page imports its `COLLAB_COLORS` so admin colors match staff colors |

## How it works

### Data flow: loading the week

`CompletedPage` is a client component; everything loads through the browser Supabase client under RLS.

1. `loadPublishedWeeks()` — fetches org teams → all `schedules` rows with `is_published = true`, maps every `schedule_date` to its Monday via `getWeekDates(...)[0]`, dedupes, sorts newest-first into `publishedWeekStarts`. `weekIndex` (0 = newest) picks the current week. On refresh, a functional-updater dance keeps the *currently viewed* week selected if it still exists rather than snapping back to newest — that was a real mid-review annoyance.
2. `loadWeek()` runs whenever `weekDates` changes. Sequential queries: teams → published `schedules` for those 7 dates → `published_jobs` (`is_break = false`, `client_id not null`, ordered by `position`) → `staff_members` → `checklist_completions` (`in schedule_job_id`) → `clients` (report prefs, step 5b) → `profiles` (display names for anyone who answered). It assembles `JobWithCompletion[]`.
3. **Crew resolution**: jobs usually carry no per-job `assigned_staff_ids`; the real crew is the day-level roster (`schedules.staff_ids` + `driver_staff_id`). `effectiveStaffIds` falls back to that roster — remove the fallback and "Waiting on" / avatars go empty everywhere. Staff colors are positional: `STAFF_COLORS[index % 6]` over `COLLAB_COLORS`, same scheme the staff form uses.

Only **published** schedules appear here, deliberately — draft weeks aren't work anyone did.

### Realtime: two channels, one gate

- **Org-wide channel** `completed-org:{orgId}` — `postgres_changes` on `checklist_completions` filtered `org_id=eq.{orgId}`. Fires for every staff keystroke autosave in the org. It patches the matching job card (`setJobs`), and *conditionally* the open panel.
- **Per-job channel** `admin-cl:{jobId}` — created in `handleSelectJob` when a panel opens (previous one removed first, ref in `realtimeChannelRef`), filtered `schedule_job_id=eq.{jobId}`. Sets `liveCompletion` unconditionally — its filter already guarantees the right job.

The gate: the org handler is a closure that cannot see `selectedJob` state, so the open-panel job id lives in `selectedJobIdRef`. The handler only touches `liveCompletion` when `selectedJobIdRef.current === jobId`. The code comment records the bug this fixed: an older `prev === null` wildcard let *any* org event hijack a "Not started" panel, after which admin corrections targeted the wrong completion. Do not "simplify" this back.

Both handlers only read `payload.new` — a `DELETE` event (reset from another device) has no `new.id` and is ignored, so an open panel won't clear until refetch/reopen.

### Opening a job: `handleSelectJob`

Sets `selectedJobIdRef`, then fetches a *fresh* completion row (never trusts the cached card) and the checklist template sections — by `job.checklist_id`, else the client's `is_default` checklist. A monotonic counter (`selectSeqRef` + `fresh()` checks after every await) discards slow responses when the admin clicks jobs rapidly; without it an older job's fetch can overwrite the newer panel.

### ChecklistPanel: rendering answers

`completion.items` is a JSON array of `{ fieldId, value, na?, completed_by? }` (camelCase `fieldId` — but `buildVisibilityMap` consumes snake_case `field_id`, so every caller maps between them). Key mechanics:

- **Visibility**: `buildVisibilityMap` re-runs the same show/hide logic-block rules the staff form used, so conditionally-hidden fields don't render as "Not answered" and don't inflate the denominator. `answeredCount` additionally filters `items` to *visible* field ids — hidden answers linger in `items` (e.g. after an admin untick collapses a branch) and would otherwise push the count past the denominator.
- **Contributor colors**: `staffByUserId` maps auth `user_id` → assigned-staff color; unknown answerers get stable fallback colors from a memoized `unknownColorMap`. Each answered card gets a 3px left border in its answerer's color, an initial avatar, and a "Filled in by" legend chip.
- **Progress**: panel `pct` = visible-answered / visible-template-fields. Note the *cards* in the grid use a different denominator — `totalFields = completion.items.length` (stored answers, ratcheted up with `Math.max` on realtime updates), because cards never load templates. The two percentages can legitimately differ.
- **Media**: photo/video values are arrays of public URLs (bucket `checklist-media`); tapping opens an in-panel lightbox modal.
- **Reset progress**: a confirm dialog then a *browser-side* `delete` on `checklist_completions` by `schedule_job_id`. Media DB rows cascade via `checklist_completion_media`'s FK. Storage files are **not** deleted. The staff form detects the vanished row (0-row update) and re-inserts on next save.

### Admin corrections (submitted checklists only)

`adminEditable = canEdit && completion.is_submitted` — corrections exist because staff sometimes forget one tick and the submitted-lock stops them fixing it. UI affordances in `ChecklistPanel`:

- **Checkbox fields**: the status square becomes a button (`handleToggle`); per-field in-flight keys in `togglingIds` block double-fires.
- **Multiselect / multidropdown**: each *option* renders as a tickable row (`handleOptionToggle`, key `` `${fieldId}:${opt}` ``).
- **Notes**: `Edit` opens a textarea with 800ms-debounced autosave. Saves are **chained** through `saveChainRef` (each save awaits the previous promise) so an in-flight autosave can never land after a newer one and resurrect old text server-side. `Done` flushes the debounce and awaits the chain; on failure the editor stays open with an explicit "not saved" alert instead of silently discarding. The unmount effect clears the timer so a pending debounce can't fire against a different job.

All three call `adminEdit()` → `POST /api/checklist/admin-edit`. The route: auth → owner/admin role → payload shape validation (a toggle is either `{fieldId, value:boolean}` or `{fieldId, option:string, selected:boolean}`, never both) → org ownership → `status === 'submitted'` → **template authority check** (re-loads `client_checklists.sections`; only real checkbox field ids and real options of multiselect fields may be toggled — typed answers cannot be altered through this route) → `admin_edit_completion` RPC. The RPC (lives only in the live DB — no SQL in `supabase/migrations/`) locks the row and merges toggles itself so two quick corrections can't erase each other, preserves pre-edit originals (`original_notes`, and the original items snapshot) on first edit, and stamps `admin_edited_at`/`admin_edited_by`. The route returns the fresh row; `applyAdminEdit` patches all three client states (`jobs`, `selectedJob`, `liveCompletion`); the realtime echo that follows writes identical data, harmlessly.

The panel surfaces the audit trail: an "Edited by {editorName} · {date}" badge (name resolved from `viewerId`/`viewerName` for self, else `userNameMap`) and a "View original staff notes" reveal when `original_notes` differs from current notes.

### Review & send inbox

Above the grid, an inbox card lists every submitted checklist this week, newest-submitted first. `awaiting = report_status !== 'sent'` drives the "N to review" badge. Each row has **Review** (opens the panel) and, for owner/admin (`canSend`), **Send email** / **Send again**. The panel's footer repeats the same call-to-action once a checklist is submitted — reviewing and approving are meant to be one motion.

### Send dialog and the send flow

`openSendDialog(job)` immediately POSTs `{ completionId, preview: true }` and renders the returned HTML in a **sandboxed iframe** (`sandbox=""`, `srcDoc`) — the owner sees pixel-for-pixel what the client's inbox gets, including subject and resolved recipient.

Recipient logic (mirrored client- and server-side): `clients.report_override_email` wins when `report_use_override` is true, else `clients.email`. The dialog's toggle/input edit these two columns directly from the browser with autosave (toggle = instant, typing = 600ms debounce via `prefsTimerRef`). `handleSendReport` **flushes a still-debouncing save before POSTing** so the server resolves the address currently on screen — but the server re-resolves from the DB regardless, so a tampered client can't redirect a report. CC is a comma-separated free-text field passed through.

`POST /api/checklist/send-report` (service role):

1. Auth → owner/admin → completion belongs to org (404 otherwise) → `status === 'submitted'` (400).
2. `markOnly: true` → just `markSent('mail_app')` and return (the mailto path below).
3. Renders the email (before checking provider config, so **preview works unconfigured**). Refuses with **409** if the checklist template was deleted — the report renders from the live template and would otherwise be an empty shell. **422** if no recipient resolvable.
4. `preview: true` → returns `{ subject, to, cc, html, overridden }`.
5. No `RESEND_API_KEY` → **501** `{ error: 'not_configured' }`.
6. `fetch('https://api.resend.com/emails')` with `from: cleanFromAddress(REPORT_FROM_EMAIL) || '{orgName} <onboarding@resend.dev>'`. Provider rejection → **502** with the provider's message.
7. `markSent('email')` writes `report_status='sent'`, `report_sent_at/to/by/via`. If that write fails *after* the email went out, the route still returns success (with `recorded: false`) — surfacing an error there would invite a duplicate send to the client.

Email HTML details that exist for a reason: nested `<table role="presentation">` with `width="640"` because Outlook's Word engine ignores `max-width`/`margin:auto`; the logo `<img>` uses a literal `width="160"` attribute for the same reason; `absoluteHttpUrl()` guards `organizations.logo_url` (http/https only, and **drops `.svg`/`.webp`** because Gmail/Outlook render them broken — text-only header beats broken branding); org name stays as text below the logo because most clients block images; every interpolated string goes through `esc()`; attachment arrays render as "N attachments" + links; the subject is client-facing (`Cleaning report — {date}`), deliberately free of internal checklist names. `cleanFromAddress` strips wrapping quotes that Vercel env dashboards keep literally (dotenv strips them locally — a classic "works on my machine" mismatch).

**Mailto fallback**: on 501 the client builds a plain-text report (`buildMailtoBody` — refetches the template, applies the same visibility map) and shows "Open in my mail app" (a `mailto:` with to/subject/cc/body prefilled) plus "I've sent it — mark as sent", which calls the route with `markOnly: true` so tracking stays truthful. Note the mailto subject differs (`Completed checklist — {job.name}`).

`applySent` patches `report_*` into `jobs`, `selectedJob`, and `liveCompletion` so every surface flips to "Sent to … · date" without a refetch.

## Database touchpoints

| Object | Access | Notes |
|---|---|---|
| `schedules` (`is_published`, `schedule_date`, `staff_ids`, `driver_staff_id`) | browser read | week discovery + crew roster |
| `teams`, `published_jobs`, `staff_members`, `profiles` | browser read | grid assembly; `profiles.full_name` for contributor names |
| `client_checklists` (`sections`, `is_default`) | browser read + service-role read | panel template, mailto body; both API routes re-read it as the authority |
| `checklist_completions` | browser read; browser **delete** (Reset progress); realtime (`postgres_changes`, filters on `org_id` and `schedule_job_id`) | columns used here: `items` (JSON string of `{fieldId,…}`), `notes`, `status`/`submitted_at`, `completed_by/at`, `report_status`, `report_sent_at/to/by/via`, `admin_edited_at/by`, `original_notes`, `org_id`, `client_id`, `schedule_job_id`, `checklist_template_id` |
| `checklist_completions` (report columns) | **service-role write** via send-report (`markSent`) | never written from the browser |
| `checklist_completions` (items/notes/audit) | **service-role write** via admin-edit → `admin_edit_completion` RPC (row lock, server-side merge, first-edit original snapshot) | RPC exists only in the live DB; not in repo migrations |
| `clients` (`email`, `report_use_override`, `report_override_email`, `name`, `address`) | browser read + **browser write** (override autosave); service-role read (recipient resolution, email header) | |
| `organizations` (`name`, `logo_url`) | service-role read | email branding |
| `checklist_completion_media` | indirect | FK cascade cleans rows on reset; storage bucket `checklist-media` files are orphaned |

## Invariants & gotchas

- **`selectedJobIdRef` gating is load-bearing.** The org channel must never set `liveCompletion` for a job that isn't open — that regression previously routed admin corrections at the wrong completion. Any refactor of the realtime handlers must keep the ref (state is invisible inside the subscription closure).
- **`items` key casing is split-brained**: stored as `fieldId`, but `buildVisibilityMap` takes `field_id`. Every call site maps; a new consumer that forgets gets an all-hidden/all-visible map with no error.
- **Recipient is resolved server-side.** The dialog's "To" line is informational; changing only client state cannot change where the email goes. Keep it that way.
- **`status === 'submitted'` is the gate for both routes.** Sending or correcting an in-progress checklist is rejected; the panel derives `is_submitted` from `status === 'submitted' || !!submitted_at`.
- **The two progress denominators differ by design** (card: stored items; panel: visible template fields). "Fixing" the card to use the template means loading every job's template on grid load.
- **Reset progress is a hard browser-side delete** — RLS must keep allowing admins to delete completions, and staff-side code depends on detecting the vanished row via a 0-row update. It does not touch storage files.
- **Send-then-record is deliberately non-atomic**: a recording failure after a successful Resend call returns success (`recorded: false`). Do not "fix" this into an error — it manufactures duplicate client emails.
- **The 501 contract is an API**: the client keys the entire mailto fallback off HTTP 501 + `error: 'not_configured'`. Changing that status breaks the unconfigured-provider path.
- **Template deletion → 409.** The report renders from the live `client_checklists` row, not a snapshot. Deleting a template makes its past completions unsendable (and the panel section list empty).
- **`esc()` doesn't escape single quotes** — safe only because every generated attribute uses double quotes. Keep it that way or upgrade `esc`.
- **Notes autosave must stay chained** (`saveChainRef`); replacing it with naive fire-and-forget reintroduces the out-of-order-save data loss it exists to prevent.
- **Realtime ignores DELETEs** — after a reset on another device, an open panel shows stale data until reopened.
- **`checklist/pdf` route is dead**: nothing links to it. Note the live table DOES have a legacy `checklist_id` column alongside `checklist_template_id` (verified live — see doc 02), so its select would not error; but the route reads `field_id`/`pre_fill` answer keys the current items format (camelCase `fieldId`) doesn't use, and `checklist_id` is not what current writers populate — so even invoked directly it renders empty/wrong output. Delete it or rewrite it against the current schema — do not use it as a reference.
- Minor quirk: `ChecklistPanel`'s fallback color assignment uses a `let nextUnknownIdx` that resets each render against a memoized map — two unknown contributors appearing across different renders can receive the same color.
- `admin_edit_completion` and the `report_*`/`admin_edited_*`/`original_notes` columns have **no repo migration** — the live DB is the only source of truth for them. Snapshot them into `supabase/migrations/` before touching related schema.

## Extension points

- **PDF attachment on reports**: rewrite `pdf/route.tsx` against the real schema (`checklist_template_id`, camelCase `fieldId`, `migrateOldSection`, `buildVisibilityMap`), then attach via Resend's `attachments` (base64) in send-report, or link a signed URL in the email.
- **Batch send**: the inbox already isolates `awaiting`; a "Send all" button can loop `POST /api/checklist/send-report` per completion — the per-completion 422/409 errors surface which ones need attention.
- **Delivery telemetry**: add a Resend webhook route writing `report_delivery_status` next to the existing `report_sent_*` columns; the inbox badge can then distinguish sent/delivered/bounced.
- **Reply-to the org**: add `reply_to: org owner's email` to the Resend payload so client replies don't dead-end at `reports@cleanroutepro.com.au`.
- **Correction history**: the RPC already snapshots originals on first edit; a `checklist_completion_edits` append table written inside the same RPC would give a full audit log with no client changes.
- **Photos in the email**: `answerDisplay` already extracts URLs; embedding `<img>` rows (with `width` attributes, mind Outlook) instead of "Attachment N" links is a contained change in the `rows` loop.
