# Scheduling Engine

The scheduling engine is the core of CleanRoute Pro: an owner/admin plans each week by placing client jobs on days for one or more teams, the engine computes drive times (Google Maps), start/end times per job, and per-team cost/revenue figures (wages, fuel, per-km, payroll-payable minutes), and the week is then **published** as an immutable snapshot that staff phones read. Everything is org-scoped (`org_id`) and all persistence goes through the browser Supabase client under RLS — there are no service-role API routes in this subsystem.

## Key files

| File | Role |
|---|---|
| `src/app/dashboard/schedule/page.tsx` | Container page (2.8k lines): week/day view switching, week cache, DnD handlers, publish/unpublish/revert, template load, team add/remove, roster exports |
| `src/components/DayEditor.tsx` | Day view: autosave engine, travel calculation orchestration, base/return addresses, team staff picker, breaks UI, map/checklist panel |
| `src/lib/routeEngine.ts` | Pure(ish) engine: `calculateTravel`, `calculateAllTravel`, `calculateScheduleTimes`, `calculateDaySummary`, `getRouteWaypoints`, CSV export |
| `src/lib/scheduleReducer.ts` | `useReducer` reducer + `createInitialState` (restores view from `localStorage.crp_schedule_view`) |
| `src/lib/timeUtils.ts` | `parseTime`/`minutesToTime` ("HH:MM" ↔ minutes-from-midnight), week/month date math, `JOB_DURATIONS` |
| `src/lib/timezone.ts` | Module-level timezone singleton; `setAppTimezone` is called by `useAuth` from the org record |
| `src/lib/routeCache.ts` | In-memory LRU (200 entries, 30 min TTL) for Directions results, keyed by lat/lng pair |
| `src/lib/scheduleWarnings.ts` | Pure warning engine: staff double-booking, cross-team travel feasibility, missing staff/driver/checklist |
| `src/components/TeamTabs.tsx` | Team tab strip: select/rename/recolor teams (portal popovers), staff-count badges |
| `src/components/WeekView.tsx` / `WeekDayColumn.tsx` | Week grid; each column is a dnd-kit droppable (`id = ISO date`), job cards are draggables, warning + roster popovers |
| `src/components/DailySummary.tsx` | Per-day per-team cost card + XLSX exports (admin and staff variants) |
| `src/components/WeeklySummaryPanel.tsx` | Week totals across teams (re-runs `calculateDaySummary` on the week cache) |
| `src/components/RouteMap.tsx` | DirectionsRenderer polyline + numbered markers; keyed on positions only to avoid flicker |
| `src/components/StaffRosterPanel.tsx` | Legacy per-day roster panel backed by `staff_assignments` (not rendered by the current schedule page) |
| `src/components/SaveTemplateModal.tsx` / `LoadTemplateModal.tsx` | Serialize week ↔ `schedule_templates.week_data` JSON |
| `src/app/dashboard/templates/page.tsx` | Template list (schedule + checklist tabs) |
| `src/app/dashboard/templates/schedule/[id]/page.tsx` | Standalone week-template editor: reuses `DayEditor` with `disableAutoSave`, in-memory `weekCacheRef` keyed 0–6 over a fixed reference week (`2024-01-01`) |
| `src/components/AssignTemplateModal.tsx` | Checklist-master → clients bulk assign (checklist side of the templates page) |
| `src/components/MonthOverlay.tsx` | Month-calendar overlay for jumping between weeks (opened from the schedule header) |
| `src/components/TravelSegment.tsx` | The travel-leg row rendered between jobs in `DayEditor` (spinner while calculating, add-break affordance) |
| `src/components/ConfirmModal.tsx` | Shared confirmation dialog (used by the schedule page and `ClientProfileView`) |
| `src/app/dashboard/schedule/error.tsx` | Next.js error boundary for the schedule route — this is the screen you see when the Turbopack stale-bundle wedge strikes (doc 01) |

**Dead code — do not edit believing it's live:** `src/lib/hooks/useScheduleJobs.ts` and
`src/lib/hooks/useTeams.ts` have zero importers (the schedule page uses the reducer + week cache
instead); `StaffRosterPanel`/`staff_assignments` are superseded and unmounted.

## How it works

### Two layers of state

1. **Reducer state** (`AppState` via `scheduleReducer`): `teams: TeamSchedule[]` holds the *currently viewed day* only — each `TeamSchedule` has that day's `clients`, `breaks`, `travelSegments` (a `Map<"fromId->toId", TravelSegment>`), day-specific `baseAddress`/`returnAddress`/`staffIds`/`driverStaffId`, plus team-level settings (rates, fuel). `viewMode` is `'week' | 'day'`; `selectedDate`/`focusedDate` track the day.
2. **Week cache** (`weekSchedules: Map<teamId, Map<date, DaySchedule>>` in page state): the whole visible week for every team, loaded by `loadWeekSchedules` in 2 bulk queries (all `schedules` rows for the week, then all `schedule_jobs` for those schedule ids).

Several refs bridge the async gaps: `allOrgTeamsRef` (every org team), `weekTeamsRef` (teams with a `schedules` row *this week* — the set shown in both views), `stateRef`/`activeTeamIdRef`/`selectedDateRef` (fresh values inside stale closures), `dayLoadRequestRef` (monotonic token that discards stale `loadDayForEdit` responses), and `daySaveRef` (the DayEditor's `saveNow`, callable by the parent).

Day navigation is optimistic: `navigateDayInstant` writes the outgoing day's reducer state into `weekSchedules`, loads the new day synchronously from cache (`loadDayFromCache`), then flushes the old day to the DB in the background (`skipUnmountSaveRef` suppresses DayEditor's unmount flush so it doesn't double-save). `handleBackToWeek` does the same patch-then-background-sync trick, calling `loadWeekSchedules(weekDates, { skipDispatch: true })` afterwards so reconciliation doesn't remount the week cards.

### Route engine (`src/lib/routeEngine.ts`)

- **`calculateTravel`** wraps `google.maps.DirectionsService.route` for one leg. Traffic (`BEST_GUESS`) is only requested when the departure time is in the future. Results go through `routeCache` (LRU keyed by `"lat,lng->lat,lng"` — note the key ignores departure time, so a traffic-aware duration is reused for any time of day for 30 min).
- **`calculateAllTravel`** builds the stop list `[base?, ...clients, base-return?]` and computes legs *sequentially*, advancing a clock by each leg + the job's effective duration so later legs get realistic departure times; a 200 ms delay between legs avoids Directions rate limits. Each leg is first emitted with `isCalculating: true` (UI spinner) then with real numbers via the `onUpdate` callback → `UPDATE_TRAVEL` dispatches. The return leg deliberately does not depend on the start base existing (a day can start at the first client but still return to a base).
- **Team size**: `getTeamSize` = `staffIds.length || 1`. Every job's *effective* duration is `jobDurationMinutes / teamSize` — a 2-person team halves on-site time. `Client.staffCount` is stored but no longer used by the engine.
- **`calculateScheduleTimes`** computes per-job `startTime`/`endTime` and the `baseDepartureTime`:
  - It finds the **last** client with a `fixedStartTime` (pinned time, set from the client card via `SET_FIXED_START_TIME`). From that anchor it walks **backward** (`end[i] = start[i+1] − travel(i→i+1) − breakAfter(i)`), honouring any earlier pins it meets, then **forward** from the anchor (a later pin simply resets the clock — it can jump backwards and cause an overlap, which is the intended manual-override behaviour).
  - With no anchors it is a pure forward pass from `team.dayStartTime`.
  - Missing/in-flight travel segments count as 0 minutes — so before travel loads, times "stack" with no gaps. This is exploited (week view) and guarded against (autosave), see below.
  - `baseDepartureTime = start[0] − travel(base→first)`; the "Day starts at" input in DayEditor shows this back-calculated departure when it differs from `dayStartTime`.
- **`calculateDaySummary`** totals travel/distance from loaded segments, sums booked vs effective job minutes, and defines **`payableMinutes` = effective job minutes + travel minutes (breaks excluded)** — the number payroll uses, computed *per team run*. Wages: every member of `team.staffIds` is paid the full payable time at `team.hourlyRate`. Fuel = `km/100 × efficiency × price`; per-km cost is separate. Revenue = Σ `client.rate × bookedHours` (unaffected by team size).

`loadWeekSchedules` also runs `calculateScheduleTimes` with an empty `travelSegments` map for any day whose jobs lack a `startTime` (e.g. right after a template load or a cross-day drag) so the week view shows approximate times immediately, and fire-and-forgets those times into `schedule_jobs`. Real travel-adjusted times replace them the next time the day is opened.

### Day view: DayEditor and autosave

DayEditor re-runs `calculateScheduleTimes` in a memo on every `activeTeam` change and dispatches `SET_CLIENT_TIMES` when computed times differ. A separate effect keyed on `routeKey` (team id + base + return + client positions) clears and recalculates travel via `calculateAllTravel` after a 500 ms debounce — first for the active team, then for every other team with clients in the background — and writes `total_travel_minutes` / `total_distance_km` onto the day's `schedules` rows (skipping zero writes unless the day genuinely has zero legs).

**Autosave** (`saveNow` + the fingerprint effect) is the subtlest part:

- Two JSON fingerprints of the full teams state are kept: one complete, one **excluding computed `startTime`/`endTime`**. If only the no-times fingerprint is unchanged, the change was just the post-load time calculation — the baseline is silently absorbed and *no save fires*. `justLoadedRef` (reset on `selectedDate` or `loadGeneration` change) makes the first effect run after any load record the baseline only.
- **Structural changes** (client/break count, base/return, staff/driver, team settings) save immediately; detail edits debounce 1500 ms. `saveNow` serialises concurrent calls (`isSavingRef` + `needsSaveRef` do-while loop) and retries each save once after 800 ms.
- Persistence is **delete-and-reinsert**: for each team it upserts the `schedules` row, then deletes all `schedule_jobs` for that schedule and reinserts. Client rows reuse `c.id`, so **job ids are stable across saves** (essential — see publishing). Break rows are inserted without an id (DB generates one); the logical break id lives in the JSON `notes`.
- Guards inside `saveNow`:
  - *Wipe guard*: if state has 0 clients but the DB schedule still has job rows, the job write is skipped (assumed load failure).
  - *travelLoaded guard*: if the day has travel legs but no loaded segments, freshly computed times are wrong (collapsed onto day start), so previously saved `start_time`/`end_time` are re-read and preserved for surviving jobs; `base_departure_time`, `total_travel_minutes`, `total_distance_km` are likewise only written when real data exists (or the day genuinely has zero legs, so honest zeros don't get stuck as stale positives).
  - `onModified` fires **before** writing when there are unsaved changes, letting the parent flip `needs_republish` first so staff never see half-edited "published" data.
- Breaks whose `afterClientId` no longer exists are filtered out at save; orphaned/malformed break rows are skipped at load (legacy rows fall back to `afterPosition`).

Background geocoding: clients loaded with `lat/lng = 0` get resolved via Places Autocomplete + PlacesService and patched with `UPDATE_CLIENT` (au-restricted).

### Week view and drag-and-drop (dnd-kit)

One `DndContext` wraps the week grid (`PointerSensor`, 5 px activation distance). Two draggable types, distinguished by `active.data.current.type`:

- **Sidebar client** (`WeekClientSidebar` → `handleDragEnd` else-branch): dropping a saved client on a day column (droppable id = ISO date) ensures a `schedules` row exists for the active team+date, counts existing jobs for `position`, looks up the client's **default checklist** (`client_checklists.is_default = true`) and inserts a `schedule_jobs` row with `checklist_id` pre-filled. The UI updates optimistically first; an insert error triggers a full week reload. Disabled in "All Teams" view.
- **Job card** (`type: 'job'`): dragging to another day ensures the target `schedules` row, then `UPDATE`s the job's `schedule_id`, `position`, and nulls `start_time`/`end_time` (recomputed on next load). Dragging onto the floating `DeleteZone` (`id: 'delete-zone'`) deletes the row. Same-day drops are no-ops; *reordering within a day happens in DayEditor, not the week grid*.

The same checklist auto-assign happens when adding a client in day view (`AddClientButton.addSavedClient` dispatches `ADD_CLIENT` then patches `checklistId` asynchronously; autosave persists it).

Warnings: `computeDayWarnings(teams, allStaff)` runs per day (memoised as `weekDayWarnings`, filtered per active team) and per the open day inside DayEditor. It detects: staff on two teams with overlapping time windows (error), staff shared across non-overlapping teams where the gap is shorter than the drive between the last/first jobs (live segment if available, else haversine at 60 km/h; warning), teams with jobs but no staff (info) or no driver (warning), and saved clients missing a checklist (warning).

### Publishing: draft vs snapshot

`schedule_jobs` is the **draft** the planner edits; `published_jobs` is the **snapshot** staff see (`/dashboard/staff-view` and the completed-jobs page read only `published_jobs` where `schedules.is_published`).

`handlePublishWeek`: sets `is_published = true, needs_republish = false` on every `schedules` row of the week, deletes old `published_jobs` for those schedule ids, selects current `schedule_jobs`, and re-inserts them into `published_jobs` **with the same `id` values, copied verbatim**. This is deliberate: `checklist_completions.schedule_job_id` and the checklist panel key off the job id, so completions recorded by staff against the published snapshot line up 1:1 with the draft row (which keeps its id across autosaves thanks to the reuse of `c.id` on reinsert).

After publishing, any edit (DayEditor's `onModified`, or a sidebar drop on a published week) sets `needs_republish = true` on all the week's schedule rows and flips the header into the amber "Re-publish / Revert" state. `handleRevertWeek` does the inverse copy — wipes `schedule_jobs` and restores rows from `published_jobs` (same verbatim column list). `handleUnpublishWeek` clears flags and deletes the snapshot so staff see nothing. `publishedDates`/`weekIsPublished` derive from `is_published || needs_republish` per date, counting only dates that actually have schedule rows. A "Published Weeks" modal lists history (grouped by `getWeekDates` Mondays) with per-week unpublish.

### Week templates

- **Save** (`SaveTemplateModal`): serialises the current `weekSchedules` into `schedule_templates.week_data` — JSON keyed `"0"`–`"6"` (Mon–Sun), each day an array of `{ teamName, teamId, dayStartTime, baseAddress, returnAddress, hasStartBase, hasReturnBase, driverStaffId, staffIds, breaks: [{afterClientIndex,…}], clients: [...] }`. Only team/days with a real `scheduleId` are included. Breaks are stored by **client index**, clients without ids (ids are regenerated on load).
- **Load** (`LoadTemplateModal` → `handleLoadWeekTemplate` in the page): flushes pending day edits, resolves template teams to org teams by saved `teamId` first then by name (creating new `teams` rows for unmatched names), **deletes every schedule row for the org for the whole week** (same blast radius as Clear Week — this prevents phantom leftover teams), strips staff/driver ids that no longer exist in `staff_members` (with a toast), then inserts `schedules` + `schedule_jobs` day by day with fresh `crypto.randomUUID()` ids (explicit ids avoid relying on Postgres RETURNING order for the break `afterClientId` mapping). A "Loaded from X" badge is persisted in `localStorage.crp_loaded_template`, keyed to the week start.
- **Standalone editor** (`/dashboard/templates/schedule/[id]`): edits a template *without touching live schedules*. It renders the same `DayEditor` with `disableAutoSave` (no DB writes from the editor), keeps 7 in-memory day states in `weekCacheRef` over a fixed reference week starting `2024-01-01` (a Monday) so date-based components work, and serialises the cache back to `week_data` on save. Template-only teams (created inside the editor) are reconstructed from `week_data` metadata on load since they have no `teams` row. Empty teams are saved anyway so they survive reload.

`weekly_team_configs` gives each week independent team names/colors: `loadTeams(weekStart)` overlays `name`/`color_index` per week, and TeamTabs rename/recolor handlers upsert into it (read-then-upsert to avoid nulling the sibling field). `week_labels` stores a free-text rotation label per org+week (debounced upsert from the header input).

### Timezone

`src/lib/timezone.ts` holds a module-global IANA string, defaulting to the browser zone and overwritten by `useAuth` from the org record (and by the settings page). `getTodayISO()` → `getTodayInTimezone()` formats "now" via `Intl.DateTimeFormat` in that zone; all other date math (`addDays`, `getWeekDates`) operates on plain `YYYY-MM-DD` strings using local `Date` construction at midnight/noon, which is DST-safe because only calendar arithmetic is done. Never use `toISOString().slice(0,10)` here — that reintroduces the UTC shift this module exists to kill.

## Database touchpoints

All reads/writes below use the **browser Supabase client under RLS** (org-scoped policies). No service-role writes exist in this subsystem.

| Table | Read | Written by |
|---|---|---|
| `teams` | `loadTeams`, template editor | autosave (`name`, `day_start_time`, `hourly_rate`, fuel columns), `TeamSettingsCard.saveFuelToDB` (`calculate_fuel`, `fuel_efficiency`, `fuel_price`, `per_km_rate`), `handleAddTeam` insert, template load insert. Columns: `base_*`, `return_*`, `return_disabled`, `color_index`, `sort_order` |
| `schedules` | week/day loads, exports, staff view | autosave upsert (`has_start_base`, `has_return_base`, `base_*`, `return_*`, `driver_staff_id`, `staff_ids[]`, `total_travel_minutes`, `total_distance_km`, `base_departure_time`, `return_arrival_time`), DayEditor travel effect (totals), publish/unpublish (`is_published`, `needs_republish`), DnD row creation, `handleAddTeam` (7 rows), template load, Clear Week / team delete (row deletes). `template_code` is **read-only legacy** — nothing writes it any more |
| `schedule_jobs` | week/day loads, exports | autosave delete+reinsert (client rows keep their `id`; break rows: `is_break=true`, break metadata JSON in `notes` = `{afterClientId, afterPosition, breakId, label}`), DnD insert/update/delete, week-view time backfill (`start_time`/`end_time`), template load bulk insert, revert (restore from snapshot) |
| `published_jobs` | staff view, completed page | `handlePublishWeek` (delete + verbatim copy of `schedule_jobs`, **same ids**), `handleUnpublishWeek` (delete) |
| `schedule_templates` | Load modal, templates page, template editor | SaveTemplateModal insert, template editor insert/update, deletes from both modals/pages |
| `weekly_team_configs` | `loadTeams(weekStart)` | TeamTabs rename/recolor upserts (`onConflict: 'team_id,week_start'`) |
| `week_labels` | header label load | debounced upsert/delete (`onConflict: 'org_id,week_start'`) |
| `clients` | color/rate maps, roster-export notes | — (managed elsewhere) |
| `client_checklists` | default-checklist lookup on job creation (`is_default = true`) | — |
| `staff_members` | `loadStaffMembers` (non-archived), template-load staff validation | — |
| `staff_assignments` | `StaffRosterPanel` (legacy; reads+writes, but the panel is not mounted by the schedule page) | |
| `checklist_completions` | staff view joins on `schedule_job_id` (why job ids must survive publish) | — (written by checklist runtime) |

## Invariants & gotchas

- **Job ids must survive both autosave and publish.** Autosave reinserts `schedule_jobs` with the same `c.id`; publish copies rows verbatim into `published_jobs`. Break either one and checklist completions (`checklist_completions.schedule_job_id`) silently detach from jobs. If you ever replace delete-and-reinsert with an upsert/diff, keep the id contract.
- **Add a field → touch four places.** A new persisted field on `Client`/`TeamSchedule` needs: the autosave payload, *both* autosave fingerprints (with/without times), the week/day loaders' row→object mapping, publish/revert's explicit column lists in `page.tsx` (they hand-pick columns — a new `schedule_jobs` column not added there is dropped from snapshots), and template save/load serialisation. Missing the fingerprint means the field never triggers a save; missing publish's list means staff never see it.
- **Never write computed times without loaded travel.** With an empty `travelSegments` map, `calculateScheduleTimes` returns gap-less times. The autosave `travelLoaded` guard and the "only write totals when > 0 unless the day has zero legs" rules exist to stop those approximations overwriting real data — payroll pays travel minutes from `schedules.total_travel_minutes`, so a bad write costs real money.
- **`minutesToTime` wraps at 24 h and `parseTime` returns 0 for malformed input.** Overnight shifts are not supported; a backward pass from an early pinned time can produce negative minutes that wrap to late-evening strings.
- **`routeCache` ignores departure time** in its key: the first traffic-aware estimate for a coordinate pair is reused for 30 minutes regardless of time of day. Acceptable inaccuracy by design.
- **Effective duration divides by team headcount** (`staffIds.length || 1`), not `client.staffCount` (legacy, still saved/rendered but ignored by the engine). Assigning staff changes job durations, times, and wages everywhere.
- **Week view only shows teams with a `schedules` row this week** (`weekTeamsRef`); day view shows the same set. `handleAddTeam` therefore inserts 7 (or missing) schedule rows just to make a team visible. Filtering day view by rows-with-jobs previously caused phantom team duplication — don't reintroduce it (see comment above the `LOAD_STATE` dispatch in `loadDayForEdit`).
- **Template load and Clear Week wipe the whole org week**, not just the active team's rows. Loading a template on a half-planned week destroys the other teams' plans by design.
- **Breaks are `schedule_jobs` rows with `is_break=true` and JSON in `notes`.** Anything that parses job notes must skip break rows; anything that renames a client id must fix `afterClientId`. Breaks anchored to deleted clients are filtered at save and skipped at load.
- **Concurrency plumbing is load-bearing:** `dayLoadRequestRef` (stale response discard), `skipUnmountSaveRef` (prevents DayEditor's unmount flush racing the explicit flush + week reload), `justLoadedRef`/`loadGeneration` (prevents a load from looking like an edit), `isSavingRef` loop (serialises saves). Removing any of these reintroduces bugs that comments in the file explicitly memorialise (double saves, wiped days, duplicated teams).
- **`onModified` must run before job writes** so `needs_republish` is set before new draft rows land — otherwise staff can observe a published week that silently differs from its snapshot with no re-publish banner.
- **Financial visibility**: `hideFinancials = role !== 'owner'` and `isRestricted = !owner && !admin` gate rates/revenue and all mutating header actions. These are UI-level gates only; RLS is the real boundary.
- Known dead/legacy bits: `schedules.template_code` is read (roster export, day header) but never written; `/dashboard/templates` "load to schedule" pushes `/dashboard/schedule?template=<id>` but the schedule page never reads that query param (dead link — load via the modal instead); `StaffRosterPanel` and `staff_assignments` are an older per-day roster mechanism superseded by `schedules.staff_ids`; `invalidateScheduleCache()` is a no-op kept only so DayEditor's import doesn't break; `calculateAllTravel` contains a dead `const clientIndex = hasBase ? i : i;` line.
- **Publish/unpublish loop per date sequentially** (7 × N queries). Fine at one org; batch before you scale.

## Extension points

- **Reorder jobs by dragging in week view**: `WeekDayColumn` job cards already carry `teamId`/`position` data; add a sortable context per column and write `position` updates like the cross-day move does.
- **True multi-week copy** ("copy last week"): reuse `handleLoadWeekTemplate`'s write path but source `weekData` from `loadWeekSchedules` of another week instead of `schedule_templates` (SaveTemplateModal's serialiser is already the right shape).
- **Per-job staff assignment revival**: `assigned_staff_ids` still round-trips through every save/load/publish path; only the UI (TeamStaffPickerCard) and wage math (`calculateDaySummary`) moved to team-level. To bring back per-job crews, reintroduce a picker on `ClientCard` and switch `staffLaborMinutes` to sum per-job windows.
- **Smarter re-publish**: `needs_republish` is week-granular (set on all dates). Making it per-schedule only requires narrowing the `.in('schedule_date', weekDates)` update in `onModified`/drop handlers and adjusting the `hasUnpublishedChanges` derivation, which already reads per-row `needs_republish`.
- **Server-side travel**: `calculateTravel` is the single Google entry point; swapping to the Routes API (server route + cached table keyed by place-id pair and hour bucket) would remove the browser key and make `total_travel_minutes` writes authoritative rather than session-dependent.
- **Warning types**: add new checks inside `computeDayWarnings` — it is pure, already receives full `TeamSchedule[]` + staff, and every surface (day banners, week badges, template editor) renders whatever it returns.
