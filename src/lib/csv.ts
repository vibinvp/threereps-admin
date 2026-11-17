type Cell = string | number | boolean | null | undefined | Date;

function toCell(v: Cell): string {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection from user-supplied text.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, headers: string[], rows: Cell[][]) {
  const body = [headers, ...rows].map((r) => r.map(toCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Firestore Timestamp | ISO string | millis -> Date (or null). */
export function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: unknown }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate();
  }
  const d = new Date(ts as string | number);
  return isNaN(d.getTime()) ? null : d;
}
