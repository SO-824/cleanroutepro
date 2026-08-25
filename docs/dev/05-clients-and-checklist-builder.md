# Clients & Checklist Builder

This subsystem is the client database (name, geocoded address, rate, contact, access notes, media) and the per-client checklist editor. Admins build the forms staff fill in on-site — a Notion-style block editor with 13 field types and a conditional show/hide logic engine — and mark one checklist per client as the *default*, which the scheduler auto-assigns to jobs. Everything staff see on their phone, everything the Completed panel reviews, and everything the emailed client report renders comes out of the `sections` JSONB these components write.

## Key files

| File | Role |
|---|---|
| `src/app/dashboard/checklists/page.tsx` | The **"Clients" nav tab** (yes, the route says checklists): client tree + nested checklists on the left, checklist editor / client profile / new-client draft on the right. Owns save, rename, delete, Set-default, and the phone-frame staff preview. |
| `src/app/dashboard/clients/page.tsx` | Older standalone client list at `/dashboard/clients` (still routable, links to `/dashboard/clients/[id]`). Contains dead legacy code for `checklist_templates` / `custom_checklist_items`. |
| `src/app/dashboard/clients/[id]/page.tsx` | Thin wrapper (24 lines) that mounts `ClientProfileView` with `showBackButton` for the standalone client-profile route |
| `src/components/ClientProfileView.tsx` | Client profile card: inline per-column editing, color picker, Access & Notes, `MediaSection` uploads, delete-with-confirm. Used by both pages above. |
| `src/components/ClientInfoPanel.tsx` | Staff-facing read-only bottom sheet (call/email links, notes, media grid). Lazy-loaded from the clients page. |
| `src/components/ClientCard.tsx` | Job card on the schedule (Week view). Checklist picker/quick-create per job, swap-client, background geocoding. |
| `src/components/AddClientButton.tsx` | "Add from Client Database" on a team day. Auto-assigns the client's default checklist and background-geocodes missing coordinates. |
| `src/components/ClientChecklistPanel.tsx` | Checklist editor opened from the schedule (job context): Google-Docs-style 1s-debounced autosave. |
| `src/components/checklist/types.ts` | Canonical types + **the conditional logic engine** (`evalLogicCondition`, `buildVisibilityMap`) + legacy migration (`migrateOldSection`). |
| `src/components/checklist/ChecklistBuilder.tsx` | The block editor: slash menu, ghost input, dnd-kit reorder, settings popover, `LogicBlockEditor`, validation, preview modal. |
| `src/components/checklist/ChecklistFieldInput.tsx` | Renders one field's input in fill-in mode; handles photo/video upload. |
| `src/components/checklist/ChecklistRunner.tsx` | Fill-in shell: progress bar, required validation, section rendering, submit. Its ONLY production mount is the builder's preview modal (`completionId=null`, so no writes ever run) — the Completed panel renders its own `ChecklistPanel`, and real completion media goes through `StaffChecklistView` into `checklist-media`, never through this component's `client-media` path. |
| `src/lib/hooks/useClients.ts` | `SavedClient` CRUD against `clients` (browser client, RLS). |
| `src/lib/hooks/useClientChecklists.ts` | CRUD for one client's `client_checklists`, default handling, `createDefaultChecklist`. |
| `src/lib/hooks/useChecklistMasters.ts` | Org-wide `checklist_masters` templates + bulk `assignToClients`. |

## How it works

### The client model

`clients` row (as read by `useClients.SavedClient` plus columns fetched ad hoc):

- Identity/routing: `name`, `address`, `lat`, `lng`, `place_id`, `color`, `rate`, `default_duration_minutes`, `default_staff_count`.
- Contact: `email` (also the checklist-report recipient), `phone`.
- `notes` — the **Access & Notes** field ("alarm code, key location…"). Explicitly staff-visible: surfaced in `ClientInfoPanel`, and as an amber accordion in `ClientChecklistPanel`.
- Report overrides: `report_use_override boolean` + `report_override_email text`. When the flag is on and an override email exists, `/api/checklist/send-report` sends there instead of `clients.email`. These are **edited only from the Completed page** (`dashboard/completed/page.tsx` writes them via the browser client, ~line 1232) — there is no UI for them on the client profile.
- Legacy (dead): `checklist_template_id`, `custom_checklist_items` — pre-date `client_checklists`; only the old `/dashboard/clients` page still references them.

**Geocoding.** Addresses are picked via `PlacesAutocomplete` (Google Places, `componentRestrictions: { country: 'au' }` hard-coded). New-client creation on the checklists page requires name + address + rate before `addClient` fires (`draftReady`); lat/lng/place_id come from the selected place, and typing free text after a selection nulls them out (`onTextChange` resets coords). When a saved client with missing/zero coords is dropped onto the schedule, `AddClientButton.geocodeAddress` / `ClientCard.resolveAddress` re-resolve the address in the background (AutocompleteService best prediction → PlacesService details) and dispatch `UPDATE_CLIENT` with the fixed `Location`. On the schedule, a saved client's address is read-only ("locked to what's in the database"); only manual/unsaved job cards get an editable address.

**Client media.** `ClientProfileView.MediaSection` uploads to the **`client-media`** storage bucket at `${orgId}/${clientId}/${Date.now()}-${sanitizedName}` and inserts a `client_media` row (`file_name`, `file_path`, `file_type: 'image'|'video'`, `file_size`). Display uses `getPublicUrl(file_path)` — the bucket is public. Delete removes the storage object then the row.

**Inline editing.** `ClientProfileView.updateField(field, value)` writes a single column per blur/Enter (`supabase.from('clients').update({ [field]: value })`) and patches local state — there is no form-level save. Duration round-trips through `h:mm` strings (`minutesToHM`/`hmToMinutes`). `hideRates` hides the rate pill and row for staff.

### `client_checklists` and the default flow

Row shape: `id, org_id, client_id, name, is_default, sections jsonb, source_template_id, created_at, updated_at`. `sections` is a JSON array of `ChecklistSection { id, title, description?, fields: ChecklistField[] }`.

**One default per client is enforced by application code, not the DB.** Every writer clears first, then sets:

- Checklists page `handleSave` / `handleSetDefault`: `update({ is_default: false }).eq('client_id', …)` (setDefault adds `.neq('id', cl.id)`) before setting the flag on the target row, then syncs local state and the open editor's `builderIsDefault`.
- `useClientChecklists.addChecklist` / `updateChecklist` do the same clear-then-set dance.
- `useChecklistMasters.assignToClients` creates the assigned copy as default only for clients that have no default yet.

The comment in `handleSave` states why this matters: **`StaffChecklistView` fetches the default with `.eq('is_default', true).maybeSingle()`** — two defaults makes `maybeSingle()` error and the staff form silently loads nothing. The scheduler (`AddClientButton`) also relies on the same `maybeSingle()` query to auto-assign `checklistId` to a job the moment a saved client is added.

`ClientCard` offers a per-job checklist picker: first click lazily fetches the client's checklists; exactly one → auto-assign; several → dropdown; none → dropdown with quick-create. Quick-create inserts (`is_default` when it's the client's first) and then **re-fetches the row by (org_id, client_id, name, newest)** instead of `insert().select()` — a deliberate two-step; keep it if you touch this (see gotchas).

### Legacy migration — `migrateOldSection`

The original checklist shape was `{ id, title, items: [{ id, text, required }] }`. `migrateOldSection` normalises `items|fields` and `migrateOldItem` converts type-less items to `{ type: 'checkbox', label: item.text }`. Migration is idempotent (`if (item.type) return item`) and is applied at **every read edge**: checklists page `selectChecklist`, `ClientChecklistPanel`, `StaffChecklistView` (both job and default paths), Completed page (4 call sites), templates page, and the `send-report` / `admin-edit` API routes. `ClientChecklist.sections` is deliberately typed `any[]` in `lib/types.ts` to force callers through the migration. Autosave then persists the migrated shape, so old rows heal on first edit.

### The conditional logic engine (`checklist/types.ts`)

A `logic` field is a *rule block*, not an input: `logicConditions: LogicCondition[]`, `logicOperator: 'and'|'or'`, `logicAction: 'show'|'hide'`, `logicTargets: string[]` (field ids). It renders as the violet `LogicBlockEditor` in the builder and is invisible to staff.

`evalLogicCondition(cond, responses)` semantics — these are load-bearing:

- A response with `na: true` counts as **unanswered** (`raw = null`).
- `is_answered`: `false` (an unticked checkbox), `''`, and `[]` are **not** answers — this must agree with progress counting and required-field validation in `ChecklistRunner`/`StaffChecklistView`, which use the same emptiness rules.
- `equals`/`not_equals`: array answers match when **any** selected option equals the value (comparing only the first pick made rules depend on tap order); booleans map to `'yes'`/`'no'`.
- `contains`: exact `includes` on arrays, case-insensitive substring on strings.

`buildVisibilityMap(allFields, responses)` returns `fieldId → visible` for every non-logic field:

1. Per logic block, drop conditions that fail `isCompleteLogicCondition` (no watched field, or a comparison operator with no value) **and** conditions watching a deleted field. A block only counts with ≥1 surviving condition and ≥1 target. A half-built rule is a no-op, never a lock.
2. `actionOf(lb) = lb.logicAction ?? 'show'`. **This `?? 'show'` default is deliberate data repair**: the builder's Show/Hide toggle renders "Show" pre-selected from a display default, so historically saved blocks carry `logicAction: undefined`; a strict `=== 'show'` comparison silently turned every such rule into a no-op. `addBlock`/`selectSlashType` now stamp `logicAction: 'show', logicOperator: 'and', …` at creation, but the `??` must stay for pre-existing rows.
3. Targets of any `show` block are hidden by default; then blocks are applied in document order — `show`+met sets visible, `hide`+met sets hidden, so a later block wins over an earlier one for a shared target.
4. Legacy per-field `conditionalOn`/`conditionalValue` (a yesno parent — still writable from the settings popover) is honoured only when the field is **not** targeted by any logic block.

The engine lives in `types.ts` precisely so three surfaces agree: the builder preview (`ChecklistRunner`), the staff phone form (`StaffChecklistView`), and the admin Completed panel. Do not fork it.

### Field types and answer shapes

`FieldResponse = { field_id, value, na, media_urls? }`. Value shapes by `FieldType`:

| Type | Value | Notes |
|---|---|---|
| `heading`, `paragraph`, `logic` | — | Decorative; no response; excluded from progress/validation (`visibleFields` filter). |
| `checkbox` | `boolean` | `false` counts as *unanswered* everywhere. |
| `text` | `string` | textarea; `''` coerced to `null`. |
| `yesno` | `'yes' \| 'no'` | Tapping the active option clears to `null`. |
| `dropdown` | `string` | |
| `multiselect` | `string[]` | Expanded checkbox list; empty array coerced to `null`. |
| `multidropdown` | `string[]` | Collapsed picker with chips (`MultiDropdownInput`). |
| `date` / `time` | `'YYYY-MM-DD'` / `'HH:MM'` | Pre-filled with today/now by both the staff form and the builder previews (`buildPreviewResponses`) — the prefill also drives logic identically in both. |
| `photo` / `video` | — (uses `media_urls: string[]`) | Uploads to `client-media` at `${orgId}/completions/${completionId}/${field.id}/…`, stores the public URL in `media_urls`, and inserts a `checklist_completion_media` row (`item_id` = field id). **Silently no-ops when `completionId` is null** — which is exactly the preview case. |

Any field may set `required` and `allowNA` (settings popover). N/A satisfies a required field.

### Builder UX (`ChecklistBuilder`)

- **Flat editing of `sections[0]` only.** `setFields` is a functional updater that rebuilds `[{ ...first, fields }, ...prev.slice(1)]` — it must preserve the first section's title/description and any extra sections (rebuilding as `[{title:''}]` used to wipe them on every keystroke). The runner still renders all sections; the builder just can't edit past index 0.
- **Slash menu**: typing `/` as the *first character on a blank line* (block input or the always-present ghost input at the bottom) opens `SlashMenu` filtered over `BLOCK_TYPES`; it deliberately does not trigger mid-text ("End of lease / sale clean"). The `+` button and the type icon also open it (type icon converts the block, clearing `options`/legacy conditionals). Field ids come from `uid()` (8-char Math.random base36); section ids are `crypto.randomUUID()`.
- **Keyboard model**: Enter inserts a same-type block below (heading → paragraph), Backspace on empty deletes and focuses the previous, arrows navigate, ghost-Enter appends a paragraph. Option rows for choice fields have their own Enter/Tab/Backspace list editing via `data-opt-field` DOM queries.
- **Drag**: dnd-kit vertical sort with a glowing drop line; `PointerSensor` distance 6 so clicks still land.
- **`removeField` cleans references**: it strips the deleted id from every block's `logicConditions`/`logicTargets` and clears legacy `conditionalOn` — dangling references used to lock "show" targets hidden forever. Any new delete path must reuse it.
- **`LogicBlockEditor`**: IF rows (field → operator → value). `getOperatorsFor` narrows operators by source type (yesno: `is`; text: answered/empty/contains; multiselect/dropdown: is/is-not/includes; everything else: answered/empty). Picking a field **resets the operator to the first one that type offers and clears the value** — committing a stale operator made the rule display one thing and store another. `getValueOptions` yields yes/no buttons or option chips, else a free-text input (contains). AND/OR is a single toggle for the whole block. Targets are chips over all non-logic, non-heading fields.
- **Incomplete-rule warning**: an amber banner explains exactly what's missing ("pick a question…", "choose a value…", "choose at least one block under Then") because the engine silently ignores incomplete rules, which admins read as "logic isn't working". Fields governed by a *complete* rule get a floating violet "Shown by rule / Hidden by rule" badge in the list.
- **Validation**: interactive fields without a label get a red ring + "Title required" badge, and Save is disabled with a counter banner (`unlabeledFields`).
- **In-builder Preview** (template mode top bar or `triggerPreview` prop): `ChecklistRunner` in a modal with date/time pre-filled, `orgId="preview"`, `completionId=null`.

### Preview-as-staff phone frame (checklists page)

"Preview as staff" renders the **real** `StaffChecklistView` inside a 390×790 rounded phone frame, fed `previewSections={builderSections}` — i.e. current *unsaved* edits. In preview mode the staff view never touches the DB (`if (previewSections) { …; return; }` in `loadChecklist`). The frame's inner div uses `[transform:translateZ(0)]` so it becomes the containing block and the staff view's `fixed inset-0` fills the frame instead of the screen — remove that transform and the preview goes fullscreen.

### The three save flows

1. **Checklists page** (explicit): edits live in `builderSections` state; `handleBuilderChange` flips `builderDirty` so switching checklists asks before discarding. Save inserts (`selectedChecklistId === 'new'`) or updates with a fresh `updated_at`, clearing other defaults first when `isDefault`. "Save as Template" snapshots the **live** builder state into `checklist_masters` (snapshotting the last-saved copy silently dropped on-screen edits). Rename is a double-click inline input in the sidebar.
2. **`ClientChecklistPanel`** (schedule context, autosave): any section/name change debounces 1s then `updateChecklist`. Note its `onSave={(name) => setEditorName(name)}` — the builder's Save button here only renames; the autosave effect does the actual persist. "Save as New" creates a non-default sibling and switches to it.
3. **`ClientCard` quick-create** (schedule): bare-bones insert with `sections: []` so a checklist can be attached to a job immediately and fleshed out later.

## Database touchpoints

All writes in this subsystem go through the **browser Supabase client under RLS** (org-scoped policies keyed on `org_id`). No service-role writes happen here; the service-role routes (`/api/checklist/send-report`, `/api/checklist/admin-edit`) only *read* these tables and belong to the Completed/reporting subsystem.

| Table / bucket | Reads | Writes (browser RLS) |
|---|---|---|
| `clients` | `useClients` (`select *` by org), `ClientProfileView`, `ClientInfoPanel` (notes/address/email/phone), `ClientChecklistPanel` (notes), `StaffChecklistView` (email); `send-report` route reads `report_use_override`/`report_override_email` (service role) | insert `addClient`; per-column update `ClientProfileView.updateField` / `updateClient`; delete `deleteClient`; report override columns updated from the Completed page |
| `client_checklists` | checklists page (all by org), `useClientChecklists` (by client), `ClientCard`, `AddClientButton` + `StaffChecklistView` (default via `maybeSingle`) | insert/update/delete from checklists page, `useClientChecklists`, `ClientCard` quick-create, `assignToClients` (sets `source_template_id`) |
| `checklist_masters` | `useChecklistMasters` (by org) | insert (`addMaster`, incl. "Save as Template"), update, delete |
| `client_media` | `ClientProfileView.MediaSection`, `ClientInfoPanel` | insert/delete from `MediaSection` |
| `checklist_completion_media` | — (read by Completed/report) | insert from `ChecklistFieldInput.handleFileUpload` |
| Storage `client-media` (public) | `getPublicUrl` everywhere | uploads: profile media `${orgId}/${clientId}/…`; checklist answers `${orgId}/completions/${completionId}/${fieldId}/…`; `MediaSection` also removes objects on delete |

## Invariants & gotchas

- **`logicAction ?? 'show'` in `buildVisibilityMap` is data repair, not sloppiness.** Old rows have `logicAction: undefined`. Tightening it to a strict comparison resurrects the bug where every legacy rule becomes a no-op.
- **Never allow two `is_default` rows per client.** No DB constraint enforces it; every write path must clear-then-set. Duplicates break `maybeSingle()` in `StaffChecklistView` and `AddClientButton` — staff simply get no checklist.
- **Field ids are foreign keys inside the JSON.** Logic conditions/targets, legacy `conditionalOn`, completion `field_id`s and `checklist_completion_media.item_id` all reference them. Never regenerate ids on save, and route all deletions through `removeField` so references are cleaned.
- **`false`/`''`/`[]` mean "unanswered" in four places that must agree**: `evalLogicCondition` (`is_answered`/`is_empty`), progress counting, required validation (`ChecklistRunner.handleSubmit`), and the staff view's equivalents. Change one and conditional forms desync from validation.
- **The builder edits only `sections[0]`** and `setFields` must keep `...prev.slice(1)` — dropping it silently deletes extra sections in old data on the next keystroke.
- Run `migrateOldSection` over `sections` at every new read site; the `any[]` typing on `ClientChecklist.sections` is the reminder.
- **Photo/video upload silently no-ops when `completionId` is null.** That's intentional for previews, but means a future "fill in without a completion row" flow will lose uploads without an error.
- **Bug: `ClientInfoPanel` renders `client_media.file_path` directly as `<img src>`/`<video src>`** with no `getPublicUrl`, while `ClientProfileView` stores a *storage path* there. Unless rows contain full URLs from an older code path, staff see broken media in the info sheet.
- `clients.checklist_template_id` / `custom_checklist_items` / the `checklist_templates` table are the **old** system; only `/dashboard/clients` still touches them. New work goes through `client_checklists` + `checklist_masters`. Don't "clean up" the columns without migrating the old page.
- The nav tab labelled **Clients** routes to `/dashboard/checklists`; `/dashboard/clients` is a second, older client list that still works. Two UIs edit the same table.
- `getOperatorsFor` has no `multidropdown` case, so a multi-select-dropdown *source* field only offers is-answered/is-empty in the builder even though the engine and `getValueOptions` support equals/includes on it.
- In `ClientChecklistPanel`, closing within ~1s of the last keystroke can drop that keystroke: the debounce timer is cleared on unmount without flushing.
- Deleting a client deletes only the `clients` row from the app; checklists/media rows are assumed to FK-cascade, and **storage objects for client media are never removed** on client delete (only individual media delete removes objects).
- Staff (`profile.role === 'staff'`) are redirected off the checklists page to `/dashboard/staff-view`; `ClientProfileView` additionally accepts `hideRates`.
- Geocoding is hard-coded to `country: 'au'`.
- `ChecklistBuilder` remounts per checklist via `key={selectedChecklistId}` (and `key={activeChecklist.id}` in the panel); the name syncs from `initialName` in an effect. Removing the key makes stale local state bleed across checklists.

## Extension points

- **New field type**: extend the `FieldType` union + `FIELD_TYPE_LABELS`/`ICONS`, add a `BLOCK_TYPES` entry and `BlockIcon`, a placeholder branch in `SortableBlock`, a `renderInput` case in `ChecklistFieldInput`, and — critically — teach the emptiness rules (progress, validation, `is_answered`) and the report renderer in `send-report`/Completed what its value shape means. A `number` field with `greater_than`/`less_than` operators is the obvious next one.
- **New logic operator**: add to `LogicCondition['operator']`, implement in `evalLogicCondition`, expose per source type in `getOperatorsFor`/`getValueOptions`, and update `isCompleteLogicCondition` if the operator needs no value.
- **Multi-section builder**: the runner, migration and types already handle N sections; the builder needs section CRUD plus moving fields across sections (keep `setFields` per-section).
- **Report override UI on the client profile**: the columns exist and the send route honours them; add a card in `ClientProfileView` writing `report_use_override`/`report_override_email` via `updateField`.
- **Template sync**: `source_template_id` is already stamped by `assignToClients`; a "re-push template changes to derived checklists" action is a query on that column plus the existing overwrite branch.
- **Default-on-create**: `useClientChecklists.createDefaultChecklist` exists but nothing calls it from the new-client draft flow; wiring it into `handleCreateDraft` would give every new client a starter checklist.
