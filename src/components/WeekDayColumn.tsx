'use client';

import { useState, useRef, useEffect } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'framer-motion';
import { DaySchedule, TeamColor, Client } from '@/lib/types';
import { formatTimeDisplay, isToday, getShortDayLabel } from '@/lib/timeUtils';
import { ScheduleWarning, maxWarningLevel } from '@/lib/scheduleWarnings';

/** Per-team roster for one day — used by the hover popover */
export interface DayTeamRoster {
  teamName: string;
  color: string;
  staffIds: string[];
  driverStaffId: string | null;
  jobCount: number;
}

interface WeekDayColumnProps {
  daySchedule: DaySchedule;
  teamColor: TeamColor;
  isActive: boolean;
  onDayClick: () => void;
  /** Per-client color override (used in All Teams mode) */
  clientColorMap?: Record<string, string>;
  /** Per-client teamId (used in All Teams mode so drag knows which team a job belongs to) */
  clientTeamMap?: Record<string, string>;
  /** Staff ID → name lookup */
  staffNameMap?: Record<string, string>;
  /** Warnings for this day */
  warnings?: ScheduleWarning[];
  /** Team rosters for this day — hover the people badge to see who's on each team */
  dayRosters?: DayTeamRoster[];
  /** Popover anchor side for the roster badge ('left' expands rightward) */
  rosterAlign?: 'left' | 'right';
}

// ─── Roster badge + hover popover ─────────────────────────────────────────────
function RosterBadge({ rosters, staffNameMap, onOpenChange, align = 'right' }: {
  rosters: DayTeamRoster[];
  staffNameMap?: Record<string, string>;
  onOpenChange?: (open: boolean) => void;
  /** Which badge edge the popover is anchored to — 'left' expands rightward
   *  (used on the first column so the week container's overflow doesn't clip it) */
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  // Unique staff count across all teams this day
  const totalStaff = new Set(
    rosters.flatMap(r => [...(r.driverStaffId ? [r.driverStaffId] : []), ...r.staffIds])
  ).size;

  return (
    <div
      className="relative"
      onClick={e => e.stopPropagation()}
      onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); toggle(true); }}
      onMouseLeave={() => { closeTimer.current = setTimeout(() => toggle(false), 150); }}
    >
      <button
        onClick={() => toggle(!open)}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border transition-colors shrink-0 ${
          open
            ? 'bg-primary-light border-primary/25 text-primary'
            : totalStaff > 0
              ? 'bg-surface-elevated border-border-light text-text-secondary hover:text-primary hover:border-primary/25'
              : 'bg-amber-50 border-amber-200 text-amber-600'
        }`}
        title="Who's on each team today"
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span className="text-[9px] font-bold leading-none">{totalStaff}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full mt-1.5 w-60 rounded-xl border border-border-light shadow-xl p-3 space-y-2.5 bg-white`}
            style={{ zIndex: 9999 }}
          >
            <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Teams Today</p>
            {rosters.map((r, i) => {
              // Driver first, then the rest of the roster (dedup driver)
              const memberIds = [
                ...(r.driverStaffId ? [r.driverStaffId] : []),
                ...r.staffIds.filter(id => id !== r.driverStaffId),
              ];
              const members = memberIds
                .map(id => ({ id, name: staffNameMap?.[id], isDriver: id === r.driverStaffId }))
                .filter((m): m is { id: string; name: string; isDriver: boolean } => !!m.name);
              return (
                <div key={`${r.teamName}-${i}`} className={i > 0 ? 'pt-2.5 border-t border-border-light' : ''}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                    <span className="text-[11px] font-bold text-text-primary flex-1 truncate">{r.teamName}</span>
                    <span className="text-[9px] text-text-tertiary shrink-0">{r.jobCount} job{r.jobCount !== 1 ? 's' : ''}</span>
                  </div>
                  {members.length === 0 ? (
                    <p className="text-[10px] font-semibold text-amber-600 pl-3.5">⚠ No staff assigned</p>
                  ) : (
                    <div className="space-y-0.5 pl-3.5">
                      {members.map(m => (
                        <p key={m.id} className="text-[11px] text-text-secondary leading-snug">
                          {m.name}
                          {m.isDriver && <span className="ml-1 text-[9px] font-semibold text-text-tertiary">🚗 Driver</span>}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Warning badge + popover ──────────────────────────────────────────────────
function WarningBadge({ warnings, onOpenChange }: { warnings: ScheduleWarning[]; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const level = maxWarningLevel(warnings);

  const toggle = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) toggle(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!level) return null;

  const colors = {
    error:   { bg: 'bg-red-500',    ring: 'ring-red-300',    popBorder: 'border-red-200' },
    warning: { bg: 'bg-amber-500',  ring: 'ring-amber-300',  popBorder: 'border-amber-200' },
    info:    { bg: 'bg-blue-500',   ring: 'ring-blue-300',   popBorder: 'border-blue-200' },
  }[level];

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => toggle(!open)}
        className={`w-5 h-5 rounded-full ${colors.bg} flex items-center justify-center ring-2 ${colors.ring} transition-all hover:scale-110 shrink-0`}
        title={`${warnings.length} issue${warnings.length > 1 ? 's' : ''} — click to view`}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute left-0 top-full mt-1.5 w-72 rounded-xl border shadow-xl p-3 space-y-2 bg-white ${colors.popBorder}`}
            style={{ minWidth: '260px', zIndex: 9999 }}
          >
            <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1">
              {warnings.length} Issue{warnings.length > 1 ? 's' : ''} Today
            </p>
            {warnings.map(w => {
              const wColors = {
                error:   { border: 'border-l-red-400',   title: 'text-red-700',   body: 'text-red-600' },
                warning: { border: 'border-l-amber-400', title: 'text-amber-700', body: 'text-amber-600' },
                info:    { border: 'border-l-blue-400',  title: 'text-blue-700',  body: 'text-blue-600' },
              }[w.level];
              return (
                <div key={w.id} className={`border-l-2 pl-2 ${wColors.border}`}>
                  <p className={`text-[11px] font-semibold ${wColors.title}`}>{w.title}</p>
                  <p className={`text-[10px] mt-0.5 leading-relaxed ${wColors.body}`}>{w.detail}</p>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Draggable job card ───────────────────────────────────────────────────────
function DraggableJobCard({
  client,
  borderColor,
  scheduleId,
  date,
  index,
  staffNameMap,
  teamId,
}: {
  client: Client;
  borderColor: string;
  scheduleId: string | null;
  date: string;
  index: number;
  staffNameMap?: Record<string, string>;
  teamId?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `job-${date}-${client.id}`,
    data: { type: 'job', job: client, scheduleId, date, teamId },
  });

  return (
    <motion.div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
        opacity: isDragging ? 0.35 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      {...listeners}
      {...attributes}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: isDragging ? 0.35 : 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className="rounded-lg p-2 border border-border-light hover:border-border transition-colors select-none"
    >
      <div className="flex items-center justify-between gap-1 mb-0.5">
        {client.startTime && (
          <span className="text-[10px] font-bold text-text-secondary">
            {formatTimeDisplay(client.startTime)}
          </span>
        )}
        <span className="text-[9px] text-text-tertiary">{client.jobDurationMinutes}m</span>
      </div>
      <p className="text-[11px] font-medium text-text-primary leading-tight truncate">
        {client.name || 'Unnamed'}
      </p>
      {client.startTime && client.endTime && (
        <p className="text-[9px] text-text-tertiary mt-0.5">
          {formatTimeDisplay(client.startTime)} – {formatTimeDisplay(client.endTime)}
        </p>
      )}
      {staffNameMap && client.assignedStaffIds && client.assignedStaffIds.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {client.assignedStaffIds.map((id) => {
            const name = staffNameMap[id];
            if (!name) return null;
            return (
              <span key={id} className="text-[8px] font-medium text-text-tertiary bg-surface-elevated px-1 py-0.5 rounded">
                {name.split(' ')[0]}
              </span>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ─── Day column ───────────────────────────────────────────────────────────────
export default function WeekDayColumn({ daySchedule, teamColor, isActive, onDayClick, clientColorMap, clientTeamMap, staffNameMap, warnings = [], dayRosters = [], rosterAlign = 'right' }: WeekDayColumnProps) {
  const today = isToday(daySchedule.date);
  const clients = daySchedule.clients;
  const hasJobs = clients.length > 0;
  const [warningOpen, setWarningOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);

  const { isOver, setNodeRef } = useDroppable({ id: daySchedule.date });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[140px] flex-1 rounded-[16px] border transition-all duration-300 cursor-pointer relative ${
        isOver
          ? 'border-primary bg-primary/5 ring-4 ring-primary/10 shadow-[0_8px_30px_rgb(79,70,229,0.12)] scale-[1.02]'
          : today
            ? 'border-primary-border bg-primary-light/30'
            : 'border-border-light bg-white hover:border-border hover:shadow-card'
      }`}
      style={{ zIndex: warningOpen || rosterOpen ? 50 : isOver ? 10 : 0 }}
      onClick={onDayClick}
    >
      {/* Day header */}
      <div className="px-3 py-2.5 border-b border-border-light shrink-0">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-xs font-bold truncate ${today ? 'text-primary' : 'text-text-primary'}`}>
              {getShortDayLabel(daySchedule.date)}
            </span>
            {today && (
              <span className="text-[9px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-full shrink-0">TODAY</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {dayRosters.length > 0 && (
              <RosterBadge rosters={dayRosters} staffNameMap={staffNameMap} onOpenChange={setRosterOpen} align={rosterAlign} />
            )}
            {daySchedule.isPublished && (
              <span className="w-2 h-2 rounded-full bg-success shrink-0" title="Published" />
            )}
            {warnings.length > 0 && <WarningBadge warnings={warnings} onOpenChange={setWarningOpen} />}
          </div>
        </div>
      </div>

      {/* Jobs list */}
      <div data-day-scroll className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-1 min-h-[120px]">
        {!hasJobs ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[10px] text-text-tertiary">No jobs</p>
          </div>
        ) : (
          clients.map((client, i) => {
            const borderColor = clientColorMap?.[client.id] || teamColor.primary;
            return (
              <DraggableJobCard
                key={client.id}
                client={client}
                borderColor={borderColor}
                scheduleId={daySchedule.scheduleId}
                date={daySchedule.date}
                index={i}
                staffNameMap={staffNameMap}
                teamId={clientTeamMap?.[client.id]}
              />
            );
          })
        )}
      </div>

      {/* Footer summary */}
      {hasJobs && (
        <div className="px-3 py-1.5 border-t border-border-light shrink-0">
          <span className="text-[10px] font-medium text-text-tertiary">{clients.length} client{clients.length !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}
