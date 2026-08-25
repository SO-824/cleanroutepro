'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { getTodayISO, getWeekDates, getWeekLabel, getShortDayLabel } from '@/lib/timeUtils';
import { ChecklistSection, migrateOldSection, buildVisibilityMap } from '@/components/checklist/types';
import { COLLAB_COLORS } from '@/components/StaffChecklistView';
import HelpTip from '@/components/HelpTip';

const STAFF_COLORS = COLLAB_COLORS.map((c: { bg: string; text: string }) => c.bg);
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Types ────────────────────────────────────────────────────────────────────
interface AssignedStaff {
  id: string;        // staff_members.id
  name: string;
  userId: string | null; // staff_members.user_id → auth user
  color: string;
}

interface FieldAnswer {
  fieldId: string;
  value: string | string[] | boolean | null;
  na?: boolean;
  completed_by?: string; // auth user id
}

interface Completion {
  id: string;
  schedule_job_id: string;
  items: FieldAnswer[];
  notes: string | null;
  completed_by: string;
  completed_at: string;
  is_submitted: boolean;
  submitted_at: string | null;
  report_status: string;
  report_sent_at: string | null;
  report_sent_to: string | null;
  admin_edited_at: string | null;
  admin_edited_by: string | null;
  original_notes: string | null;
}

interface JobWithCompletion {
  id: string;
  name: string;
  address: string;
  client_id: string | null;
  checklist_id: string | null;
  schedule_id: string;
  date: string;
  teamColor: string;
  teamName: string;
  assignedStaff: AssignedStaff[];
  completion: Completion | null;
  totalFields: number;
  answeredFields: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseItems(raw: unknown): FieldAnswer[] {
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as FieldAnswer[];
    if (Array.isArray(raw)) return raw as FieldAnswer[];
  } catch { /* */ }
  return [];
}

type CompletionRow = {
  id: string; schedule_job_id: string; items: unknown;
  notes: string | null; completed_by: string; completed_at: string;
  status?: string; submitted_at?: string | null;
  report_status?: string; report_sent_at?: string | null; report_sent_to?: string | null;
  admin_edited_at?: string | null; admin_edited_by?: string | null; original_notes?: string | null;
};

function parseCompletion(c: CompletionRow): Completion {
  return {
    id: c.id,
    schedule_job_id: c.schedule_job_id,
    items: parseItems(c.items),
    notes: c.notes,
    completed_by: c.completed_by,
    completed_at: c.completed_at,
    is_submitted: c.status === 'submitted' || !!c.submitted_at,
    submitted_at: c.submitted_at ?? null,
    report_status: c.report_status || 'pending',
    report_sent_at: c.report_sent_at ?? null,
    report_sent_to: c.report_sent_to ?? null,
    admin_edited_at: c.admin_edited_at ?? null,
    admin_edited_by: c.admin_edited_by ?? null,
    original_notes: c.original_notes ?? null,
  };
}

function countAnswered(items: FieldAnswer[]): number {
  return items.filter(a => {
    if (a.na) return true;
    const v = a.value;
    if (v === null || v === '' || v === false) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
}

// ─── Progress ring ────────────────────────────────────────────────────────────
function ProgressRing({ pct, submitted, size = 36 }: { pct: number; submitted: boolean; size?: number }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth="3" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={submitted ? '#10B981' : pct > 0 ? '#4F46E5' : '#E5E7EB'}
        strokeWidth="3"
        strokeDasharray={`${(pct / 100) * circ} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }} />
    </svg>
  );
}

// ─── Checklist panel (admin read-only, live) ──────────────────────────────────
function ChecklistPanel({
  job, sections, completion, userNameMap, onClose, loading, onReset, canSend, onSend,
  canEdit, viewerId, viewerName, onToggleField, onToggleOption, onToggleYesNo, onEditNotes,
}: {
  job: JobWithCompletion;
  sections: ChecklistSection[];
  completion: Completion | null;
  userNameMap: Map<string, string>;
  onClose: () => void;
  loading: boolean;
  onReset: () => Promise<void>;
  canSend: boolean;
  onSend: () => void;
  canEdit: boolean;
  viewerId?: string;
  viewerName?: string;
  onToggleField: (fieldId: string, next: boolean) => Promise<void>;
  onToggleOption: (fieldId: string, option: string, selected: boolean) => Promise<void>;
  onToggleYesNo: (fieldId: string, answer: 'yes' | 'no' | null) => Promise<void>;
  onEditNotes: (notes: string) => Promise<void>;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'video'>('image');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  // ── Admin corrections on a submitted checklist ──
  const adminEditable = canEdit && !!completion?.is_submitted;
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaveState, setNotesSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showOriginalNotes, setShowOriginalNotes] = useState(false);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleYesNo = async (fieldId: string, answer: 'yes' | 'no' | null) => {
    if (togglingIds.has(fieldId)) return;
    setTogglingIds(prev => new Set(prev).add(fieldId));
    try {
      await onToggleYesNo(fieldId, answer);
    } catch (e) {
      alert(e instanceof Error && e.message
        ? e.message
        : 'Could not save the correction — check your connection and try again.');
    } finally {
      setTogglingIds(prev => { const n = new Set(prev); n.delete(fieldId); return n; });
    }
  };

  const handleOptionToggle = async (fieldId: string, option: string, selected: boolean) => {
    const key = `${fieldId}:${option}`;
    if (togglingIds.has(key)) return;
    setTogglingIds(prev => new Set(prev).add(key));
    try {
      await onToggleOption(fieldId, option, selected);
    } catch (e) {
      alert(e instanceof Error && e.message
        ? e.message
        : 'Could not save the correction — check your connection and try again.');
    } finally {
      setTogglingIds(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const handleToggle = async (fieldId: string, next: boolean) => {
    if (togglingIds.has(fieldId)) return;
    setTogglingIds(prev => new Set(prev).add(fieldId));
    try {
      await onToggleField(fieldId, next);
    } catch (e) {
      alert(e instanceof Error && e.message
        ? e.message
        : 'Could not save the correction — check your connection and try again.');
    } finally {
      setTogglingIds(prev => { const n = new Set(prev); n.delete(fieldId); return n; });
    }
  };

  // Saves are chained so an in-flight autosave can never land AFTER a newer
  // one and resurrect older text server-side.
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const saveNotes = (v: string) => {
    setNotesSaveState('saving');
    const p = saveChainRef.current.then(() => onEditNotes(v));
    saveChainRef.current = p.then(() => setNotesSaveState('saved'), () => setNotesSaveState('error'));
    return p;
  };
  const startEditNotes = () => {
    setNotesDraft(completion?.notes || '');
    setEditingNotes(true);
    setNotesSaveState('idle');
  };
  const onNotesDraftChange = (v: string) => {
    setNotesDraft(v);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => { saveNotes(v).catch(() => {}); }, 800);
  };
  const finishEditNotes = async () => {
    // Flush the debounce so Done never loses the last keystrokes
    if (notesTimerRef.current) { clearTimeout(notesTimerRef.current); notesTimerRef.current = null; }
    try {
      await saveNotes(notesDraft);
      setEditingNotes(false);
    } catch (e) {
      // The edit is NOT saved — keep the editor open rather than silently
      // discarding what the admin typed
      alert(e instanceof Error && e.message
        ? `Could not save the notes — they have not been saved. ${e.message}`
        : 'Could not save the notes — they have not been saved. Check your connection and press Done again.');
    }
  };
  // A pending debounce must not fire against a different job after unmount
  useEffect(() => () => {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
  }, []);
  const editorName = completion?.admin_edited_by
    ? (completion.admin_edited_by === viewerId
        ? (viewerName || 'admin')
        : (userNameMap.get(completion.admin_edited_by) || 'admin'))
    : 'admin';

  // Build userId → {color, name} from assignedStaff first (consistent colors)
  const staffByUserId = useMemo(() => {
    const m = new Map<string, AssignedStaff>();
    job.assignedStaff.forEach(s => { if (s.userId) m.set(s.userId, s); });
    return m;
  }, [job.assignedStaff]);

  // Fallback colors for unknown users
  const unknownColorMap = useMemo(() => new Map<string, string>(), []);
  let nextUnknownIdx = job.assignedStaff.length;

  const getColor = (uid?: string) => {
    if (!uid) return '#94A3B8';
    const staff = staffByUserId.get(uid);
    if (staff) return staff.color;
    if (!unknownColorMap.has(uid)) { unknownColorMap.set(uid, STAFF_COLORS[nextUnknownIdx++ % STAFF_COLORS.length]); }
    return unknownColorMap.get(uid) || '#94A3B8';
  };

  const getName = (uid?: string) => {
    if (!uid) return 'Staff';
    const staff = staffByUserId.get(uid);
    if (staff) return staff.name;
    return userNameMap.get(uid) || 'Staff';
  };

  const answers = useMemo(() => {
    const m = new Map<string, FieldAnswer>();
    (completion?.items || []).forEach(a => m.set(a.fieldId, a));
    return m;
  }, [completion]);

  // Conditional logic: hide the same fields the staff form hid, so they don't
  // show as "Not answered" and don't count toward the progress ring
  const visibilityMap = useMemo(() => {
    const responses = (completion?.items || []).map(a => ({
      field_id: a.fieldId, value: a.value, na: !!a.na,
    }));
    return buildVisibilityMap(sections.flatMap(s => s.fields), responses);
  }, [sections, completion]);

  const allFields = useMemo(() =>
    sections.flatMap(s => s.fields.filter(f =>
      f.type !== 'heading' && f.type !== 'paragraph' && f.type !== 'logic' && visibilityMap[f.id] !== false
    )),
  [sections, visibilityMap]);

  // Count only answers whose fields are visible under the logic rules —
  // hidden answers linger in items (e.g. after an admin untick) and would
  // push the count past the visible denominator.
  const answeredCount = useMemo(() => {
    const visibleIds = new Set(allFields.map(f => f.id));
    return countAnswered((completion?.items || []).filter(a => visibleIds.has(a.fieldId)));
  }, [completion, allFields]);
  const pct = allFields.length > 0 ? Math.round((answeredCount / allFields.length) * 100) : 0;
  const isSubmitted = completion?.is_submitted ?? false;

  // Unique contributors (users who answered at least one field)
  const contributors = useMemo(() => {
    const seen = new Set<string>();
    (completion?.items || []).forEach(a => { if (a.completed_by) seen.add(a.completed_by); });
    return [...seen].map(uid => ({ uid, color: getColor(uid), name: getName(uid) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completion, staffByUserId, userNameMap]);

  const openPreview = (url: string, type: 'image' | 'video') => {
    setPreviewUrl(url);
    setPreviewType(type);
  };

  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-y-0 right-0 w-full max-w-md bg-[#f5f6fa] shadow-2xl z-50 flex flex-col border-l border-border-light"
      style={{ touchAction: 'pan-y' }}
    >
      {/* Header */}
      <div className="shrink-0 px-5 py-4 bg-white border-b border-border-light">
        <div className="flex items-start gap-3">
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-surface-elevated text-text-secondary transition-colors shrink-0 mt-0.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-text-primary truncate">{job.name}</h3>
            <p className="text-xs text-text-tertiary truncate mt-0.5">{job.address}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ProgressRing pct={pct} submitted={isSubmitted} />
            <div className="text-right">
              <p className={`text-xs font-bold ${isSubmitted ? 'text-emerald-600' : pct > 0 ? 'text-primary' : 'text-text-tertiary'}`}>
                {isSubmitted ? 'Submitted' : pct > 0 ? 'In Progress' : 'Not Started'}
              </p>
              {allFields.length > 0 && (
                <p className="text-[10px] text-text-tertiary">{answeredCount}/{allFields.length} fields</p>
              )}
            </div>
          </div>
        </div>

        {/* Assigned team */}
        {job.assignedStaff.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5">Assigned Team</p>
            <div className="flex flex-wrap gap-1.5">
              {job.assignedStaff.map(staff => (
                <span key={staff.id}
                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-white"
                  style={{ backgroundColor: staff.color }}>
                  {staff.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Who filled it in — with colour legend */}
        {contributors.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5">Filled in by</p>
            <div className="flex flex-wrap gap-1.5">
              {contributors.map(({ uid, color, name }) => (
                <span key={uid}
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full text-white"
                  style={{ backgroundColor: color }}>
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Live indicator */}
        {!isSubmitted && completion && (
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-600 font-semibold">Live — updating in real time</span>
          </div>
        )}

        {/* Reset progress */}
        {completion && (
          <button onClick={() => setShowResetConfirm(true)}
            className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-text-tertiary hover:text-rose-600 px-2 py-1 -mx-2 rounded-lg hover:bg-rose-50 transition-colors">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>
            </svg>
            Reset progress
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="shimmer h-14 rounded-2xl" />)}
          </div>
        ) : sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
            <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-2xl border border-border-light">📋</div>
            <p className="text-sm font-semibold text-text-secondary">No checklist assigned</p>
            <p className="text-xs text-text-tertiary">Assign a checklist to this job in the scheduler</p>
          </div>
        ) : (
          sections.map(section => (
            <div key={section.id}>
              {section.title && (
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-border" />
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-text-secondary min-w-0 break-words text-center px-1">
                    {section.title}
                  </h4>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <div className="space-y-2">
                {section.fields.map(field => {
                  if (field.type === 'heading') return (
                    <p key={field.id} className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary pt-2">
                      {field.label}
                    </p>
                  );
                  if (field.type === 'paragraph' || field.type === 'logic') return null;
                  if (visibilityMap[field.id] === false) return null;

                  const ans = answers.get(field.id);
                  const answererColor = getColor(ans?.completed_by);
                  const answererName = getName(ans?.completed_by);
                  const isAnswered = !!ans && (
                    ans.na === true ||
                    (ans.value !== null && ans.value !== undefined && ans.value !== '' &&
                     ans.value !== false && !(Array.isArray(ans.value) && ans.value.length === 0))
                  );

                  // Display value
                  let displayVal = '';
                  if (ans?.na) displayVal = 'N/A';
                  else if (ans?.value === true || ans?.value === 'yes') displayVal = 'Yes';
                  else if (ans?.value === false || ans?.value === 'no') displayVal = 'No';
                  else if (Array.isArray(ans?.value) && field.type !== 'photo' && field.type !== 'video')
                    displayVal = (ans.value as string[]).join(', ');
                  else if (ans?.value && field.type !== 'photo' && field.type !== 'video')
                    displayVal = String(ans.value);

                  // Status icon for checkbox/yesno. For admins on a submitted
                  // checklist the box itself is the tick/untick control.
                  const checkedNow = field.type === 'checkbox' && isAnswered && !ans?.na;
                  const tickColor = answererColor || '#4F46E5';
                  const statusIcon = field.type === 'checkbox' ? (
                    adminEditable ? (
                      <button
                        type="button"
                        onClick={() => handleToggle(field.id, !checkedNow)}
                        disabled={togglingIds.has(field.id)}
                        title={checkedNow ? 'Untick (admin correction)' : 'Tick (admin correction)'}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                          togglingIds.has(field.id) ? 'opacity-40' : 'cursor-pointer hover:ring-2 hover:ring-primary/40'
                        } ${checkedNow ? '' : 'border-2 border-gray-300 bg-white'}`}
                        style={checkedNow ? { backgroundColor: tickColor } : undefined}
                      >
                        {checkedNow && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                    ) : checkedNow ? (
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: answererColor }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-lg border-2 border-gray-200 shrink-0" />
                    )
                  ) : null;

                  // Yes/No: read-only pill normally; for admins on a submitted
                  // checklist, two tappable pills (tap current = clear, matching
                  // the staff form). Stored as 'yes'/'no' strings, same as staff.
                  const currentYN: 'yes' | 'no' | null =
                    ans?.value === true || ans?.value === 'yes' ? 'yes'
                    : ans?.value === false || ans?.value === 'no' ? 'no' : null;
                  const yesNoPill = field.type !== 'yesno' ? null
                    : adminEditable ? (
                      <span className="flex gap-1 shrink-0">
                        {(['yes', 'no'] as const).map(opt => (
                          <button key={opt} type="button"
                            onClick={() => handleYesNo(field.id, currentYN === opt ? null : opt)}
                            disabled={togglingIds.has(field.id)}
                            title={currentYN === opt ? 'Tap to clear (admin correction)' : `Set ${opt === 'yes' ? 'Yes' : 'No'} (admin correction)`}
                            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all active:scale-95 ${
                              togglingIds.has(field.id) ? 'opacity-40' : 'cursor-pointer'
                            } ${currentYN === opt
                              ? opt === 'yes' ? 'bg-emerald-500 text-white' : 'bg-red-400 text-white'
                              : 'bg-white border border-border-light text-text-tertiary hover:border-primary/40'}`}>
                            {opt === 'yes' ? '✓ Yes' : '✗ No'}
                          </button>
                        ))}
                      </span>
                    ) : isAnswered && !ans?.na ? (
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${
                        currentYN === 'yes'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {currentYN === 'yes' ? '✓ Yes' : '✗ No'}
                      </span>
                    ) : null;

                  // Photo/video URLs
                  const mediaUrls: string[] = (field.type === 'photo' || field.type === 'video')
                    ? (Array.isArray(ans?.value) ? (ans.value as string[]) : ans?.value ? [String(ans.value)] : [])
                    : [];

                  return (
                    <div key={field.id}
                      className={`rounded-2xl border bg-white transition-all overflow-hidden ${
                        isAnswered ? 'border-border-light' : 'border-border-light/50 opacity-60'
                      }`}
                      style={isAnswered && answererColor
                        ? { borderLeftColor: answererColor, borderLeftWidth: 3 }
                        : undefined}
                    >
                      <div className="px-3.5 py-3">
                        <div className="flex items-start gap-3">
                          {/* Checkbox icon */}
                          {statusIcon}

                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-semibold leading-snug ${
                              isAnswered ? 'text-text-primary' : 'text-text-tertiary'
                            }`}>{field.label}</p>

                            {/* Multi-select lists: tickable option rows for admins */}
                            {adminEditable && (field.type === 'multiselect' || field.type === 'multidropdown') && (field.options?.length || 0) > 0 ? (
                              <div className="mt-1.5 space-y-0.5">
                                {field.options!.map(opt => {
                                  const sel = Array.isArray(ans?.value) && (ans!.value as string[]).includes(opt);
                                  const busy = togglingIds.has(`${field.id}:${opt}`);
                                  return (
                                    <button key={opt} type="button"
                                      onClick={() => handleOptionToggle(field.id, opt, !sel)}
                                      disabled={busy}
                                      title={sel ? 'Untick (admin correction)' : 'Tick (admin correction)'}
                                      className={`w-full flex items-center gap-2 text-left px-1.5 py-1 -mx-1.5 rounded-lg transition-colors ${
                                        busy ? 'opacity-40' : 'hover:bg-surface-elevated cursor-pointer'
                                      }`}>
                                      <span className={`w-[18px] h-[18px] rounded-md flex items-center justify-center shrink-0 ${
                                        sel ? '' : 'border-2 border-gray-300 bg-white'
                                      }`}
                                        style={sel ? { backgroundColor: tickColor } : undefined}>
                                        {sel && (
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
                                            <polyline points="20 6 9 17 4 12"/>
                                          </svg>
                                        )}
                                      </span>
                                      <span className={`text-xs ${sel ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>{opt}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : field.type !== 'checkbox' && field.type !== 'yesno' && field.type !== 'photo' && field.type !== 'video' && (
                              displayVal ? (
                                <p className="text-xs text-text-secondary mt-1 font-medium">{displayVal}</p>
                              ) : (
                                <p className="text-[11px] text-text-tertiary mt-0.5 italic">Not answered</p>
                              )
                            )}

                            {/* N/A badge */}
                            {ans?.na && (
                              <span className="inline-block text-[10px] font-bold text-text-tertiary bg-surface-elevated px-2 py-0.5 rounded-lg mt-1 border border-border-light">N/A</span>
                            )}
                          </div>

                          {/* Yes/No pill */}
                          {yesNoPill}

                          {/* Staff indicator */}
                          {isAnswered && ans?.completed_by && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                                style={{ backgroundColor: answererColor }}
                                title={answererName}
                              >
                                {(answererName || '?')[0].toUpperCase()}
                              </div>
                              <span className="text-[10px] font-medium text-text-tertiary max-w-[60px] truncate hidden sm:block">
                                {answererName.split(' ')[0]}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* ── Photo/Video grid ── */}
                        {(field.type === 'photo' || field.type === 'video') && (
                          mediaUrls.length > 0 ? (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {mediaUrls.map((url, ui) =>
                                field.type === 'photo' ? (
                                  <button key={ui} onClick={() => openPreview(url, 'image')}
                                    className="block w-24 h-24 rounded-xl overflow-hidden border border-border-light bg-surface-elevated shrink-0 hover:opacity-80 transition-opacity hover:ring-2 hover:ring-primary/30 active:scale-95">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt={`Photo ${ui + 1}`} className="w-full h-full object-cover" />
                                  </button>
                                ) : (
                                  <button key={ui} onClick={() => openPreview(url, 'video')}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-light bg-surface-elevated text-xs font-semibold text-primary hover:bg-primary/5 transition-colors active:scale-95">
                                    <span className="text-lg">🎬</span>
                                    View video {ui + 1}
                                  </button>
                                )
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] text-text-tertiary mt-1 italic">No media uploaded</p>
                          )
                        )}
                      </div>
                    </div>
                  );

                })}
              </div>
            </div>
          ))
        )}

        {/* Notes — admins can correct them on a submitted checklist */}
        {completion && (completion.notes || adminEditable) && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700">Staff Notes</p>
              {completion.admin_edited_at && (
                <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 border border-amber-200 rounded-md px-1.5 py-0.5"
                  title={new Date(completion.admin_edited_at).toLocaleString('en-AU')}>
                  Edited by {editorName} · {new Date(completion.admin_edited_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                </span>
              )}
              <span className="flex-1" />
              {editingNotes && (
                <span className="text-[10px] font-semibold text-amber-700/80">
                  {notesSaveState === 'saving' ? 'Saving…'
                    : notesSaveState === 'saved' ? 'Saved ✓'
                    : notesSaveState === 'error' ? 'Save failed — edit again to retry' : ''}
                </span>
              )}
              {adminEditable && (
                editingNotes ? (
                  <button onClick={finishEditNotes}
                    className="text-[11px] font-bold text-amber-800 hover:underline">Done</button>
                ) : (
                  <button onClick={startEditNotes}
                    className="text-[11px] font-bold text-amber-800 hover:underline">Edit</button>
                )
              )}
            </div>
            {editingNotes ? (
              <textarea
                value={notesDraft}
                onChange={e => onNotesDraftChange(e.target.value)}
                rows={4}
                autoFocus
                placeholder="Notes for this clean…"
                className="w-full text-sm text-text-primary bg-white border border-amber-200 rounded-xl p-3 leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-300 resize-y"
              />
            ) : completion.notes ? (
              <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{completion.notes}</p>
            ) : (
              <p className="text-xs text-amber-700/70 italic">No staff notes.</p>
            )}
            {completion.original_notes !== null && completion.original_notes !== (completion.notes || '') && (
              <div className="mt-2">
                <button onClick={() => setShowOriginalNotes(v => !v)}
                  className="text-[10px] font-semibold text-amber-800/80 hover:underline">
                  {showOriginalNotes ? 'Hide original' : 'View original staff notes'}
                </button>
                {showOriginalNotes && (
                  <p className="mt-1 text-xs text-amber-900/70 whitespace-pre-wrap border-l-2 border-amber-300 pl-2">
                    {completion.original_notes || '(no notes were written)'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Submitted timestamp */}
        {isSubmitted && completion?.completed_at && (
          <div className="text-center py-3">
            <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span className="text-xs font-bold text-emerald-700">
                Submitted {new Date(completion.submitted_at || completion.completed_at).toLocaleString('en-AU', {
                  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        )}

        {/* No completion yet */}
        {!loading && !completion && sections.length > 0 && (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-2xl bg-white border border-border-light flex items-center justify-center text-2xl mx-auto mb-3">⏳</div>
            <p className="text-sm font-semibold text-text-secondary">No checklist submitted yet</p>
            {job.assignedStaff.length > 0 && (
              <p className="text-xs text-text-tertiary mt-1">
                Waiting on: {job.assignedStaff.map(s => s.name).join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Report send footer — the approve step of the review workflow ── */}
      {isSubmitted && completion && canSend && (
        <div className="shrink-0 px-5 py-3 bg-white border-t border-border-light flex items-center gap-3">
          {completion.report_status === 'sent' ? (
            <>
              <span className="flex-1 min-w-0 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 truncate">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                Sent{completion.report_sent_to ? ` to ${completion.report_sent_to}` : ''}
                {completion.report_sent_at ? ` · ${new Date(completion.report_sent_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
              <button onClick={onSend}
                className="shrink-0 text-[11px] font-semibold text-text-tertiary hover:text-primary px-2.5 py-1.5 rounded-lg border border-border-light transition-colors">
                Send again
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-[11px] font-semibold text-amber-700">Reviewed it? Send the report to the client.</span>
              <button onClick={onSend}
                className="shrink-0 flex items-center gap-1.5 text-xs font-bold bg-primary text-white px-3.5 py-2 rounded-xl hover:bg-primary-hover transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
                Send to client…
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Reset progress confirmation ── */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6"
            onClick={() => !resetting && setShowResetConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E11D48" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-text-primary">Reset checklist progress?</h3>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed mb-1.5">
                This permanently deletes every answer, photo and note staff have recorded
                for <span className="font-semibold text-text-primary">{job.name}</span>.
                The checklist goes back to blank for everyone.
              </p>
              <p className="text-xs font-semibold text-rose-600 mb-4">This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={resetting}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-border text-text-secondary hover:bg-surface-elevated transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setResetting(true);
                    try {
                      await onReset();
                      setShowResetConfirm(false);
                    } finally {
                      setResetting(false);
                    }
                  }}
                  disabled={resetting}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-60"
                >
                  {resetting ? 'Resetting…' : 'Yes, reset progress'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Media Preview Modal ── */}
      <AnimatePresence>
        {previewUrl && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4"
            onClick={() => setPreviewUrl(null)}
          >
            <button onClick={() => setPreviewUrl(null)}
              className="absolute top-4 right-4 p-2.5 rounded-xl bg-white/10 text-white hover:bg-white/20 z-10 active:scale-90 transition-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
            <div className="max-w-3xl max-h-[85vh] w-full" onClick={e => e.stopPropagation()}>
              {previewType === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Preview" className="w-full h-auto max-h-[85vh] object-contain rounded-xl" />
              ) : (
                <video src={previewUrl} controls autoPlay className="w-full max-h-[85vh] rounded-xl" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CompletedPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const orgId = profile?.org_id;

  // ── Published weeks navigation ──────────────────────────────────────────────
  // Only weeks that have at least one published schedule row are shown.
  // publishedWeekStarts is sorted newest → oldest (index 0 = most recent).
  const [publishedWeekStarts, setPublishedWeekStarts] = useState<string[]>([]);
  const [weekIndex, setWeekIndex] = useState(0); // 0 = most recent published week
  const [weeksLoading, setWeeksLoading] = useState(true);

  const [jobs, setJobs] = useState<JobWithCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobWithCompletion | null>(null);
  const [jobSections, setJobSections] = useState<ChecklistSection[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [liveCompletion, setLiveCompletion] = useState<Completion | null>(null);
  // Which job the panel is open for — read inside the org-wide realtime
  // handler (a closure that can't see selectedJob state)
  const selectedJobIdRef = useRef<string | null>(null);
  const [userNameMap, setUserNameMap] = useState<Map<string, string>>(new Map());
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pageChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const today = useMemo(() => getTodayISO(), []);

  // Derive weekDates from the currently selected published week start
  const currentWeekStart = publishedWeekStarts[weekIndex] ?? null;
  const weekDates = useMemo(
    () => currentWeekStart ? getWeekDates(currentWeekStart) : [],
    [currentWeekStart]
  );
  const weekLabel = useMemo(
    () => weekDates.length === 7 ? getWeekLabel(weekDates[0], weekDates[6]) : 'No published weeks',
    [weekDates]
  );

  // ── Load all published week starts ─────────────────────────────────────────
  const loadPublishedWeeks = useCallback(async () => {
    if (!orgId) return;
    setWeeksLoading(true);

    const { data: teamsRaw } = await supabase
      .from('teams').select('id').eq('org_id', orgId);
    if (!teamsRaw || teamsRaw.length === 0) { setWeeksLoading(false); return; }
    const teamIds = (teamsRaw as { id: string }[]).map(t => t.id);

    const { data: schedulesRaw } = await supabase
      .from('schedules')
      .select('schedule_date')
      .in('team_id', teamIds)
      .eq('is_published', true);

    if (!schedulesRaw || schedulesRaw.length === 0) {
      setPublishedWeekStarts([]);
      setWeeksLoading(false);
      setLoading(false);
      return;
    }

    // Convert each date → its Monday (week start), deduplicate, sort newest first
    const weekStartSet = new Set<string>();
    (schedulesRaw as { schedule_date: string }[]).forEach(r => {
      weekStartSet.add(getWeekDates(r.schedule_date)[0]);
    });
    const sorted = [...weekStartSet].sort((a, b) => b.localeCompare(a)); // newest first
    setPublishedWeekStarts(prevList => {
      // Keep the currently viewed week selected if it still exists —
      // Refresh used to snap the owner back to the newest week mid-review
      setWeekIndex(prevIdx => {
        const currentWeek = prevList[prevIdx];
        const keep = currentWeek ? sorted.indexOf(currentWeek) : -1;
        return keep >= 0 ? keep : 0;
      });
      return sorted;
    });
    setWeeksLoading(false);
  }, [orgId, supabase]);

  useEffect(() => { loadPublishedWeeks(); }, [loadPublishedWeeks]);

  // ── Load week ────────────────────────────────────────────────────────────────
  const loadWeek = useCallback(async () => {
    if (!orgId || weekDates.length === 0) return;
    setLoading(true);

    // 1. Teams
    const { data: teamsRaw } = await supabase
      .from('teams').select('id, name, color_index').eq('org_id', orgId);
    if (!teamsRaw) { setLoading(false); return; }
    type TeamRow = { id: string; name: string; color_index: number | null };
    const teams = teamsRaw as TeamRow[];
    const teamIds = teams.map(t => t.id);
    const teamColorMap = new Map<string, string>(teams.map(t => [t.id, STAFF_COLORS[(t.color_index || 0) % STAFF_COLORS.length]]));
    const teamNameMap = new Map<string, string>(teams.map(t => [t.id, t.name]));

    // 2. Schedules for the week — PUBLISHED ONLY
    const { data: schedulesRaw } = await supabase
      .from('schedules').select('id, team_id, schedule_date, staff_ids, driver_staff_id')
      .in('team_id', teamIds).in('schedule_date', weekDates)
      .eq('is_published', true);
    if (!schedulesRaw || schedulesRaw.length === 0) { setJobs([]); setLoading(false); return; }
    type ScheduleRow = { id: string; team_id: string; schedule_date: string; staff_ids: string[] | null; driver_staff_id: string | null };
    const schedules = schedulesRaw as ScheduleRow[];
    const scheduleIds = schedules.map(s => s.id);
    const scheduleTeamMap = new Map<string, string>(schedules.map(s => [s.id, s.team_id]));
    const scheduleDateMap = new Map<string, string>(schedules.map(s => [s.id, s.schedule_date]));

    // 3. Jobs (non-break, with client, including assigned staff)
    const { data: jobsRaw } = await supabase
      .from('published_jobs')
      .select('id, name, address, client_id, checklist_id, schedule_id, assigned_staff_ids')
      .in('schedule_id', scheduleIds)
      .eq('is_break', false)
      .not('client_id', 'is', null)
      .order('position');
    if (!jobsRaw || jobsRaw.length === 0) { setJobs([]); setLoading(false); return; }
    type RawJob = {
      id: string; name: string; address: string; client_id: string | null;
      checklist_id: string | null; schedule_id: string; assigned_staff_ids: string[] | null;
    };
    const rawJobs = jobsRaw as RawJob[];
    const jobIds = rawJobs.map(j => j.id);

    // 4. Fetch all assigned staff members. Jobs usually carry no per-job
    // assignment — the day-level roster (schedule.staff_ids + driver) is the
    // real crew, and without it "Waiting on" was empty everywhere.
    const scheduleRosterMap = new Map<string, string[]>(schedules.map(s => {
      const ids = new Set<string>(s.staff_ids || []);
      if (s.driver_staff_id) ids.add(s.driver_staff_id);
      return [s.id, [...ids]];
    }));
    const allStaffIds = new Set<string>();
    rawJobs.forEach(j => (j.assigned_staff_ids || []).forEach(id => allStaffIds.add(id)));
    scheduleRosterMap.forEach(ids => ids.forEach(id => allStaffIds.add(id)));
    type StaffRow = { id: string; name: string; user_id: string | null };
    let staffMap = new Map<string, StaffRow>();
    if (allStaffIds.size > 0) {
      const { data: staffData } = await supabase
        .from('staff_members').select('id, name, user_id').in('id', [...allStaffIds]);
      if (staffData) staffMap = new Map<string, StaffRow>((staffData as StaffRow[]).map(s => [s.id, s]));
    }

    // 5. Completions
    const { data: completionsRaw } = await supabase
      .from('checklist_completions')
      .select('id, schedule_job_id, items, notes, completed_by, completed_at, status, submitted_at, report_status, report_sent_at, report_sent_to, admin_edited_at, admin_edited_by, original_notes')
      .in('schedule_job_id', jobIds);
    const completionMap = new Map<string, Completion>();
    const allUserIds = new Set<string>();
    (completionsRaw as CompletionRow[] || []).forEach(c => {
      const comp = parseCompletion(c);
      completionMap.set(c.schedule_job_id, comp);
      comp.items.forEach(a => { if (a.completed_by) allUserIds.add(a.completed_by); });
      if (c.completed_by) allUserIds.add(c.completed_by);
      if (c.admin_edited_by) allUserIds.add(c.admin_edited_by);
    });

    // 5b. Client report prefs — recipient + per-client override for the dialog
    const clientIds = [...new Set(rawJobs.map(j => j.client_id).filter((id): id is string => !!id))];
    if (clientIds.length > 0) {
      const { data: clientRows } = await supabase
        .from('clients').select('id, email, report_use_override, report_override_email').in('id', clientIds);
      setClientReportMap(new Map(
        (clientRows as { id: string; email: string | null; report_use_override: boolean | null; report_override_email: string | null }[] || [])
          .map(c => [c.id, { email: c.email, useOverride: !!c.report_use_override, overrideEmail: c.report_override_email }])
      ));
    } else {
      setClientReportMap(new Map());
    }

    // 6. User display names
    if (allUserIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles').select('id, full_name').in('id', [...allUserIds]);
      const nameMap = new Map<string, string>();
      (profiles as { id: string; full_name: string | null }[] || []).forEach(p =>
        nameMap.set(p.id, p.full_name || 'Staff'));
      setUserNameMap(nameMap);
    }

    // 7. Assemble
    const assembled: JobWithCompletion[] = rawJobs.map(j => {
      const completion = completionMap.get(j.id) || null;
      const teamId = scheduleTeamMap.get(j.schedule_id) || '';

      const effectiveStaffIds = (j.assigned_staff_ids && j.assigned_staff_ids.length > 0)
        ? j.assigned_staff_ids
        : (scheduleRosterMap.get(j.schedule_id) || []);
      const assignedStaff: AssignedStaff[] = effectiveStaffIds.map((sid, si) => {
        const s = staffMap.get(sid);
        return {
          id: sid,
          name: s?.name || 'Staff',
          userId: s?.user_id || null,
          color: STAFF_COLORS[si % STAFF_COLORS.length],
        };
      });

      return {
        id: j.id,
        name: j.name,
        address: j.address,
        client_id: j.client_id,
        checklist_id: j.checklist_id,
        schedule_id: j.schedule_id,
        date: scheduleDateMap.get(j.schedule_id) || '',
        teamColor: teamColorMap.get(teamId) || '#4F46E5',
        teamName: teamNameMap.get(teamId) || '',
        assignedStaff,
        completion,
        totalFields: completion?.items.length || 0,
        answeredFields: countAnswered(completion?.items || []),
      };
    });

    setJobs(assembled);
    setLoading(false);
  }, [orgId, weekDates, supabase]);

  useEffect(() => { loadWeek(); }, [loadWeek]);


  // ── Page-level realtime: watch ALL completions for this org ─────────────────
  // So when staff submit a checklist the job card updates immediately
  useEffect(() => {
    if (!orgId) return;

    const ch = supabase
      .channel(`completed-org:${orgId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'checklist_completions',
        filter: `org_id=eq.${orgId}`,
      }, (payload: { new: Record<string, unknown> }) => {
        const row = payload.new;
        if (!row?.id) return;
        const jobId = row.schedule_job_id as string;
        if (!jobId) return;

        const comp = parseCompletion({
          id: row.id as string,
          schedule_job_id: jobId,
          items: row.items as unknown,
          notes: row.notes as string | null,
          completed_by: row.completed_by as string,
          completed_at: row.completed_at as string,
          status: row.status as string | undefined,
          submitted_at: row.submitted_at as string | null | undefined,
          report_status: row.report_status as string | undefined,
          report_sent_at: row.report_sent_at as string | null | undefined,
          report_sent_to: row.report_sent_to as string | null | undefined,
          admin_edited_at: row.admin_edited_at as string | null | undefined,
          admin_edited_by: row.admin_edited_by as string | null | undefined,
          original_notes: row.original_notes as string | null | undefined,
        });

        setJobs(prev => prev.map(j => {
          if (j.id !== jobId) return j;
          return {
            ...j,
            completion: comp,
            totalFields: Math.max(j.totalFields, comp.items.length),
            answeredFields: countAnswered(comp.items),
          };
        }));

        // Update live panel if it's open for this job
        setSelectedJob(prev => {
          if (!prev || prev.id !== jobId) return prev;
          return { ...prev, completion: comp };
        });
        // Only the currently open job may update the live panel — the old
        // prev===null wildcard let ANY org event hijack a "Not started" panel
        // (and admin corrections would then hit the wrong completion).
        setLiveCompletion(prev => {
          if (selectedJobIdRef.current !== jobId) return prev;
          if (prev === null || prev.schedule_job_id === jobId) return comp;
          return prev;
        });
      })
      .subscribe();

    pageChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [orgId, supabase]);

  // ── Open job panel: fetch fresh data + subscribe realtime ───────────────────
  // seq guard: rapid job switching must not let a slow older fetch overwrite
  // the newer job's panel data
  const selectSeqRef = useRef(0);
  const handleSelectJob = useCallback(async (job: JobWithCompletion) => {
    selectedJobIdRef.current = job.id;
    const seq = ++selectSeqRef.current;
    const fresh = () => seq === selectSeqRef.current;
    setSelectedJob(job);
    setPanelLoading(true);
    setJobSections([]);
    setLiveCompletion(null);

    // Always fetch fresh completion from DB (don't rely on stale cached data)
    const { data: freshComp } = await supabase
      .from('checklist_completions')
      .select('id, schedule_job_id, items, notes, completed_by, completed_at, status, submitted_at, report_status, report_sent_at, report_sent_to, admin_edited_at, admin_edited_by, original_notes')
      .eq('schedule_job_id', job.id)
      .maybeSingle();

    if (!fresh()) return;
    if (freshComp) {
      const parsed = parseCompletion(freshComp as CompletionRow);
      setLiveCompletion(parsed);
      setJobs(prev => prev.map(j => j.id === job.id
        ? { ...j, completion: parsed, answeredFields: countAnswered(parsed.items), totalFields: Math.max(j.totalFields, parsed.items.length) }
        : j));
    }

    // Load checklist template sections
    if (job.checklist_id) {
      const { data: cl } = await supabase
        .from('client_checklists').select('sections').eq('id', job.checklist_id).single();
      if (fresh() && cl) setJobSections(((cl.sections as Record<string, unknown>[]) || []).map(migrateOldSection));
    } else if (job.client_id) {
      const { data: cl } = await supabase
        .from('client_checklists').select('sections')
        .eq('client_id', job.client_id).eq('is_default', true).maybeSingle();
      if (fresh() && cl) setJobSections(((cl.sections as Record<string, unknown>[]) || []).map(migrateOldSection));
    }

    if (!fresh()) return;
    setPanelLoading(false);

    // Subscribe to realtime for this specific job (in addition to page-level)
    if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);
    const ch = supabase
      .channel(`admin-cl:${job.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'checklist_completions',
        filter: `schedule_job_id=eq.${job.id}`,
      }, (payload: { new: Record<string, unknown> }) => {
        const row = payload.new;
        if (!row?.id) return;
        const comp = parseCompletion({
          id: row.id as string,
          schedule_job_id: row.schedule_job_id as string,
          items: row.items as unknown,
          notes: row.notes as string | null,
          completed_by: row.completed_by as string,
          completed_at: row.completed_at as string,
          status: row.status as string | undefined,
          submitted_at: row.submitted_at as string | null | undefined,
          report_status: row.report_status as string | undefined,
          report_sent_at: row.report_sent_at as string | null | undefined,
          report_sent_to: row.report_sent_to as string | null | undefined,
          admin_edited_at: row.admin_edited_at as string | null | undefined,
          admin_edited_by: row.admin_edited_by as string | null | undefined,
          original_notes: row.original_notes as string | null | undefined,
        });
        setLiveCompletion(comp);
        setJobs(prev => prev.map(j => j.id === job.id
          ? { ...j, completion: comp, answeredFields: countAnswered(comp.items), totalFields: Math.max(j.totalFields, comp.items.length) }
          : j));
      })
      .subscribe();
    realtimeChannelRef.current = ch;
  }, [supabase]);

  const handleClosePanel = useCallback(() => {
    selectedJobIdRef.current = null;
    setSelectedJob(null);
    setLiveCompletion(null);
    setJobSections([]);
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
  }, [supabase]);

  // ── Reset progress: permanently delete the job's completion record ──────────
  // Media rows cascade via checklist_completion_media's FK.
  const handleResetProgress = useCallback(async () => {
    if (!selectedJob) return;
    const { error } = await supabase
      .from('checklist_completions')
      .delete()
      .eq('schedule_job_id', selectedJob.id);
    if (error) {
      console.error('Reset progress failed:', error.message);
      return;
    }
    setLiveCompletion(null);
    setJobs(prev => prev.map(j => j.id === selectedJob.id
      ? { ...j, completion: null, answeredFields: 0 }
      : j));
    setSelectedJob(prev => prev && prev.id === selectedJob.id
      ? { ...prev, completion: null }
      : prev);
  }, [selectedJob, supabase]);

  // ── Send-report workflow ────────────────────────────────────────────────────
  const canSend = profile?.role === 'owner' || profile?.role === 'admin';
  interface ClientReportPrefs { email: string | null; useOverride: boolean; overrideEmail: string | null }
  const [clientReportMap, setClientReportMap] = useState<Map<string, ClientReportPrefs>>(new Map());
  const effectiveRecipient = (clientId: string | null): string | null => {
    if (!clientId) return null;
    const p = clientReportMap.get(clientId);
    if (!p) return null;
    return (p.useOverride && p.overrideEmail) ? p.overrideEmail : p.email;
  };
  // Autosave the per-client override prefs (toggle saves instantly; typing
  // debounces). Flushed before sending so the server sees the latest choice.
  const prefsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistPrefs = useCallback(async (clientId: string, useOverride: boolean, overrideEmail: string | null) => {
    await supabase.from('clients')
      .update({ report_use_override: useOverride, report_override_email: overrideEmail })
      .eq('id', clientId);
  }, [supabase]);
  const setPrefs = useCallback((clientId: string, patch: Partial<ClientReportPrefs>, opts: { debounce?: boolean } = {}) => {
    setClientReportMap(prev => {
      const cur = prev.get(clientId) || { email: null, useOverride: false, overrideEmail: null };
      const next = { ...cur, ...patch };
      if (prefsTimerRef.current) clearTimeout(prefsTimerRef.current);
      if (opts.debounce) {
        prefsTimerRef.current = setTimeout(() => persistPrefs(clientId, next.useOverride, next.overrideEmail), 600);
      } else {
        persistPrefs(clientId, next.useOverride, next.overrideEmail);
      }
      return new Map(prev).set(clientId, next);
    });
  }, [persistPrefs]);
  const [sendTarget, setSendTarget] = useState<JobWithCompletion | null>(null);
  const [sendCc, setSendCc] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [mailtoFallback, setMailtoFallback] = useState<string | null>(null);

  const [emailPreview, setEmailPreview] = useState<{ subject: string; to: string | null; html: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openSendDialog = (job: JobWithCompletion) => {
    setSendTarget(job);
    setSendCc('');
    setSendError(null);
    setMailtoFallback(null);
    setEmailPreview(null);
    // Fetch the rendered email so the owner sees EXACTLY what the client gets
    if (job.completion) {
      setPreviewLoading(true);
      fetch('/api/checklist/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completionId: job.completion.id, preview: true }),
      })
        .then(res => res.json())
        .then(data => { if (data?.preview) setEmailPreview({ subject: data.subject, to: data.to, html: data.html }); })
        .catch(() => {})
        .finally(() => setPreviewLoading(false));
    }
  };

  // Reflect a successful send in every piece of local state
  const applySent = useCallback((jobId: string, sentTo: string) => {
    const patch = (c: Completion | null): Completion | null => c ? ({
      ...c, report_status: 'sent', report_sent_at: new Date().toISOString(), report_sent_to: sentTo,
    }) : c;
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, completion: patch(j.completion) } : j));
    setSelectedJob(prev => prev && prev.id === jobId ? { ...prev, completion: patch(prev.completion) } : prev);
    setLiveCompletion(prev => prev && prev.schedule_job_id === jobId ? (patch(prev) as Completion) : prev);
  }, []);

  // Reflect an admin correction (toggle/notes) in every piece of local state.
  // The realtime channel will echo the same row shortly after — harmless,
  // since both paths write identical data.
  const applyAdminEdit = useCallback((jobId: string, fresh: {
    items: unknown; notes: string | null;
    admin_edited_at: string | null; admin_edited_by: string | null; original_notes: string | null;
  }) => {
    const patch = (c: Completion | null): Completion | null => c ? ({
      ...c, items: parseItems(fresh.items), notes: fresh.notes,
      admin_edited_at: fresh.admin_edited_at, admin_edited_by: fresh.admin_edited_by,
      original_notes: fresh.original_notes,
    }) : c;
    setJobs(prev => prev.map(j => {
      if (j.id !== jobId) return j;
      const c = patch(j.completion);
      return { ...j, completion: c, answeredFields: c ? countAnswered(c.items) : j.answeredFields };
    }));
    setSelectedJob(prev => prev && prev.id === jobId ? { ...prev, completion: patch(prev.completion) } : prev);
    setLiveCompletion(prev => prev && prev.schedule_job_id === jobId ? (patch(prev) as Completion) : prev);
  }, []);

  const adminEdit = useCallback(async (payload: {
    toggles?: ({ fieldId: string; value: boolean }
      | { fieldId: string; option: string; selected: boolean }
      | { fieldId: string; answer: 'yes' | 'no' | null })[];
    notes?: string;
  }) => {
    const job = selectedJob;
    const completionId = liveCompletion?.id || job?.completion?.id;
    if (!job || !completionId) throw new Error('No checklist open');
    const res = await fetch('/api/checklist/admin-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completionId, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save the correction');
    if (data.completion) applyAdminEdit(job.id, data.completion);
  }, [selectedJob, liveCompletion, applyAdminEdit]);

  // Plain-text report for the mail-app fallback (no email provider configured)
  const buildMailtoBody = useCallback(async (job: JobWithCompletion): Promise<string | null> => {
    const completion = job.completion;
    if (!completion) return null;
    let secs: ChecklistSection[] = [];
    if (job.checklist_id) {
      const { data: cl } = await supabase
        .from('client_checklists').select('sections').eq('id', job.checklist_id).maybeSingle();
      if (cl) secs = ((cl.sections as Record<string, unknown>[]) || []).map(migrateOldSection);
    } else if (job.client_id) {
      const { data: cl } = await supabase
        .from('client_checklists').select('sections')
        .eq('client_id', job.client_id).eq('is_default', true).maybeSingle();
      if (cl) secs = ((cl.sections as Record<string, unknown>[]) || []).map(migrateOldSection);
    }
    if (secs.length === 0) return null;
    const answers = new Map(completion.items.map(a => [a.fieldId, a]));
    const vis = buildVisibilityMap(
      secs.flatMap(s => s.fields),
      completion.items.map(a => ({ field_id: a.fieldId, value: a.value, na: !!a.na })),
    );
    let body = `Hi,\n\nHere is the completed checklist for ${job.name}:\n\n`;
    secs.forEach(sec => {
      if (sec.title) body += `\n— ${sec.title} —\n`;
      sec.fields.forEach(f => {
        if (f.type === 'heading' || f.type === 'paragraph' || f.type === 'logic') return;
        if (vis[f.id] === false) return;
        const ans = answers.get(f.id);
        let val = 'No response';
        if (ans?.na) val = 'N/A';
        else if (ans?.value === true || ans?.value === 'yes') val = 'Yes';
        else if (ans?.value === false || ans?.value === 'no') val = 'No';
        else if (Array.isArray(ans?.value)) val = ans.value.join(', ') || 'None selected';
        else if (ans?.value) val = String(ans.value);
        body += `${f.label}: ${val}\n`;
      });
    });
    if (completion.notes) body += `\nNotes: ${completion.notes}`;
    body += `\n\n---\nSent via CleanRoute Pro`;
    return body;
  }, [supabase]);

  const handleSendReport = useCallback(async () => {
    if (!sendTarget?.completion) return;
    setSending(true);
    setSendError(null);
    // Flush a still-debouncing override save so the server sends to the
    // address currently on screen
    if (prefsTimerRef.current && sendTarget.client_id) {
      clearTimeout(prefsTimerRef.current);
      const p = clientReportMap.get(sendTarget.client_id);
      if (p) await persistPrefs(sendTarget.client_id, p.useOverride, p.overrideEmail);
    }
    try {
      const res = await fetch('/api/checklist/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completionId: sendTarget.completion.id, cc: sendCc || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        applySent(sendTarget.id, data.sentTo || '');
        setSendTarget(null);
      } else if (res.status === 501) {
        // No provider — offer the owner's own mail app instead
        const email = effectiveRecipient(sendTarget.client_id);
        const body = await buildMailtoBody(sendTarget);
        if (!email || !body) {
          setSendError(email ? 'Could not build the report for this checklist.' : 'This client has no email address saved — add one on the Clients page.');
        } else {
          const subject = encodeURIComponent(`Completed checklist — ${sendTarget.name}`);
          const ccPart = sendCc ? `&cc=${encodeURIComponent(sendCc)}` : '';
          setMailtoFallback(`mailto:${email}?subject=${subject}${ccPart}&body=${encodeURIComponent(body)}`);
        }
      } else {
        setSendError(data.error || 'Failed to send the report.');
      }
    } catch {
      setSendError('Network error — please try again.');
    }
    setSending(false);
  }, [sendTarget, sendCc, clientReportMap, persistPrefs, applySent, buildMailtoBody]);

  const handleMarkMailtoSent = useCallback(async () => {
    if (!sendTarget?.completion) return;
    setSending(true);
    try {
      const res = await fetch('/api/checklist/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completionId: sendTarget.completion.id, markOnly: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        applySent(sendTarget.id, data.sentTo || '');
        setSendTarget(null);
      } else {
        setSendError(data.error || 'Failed to record the send.');
      }
    } catch {
      setSendError('Network error — please try again.');
    }
    setSending(false);
  }, [sendTarget, applySent]);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const weekStats = useMemo(() => ({
    total: jobs.length,
    submitted: jobs.filter(j => j.completion?.is_submitted).length,
    inProgress: jobs.filter(j => j.completion && !j.completion.is_submitted).length,
  }), [jobs]);

  const jobsByDate = useMemo(() => {
    const map = new Map<string, JobWithCompletion[]>();
    weekDates.forEach(d => map.set(d, []));
    jobs.forEach(j => { if (map.has(j.date)) map.get(j.date)!.push(j); });
    return map;
  }, [jobs, weekDates]);

  return (
    <div className="h-full flex flex-col bg-[#f5f6fa] overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 bg-white border-b border-border-light px-4 lg:px-6 py-3 lg:py-4">
        <div className="flex items-center gap-4 flex-wrap justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-bold text-text-primary">Completed Jobs</h1>
              <HelpTip tip="Watch checklists fill in live as staff work, review answers and photos, and reset progress if needed." article="checklist-review" />
            </div>
            <p className="text-sm text-text-tertiary mt-0.5">{weekLabel}</p>
          </div>

          {!loading && (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold">
                {weekStats.submitted}/{weekStats.total} submitted
              </span>
              {weekStats.inProgress > 0 && (
                <span className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold">
                  {weekStats.inProgress} in progress
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-1">
            {/* Older week (higher index = older) */}
            <button
              onClick={() => setWeekIndex(i => Math.min(i + 1, publishedWeekStarts.length - 1))}
              disabled={weekIndex >= publishedWeekStarts.length - 1}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-surface-elevated text-text-secondary transition-colors disabled:opacity-30">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span className="px-2 text-xs text-text-tertiary font-medium">
              {weekIndex + 1} / {publishedWeekStarts.length}
            </span>
            {/* Newer week (lower index = newer) */}
            <button
              onClick={() => setWeekIndex(i => Math.max(i - 1, 0))}
              disabled={weekIndex <= 0}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-surface-elevated text-text-secondary transition-colors disabled:opacity-30">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
            <div className="w-px h-4 bg-border-light mx-1" />
            {/* Manual refresh */}
            <button onClick={() => { loadPublishedWeeks(); loadWeek(); }} disabled={loading || weeksLoading}
              title="Refresh"
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-surface-elevated text-text-secondary transition-colors disabled:opacity-40">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={loading || weeksLoading ? 'animate-spin' : ''}>
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Week grid ── */}
      <div className="flex-1 overflow-auto">
        {weeksLoading ? (
          <>
            {/* Desktop skeleton */}
            <div className="hidden lg:grid p-6 grid-cols-7 gap-3">
              {DAY_NAMES.map(d => (
                <div key={d}>
                  <div className="shimmer h-8 rounded-xl mb-2" />
                  {[1, 2, 3].map(i => <div key={i} className="shimmer h-20 rounded-xl mb-2" />)}
                </div>
              ))}
            </div>
            {/* Mobile skeleton */}
            <div className="lg:hidden p-4 space-y-3">
              {[1,2,3].map(i => <div key={i} className="shimmer h-20 rounded-2xl" />)}
            </div>
          </>
        ) : publishedWeekStarts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center text-3xl">📅</div>
            <div>
              <p className="text-sm font-bold text-text-primary">No published weeks yet</p>
              <p className="text-xs text-text-tertiary mt-1">Publish a week from the Schedule page to see it here</p>
            </div>
          </div>
        ) : loading ? (
          <>
            {/* Desktop skeleton */}
            <div className="hidden lg:grid p-6 grid-cols-7 gap-3">
              {DAY_NAMES.map(d => (
                <div key={d}>
                  <div className="shimmer h-8 rounded-xl mb-2" />
                  {[1, 2, 3].map(i => <div key={i} className="shimmer h-20 rounded-xl mb-2" />)}
                </div>
              ))}
            </div>
            {/* Mobile skeleton */}
            <div className="lg:hidden p-4 space-y-3">
              {[1,2,3].map(i => <div key={i} className="shimmer h-20 rounded-2xl" />)}
            </div>
          </>
        ) : (
          <>
            {/* ── Review & send inbox: every submitted checklist this week ── */}
            {(() => {
              const submitted = jobs
                .filter(j => j.completion?.is_submitted)
                .sort((a, b) => (b.completion?.submitted_at || b.completion?.completed_at || '')
                  .localeCompare(a.completion?.submitted_at || a.completion?.completed_at || ''));
              if (submitted.length === 0) return null;
              const awaiting = submitted.filter(j => j.completion?.report_status !== 'sent');
              return (
                <div className="px-4 lg:px-6 pt-4">
                  <div className="bg-white rounded-2xl border border-border-light overflow-hidden">
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-light">
                      <div className="w-8 h-8 rounded-xl bg-primary-light flex items-center justify-center shrink-0">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-text-primary">Review &amp; send reports</p>
                        <p className="text-[11px] text-text-tertiary">
                          {awaiting.length > 0
                            ? `${awaiting.length} checklist${awaiting.length !== 1 ? 's' : ''} awaiting review`
                            : 'All submitted checklists have been sent'}
                        </p>
                      </div>
                      {awaiting.length > 0 && (
                        <span className="shrink-0 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                          {awaiting.length} to review
                        </span>
                      )}
                    </div>
                    <div className="divide-y divide-border-light/60 max-h-80 overflow-y-auto custom-scrollbar">
                      {submitted.map(job => {
                        const c = job.completion!;
                        const isSent = c.report_status === 'sent';
                        const when = c.submitted_at || c.completed_at;
                        return (
                          <div key={job.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-elevated/60 transition-colors">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: job.teamColor }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-text-primary truncate">{job.name}</p>
                              <p className="text-[11px] text-text-tertiary truncate">
                                {getShortDayLabel(job.date)}
                                {when ? ` · submitted ${new Date(when).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                              </p>
                            </div>
                            {isSent ? (
                              <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full"
                                title={c.report_sent_to ? `Sent to ${c.report_sent_to}` : 'Sent'}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                Sent
                              </span>
                            ) : (
                              <span className="shrink-0 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                                Awaiting review
                              </span>
                            )}
                            <button onClick={() => handleSelectJob(job)}
                              className="shrink-0 text-[11px] font-semibold text-text-secondary hover:text-primary px-2.5 py-1.5 rounded-lg border border-border-light hover:border-primary/40 transition-colors">
                              Review
                            </button>
                            {canSend && (
                              <button onClick={() => openSendDialog(job)}
                                className={`shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                                  isSent
                                    ? 'text-text-tertiary hover:text-primary border border-border-light'
                                    : 'bg-primary text-white hover:bg-primary-hover'
                                }`}>
                                {isSent ? 'Send again' : 'Send email'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ══ DESKTOP: 7-column week grid ══ */}
            <div className="hidden lg:grid p-6 grid-cols-7 gap-3 min-w-[900px]">
              {weekDates.map(date => {
                const dayJobs = jobsByDate.get(date) || [];
                const isToday = date === today;
                const dayLabel = getShortDayLabel(date);
                const daySubmitted = dayJobs.filter(j => j.completion?.is_submitted).length;

                return (
                  <div key={date} className="flex flex-col gap-2">
                    <div className={`flex items-center justify-between px-2 py-1.5 rounded-xl ${
                      isToday ? 'bg-primary' : 'bg-white border border-border-light'
                    }`}>
                      <span className={`text-xs font-bold ${isToday ? 'text-white' : 'text-text-primary'}`}>
                        {dayLabel}
                      </span>
                      {dayJobs.length > 0 && (
                        <span className={`text-[10px] font-semibold ${isToday ? 'text-white/80' : 'text-text-tertiary'}`}>
                          {daySubmitted}/{dayJobs.length}
                        </span>
                      )}
                    </div>
                    {dayJobs.length === 0 ? (
                      <div className="min-h-[60px] rounded-xl border border-dashed border-border-light flex items-center justify-center">
                        <span className="text-[10px] text-text-tertiary">No jobs</span>
                      </div>
                    ) : (
                      dayJobs.map(job => {
                        const isSubmitted = job.completion?.is_submitted;
                        const inProgress = job.completion && !isSubmitted;
                        const pct = job.totalFields > 0
                          ? Math.round((job.answeredFields / job.totalFields) * 100) : 0;
                        return (
                          <motion.button
                            key={job.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleSelectJob(job)}
                            className={`w-full text-left rounded-xl border-2 p-3 bg-white shadow-sm transition-all ${
                              selectedJob?.id === job.id ? 'border-primary shadow-md' :
                              isSubmitted ? 'border-emerald-300' :
                              inProgress ? 'border-primary/30' :
                              'border-border-light'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <div className="w-1 min-h-[28px] rounded-full shrink-0" style={{ backgroundColor: job.teamColor }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-text-primary leading-snug truncate">{job.name}</p>
                                {job.teamName && <p className="text-[10px] text-text-tertiary mt-0.5 truncate">{job.teamName}</p>}
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex -space-x-1">
                                {job.assignedStaff.length > 0
                                  ? job.assignedStaff.slice(0, 4).map(staff => (
                                    <div key={staff.id} title={staff.name}
                                      className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white"
                                      style={{ backgroundColor: staff.color }}>
                                      {(staff.name || '?')[0].toUpperCase()}
                                    </div>
                                  ))
                                  : <div className="w-5 h-5 rounded-full border border-dashed border-border-light bg-surface-elevated" />}
                              </div>
                              <div>
                                {isSubmitted ? (
                                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-lg">✓ Done</span>
                                ) : inProgress ? (
                                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-lg">{pct}% done</span>
                                ) : (
                                  <span className="text-[10px] text-text-tertiary">Not started</span>
                                )}
                              </div>
                            </div>
                          </motion.button>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>

            {/* ══ MOBILE: vertical day list ══ */}
            <div className="lg:hidden p-3 space-y-2 pb-20">
              {weekDates.map(date => {
                const dayJobs = jobsByDate.get(date) || [];
                const isToday = date === today;
                const dayLabel = getShortDayLabel(date);
                const dayNum = new Date(date + 'T12:00:00').getDate();
                const daySubmitted = dayJobs.filter(j => j.completion?.is_submitted).length;
                if (dayJobs.length === 0) return null;

                return (
                  <div key={date}>
                    {/* Day heading */}
                    <div className={`flex items-center gap-2 px-2 py-2 mb-1.5`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                        isToday ? 'bg-primary text-white' : 'bg-white border border-border-light text-text-primary'
                      }`}>
                        {dayNum}
                      </div>
                      <div className="flex-1">
                        <span className={`text-sm font-bold ${isToday ? 'text-primary' : 'text-text-primary'}`}>
                          {dayLabel}{isToday ? ' — Today' : ''}
                        </span>
                      </div>
                      <span className="text-xs text-text-tertiary font-medium">
                        {daySubmitted}/{dayJobs.length} done
                      </span>
                    </div>

                    {/* Job cards */}
                    <div className="space-y-2">
                      {dayJobs.map(job => {
                        const isSubmitted = job.completion?.is_submitted;
                        const inProgress = job.completion && !isSubmitted;
                        const pct = job.totalFields > 0
                          ? Math.round((job.answeredFields / job.totalFields) * 100) : 0;
                        return (
                          <motion.button
                            key={job.id}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleSelectJob(job)}
                            className={`w-full text-left rounded-2xl border-2 px-4 py-3 bg-white shadow-sm transition-all active:scale-[0.98] ${
                              selectedJob?.id === job.id ? 'border-primary shadow-md' :
                              isSubmitted ? 'border-emerald-300' :
                              inProgress ? 'border-primary/30' :
                              'border-border-light'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Team color stripe */}
                              <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: job.teamColor }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-text-primary leading-snug truncate">{job.name}</p>
                                <p className="text-xs text-text-tertiary mt-0.5 truncate">{job.address || job.teamName}</p>
                              </div>
                              {/* Status badge */}
                              <div className="shrink-0">
                                {isSubmitted ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-xl">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                    Done
                                  </span>
                                ) : inProgress ? (
                                  <span className="inline-flex items-center text-xs font-bold text-primary bg-primary/10 px-2.5 py-1.5 rounded-xl">{pct}%</span>
                                ) : (
                                  <span className="inline-flex items-center text-xs text-text-tertiary bg-surface-elevated px-2.5 py-1.5 rounded-xl">—</span>
                                )}
                              </div>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-tertiary shrink-0">
                                <polyline points="9 18 15 12 9 6"/>
                              </svg>
                            </div>
                            {/* Staff avatars */}
                            {job.assignedStaff.length > 0 && (
                              <div className="flex items-center gap-1.5 mt-2 pl-4">
                                <div className="flex -space-x-1">
                                  {job.assignedStaff.slice(0, 5).map(staff => (
                                    <div key={staff.id} title={staff.name}
                                      className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white"
                                      style={{ backgroundColor: staff.color }}>
                                      {(staff.name || '?')[0].toUpperCase()}
                                    </div>
                                  ))}
                                </div>
                                <span className="text-[10px] text-text-tertiary">
                                  {job.assignedStaff.map(s => s.name).join(', ')}
                                </span>
                              </div>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Empty state for mobile */}
              {weekDates.every(d => (jobsByDate.get(d) || []).length === 0) && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <div className="text-4xl">📋</div>
                  <p className="text-sm font-semibold text-text-secondary">No jobs this week</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Send-report confirmation dialog ── */}
      <AnimatePresence>
        {sendTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-6"
            onClick={() => !sending && setSendTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl p-5 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center shrink-0">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-text-primary truncate">Send report to client</h3>
                  <p className="text-[11px] text-text-tertiary truncate">{sendTarget.name}</p>
                </div>
              </div>

              {/* ── Email preview: exactly what lands in the client's inbox ── */}
              <div className="mb-3 rounded-xl border border-border-light overflow-hidden">
                <div className="px-3.5 py-2 bg-surface-elevated border-b border-border-light">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Email preview</p>
                  {emailPreview && (
                    <p className="text-xs font-semibold text-text-primary truncate mt-0.5">{emailPreview.subject}</p>
                  )}
                </div>
                {previewLoading ? (
                  <div className="h-64 shimmer" />
                ) : emailPreview ? (
                  <iframe
                    title="Email preview"
                    sandbox=""
                    srcDoc={emailPreview.html}
                    className="w-full h-72 bg-white"
                  />
                ) : (
                  <div className="h-24 flex items-center justify-center text-xs text-text-tertiary">
                    Preview unavailable
                  </div>
                )}
              </div>

              {mailtoFallback ? (
                <>
                  <p className="text-xs text-text-secondary leading-relaxed mb-3">
                    No email service is connected yet, so the report will open in <span className="font-semibold">your own mail app</span> with
                    everything prefilled — press send there, then come back and mark it as sent.
                  </p>
                  <div className="flex gap-2">
                    <a href={mailtoFallback}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-primary text-white text-center hover:bg-primary-hover transition-colors">
                      Open in my mail app
                    </a>
                    <button onClick={handleMarkMailtoSent} disabled={sending}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                      {sending ? 'Saving…' : "I've sent it — mark as sent"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {(() => {
                    const cid = sendTarget.client_id;
                    const prefs = cid ? clientReportMap.get(cid) : undefined;
                    const useProfile = !(prefs?.useOverride);
                    const effective = effectiveRecipient(cid);
                    return (
                      <div className="rounded-xl bg-surface-elevated border border-border-light px-3.5 py-3 mb-3 space-y-2.5">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">To</p>
                          <p className="text-sm font-semibold text-text-primary">{effective || 'No email available'}</p>
                          {!effective && (
                            <p className="text-[11px] text-rose-600 mt-1">
                              {useProfile ? 'Add an email on the Clients page, or switch the toggle off and enter one below.' : 'Enter an address below.'}
                            </p>
                          )}
                        </div>
                        {/* Toggle: profile email vs saved per-client override */}
                        <button type="button"
                          onClick={() => cid && setPrefs(cid, { useOverride: useProfile })}
                          className="w-full flex items-center justify-between gap-3 text-left"
                        >
                          <span className="text-xs font-medium text-text-secondary">Use the email on the client profile</span>
                          <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${useProfile ? 'bg-primary' : 'bg-gray-300'}`}>
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${useProfile ? 'left-[18px]' : 'left-0.5'}`} />
                          </span>
                        </button>
                        {!useProfile && cid && (
                          <div>
                            <input
                              value={prefs?.overrideEmail || ''}
                              onChange={e => setPrefs(cid, { overrideEmail: e.target.value }, { debounce: true })}
                              placeholder="your.email@example.com"
                              type="email"
                              className="input-field text-sm w-full"
                            />
                            <p className="text-[10px] text-text-tertiary mt-1">
                              Saved automatically for this client — reports go here until you switch the toggle back.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1">CC (optional — e.g. management)</label>
                  <input value={sendCc} onChange={e => setSendCc(e.target.value)}
                    placeholder="manager@yourcompany.com"
                    className="input-field text-sm w-full mb-3" />
                  {sendTarget.completion?.report_status === 'sent' && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                      Already sent{sendTarget.completion.report_sent_to ? ` to ${sendTarget.completion.report_sent_to}` : ''}
                      {sendTarget.completion.report_sent_at ? ` on ${new Date(sendTarget.completion.report_sent_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''} — this will send it again.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setSendTarget(null)} disabled={sending}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-border text-text-secondary hover:bg-surface-elevated transition-colors disabled:opacity-50">
                      Cancel
                    </button>
                    <button onClick={handleSendReport}
                      disabled={sending || !effectiveRecipient(sendTarget.client_id)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50">
                      {sending ? 'Sending…' : 'Approve & send'}
                    </button>
                  </div>
                </>
              )}
              {sendError && (
                <p className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-3">{sendError}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Slide-in panel ── */}
      <AnimatePresence>
        {selectedJob && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 z-40"
              onClick={handleClosePanel}
              style={{ touchAction: 'none' }}
            />
            <ChecklistPanel
              key={selectedJob.id}
              job={selectedJob}
              sections={jobSections}
              completion={liveCompletion}
              userNameMap={userNameMap}
              onClose={handleClosePanel}
              loading={panelLoading}
              onReset={handleResetProgress}
              canSend={canSend}
              onSend={() => openSendDialog(liveCompletion ? { ...selectedJob, completion: liveCompletion } : selectedJob)}
              canEdit={canSend}
              viewerId={profile?.id}
              viewerName={profile?.full_name || undefined}
              onToggleField={(fieldId, next) => adminEdit({ toggles: [{ fieldId, value: next }] })}
              onToggleOption={(fieldId, option, selected) => adminEdit({ toggles: [{ fieldId, option, selected }] })}
              onToggleYesNo={(fieldId, answer) => adminEdit({ toggles: [{ fieldId, answer }] })}
              onEditNotes={(notes) => adminEdit({ notes })}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
