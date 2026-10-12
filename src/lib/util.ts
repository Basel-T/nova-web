// ============================================================
// util.ts — Calendar files, CSV export, maps links
// ============================================================

import { endTime } from './time';
import { t } from '../i18n';

/** Trigger a file download in the browser */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build CSV text (Excel-friendly) from rows of cells */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** "Add to calendar" — an .ics file in local (floating) time */
export function downloadIcs(opts: {
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  durationMin: number;
}): void {
  const stamp = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
  const esc = (s: string) => s.replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Barbershop//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@barbershop`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${stamp(opts.date, opts.time)}`,
    `DTEND:${stamp(opts.date, endTime(opts.time, opts.durationMin))}`,
    `SUMMARY:${esc(opts.title)}`,
    `DESCRIPTION:${esc(opts.description)}`,
    `LOCATION:${esc(opts.location)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(t('ics.reminder'))}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  downloadFile('appointment.ics', ics, 'text/calendar');
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * Store phone numbers cleaned: digits only, keeping one leading "+" for
 * international numbers ("+49 151 2345 6789" → "+4915123456789").
 * "0049…" is treated like "+49…".
 */
export function cleanNumber(s: string): string {
  const raw = s.trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return '+' + digits;
  if (digits.startsWith('00') && digits.length > 4) return '+' + digits.slice(2);
  return digits;
}

/** How many digits a (cleaned) number has — "+" doesn't count */
export function digitCount(s: string): number {
  return s.replace(/\D/g, '').length;
}
