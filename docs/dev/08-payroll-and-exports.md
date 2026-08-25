# Payroll & Spreadsheet Exports

This subsystem turns published schedules into money and paper: a weekly per-staff payroll
screen (hours, travel, driver km allowance, gross wage) with an XLSX download the owner hands
to their bookkeeper, plus the day/week "run sheet" roster XLSX exports printed for cleaning
crews. Everything is computed **client-side in the browser** from published schedule rows —
there is no payroll table in the DB; the schedule *is* the timesheet. All spreadsheets are
built with ExcelJS in `'use client'` modules and delivered as Blob downloads.

## Key files

| File | Role |
|---|---|
| `src/app/dashboard/staff/payroll/page.tsx` | Owner-only payroll screen: staff picker, published-week dropdown, per-day computation (`days` useMemo), wage calc, XLSX trigger |
| `src/lib/payrollXlsxExport.ts` | `exportPayrollXlsx()` — payroll workbook (two-row-per-day layout, hh:mm + decimal) and the `DayPayrollData` contract the page fills |
| `src/lib/rosterXlsxExport.ts` | `exportDayRosterXLSX()` / `exportWeekRosterXLSX()` + `buildWeekRosterDays()` — the styled all-teams run-sheet exports used by the schedule page |
| `src/lib/staffXlsxExport.ts` | `exportStaffScheduleXLSX()` — single-team staff run sheet from the day-summary card. Also contains a **dead** older `exportDayRosterXLSX` (see gotchas) |
| `src/app/dashboard/schedule/page.tsx` | `handleExportRoster()` / `handleExportWeekRoster()` — the "Export Today's / This Week's Roster" dropdowns (all teams or one team) |
| `src/app/dashboard/staff/page.tsx` | Staff roster admin (names, `hourly_rate`, availability, archive). Links to `/dashboard/staff/payroll`; hourly_rate edited here feeds the wage calc |
| `src/components/DailySummary.tsx` | Day-summary card with per-team "staff export" button calling `exportStaffScheduleXLSX` |
| `src/lib/routeEngine.ts` | `calculateDaySummary()` / `calculateScheduleTimes()` — shared math the roster exports lean on |
| `src/lib/payrollCsvExport.ts` | **Unreferenced dead code** (stale `DayPayrollData` copy, missing `kmAllowance`) — delete rather than edit |
| `src/lib/xlsxExport.ts` | `exportScheduleXLSX` — the ADMIN day export triggered from `DailySummary`'s export button: one sheet per day with costs/travel for office use, distinct from the staff-facing roster exports below |

## How it works

### The payroll cycle

- `organizations.payroll_cycle_start_day` (0=Sun … 6=Sat, defaults to 1 = Monday) defines when
  a pay week starts. `getCycleStartOf(date, startDay)` walks back to the most recent such
  weekday. The payroll cycle is deliberately independent from the schedule week (Mon–Sun), so
  a Wednesday-starting cycle spans **two** schedule weeks.
- On load the page fetches *every* published `schedules.schedule_date` for the org, groups the
  dates into cycles keyed by their cycle-start date, and builds the `publishedWeeks` dropdown
  (newest first, label like `12 Aug — 18 Aug 2026 (5/7 days)` when partial). If the currently
  selected week isn't a real published cycle, it snaps to the newest one.
- `publishedCount < 7` sets `isCycleIncomplete` → red banner + a `window.confirm` guard on the
  export button. This exists precisely for the cross-week cycle case: exporting before both
  schedule weeks are published silently underpays.

### Loading jobs for one staff member + week (`loadJobs`)

Reads, via the browser client (RLS):

1. `schedules` for the org in `[weekStart, weekStart+6]` **where `is_published = true`** —
   unpublished drafts never touch payroll. Each row feeds `scheduleDataMap`:
   `{teamId, teamSize, totalTravelMinutes, totalDistanceKm, driverStaffId, calculateFuel, perKmRate, baseDepartureTime}`.
   `teamSize = schedules.staff_ids.length || 1`; `calculateFuel`/`perKmRate` come from the
   separately loaded `teams` map.
2. `schedule_jobs` for all those schedule ids. A job belongs to the selected staff member when
   `assigned_staff_ids` contains them **or** they are "day staff" on the run (in
   `schedules.staff_ids` or the run's `driver_staff_id`).

### The per-day computation (`days` useMemo) — the heart of payroll

For each of the 7 dates:

- **Team split**: `individualJobMinutes += duration_minutes / teamSize` per non-break job.
  The split uses the *run's* staff count, not per-job `assigned_staff_ids`. Two cleaners on a
  3h job → 1h30 each.
- **PER-RUN travel** — the critical invariant (commit `92eaf28`). Travel, driver kms and the
  Start anchor are totalled **per schedule (run) and then summed**, never across the merged
  day. Someone on a midday team and an evening team the same day must not have the idle hours
  between runs counted as travel. Per run:
  1. If the run has saved Google travel (`schedules.total_travel_minutes > 0`), that value
     wins outright and the fallback is skipped (`return` inside the per-schedule loop).
  2. Otherwise, travel is inferred from gaps within *this run only*: an anchor starts at the
     run's `base_departure_time` when that is earlier than its first job (else at the first
     job's start), then every gap between the tracker and the next job's start counts as
     travel. `timedForDay` includes breaks, so a gap covered by a lunch break is *not* travel.
- **Start / Finish columns**: `firstStart` is the earliest per-run anchor — derived by the same
  logic as travel so the two can never contradict (a run whose base departure precedes its
  first job shows the departure). `lastEnd` is the lexicographic max `end_time` across the
  day's jobs+breaks (safe because times are zero-padded `HH:MM`).
- **Driver km allowance**: for each run where the team has `calculate_fuel` on **and**
  `driver_staff_id === selectedStaffId`: `dayDistanceKm += total_distance_km` and
  `dayKmAllowance += total_distance_km * per_km_rate`. Non-drivers get nothing; teams with
  fuel tracking off get nothing.
- **Net work**: `workMinutes = individualJobMinutes + travelMinutes` (clamped ≥ 0). Breaks are
  tracked and displayed but are **unpaid** — same policy as `calculateDaySummary`'s
  `payableMinutes`.

Wage: `grossWage = (Σ workMinutes / 60) × staff_members.hourly_rate`;
`totalPayable = grossWage + Σ kmAllowance`. The UI shows every figure in both `Xh YYm` and
decimal hours because bookkeepers want decimals and humans want h:mm.

### Payroll XLSX layout (`exportPayrollXlsx`)

Single sheet "Payroll", 10 columns:
`Day / Date | Team | Start | Finish | Jobs | Job Hours Total (Team) | Job Hours (Individual) | Travel | Net Work | KM`.
Title row, staff line (`Name - Role - $rate/hr`), header row, then **two rows per worked day**:

- Row 1: day label, team name(s), Start, Finish, `; `-joined job names, then h:mm values
  (`minsToHHMM`), km with one decimal.
- Row 2: full date (`12 August 2026`) in col 1, decimal hours in the four time columns.
- Days with `workMinutes === 0` are skipped entirely (so a day holding only a break exports
  nothing).

Footer block: `WEEKLY TOTALS` — team job hours, individual job hours, travel, net work (each
h:mm + decimal), then `Total KM` / `KM Allowance` only when km > 0, `Gross Wage`, and
`Total Payable` only when an allowance exists. Filename:
`payroll-<Name>-w<DD-MM-YYYY>.xlsx` (week-ending date).

### Day roster XLSX (`rosterXlsxExport.exportDayRosterXLSX`)

Triggered from the schedule page's "Export Today's Roster" dropdown (day view; all teams or a
single team). Columns (7): `# | Client | Address | Start Time | End Time | Total Duration | Access & Notes`.
Per active team: a colour-filled header row (team hex → ARGB), an optional Base row with the
departure time, numbered client rows (addresses stripped of state/postcode via
`cleanAddress`, duration shown **split** — `jobDurationMinutes / teamSize`), amber italic
break rows, a Return-to-Base row, then a Summary block (staff names, Driver, Total Clients,
Total Job Time, Team Split = `payableMinutes − travel`, Travel, Driver Km). "Access & Notes"
is the **client profile's** `clients.notes`, resolved through `clientNotesMap`
(savedClientId → notes) fetched at export time — not the per-job notes field.

Because live `travelSegments` are only populated for teams actually opened in the editor this
session, `handleExportRoster` overlays saved DB truth before exporting: saved
`staff_ids`/`driver_staff_id` (team size changes split durations!), saved
`total_travel_minutes`/`total_distance_km` patched into summaries when the engine computed 0,
and saved `base_departure_time`/`return_arrival_time` passed as `savedTimes`. Inside
`addDayRoster` the same defence exists again: gap-fallback travel anchored at the run's saved
departure (else `team.dayStartTime`), and the Base row prefers the saved departure unless the
base→first-job segment is genuinely loaded.

### Week roster XLSX (`exportWeekRosterXLSX` + `buildWeekRosterDays`)

`handleExportWeekRoster` **refetches the whole week from the DB** (`schedules` +
`schedule_jobs` raw rows typed as `RawWeekScheduleRow`/`RawWeekJobRow`) rather than trusting
the UI's partially-loaded week cache — the export must be saved truth. `buildWeekRosterDays`
reassembles per-day `TeamSchedule` snapshots from those rows (breaks are `is_break` job rows
carrying `{afterClientId, label}` JSON in `notes`; base/return come from the schedule row's
denormalised address columns), computes summaries with the saved travel/distance fallback,
and returns only days that have teams with clients. The output is deliberately **one single
stacked worksheet** (Mon → Sun, each day formatted exactly like the day export under a bold
date header): separate per-day tabs are invisible in macOS Quick Look and read as "only
Monday exported". Filename: `staff-roster[-<team>|-all-teams]-<start>-to-<end>.xlsx`.

### Single-team staff export (`staffXlsxExport.exportStaffScheduleXLSX`)

From `DailySummary.tsx` (day summary card). Plainer styling, 7 columns with `Job Notes /
Access` (the *job-level* `notes`, unlike the roster export), base/return rows, same Summary
block. Uses live `travelSegments` only — no saved-times fallback — so it reflects the editor
session's state. Filename `<Team>-staff-schedule.xlsx`.

### The `*.tmp.ts` live-simulation testing convention

Payroll has no unit tests; the guardrail is a throwaway simulation script. When changing the
payroll math, write a `something.tmp.ts` scratch file (e.g. `payrollSim.tmp.ts`) that
re-implements the old and new versions of the `days` computation side-by-side, feed it real
published `schedules` + `schedule_jobs` rows from the live DB (read-only), and diff the
per-staff per-day outputs across recent weeks before shipping. The per-run travel fix was
verified this way ("Verified against live data: only multi-run days changed" — commit
`92eaf28`). These files are never committed — run with `npx tsx`, then delete. If you touch
`days`, `exportPayrollXlsx`, or the split/travel rules, do this; the one production customer's
wages depend on it.

## Database touchpoints

All access in this subsystem is **browser Supabase client under RLS**; the exports perform
**no writes** anywhere.

| Table / column | Use |
|---|---|
| `organizations.payroll_cycle_start_day` | read — cycle anchor (default 1) |
| `schedules` (`is_published`, `schedule_date`, `staff_ids`, `driver_staff_id`, `team_id`, `total_travel_minutes`, `total_distance_km`, `base_departure_time`, `return_arrival_time`, `has_start_base`, `has_return_base`, `base_address/lat/lng`, `return_address/lat/lng`, `template_code`) | read — payroll week query (published only) and both roster exports' saved-truth overlay/refetch |
| `schedule_jobs` (`schedule_id`, `name`, `address`, `duration_minutes`, `start_time`, `end_time`, `is_break`, `notes` (break JSON), `position`, `client_id`, `assigned_staff_ids`, `staff_count`) | read — job rows for payroll filtering and roster rows |
| `teams` (`day_start_time`, `calculate_fuel`, `per_km_rate`) | read — km-allowance config and gap-fallback anchor of last resort |
| `staff_members` (`name`, `hourly_rate`, `role`, `archived`) | read — payroll staff picker (`archived = false` only); written by the staff roster page (insert/update/archive via browser RLS) |
| `clients.notes` | read at export time — the roster "Access & Notes" column |

The staff page also touches `org_members`/`profiles` (accounts & access) and calls
service-role API routes (`/api/staff/invite`, `/api/staff/remove`, …), but that is the
accounts subsystem, not payroll.

## Invariants & gotchas

- **Travel is per run, never per merged day.** The per-schedule loop in the `days` useMemo is
  the load-bearing structure. Flattening it back to "sort all the day's jobs and sum the
  gaps" re-introduces the bug where hours idle between two runs became paid travel (3h30
  fabricated in production before `92eaf28`).
- **Saved Google travel wins per run, all-or-nothing.** If `total_travel_minutes > 0` the gap
  fallback is skipped for that run entirely. Don't "combine" them — you'd double-count.
- **Payroll never falls back to `teams.day_start_time`.** That fallback was deliberately
  removed (`e9e59f8`): the nominal team start fabricates travel on days that actually start
  at the first job. Only the run's own `base_departure_time` may anchor. (The *roster* export
  does still use `team.dayStartTime` as last resort — that's display, not pay.)
- **Start and travel derive from the same anchor.** If you change one without the other, the
  Start column and the travel figure can contradict on pinned-start days.
- **`timedForDay` includes breaks** so break gaps aren't billed as travel. Breaks are unpaid
  everywhere (`workMinutes`, `payableMinutes`).
- **Team size = `schedules.staff_ids.length`, not per-job assignment.** A driver listed only
  in `driver_staff_id` (not in `staff_ids`) still gets the day's jobs attributed but does not
  increase the divisor. Changing the split to per-job `assigned_staff_ids` is a product
  decision, not a bug fix.
- **Only published schedules count.** Removing `.eq('is_published', true)` pays drafts.
- **Week roster must be built from the DB, not UI state.** The in-memory week cache only holds
  days/teams opened this session; exporting it produces convincingly incomplete spreadsheets.
  Same reason `handleExportRoster` overlays saved staff/driver *before* computing summaries —
  team size affects the split durations in the sheet.
- **Keep the week export single-sheet.** Multi-tab was tried and read as data loss in Quick
  Look.
- **Duplicate/dead code traps**: `staffXlsxExport.ts` still exports an older
  `exportDayRosterXLSX` that nothing imports — the live one is in `rosterXlsxExport.ts`
  (7-column layout with client-profile notes). `payrollCsvExport.ts` is fully unreferenced
  and its copy of `DayPayrollData` is stale (no `kmAllowance`). Prefer deleting both over
  accidentally editing the wrong one.
- Excel column formats are strings, not typed numbers — the hh:mm cells are text like `7:30`.
  Bookkeepers use the decimal row for arithmetic. If you switch to real Excel time/number
  cells, keep both representations.
- `days` runs with `weekStart!` while `weekStart` can still be null; it's safe only because
  `jobs` is empty until `loadJobs` runs and rendering is guarded by the early return. Don't
  reorder the guards.
- Payroll page is **owner-only** (`profile.role !== 'owner'` redirects); the staff roster page
  allows owner+admin. `hourly_rate` visibility is the reason.
- Minor: the `loadStaff` effect on the payroll page lists `selectedStaffId` as a dependency,
  so the staff list refetches on every picker change — harmless, but don't copy the pattern.

## Extension points

- **Multi-staff export**: loop `exportPayrollXlsx` over `staff` (one worksheet per person or a
  summary sheet), reusing the existing `days` computation per staff id — everything already
  keys off `selectedStaffId`; extract the useMemo body into a pure
  `computeStaffDays(jobs, scheduleDataMap, teams, staffId, weekStart)` first (this also makes
  the `*.tmp.ts` simulations trivial).
- **Overtime / penalty rates**: apply band logic where `grossWage` is computed (page) and
  mirror it in the workbook footer; the per-day `workMinutes` array is already the right input.
- **Fortnightly cycles**: generalise `getCycleStartOf` + the 7-day loops (`addDays(weekStart, 6)`,
  `Array.from({length: 7})`, the `/7 days` copy) behind a `cycleLengthDays` org setting.
- **Persisted pay runs** (lock a week once paid): add a `pay_runs` table written by a
  service-role API route, snapshot the computed `DayPayrollData[]` JSON so later schedule
  edits can't rewrite history — today re-opening an old week recomputes from live rows.
- **New roster columns**: extend `setRosterColumns` + every `addRow` in
  `rosterXlsxExport.addDayRoster` in lockstep (widths, the `1..7` styling loops, and the
  week export inherit automatically since it reuses `addDayRoster`).
