# Staff experience (mobile-first)

This subsystem is what a cleaner sees on their phone: "My Schedule" (`/dashboard/staff-view`) shows today's run, the week ahead and their submitted checklists; tapping a job opens `StaffChecklistView`, a full-screen collaborative checklist form that autosaves every answer to `checklist_completions`, syncs live between teammates via Supabase Realtime, and locks itself once submitted. Admins get a read-only impersonation tool ("Staff View", `/dashboard/staff-preview`) that renders the real pages as any staff member/role would see them. This is the highest-stakes UI in the product — it runs on flaky phone connections in the field, and most of its complexity exists to guarantee a tap is never silently lost.

## Key files

| File | Role |
|---|---|
| `src/app/dashboard/staff-view/page.tsx` | `StaffPortalPage` — Today / Schedule / Completed tabs, team roster, job cards, base cards, driver banner |
| `src/components/StaffChecklistView.tsx` | The checklist form: field renderers, autosave engine, realtime collaboration, submit lock, media upload, mailto report. Exports `COLLAB_COLORS` |
| `src/app/dashboard/staff-preview/page.tsx` | Admin "Staff View" impersonation tool (page toggles rendering real page components) |
| `src/components/checklist/types.ts` | Shared field model, `buildVisibilityMap` (conditional logic), `migrateOldSection` (legacy shape migration) |
| `src/app/dashboard/DashboardShell.tsx` | Nav labels the preview tool mirrors; auto-redirects mobile users to `/dashboard/staff-view` |
| `src/lib/supabase/middleware.ts` | Role gates: staff can only reach `staff-view`; supervisors are blocked from `staff-preview` |
| `src/components/ClientInfoPanel.tsx` | Lazy-loaded overlay from the job card info button |

## How it works

### StaffPortalPage (`staff-view/page.tsx`)

Three tabs (`Tab = 'today' | 'week' | 'completed'`), bottom tab bar on real devices, an inline top strip in preview mode (`isPreview = !!overrideStaffId`). All data loads through the **browser Supabase client under RLS**.

**Staff identity resolution** (first effect): the page needs a `staff_members.id`, not an auth user id.
1. Preview: `overrideStaffId` is used verbatim.
2. Otherwise look up `staff_members` by `user_id = profile.id` **and** `org_id = profile.org_id`. The org scope matters: one login can be staff in several orgs, and an unscoped `maybeSingle()` returns null on multiple rows, which used to make the page silently show no jobs.
3. Fallback: case-insensitive email match against the roster; on a hit it **writes back** `staff_members.user_id` (self-linking, browser write).

**Admin fallback**: `isAdminView = !isPreview && profile.role !== 'staff'`. Owners/admins/supervisors (who often have no staff record) see the *full* published schedule read-only instead of loading forever. In preview this is forced off, so an admin previewing a cleaner sees only that cleaner's jobs.

**`loadWeek`** builds `DayData[]` for the Mon–Sun window (`getTodayISO`/`formatDateInTimezone` — org-timezone aware, do not swap in `new Date().toISOString()`):
- Reads `teams`, `schedules` (only `is_published` rows are kept), `published_jobs` (ordered by `position`), and `checklist_completions` filtered to `status = 'submitted'` for the completion badges — an in-progress checklist deliberately does not count as done.
- Jobs are filtered per schedule to the staff member: assigned on the job (`assigned_staff_ids`), or on the day (`staff_ids`/driver), or everything when `isAdminView`.
- **Breaks** are stored as jobs with `is_break` and their placement metadata JSON-encoded in `notes` (`{afterClientId}` or `{afterPosition}`); `loadWeek` re-inserts them between client jobs and derives the break start time from the previous job's `end_time`. Non-JSON notes fall through to "insert at end".
- **Team segments**: each published schedule for a day becomes a `TeamSegment` (team name/color, driver, roster, jobs, leave-base and return-base info). Segments sort by start time so morning shifts render before evening shifts. The roster merges day-level `staff_ids` + driver + every job's `assigned_staff_ids` — many days roster staff only on individual jobs, which used to leave the roster card empty.
- Team colors come from `TEAM_COLORS[team.color_index % 8]` — a *different* palette from `COLLAB_COLORS`.

**Today tab** renders `DriverBanner`, a 3-stat strip (jobs / start / "Signed" checklist count), one `TeamRosterCard` per segment, then per-segment `BaseCard` (leave) → `JobCard`s → `BaseCard` (return). `JobCard` shows a Google Maps deep link (`destination` + optional `destination_place_id`) and a Checklist button only when the job has both `client_id` and `checklist_id`. `handleChecklistClose` reloads the week so completion badges update immediately.

**Completed tab** (`loadCompleted`): last 60 `checklist_completions` where `completed_by = auth user` and `status = 'submitted'`, with client names resolved from `clients` and template names from `checklist_templates` (see gotchas — that lookup is wrong). The View button reopens `StaffChecklistView` for that `schedule_job_id`.

### StaffChecklistView — the completion write machinery

The core problem: several cleaners edit **one row** (`checklist_completions`, one per `schedule_job_id`) from phones with poor connectivity, while Realtime echoes every write back to every device. Naive state management reverts in-flight taps; everything below exists to prevent that.

**State vs refs.** React state (`answers`, `notes`, `mediaUrls`) drives rendering; synchronous refs (`answersRef`, `notesRef`, `mediaUrlsRef`, `currentUserIdRef`, `orgIdRef`) drive the save payload, because state is stale inside async saves. Every mutation updates the ref *first*, then state. `performSaveRef.current = performSave` is reassigned every render so timers always call the latest closure (the old stale-closure bug wrote empty state).

**`pendingFieldsRef` — the echo guard.** `Map<fieldId, editTimestamp>`. Set on every local edit; consulted by both the resume fetch and `mergeRemoteItems` — a pending field is never overwritten by remote data, because the Realtime echo of an in-flight save carries a pre-tap snapshot. After a successful save, only entries with `ts <= saveStartTs` are cleared: a field tapped *during* the save stays protected from the echo that is about to arrive. `dirtyRef` is then recomputed from whether anything is still pending. Notes have the same protection via `notesEditTsRef` + the `!dirtyRef.current && !saveLockRef.current` guard in the realtime handler (this was the "character limit that deletes text" bug — the echo reverted typing).

**`mergeRemoteItems`** (applied to resume + every realtime payload) skips, in order: fields in `pendingFieldsRef`; the self-echo of answers I authored (`completed_by === myId` with an existing local answer); and remote copies with `value:null` and no `completed_by` that would erase a real local answer (a peer's whole-row write snapshotted before my save landed). Everything else is adopted, `answersRef` re-synced, the user color map rebuilt, and the merged state written to the localStorage draft.

**Autosave engine.** Discrete fields (`setAnswer(..., debounce=false)`, `toggleNa`, uploads) call `saveNow()` — immediate. Text fields go through `scheduleDebouncedSave()` (500 ms). `performSave(isFinal)`:
- Serializes concurrency with `saveLockRef`; a save requested mid-save sets `pendingSaveRef` and is run once as a follow-up. A `visibilitychange → hidden` listener flushes a dirty form when the app is backgrounded (this, not `beforeunload`, is the real flush — see gotchas).
- Payload: `org_id`, `client_id`, `schedule_job_id`, `checklist_template_id`, `items: JSON.stringify(answersArr)`, `media_urls`, `notes`, `completed_by`, `completed_at: now`, `status: isFinal ? 'submitted' : 'in_progress'`, `submitted_at`.
- **`updateRow`** does `.update(...).select('id')` and treats **0 returned rows as the row having been deleted** (admin "Reset progress" on the Completed dashboard hard-deletes the row). Without this, a 0-row update returns no error and every later save is a silent no-op forever. On detection it nulls `completionIdRef`, sets `rowVanished`, and the save re-inserts so the cleaner's current answers survive the reset.
- **`insertRow`** handles the two-devices race: a unique index on `schedule_job_id` makes the loser's insert fail with **`23505`**; recovery re-queries the winner row, adopts its id into `completionIdRef`, and retries as an update.
- Non-final saves against a known row first read `status`; if `'submitted'` the form locks locally (`setSaved(true)`, pending cleared) instead of writing — a DB trigger rejects post-submit writes anyway (final-submit errors containing `submitted_locked` are surfaced as "already submitted"), the check just keeps the UI honest and avoids error noise.

**Success-gated submit.** `handleSubmit` cancels the debounce timer, validates required *visible* fields (N/A counts as answered; `false`/empty string/empty array do not — the same rule `buildVisibilityMap`'s `is_answered` and the progress counter use), scrolls to the first error, then **spin-waits up to 5 s for `saveLockRef` to release** before `performSave(true)` — a final save interleaved with an autosave could downgrade `status` back to `in_progress`. Success is the *only* path to the "All done!" screen and `clearDraft()`; a failed submit keeps `dirty`/`pending` set, shows `submitError`, and leaves the localStorage safety draft in place (it used to show "All done!" and delete the draft on failure).

**Drafts.** Keyed `crp_cl_draft_${scheduleJobId}` in localStorage, storing `{answers, notes, ts, templateId}`. Restored only when the DB has no row yet; a draft whose `templateId` differs from the currently loaded checklist is discarded (admin swapped the client's checklist — the fieldIds would not match). A restored draft schedules a save after 2 s to push it to the DB.

**Realtime collaboration.** One channel per job (`checklist:${scheduleJobId}`), `postgres_changes` on `checklist_completions` filtered by `schedule_job_id`. The handler adopts the row id, locks the form when a teammate submits, applies guarded notes, and runs `mergeRemoteItems`. Colors: `buildUserMap` assigns `COLLAB_COLORS[i % 6].bg` by first-seen order of `completed_by` across answers, with the **current user forced into slot 0** — so every device shows *itself* as indigo; colors are per-device consistent, not globally consistent (deliberate tradeoff). `fetchUserNames` resolves `profiles.full_name` for avatar initials and the "Completed by" chips. Each `FieldAnswer` carries `completed_by`, which drives the colored border/dot per field.

**Media upload.** `handleFileChange` uploads straight from the browser to the **`checklist-media`** storage bucket at `${userId}/${fieldId}/${ts}-${rand}.${ext}` (`upsert: true`), then stores the **public URL** (`getPublicUrl`) both in `mediaUrls[fieldId]` and inside the answer's `value` array, and triggers `saveNow()`. The Submit button is disabled while `uploading` (but deliberately *not* while `saving` — a `pointer-events-none` submit button silently swallowed the tap that follows an autosave).

**Preview mode (`isPreview = !!previewSections`).** Used by the checklist builder's phone-frame preview (`checklists/page.tsx`, which relies on a CSS `transform` making the frame the containing block for this component's `fixed inset-0`). Preview renders the passed sections, never queries or writes anything: no completion row, `performSave` short-circuits (final just shows the done screen), uploads become local `URL.createObjectURL` previews, no realtime channel (the resume effect needs `scheduleJobId`, which preview doesn't pass).

**Email report fallback.** On the done screen, `handleEmailToClient` builds a plaintext report and opens a **`mailto:`** URL to `clients.email` — no server involved. Fields hidden by conditional logic are excluded so a stale answer from before a field was hidden can't leak to the client. The polished Resend-powered email lives elsewhere (admin Completed page → `/api/checklist/send-report`); mailto is the staff-side, zero-infrastructure path.

**Field rendering (`FieldCard`)** covers `heading`/`paragraph` (display-only), `checkbox`, `yesno`, `dropdown`, `multiselect`, `multidropdown`, `text`, `date`, `time`, `photo`/`video`. `date`/`time` fields are pre-filled with today/now by `initAnswers`. Two iOS-specific patterns are load-bearing (both commented in the file): the card header is a plain JSX *value*, not an inline component (an inline component remounts every render and iOS drops taps on remounted nodes), and the checkbox card is a `div role="button"`, not `<button>`, because the nested N/A control is a real button and nested buttons break hydration and taps.

### Staff preview (`staff-preview/page.tsx`)

Admin-only (`role === 'staff'` is redirected to `staff-view`; middleware also blocks supervisors). It loads non-archived `staff_members` plus an `org_members` role map to build `PreviewAccount`s (unlinked staff default to role `staff`). Selecting a person shows the nav for their role — `ADMIN_NAV` / `SUPERVISOR_NAV` / `STAFF_NAV` **must mirror the labels in `DashboardShell`'s nav** — and each page toggle renders the *real* page component: `StaffPortalPage` with `overrideStaffId`/`overrideStaffName` for "My Schedule", `CompletedPage`, `ChecklistsPage`, `TemplatesPage`, `StaffPage`, `SettingsPage` with `overrideRole` (which swaps `effectiveRole = overrideRole ?? profile.role` for UI gating), `HelpPage`, and `SchedulePage` with `overrideRole` as the fallback branch. The "Staff View" toggle renders a self-referential placeholder.

This is **UI-level impersonation only**: every query still runs under the *admin's* auth session and RLS. `overrideStaffId` filters which jobs show; `overrideRole` changes which controls render. It cannot reveal anything RLS hides from the admin, and it cannot test RLS as the staff user.

## Database touchpoints

All staff-view/checklist traffic is the **browser client under RLS** — this subsystem has no API routes of its own.

Reads: `teams`, `schedules`, `published_jobs`, `checklist_completions`, `clients` (name/email), `client_checklists` (job checklist by id, or client default via `is_default`), `checklist_templates` (Completed-tab name lookup — buggy, see below), `staff_members`, `org_members` (preview role map), `profiles` (org_id, full_name).

Writes (browser, RLS):
- `checklist_completions` insert/update — the whole row every save: `items` (stringified `FieldAnswer[]`), `media_urls`, `notes`, `status`, `completed_by`, `completed_at`, `submitted_at`.
- `staff_members.user_id` backfill on email-match self-linking.
- Storage upload to the `checklist-media` bucket (public URLs).

DB-side invariants this code depends on (live in the database, not in repo migrations): a **unique index on `checklist_completions.schedule_job_id`** (the `23505` recovery path), and a **trigger locking submitted rows** whose error message contains `submitted_locked`. Admin-side counterparts (service-role API routes, out of scope here) are `/api/checklist/admin-edit` → `admin_edit_completion` RPC, and the Completed page's Reset progress, which `.delete()`s the row — the trigger that `updateRow`'s 0-row detection exists for.

## Invariants & gotchas

- **`items` is double-encoded.** `performSave` writes `JSON.stringify(answersArr)` into the column, so every reader (this file, the admin Completed page, PDF/report routes) guards with `typeof items === 'string' ? JSON.parse(items) : items`. Removing either side alone breaks the other.
- **Never remove the ref-sync lines.** Every `setAnswers`/`setNotes`/`setMediaUrls` is paired with a ref assignment. Saving from React state re-introduces the lost-keystroke bugs.
- **The pending-field clear must stay timestamped** (`ts <= saveStartTs`). Clearing the whole map after a save re-opens the mid-save-tap revert bug.
- **`updateRow` must `.select('id')`.** Supabase returns success with zero rows for an update on a deleted row; without the row-count check, admin Reset progress permanently bricks the open form.
- **Submit's lock-wait loop** exists because a final save must not interleave with an autosave (status downgrade). If you add new save paths, respect `saveLockRef`.
- **The Submit button is intentionally enabled while `saving`** and the checkbox card is intentionally not a `<button>`; the FieldCard header is intentionally not an inline component. All three are iOS tap-reliability fixes with comments in the file.
- **`completed_at`/`completed_by` are "last writer", not "submitter".** Every autosave overwrites both. Consequently the Completed tab (filtered `completed_by = me`) only lists checklists where *you* made the last write — a teammate who submitted the shared checklist "owns" it. Per-field attribution lives in `items[].completed_by`.
- **Completed-tab template names are looked up in the wrong table.** `loadCompleted` queries `checklist_templates` by `checklist_template_id`, but the value stored is a `client_checklists.id` (that is what `StaffChecklistView` sets `templateId` from, and what `send-report`/`admin-edit` join against). The lookup misses and the UI falls back to "Checklist".
- **Completed-tab View reopens the done screen, not a readback.** It passes no `checklistId`, so the component falls back to the client's *default* checklist; the resume fetch then sees `status='submitted'` and shows the "All done!" screen (useful for re-sending the mailto report). If the job ran a non-default checklist, or the client has no default, sections won't load ("No checklist assigned") — the answers themselves are safe in the DB either way.
- **`beforeunload` does not actually save** — `flushSave` only clears `dirtyRef` (you cannot await inside beforeunload). The real flush is `visibilitychange → hidden`. Don't "simplify" the visibility handler away.
- **`myColor` (~line 357) is dead code** — a vestigial `useMemo` that always returns `COLLAB_COLORS[0].bg` and is never read; `userColorMap` is the real mechanism.
- **Collaboration colors are per-device**, not globally agreed: each device pins itself to color 0. Do not "fix" one side to a global ordering without changing all devices at once.
- **`checklist-media` is served via public URLs** — anyone holding a URL can view the file. Paths embed the uploader's user id.
- **Conditional logic must stay unified.** Visibility, progress counting, required validation, and the mailto report all flow through `buildVisibilityMap`/`allFields`; a field diverging between them lets a hidden required field block submit, or leaks hidden answers into reports. Note `logicAction` defaults to `'show'` (`actionOf`) because the builder never writes the default — a strict `=== 'show'` comparison silently disabled most rules once.
- **Draft `templateId` check**: drafts from a swapped checklist are discarded, not migrated. Answers keyed by old fieldIds are unrecoverable by design.
- **Preview nav arrays must track `DashboardShell`** by label string; renaming a nav item in the shell without updating `ADMIN_NAV`/`SUPERVISOR_NAV`/`STAFF_NAV` desyncs the impersonation tool silently.
- Break placement metadata is JSON hidden inside `published_jobs.notes` for break rows — real notes rendering must keep excluding break rows, and the `try/catch` around `JSON.parse` is load-bearing.

## Extension points

- **Read-only answer review for staff**: store `checklist_id` on the completion row (or pass `job.checklist_id` through the Completed tab) and add a `readOnly` render mode to `StaffChecklistView` (render `FieldCard`s with all inputs disabled when `saved` instead of the done screen). Fixes the View-button limitation at the same time.
- **Fix the Completed-tab name lookup**: query `client_checklists` instead of `checklist_templates` in `loadCompleted`.
- **Offline-first**: the draft system already survives reloads; extending it means queuing `performSave` payloads (e.g. in IndexedDB) and replaying on `online` — the echo guards and 23505/0-row recovery already tolerate replayed writes.
- **Presence ("who's viewing now")**: the per-job Realtime channel is already open; add Supabase presence tracking on it and render live avatars beside the answer-attribution avatars.
- **Per-field timestamps / audit**: `FieldAnswer` is an open shape stored as JSON — add `completed_at` per field; old rows simply lack the key. Keep the merge rules in `mergeRemoteItems` in mind when adding fields the guard logic should compare.
- **Clock-in/clock-out or job status**: follow the completion-row pattern — one row per `schedule_job_id`, unique index, adopt-on-23505, echo-guarded realtime — rather than inventing a second write discipline.
- **Staff-side Resend email**: the done screen could POST to `/api/checklist/send-report` (it already validates org membership server-side) instead of `mailto:`; keep the mailto as the no-email-configured fallback.
