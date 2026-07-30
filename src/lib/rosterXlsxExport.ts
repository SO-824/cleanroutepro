'use client';

import ExcelJS from 'exceljs';
import { TeamSchedule, StaffMember, DaySummary } from './types';
import { calculateDaySummary, calculateScheduleTimes } from './routeEngine';
import { formatTimeDisplay } from './timeUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip trailing state, postcode, and country from an address string. */
function cleanAddress(address: string): string {
  return address
    .replace(/,?\s*Australia\s*$/i, '')
    .replace(/,?\s*(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s*\d{4}\s*$/i, '')
    .replace(/,\s*$/, '')
    .trim();
}

/** Format minutes as H:MM */
function minsToHHMM(minutes: number): string {
  if (minutes <= 0) return '0:00';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

/** Format date string "2026-06-18" → "18/06/2026" (AU format) */
function formatDateAU(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Get day of week label from date string */
function getDayLabel(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'long' });
}

/** Number of people on the team */
function getTeamSize(team: TeamSchedule): number {
  const n = (team.staffIds || []).length;
  return n > 0 ? n : 1;
}

/** '#059669' → 'FF059669' (ExcelJS ARGB) */
function hexToArgb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`;
}

// ─── Styling constants ────────────────────────────────────────────────────────

const FONT = 'Calibri';
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
};

function solidFill(argb: string): ExcelJS.FillPattern {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

// ─── Merged All-Teams Day Roster XLSX Export ──────────────────────────────────
//
// Mirrors the layout of the old CSV export with one change: the per-job
// notes column was dropped (it duplicated a legacy field) — the single
// "Access & Notes" column holds the client profile's Access & Notes.

export type SavedScheduleTimes = { baseDepartureTime: string | null; returnArrivalTime: string | null };

// Columns: #, Client, Address, Start, End, Total Duration, Access & Notes
function setRosterColumns(ws: ExcelJS.Worksheet): void {
  ws.columns = [
    { width: 10 },
    { width: 26 },
    { width: 40 },
    { width: 11 },
    { width: 11 },
    { width: 14 },
    { width: 48 },
  ];
}

/** Append one day's full roster (header + every team section) to a worksheet. */
function addDayRoster(
  ws: ExcelJS.Worksheet,
  teams: TeamSchedule[],
  allStaff: StaffMember[],
  date: string,
  templateCode?: string,
  summaries?: Map<string, DaySummary>,
  /** savedClientId → clients.notes (the client profile's "Access & Notes") */
  clientNotesMap?: Map<string, string>,
  /** teamId → saved schedule times, used as fallback when a team's live travel
   *  segments aren't loaded (segments are only fetched for teams viewed in the
   *  editor this session — without them the route engine collapses the base
   *  departure onto the first job's start time) */
  savedTimes?: Map<string, SavedScheduleTimes>,
): void {
  const staffMap = new Map(allStaff.map(s => [s.id, s]));

  // ── Date + day header ──
  if (templateCode) {
    const r = ws.addRow([templateCode]);
    r.getCell(1).font = { name: FONT, bold: true, size: 14, color: { argb: 'FF4F46E5' } };
  }
  if (date) {
    const r = ws.addRow([`${getDayLabel(date)} ${formatDateAU(date)}`]);
    r.getCell(1).font = { name: FONT, bold: true, size: 12 };
  }
  ws.addRow([]); // blank line

  // Only include teams that have clients scheduled
  const activeTeams = teams.filter(t => t.clients.length > 0);

  for (let idx = 0; idx < activeTeams.length; idx++) {
    const team = activeTeams[idx];
    let summary = summaries?.get(team.id) || calculateDaySummary(team);

    // Fallback: if the route engine returned 0 travel (travelSegments empty for non-active teams),
    // compute travel from timeline gaps (departure → first job, gaps between jobs).
    // Anchor at the day's actual saved departure when available — the team's
    // nominal dayStartTime fabricates travel on days that start later at the
    // first job (no start base + pinned start).
    if (summary.totalTravelMinutes === 0 && team.clients.length > 0) {
      const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
      let gapTravel = 0;
      let lastEnd = parseTime(savedTimes?.get(team.id)?.baseDepartureTime || team.dayStartTime);

      // Sort clients by start time
      const sorted = [...team.clients]
        .filter(c => c.startTime && c.endTime)
        .sort((a, b) => parseTime(a.startTime!) - parseTime(b.startTime!));

      for (const c of sorted) {
        const cStart = parseTime(c.startTime!);
        if (cStart > lastEnd) {
          gapTravel += (cStart - lastEnd);
        }
        lastEnd = parseTime(c.endTime!);
      }

      if (gapTravel > 0) {
        // Rebuild summary with the gap-calculated travel
        summary = {
          ...summary,
          totalTravelMinutes: gapTravel,
          payableMinutes: (summary.payableMinutes - summary.totalTravelMinutes) + gapTravel,
        };
      }
    }

    const teamSize = getTeamSize(team);
    const hasBase = team.baseAddress && team.baseAddress.lat !== 0;
    const teamArgb = hexToArgb(team.color.primary);
    const teamLightArgb = hexToArgb(team.color.light);

    // Resolve staff names for this team
    const teamStaffNames = (team.staffIds || [])
      .map(id => staffMap.get(id)?.name)
      .filter((n): n is string => !!n);

    // Resolve driver name
    const driverName = team.driverStaffId
      ? staffMap.get(team.driverStaffId)?.name || ''
      : '';

    // Blank separator between teams
    if (idx > 0) {
      ws.addRow([]);
      ws.addRow([]);
    }

    // ── Team header row — filled with the team's colour ──
    const headerRow = ws.addRow([team.name, 'Client', 'Address', 'Start Time', 'End Time', 'Total Duration', 'Access & Notes']);
    headerRow.height = 22;
    for (let col = 1; col <= 7; col++) {
      const cell = headerRow.getCell(col);
      cell.fill = solidFill(teamArgb);
      cell.font = { name: FONT, bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle' };
      cell.border = thinBorder;
    }

    const styleDataRow = (row: ExcelJS.Row, opts: { fill?: string; bold?: boolean; italic?: boolean } = {}) => {
      row.height = 18;
      for (let col = 1; col <= 7; col++) {
        const cell = row.getCell(col);
        cell.font = { name: FONT, size: 11, bold: !!opts.bold, italic: !!opts.italic };
        if (opts.fill) cell.fill = solidFill(opts.fill);
        cell.border = thinBorder;
        // Wrap the address + notes columns, centre the small columns
        if (col === 3 || col === 7) {
          cell.alignment = { vertical: 'top', wrapText: true };
        } else if (col === 1 || col === 4 || col === 5 || col === 6) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle' };
        }
      }
    };

    // ── Base row ──
    if (hasBase) {
      const baseAddr = cleanAddress(team.baseAddress?.address || '');
      // The route engine's departure time (accounts for "Leave Base At"
      // overrides) is only trustworthy when the base→first-job travel segment
      // is actually loaded; otherwise fall back to the saved departure time —
      // the same value payroll and the staff app read.
      const firstClient = team.clients[0];
      const baseSeg = firstClient ? team.travelSegments.get(`base->${firstClient.id}`) : undefined;
      const baseSegLoaded = !!baseSeg && !baseSeg.isCalculating;
      const { baseDepartureTime } = calculateScheduleTimes(team);
      const departure = baseSegLoaded
        ? baseDepartureTime
        : (savedTimes?.get(team.id)?.baseDepartureTime || baseDepartureTime);
      const r = ws.addRow(['', 'Base', baseAddr, formatTimeDisplay(departure || ''), '', '', '']);
      styleDataRow(r, { fill: teamLightArgb, bold: true });
    }

    // ── Client rows + breaks ──
    const breakMap = new Map<string, typeof team.breaks[0][]>();
    for (const b of team.breaks || []) {
      const list = breakMap.get(b.afterClientId) || [];
      list.push(b);
      breakMap.set(b.afterClientId, list);
    }

    team.clients.forEach((c, i) => {
      const effMin = c.jobDurationMinutes / teamSize;
      const addr = cleanAddress(c.location.address);
      const clientNotes = (c.savedClientId && clientNotesMap?.get(c.savedClientId)) || '';
      const r = ws.addRow([
        String(i + 1),
        c.name,
        addr,
        formatTimeDisplay(c.startTime || ''),
        formatTimeDisplay(c.endTime || ''),
        minsToHHMM(effMin),
        clientNotes,
      ]);
      styleDataRow(r);
      r.getCell(2).font = { name: FONT, size: 11, bold: true };

      // Insert breaks after this client
      const breaksAfter = breakMap.get(c.id);
      if (breaksAfter) {
        for (const b of breaksAfter) {
          const breakStart = c.endTime || '';
          let breakEnd = '';
          if (breakStart && b.durationMinutes > 0) {
            const parts = breakStart.split(':').map(Number);
            const totalMin = parts[0] * 60 + parts[1] + b.durationMinutes;
            const h = Math.floor(totalMin / 60) % 24;
            const m = totalMin % 60;
            breakEnd = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
          }
          const br = ws.addRow([
            '',
            b.label || 'Break',
            '',
            formatTimeDisplay(breakStart),
            formatTimeDisplay(breakEnd),
            minsToHHMM(b.durationMinutes),
            '',
          ]);
          styleDataRow(br, { fill: 'FFFFF7E6', italic: true });
        }
      }
    });

    // ── Return to Base ──
    const hasReturn = team.returnAddress !== null && team.returnAddress !== 'none';
    if (team.clients.length > 0 && hasReturn) {
      const last = team.clients[team.clients.length - 1];
      const ret = team.travelSegments.get(`${last.id}->base-return`);

      let arrivalTime = '';
      if (last.endTime && ret && !ret.isCalculating) {
        const parts = last.endTime.split(':').map(Number);
        const totalMin = parts[0] * 60 + parts[1] + ret.durationMinutes;
        const h = Math.floor(totalMin / 60) % 24;
        const m = totalMin % 60;
        arrivalTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      }
      // Return segment not loaded this session → use the saved arrival time
      if (!arrivalTime) {
        arrivalTime = savedTimes?.get(team.id)?.returnArrivalTime || '';
      }

      const returnAddr = typeof team.returnAddress === 'object' && team.returnAddress
        ? cleanAddress(team.returnAddress.address)
        : cleanAddress(team.baseAddress?.address || '');
      const r = ws.addRow(['', 'Return to Base', returnAddr, formatTimeDisplay(last.endTime || ''), formatTimeDisplay(arrivalTime), '', '']);
      styleDataRow(r, { fill: teamLightArgb, bold: true });
    }

    // ── Summary section ──
    ws.addRow([]);
    const summaryHeader = ws.addRow(['Summary']);
    summaryHeader.getCell(1).font = { name: FONT, bold: true, size: 12 };

    const addSummaryRow = (vals: (string | number)[]) => {
      const r = ws.addRow(vals);
      r.getCell(1).font = { name: FONT, bold: true, size: 11 };
      for (let col = 2; col <= Math.max(vals.length, 2); col++) {
        r.getCell(col).font = { name: FONT, size: 11 };
      }
      return r;
    };

    if (teamStaffNames.length > 0) {
      const r = addSummaryRow([team.name, ...teamStaffNames]);
      r.getCell(1).font = { name: FONT, bold: true, size: 11, color: { argb: teamArgb } };
    }

    if (driverName) {
      addSummaryRow(['Driver', driverName]);
    }

    addSummaryRow(['Total Clients', `${summary.clientCount} clients`]);
    addSummaryRow(['Total Job Time', minsToHHMM(summary.totalJobMinutes), `${(summary.totalJobMinutes / 60).toFixed(2)} hrs`]);

    const effectiveJobMins = summary.payableMinutes - summary.totalTravelMinutes;
    addSummaryRow(['Team Split', minsToHHMM(effectiveJobMins), `${(effectiveJobMins / 60).toFixed(2)} hrs`]);
    addSummaryRow(['Travel', minsToHHMM(summary.totalTravelMinutes), `${(summary.totalTravelMinutes / 60).toFixed(2)} hrs`]);
    addSummaryRow(['Driver Km', `${summary.totalDistanceKm.toFixed(1)} km`]);
  }
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function exportDayRosterXLSX(
  teams: TeamSchedule[],
  allStaff: StaffMember[],
  date: string,
  templateCode?: string,
  summaries?: Map<string, DaySummary>,
  clientNotesMap?: Map<string, string>,
  savedTimes?: Map<string, SavedScheduleTimes>,
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Roster');
  setRosterColumns(ws);
  addDayRoster(ws, teams, allStaff, date, templateCode, summaries, clientNotesMap, savedTimes);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}

// ─── Full-Week Roster XLSX Export ─────────────────────────────────────────────
// ONE worksheet with every day stacked vertically (Mon → Sun), each day laid
// out exactly like the single-day export under its own bold date header.
// Kept single-sheet deliberately: separate per-day tabs are invisible in
// macOS Quick Look and easily missed, reading as "only Monday exported".
// Days with no scheduled jobs are skipped.

export interface WeekRosterDay {
  date: string;
  teams: TeamSchedule[];
  templateCode?: string;
  summaries?: Map<string, DaySummary>;
  savedTimes?: Map<string, SavedScheduleTimes>;
}

// Raw DB rows the week export builds from — fetched fresh so the export is
// the saved truth, independent of any partially-loaded UI cache.
export interface RawWeekScheduleRow {
  id: string; team_id: string; schedule_date: string;
  staff_ids: string[] | null; driver_staff_id: string | null;
  total_travel_minutes: number | null; total_distance_km: string | number | null;
  base_departure_time: string | null; return_arrival_time: string | null;
  has_start_base: boolean | null; has_return_base: boolean | null;
  base_address: string | null; base_lat: number | null; base_lng: number | null;
  return_address: string | null; return_lat: number | null; return_lng: number | null;
  template_code: string | null;
}

export interface RawWeekJobRow {
  id: string; schedule_id: string; name: string | null; address: string | null;
  lat: number | null; lng: number | null; duration_minutes: number | null;
  start_time: string | null; end_time: string | null; notes: string | null;
  is_break: boolean | null; position: number | null; client_id: string | null;
  assigned_staff_ids: string[] | null; staff_count: number | null;
}

/** Assemble per-day team snapshots for the week export from raw DB rows. */
export function buildWeekRosterDays(
  weekDates: string[],
  teamsMeta: TeamSchedule[],
  schedRows: RawWeekScheduleRow[],
  jobRows: RawWeekJobRow[],
): WeekRosterDay[] {
  const schedByKey = new Map(schedRows.map(r => [`${r.team_id}::${r.schedule_date}`, r]));
  const jobsBySchedule = new Map<string, RawWeekJobRow[]>();
  for (const j of jobRows) {
    const list = jobsBySchedule.get(j.schedule_id) || [];
    list.push(j);
    jobsBySchedule.set(j.schedule_id, list);
  }

  return weekDates.map(date => {
    const dayTeams: TeamSchedule[] = [];
    const summaries = new Map<string, DaySummary>();
    const savedTimes = new Map<string, SavedScheduleTimes>();
    let templateCode: string | undefined;

    for (const meta of teamsMeta) {
      const sched = schedByKey.get(`${meta.id}::${date}`);
      if (!sched) continue;
      const rows = (jobsBySchedule.get(sched.id) || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));

      const clients = rows.filter(r => !r.is_break).map(r => ({
        id: r.id,
        name: r.name || '',
        location: { address: r.address || '', lat: r.lat || 0, lng: r.lng || 0 },
        jobDurationMinutes: r.duration_minutes || 90,
        staffCount: r.staff_count || 1,
        isLocked: false,
        startTime: r.start_time || undefined,
        endTime: r.end_time || undefined,
        notes: r.notes || undefined,
        savedClientId: r.client_id || undefined,
        assignedStaffIds: r.assigned_staff_ids || [],
      }));
      if (clients.length === 0) continue;

      // Breaks: is_break rows carry {afterClientId, label} in notes JSON
      const clientIds = new Set(clients.map(c => c.id));
      const breaks = rows.filter(r => r.is_break).flatMap(r => {
        try {
          const m = JSON.parse(r.notes || '{}');
          if (!m.afterClientId || !clientIds.has(m.afterClientId)) return [];
          return [{
            id: m.breakId || r.id,
            afterClientId: m.afterClientId as string,
            durationMinutes: r.duration_minutes || 30,
            label: m.label || r.name || 'Break',
          }];
        } catch { return []; }
      });

      const hasStartBase = sched.has_start_base !== false && !!sched.base_address;
      const hasReturnBase = sched.has_return_base !== false && !!sched.return_address;

      const t: TeamSchedule = {
        ...meta,
        clients,
        breaks,
        travelSegments: new Map(),
        baseAddress: hasStartBase
          ? { address: sched.base_address!, lat: sched.base_lat || 0, lng: sched.base_lng || 0 }
          : null,
        returnAddress: hasReturnBase
          ? { address: sched.return_address!, lat: sched.return_lat || 0, lng: sched.return_lng || 0 }
          : (sched.has_return_base === false ? 'none' : null),
        staffIds: Array.isArray(sched.staff_ids) ? sched.staff_ids : [],
        driverStaffId: sched.driver_staff_id || null,
      };

      const summary = calculateDaySummary(t);
      const savedTravel = sched.total_travel_minutes || 0;
      const savedDist = Number(sched.total_distance_km) || 0;
      if (summary.totalTravelMinutes === 0 && savedTravel > 0) {
        summary.totalTravelMinutes = savedTravel;
        summary.payableMinutes += savedTravel;
      }
      if (summary.totalDistanceKm === 0 && savedDist > 0) {
        summary.totalDistanceKm = savedDist;
      }
      summaries.set(t.id, summary);
      savedTimes.set(t.id, {
        baseDepartureTime: sched.base_departure_time || null,
        returnArrivalTime: sched.return_arrival_time || null,
      });
      if (!templateCode && sched.template_code) templateCode = sched.template_code;
      dayTeams.push(t);
    }

    return { date, teams: dayTeams, summaries, savedTimes, templateCode };
  }).filter(d => d.teams.length > 0);
}

export async function exportWeekRosterXLSX(
  days: WeekRosterDay[],
  allStaff: StaffMember[],
  clientNotesMap?: Map<string, string>,
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Week Roster');
  setRosterColumns(ws);
  let firstDay = true;
  for (const day of days) {
    if (!day.teams.some(t => t.clients.length > 0)) continue;
    if (!firstDay) {
      ws.addRow([]);
      ws.addRow([]);
      ws.addRow([]);
    }
    firstDay = false;
    addDayRoster(ws, day.teams, allStaff, day.date, day.templateCode, day.summaries, clientNotesMap, day.savedTimes);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}
