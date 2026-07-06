'use client';

import ExcelJS from 'exceljs';
import { TeamSchedule, StaffMember, DaySummary } from './types';
import { calculateDaySummary, calculateScheduleTimes } from './routeEngine';

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
// Mirrors the layout of the old CSV export exactly (same rows, same columns,
// same values) with one addition: a "Client Notes" column after
// "Total Duration" holding the saved client profile's Access & Notes.

export async function exportDayRosterXLSX(
  teams: TeamSchedule[],
  allStaff: StaffMember[],
  date: string,
  templateCode?: string,
  summaries?: Map<string, DaySummary>,
  /** savedClientId → clients.notes (the client profile's "Access & Notes") */
  clientNotesMap?: Map<string, string>,
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Roster');
  const staffMap = new Map(allStaff.map(s => [s.id, s]));

  // Columns: #, Client, Address, Job Notes / Access, Start, End, Total Duration, Client Notes
  ws.columns = [
    { width: 10 },
    { width: 26 },
    { width: 40 },
    { width: 36 },
    { width: 11 },
    { width: 11 },
    { width: 14 },
    { width: 44 },
  ];

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
    // compute travel from timeline gaps (dayStartTime → first job, gaps between jobs).
    if (summary.totalTravelMinutes === 0 && team.clients.length > 0) {
      const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
      let gapTravel = 0;
      let lastEnd = parseTime(team.dayStartTime);

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
    const headerRow = ws.addRow([team.name, 'Client', 'Address', 'Job Notes / Access', 'Start Time', 'End Time', 'Total Duration', 'Client Notes']);
    headerRow.height = 22;
    for (let col = 1; col <= 8; col++) {
      const cell = headerRow.getCell(col);
      cell.fill = solidFill(teamArgb);
      cell.font = { name: FONT, bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle' };
      cell.border = thinBorder;
    }

    const styleDataRow = (row: ExcelJS.Row, opts: { fill?: string; bold?: boolean; italic?: boolean } = {}) => {
      row.height = 18;
      for (let col = 1; col <= 8; col++) {
        const cell = row.getCell(col);
        cell.font = { name: FONT, size: 11, bold: !!opts.bold, italic: !!opts.italic };
        if (opts.fill) cell.fill = solidFill(opts.fill);
        cell.border = thinBorder;
        // Wrap the notes + address columns, centre the small columns
        if (col === 3 || col === 4 || col === 8) {
          cell.alignment = { vertical: 'top', wrapText: true };
        } else if (col === 1 || col === 5 || col === 6 || col === 7) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle' };
        }
      }
    };

    // ── Base row ──
    if (hasBase) {
      const baseAddr = cleanAddress(team.baseAddress?.address || '');
      // Use the route engine's calculated departure time (accounts for "Leave Base At" overrides)
      const { baseDepartureTime } = calculateScheduleTimes(team);
      const r = ws.addRow(['', 'Base', baseAddr, '', baseDepartureTime, '', '', '']);
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
        c.notes || '',
        c.startTime || '',
        c.endTime || '',
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
            '',
            breakStart,
            breakEnd,
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

      const returnAddr = typeof team.returnAddress === 'object' && team.returnAddress
        ? cleanAddress(team.returnAddress.address)
        : cleanAddress(team.baseAddress?.address || '');
      const r = ws.addRow(['', 'Return to Base', returnAddr, '', last.endTime || '', arrivalTime, '', '']);
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

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob(
    [buffer],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  );
}
