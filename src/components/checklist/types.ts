// ─── Field types ─────────────────────────────────────────────────────────────
export type FieldType =
  | 'heading'       // visual section title / divider
  | 'paragraph'     // plain body text for staff to read
  | 'logic'         // conditional logic rule block
  | 'checkbox'      // simple tick item
  | 'text'          // open text input
  | 'yesno'         // Yes / No toggle
  | 'dropdown'      // single-select from admin-defined options
  | 'multiselect'   // multi-select checkbox list (all options expanded)
  | 'multidropdown' // multi-select dropdown (collapsed picker with chips)
  | 'date'          // date picker
  | 'time'          // time picker
  | 'photo'         // image upload
  | 'video';        // video upload

// Condition for a logic block
export interface LogicCondition {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'is_answered' | 'is_empty' | 'contains';
  value?: string;
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  logic: 'Logic',
  heading: 'Heading',
  paragraph: 'Text',
  checkbox: 'Checkbox',
  text: 'Open Text',
  yesno: 'Yes / No',
  dropdown: 'Dropdown',
  multiselect: 'Checkbox List',
  multidropdown: 'Multi-select',
  date: 'Date',
  time: 'Time',
  photo: 'Photo / Image',
  video: 'Video',
};

export const FIELD_TYPE_ICONS: Record<FieldType, string> = {
  logic: '⚡',
  heading: 'H',
  paragraph: '📝',
  checkbox: '☑',
  text: '📝',
  yesno: '👍',
  dropdown: '🔽',
  multiselect: '☰',
  multidropdown: '🔲',
  date: '📅',
  time: '🕐',
  photo: '📷',
  video: '🎥',
};

// ─── Template structure (stored in client_checklists.sections) ────────────────
export interface ChecklistField {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  required?: boolean;
  allowNA?: boolean;
  options?: string[];         // for dropdown / multiselect
  conditionalOn?: string;     // LEGACY: field.id of a yesno field
  conditionalValue?: 'yes' | 'no'; // LEGACY: show this field when parent equals this

  // ── Logic block fields (type === 'logic') ─────────────────────────────────
  logicConditions?: LogicCondition[];
  logicOperator?: 'and' | 'or';   // how to combine multiple conditions
  logicAction?: 'show' | 'hide';  // what to do when conditions are met
  logicTargets?: string[];         // field IDs affected by this logic
}

export interface ChecklistSection {
  id: string;
  title: string;
  description?: string;
  fields: ChecklistField[];
}

// ─── Completion responses (stored in checklist_completions.items) ─────────────
export interface FieldResponse {
  field_id: string;
  value: string | string[] | boolean | null;
  na: boolean;
  media_urls?: string[]; // public URLs for photo/video fields
}

// ─── Pre-fill metadata (stored in checklist_completions.pre_fill) ─────────────
export interface PreFillMeta {
  date: string;
  time: string;
  staff_name: string;
  client_name: string;
  client_address: string;
}

// ─── Conditional-logic visibility ──────────────────────────────────────────────
// Shared by the admin builder preview (ChecklistRunner), the staff mobile form
// (StaffChecklistView) and the admin Completed panel so all three agree on
// which fields a logic block shows/hides.

export function evalLogicCondition(
  cond: LogicCondition,
  responses: { field_id: string; value: string | string[] | boolean | null; na: boolean }[]
): boolean {
  const resp = responses.find(r => r.field_id === cond.fieldId);
  // A field marked N/A counts as unanswered for logic purposes
  const raw = resp?.na ? null : (resp?.value ?? null);
  switch (cond.operator) {
    case 'is_answered':
      // false (an unticked checkbox) is NOT an answer — this must agree with
      // how progress counting and required-field validation treat it
      return raw !== null && raw !== '' && raw !== false && !(Array.isArray(raw) && raw.length === 0);
    case 'is_empty':
      return raw === null || raw === '' || raw === false || (Array.isArray(raw) && raw.length === 0);
    case 'equals':
    case 'not_equals': {
      // Multi-select answers match when ANY selected option equals the value —
      // comparing only the first pick made the rule depend on tap order
      let match: boolean;
      if (Array.isArray(raw)) {
        match = raw.includes(cond.value ?? '');
      } else {
        let s: string | null = null;
        if (typeof raw === 'string') s = raw;
        else if (typeof raw === 'boolean') s = raw ? 'yes' : 'no';
        match = s === cond.value;
      }
      return cond.operator === 'equals' ? match : !match;
    }
    case 'contains':
      if (Array.isArray(raw)) return raw.includes(cond.value ?? '');
      if (typeof raw === 'string') return raw.toLowerCase().includes((cond.value ?? '').toLowerCase());
      return false;
    default: return false;
  }
}

/** Build a map of fieldId → visible for all non-logic fields */
/** A condition only counts once it's fully configured — a half-built rule
 *  (no watched field, or a comparison with no value picked) must be ignored
 *  rather than silently locking fields hidden or visible. */
export function isCompleteLogicCondition(c: LogicCondition): boolean {
  if (!c.fieldId) return false;
  if (c.operator === 'is_answered' || c.operator === 'is_empty') return true;
  return (c.value ?? '') !== '';
}

export function buildVisibilityMap(
  allFields: ChecklistField[],
  responses: { field_id: string; value: string | string[] | boolean | null; na: boolean }[]
): Record<string, boolean> {
  const fieldIds = new Set(allFields.map(f => f.id));
  const logicBlocks = allFields
    .map(f => f.type === 'logic'
      ? {
          ...f,
          // Half-built conditions and conditions watching a DELETED field are
          // ignored — otherwise a dangling reference can lock fields hidden
          logicConditions: (f.logicConditions ?? []).filter(
            c => isCompleteLogicCondition(c) && fieldIds.has(c.fieldId)
          ),
        }
      : f)
    .filter(
      f => f.type === 'logic' && (f.logicConditions?.length ?? 0) > 0 && (f.logicTargets?.length ?? 0) > 0
    );

  // Fields targeted by a 'show' action are hidden by default.
  // logicAction MUST default to 'show' here: the builder's Show/Hide toggle
  // renders "Show" pre-selected without writing the field, so most saved
  // blocks carry logicAction: undefined — a strict === 'show' comparison
  // silently turned every such rule into a no-op.
  const actionOf = (lb: ChecklistField) => lb.logicAction ?? 'show';
  const hiddenByDefault = new Set<string>();
  for (const lb of logicBlocks) {
    if (actionOf(lb) === 'show') lb.logicTargets!.forEach(id => hiddenByDefault.add(id));
  }

  const map: Record<string, boolean> = {};

  for (const field of allFields) {
    if (field.type === 'logic') continue;

    // ── Legacy conditionalOn (keep working) ─────────────────────────────
    if (field.conditionalOn && !hiddenByDefault.has(field.id) && logicBlocks.every(lb => !lb.logicTargets?.includes(field.id))) {
      const parentResp = responses.find(r => r.field_id === field.conditionalOn);
      if (!parentResp) { map[field.id] = false; continue; }
      map[field.id] = parentResp.value === field.conditionalValue;
      continue;
    }

    // ── New logic system ─────────────────────────────────────────────────
    let visible = !hiddenByDefault.has(field.id);

    for (const lb of logicBlocks) {
      if (!lb.logicTargets?.includes(field.id)) continue;
      const conds = lb.logicConditions ?? [];
      const op = lb.logicOperator ?? 'and';
      const met = op === 'and'
        ? conds.every(c => evalLogicCondition(c, responses))
        : conds.some(c => evalLogicCondition(c, responses));

      if (actionOf(lb) === 'show' && met) visible = true;
      if (actionOf(lb) === 'hide' && met) visible = false;
    }

    map[field.id] = visible;
  }

  return map;
}

// ─── Backward-compat: convert old ChecklistItem shape → ChecklistField ────────
export function migrateOldItem(item: Record<string, unknown>): ChecklistField {
  if (item.type) return item as unknown as ChecklistField;
  return {
    id: item.id as string,
    type: 'checkbox',
    label: (item.text as string) || '',
    required: (item.required as boolean) || false,
  };
}

export function migrateOldSection(sec: Record<string, unknown>): ChecklistSection {
  const rawItems = (sec.items || sec.fields || []) as Record<string, unknown>[];
  return {
    id: sec.id as string,
    title: sec.title as string,
    description: sec.description as string | undefined,
    fields: rawItems.map(migrateOldItem),
  };
}
