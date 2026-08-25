# Known Issues & Technical Debt Register

Compiled during the documentation deep-dive (every item verified against the code at write time).
These are honest, pre-existing imperfections a new developer should know about before assuming
"the code must be right". Each entry names the owning doc for context. None are release blockers
— the app is in production and working — but several are worth scheduling.

## User-visible bugs

| # | Issue | Where | Doc |
|---|---|---|---|
| 1 | Staff "Completed" tab shows every checklist as just "Checklist" — the name lookup queries the empty legacy `checklist_templates` table, but stored ids belong to `client_checklists` | `staff-view/page.tsx` (~line 713) | 06 |
| 2 | Staff "Completed" tab's **View** button doesn't pass the checklist id, so it loads the client's *default* checklist and shows the "All done!" screen instead of the recorded answers; errors if the client has no default | `staff-view/page.tsx` | 06 |
| 3 | A checklist's `completed_by` is last-writer-wins, so a teammate pressing submit removes the job from *your* Completed history even if you answered most of it | completions model | 06 |
| 4 | `ClientInfoPanel` (the staff-facing client info sheet) renders `client_media.file_path` directly as an `<img>/<video>` src without `getPublicUrl` — client photos/videos are likely broken for staff while working fine in the admin `ClientProfileView` | `ClientInfoPanel.tsx` | 05 |
| 5 | Supervisors see admin-only help articles — the dashboard help audience filter only checks `role === 'staff'` | `dashboard/help/page.tsx` | 09 |
| 6 | The templates page "use template" link pushes `/dashboard/schedule?template=<id>` but the schedule page never reads that query param — the click lands on a plain schedule | `templates/page.tsx` | 04 |
| 7 | Realtime handlers on the Completed page ignore DELETE events, so a reset done on another device leaves an already-open panel stale until closed | `completed/page.tsx` | 07 |
| 8 | `ClientChecklistPanel`'s 1s autosave debounce can drop the final second of edits if the panel is closed immediately after typing | `ClientChecklistPanel.tsx` | 05 |
| 9 | Builder: `getOperatorsFor` has no `multidropdown` case, so those fields can't be picked as conditional-logic sources even though the engine evaluates them fine | `ChecklistBuilder.tsx` | 05 |

## Data & lifecycle debt

| # | Issue | Doc |
|---|---|---|
| 10 | `/api/org/delete` hand-deletes only ~7 of ~19 org-scoped tables — an org delete likely orphans rows or trips an FK. Verify and extend before ever deleting an org | 02/03 |
| 11 | Deleting a client never removes its storage objects — media accumulates in `client-media` | 05 |
| 12 | Payroll is computed live from schedule rows and never persisted — editing a past week's schedule silently rewrites past payroll views and re-exports | 08 |
| 13 | A driver set in `driver_staff_id` but absent from `staff_ids` is attributed the day's jobs without increasing the split divisor (looks deliberate; confirm before "fixing") | 08 |
| 14 | `checklist_completions.items` is historically double-JSON-encoded (string inside jsonb) — every reader must keep the string/array guard; new writes via the admin-edit RPC store real arrays | 02/06 |
| 15 | Legacy leftovers in the schema: `checklist_templates` (empty but still referenced twice), `checklist_completions.checklist_id` (second FK, unused by current writers), `schedules.template_code` (read, never written), `clients.checklist_template_id` / `custom_checklist_items` | 02/05 |

## Security-adjacent debt (RLS holds the line, but tighten when convenient)

| # | Issue | Doc |
|---|---|---|
| 16 | `client-media` and `checklist-media` storage write/delete policies are bucket-wide for any authenticated user — not org-scoped like the newer `org-assets` pattern. Cross-org object tampering is possible for a logged-in user who guesses paths | 02 |
| 17 | `/admin` (platform admin) gates client-side only; RLS is the real barrier. Fine today, but don't add service-role reads to that page without a server-side `is_platform_admin` check | 03/09 |
| 18 | `profiles.role` defaults to `'admin'` for brand-new org-less signups (harmless while `org_id` is null, but surprising) | 02 |
| 19 | Invites are hardcoded `role: 'staff'` — inviting an admin means inviting as staff then changing role afterwards | 03 |

## Billing (built but dormant)

| # | Issue | Doc |
|---|---|---|
| 20 | `/api/stripe/checkout` is fully implemented but no UI calls it; nothing in the app gates on `subscription_status`; `subscription_tier` is never written (DB default only); the portal button 400s until a `stripe_customer_id` exists. Billing is effectively display-only today | 09 |

## Dead code register (delete freely, do not "fix")

- `src/lib/hooks/useScheduleJobs.ts`, `src/lib/hooks/useTeams.ts` — zero importers (doc 04)
- `src/lib/payrollCsvExport.ts` — unreferenced, stale types (doc 08)
- `src/lib/staffXlsxExport.ts` exports an older `exportDayRosterXLSX` nothing imports — the live one is in `rosterXlsxExport.ts`; easy to edit the wrong file (doc 08)
- `src/app/api/checklist/pdf/route.tsx` — orphaned legacy PDF renderer against an obsolete data shape (doc 07)
- `src/components/StaffRosterPanel.tsx` + the `staff_assignments` table — superseded, unmounted (doc 04)
- `src/components/OrgSwitcher.tsx` default export — dead (doc 03)
- `myColor` useMemo in `StaffChecklistView.tsx` — dead (doc 06)
- `profiles_insert` RLS policy — dead since `authenticated` lost the INSERT grant (doc 02)
- Dead line `const clientIndex = hasBase ? i : i;` in `routeEngine.calculateAllTravel` (doc 04)

## Minor / perf

- `routeCache` keys by lat/lng only — traffic-aware drive times are reused across different
  departure hours within the 30-min TTL (doc 04)
- Publish/unpublish issue 7×N sequential queries per week (doc 04)
- `minutesToTime` wraps at 24h — overnight shifts are unsupported by design (doc 04)
- Middleware `publicPaths` is exact-match — a future `/help/[slug]` route would silently require
  login until the matcher is updated (doc 03/09)
- `useAuth` client-side profile always carries `timezone: null` (the value is applied via the
  timezone singleton server-side; don't read it off the profile in the browser) (doc 03)
- The items answer key is camelCase `fieldId`, but `buildVisibilityMap` takes `field_id` — every
  caller maps between them by hand; a mistake produces no error, just wrong visibility (doc 07)
