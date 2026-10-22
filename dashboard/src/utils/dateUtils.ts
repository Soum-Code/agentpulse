/**
 * Utility functions for parsing, formatting and comparing timestamps across telemetry, traces, and incidents.
 *
 * The backend stores times as naive UTC and sends them without a zone suffix
 * ("2026-10-21T08:44:42.963349"). Date.parse reads such a string as local time, so a
 * viewer in IST would see every trace as 5h30m older (or newer) than it is. A full date-time
 * with no zone is therefore read as UTC here. A string that carries a zone (Z or +05:30) is
 * taken as written.
 */

export interface TimeDisplayInfo {
  relative: string;          // e.g. "2s ago", "1m ago", "just now"
  fullRelative: string;      // e.g. "2 seconds ago", "1 minute ago", "just now"
  formattedTime: string;     // local time, e.g. "10:32:15"
  formattedDate: string;     // local date, e.g. "2026-10-19"
  formattedDateTime: string; // local date and time, e.g. "2026-10-19 10:32:15"
  isoString: string;         // ISO 8601 in UTC
  timestampMs: number;       // Unix epoch ms
  raw: string;
}

export type TimeFormatMode = 'relative' | 'absolute' | 'dual';

/** A full date and time with no zone: "2026-10-21T08:44:42", "2026-10-21 08:44:42.963349". */
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/** A timestamp from a browser and a server clock can differ by a few seconds. A time this far
 *  ahead of now is read as clock drift and shown as "just now"; anything further ahead is not. */
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

/** Epoch ms for a full date-time string, or null when it is not one (a time of day alone has no date). */
const parseFullDateTimeMs = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (NAIVE_DATETIME.test(trimmed)) {
    const utc = Date.parse(`${trimmed.replace(' ', 'T')}Z`);
    return isNaN(utc) ? null : utc;
  }

  // Zoned ISO strings, and the 12-hour forms Date.parse understands
  const normalized = trimmed.includes(' ') && !/\b(am|pm)\b/i.test(trimmed)
    ? trimmed.replace(' ', 'T')
    : trimmed;
  const direct = Date.parse(normalized);
  if (!isNaN(direct)) return direct;

  const fallback = Date.parse(trimmed);
  return isNaN(fallback) ? null : fallback;
};

/** Epoch ms for any accepted input, or null when there is nothing usable to show. */
const toEpochMs = (input?: string | number | Date | null): number | null => {
  if (input === undefined || input === null || input === '') return null;
  const ms = typeof input === 'number'
    ? input
    : input instanceof Date
    ? input.getTime()
    : parseFullDateTimeMs(input);
  return ms !== null && Number.isFinite(ms) && ms > 0 ? ms : null;
};

/**
 * Parses a date/time string to epoch ms, for ordering. A time of day alone ("10:32:15", "2:30 PM")
 * has no date, so it comes back as ms since midnight: enough to order it against other times of day
 * and not a real instant. Returns 0 when the string cannot be read.
 */
export const parseDateTimeToMs = (dateStr?: string | null): number => {
  if (!dateStr) return 0;
  const trimmed = dateStr.trim();
  if (!trimmed) return 0;

  const full = parseFullDateTimeMs(trimmed);
  if (full !== null) return full;

  // Time string e.g. "10:32:15", "10:32:15 AM", "2:30 PM"
  const timeRegex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i;
  const match = trimmed.match(timeRegex);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = match[3] ? parseInt(match[3], 10) : 0;
    const ampm = match[4]?.toLowerCase();

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  return 0;
};

type RelativeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

/** The largest whole unit that fits in an age, shared by the short and the long wording. */
const relativeParts = (diffMs: number): { amount: number; unit: RelativeUnit } => {
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return { amount: sec, unit: 'second' };
  const min = Math.floor(sec / 60);
  if (min < 60) return { amount: min, unit: 'minute' };
  const hours = Math.floor(min / 60);
  if (hours < 24) return { amount: hours, unit: 'hour' };
  const days = Math.floor(hours / 24);
  if (days < 7) return { amount: days, unit: 'day' };
  if (days < 30) return { amount: Math.floor(days / 7), unit: 'week' };
  if (days < 365) return { amount: Math.floor(days / 30), unit: 'month' };
  return { amount: Math.floor(days / 365), unit: 'year' };
};

const SHORT_UNIT: Record<RelativeUnit, string> = {
  second: 's', minute: 'm', hour: 'h', day: 'd', week: 'w', month: 'mo', year: 'y',
};

const pad2 = (n: number) => n.toString().padStart(2, '0');

const localDateTime = (ms: number): { time: string; date: string } => {
  const d = new Date(ms);
  return {
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
  };
};

/**
 * Returns a compact relative time string (e.g. "2s ago", "15m ago", "2h ago", "just now").
 * A missing or unreadable time gives "N/A"; a time further ahead than clock drift explains
 * gives its local date and time rather than a relative claim.
 */
export const formatRelativeTime = (
  dateInput?: string | number | Date | null,
  referenceNow: number = Date.now()
): string => {
  const ms = toEpochMs(dateInput);
  if (ms === null) return 'N/A';

  const diffMs = referenceNow - ms;
  if (diffMs < -CLOCK_SKEW_TOLERANCE_MS) {
    const { date, time } = localDateTime(ms);
    return `${date} ${time}`;
  }
  if (diffMs < 1000) return 'just now';

  const { amount, unit } = relativeParts(diffMs);
  if (unit === 'day' && amount === 1) return 'yesterday';
  return `${amount}${SHORT_UNIT[unit]} ago`;
};

/**
 * Returns an expanded, human-readable relative time string (e.g. "2 seconds ago", "3 minutes ago").
 */
export const formatFullRelativeTime = (
  dateInput?: string | number | Date | null,
  referenceNow: number = Date.now()
): string => {
  const ms = toEpochMs(dateInput);
  if (ms === null) return 'N/A';

  const diffMs = referenceNow - ms;
  if (diffMs < -CLOCK_SKEW_TOLERANCE_MS) {
    const { date, time } = localDateTime(ms);
    return `${date} ${time}`;
  }
  if (diffMs < 1000) return 'just now';

  const { amount, unit } = relativeParts(diffMs);
  if (unit === 'day' && amount === 1) return 'yesterday';
  return `${amount} ${unit}${amount === 1 ? '' : 's'} ago`;
};

/**
 * Formats a timestamp into comprehensive display components for UI columns and tooltips.
 * Unreadable input is passed through as written, so the screen shows what the backend sent.
 */
export const getTimeDisplayInfo = (
  dateInput?: string | number | Date | null,
  referenceNow: number = Date.now()
): TimeDisplayInfo => {
  const raw = dateInput !== undefined && dateInput !== null ? String(dateInput).trim() : '';
  const ms = toEpochMs(dateInput);

  if (ms === null) {
    return {
      relative: raw || 'N/A',
      fullRelative: raw || 'N/A',
      formattedTime: raw || '--:--:--',
      formattedDate: '--',
      formattedDateTime: raw || 'N/A',
      isoString: '',
      timestampMs: 0,
      raw,
    };
  }

  const { time, date } = localDateTime(ms);

  return {
    relative: formatRelativeTime(ms, referenceNow),
    fullRelative: formatFullRelativeTime(ms, referenceNow),
    formattedTime: time,
    formattedDate: date,
    formattedDateTime: `${date} ${time}`,
    isoString: new Date(ms).toISOString(),
    timestampMs: ms,
    raw,
  };
};

/** The label for a time column in the chosen mode: "2m ago", "10:32:15", or "2m ago · 10:32:15". */
export const formatTimeForMode = (info: TimeDisplayInfo, mode: TimeFormatMode): string => {
  // A time that could not be read has one form only: what the backend sent
  if (info.timestampMs === 0) return info.relative;
  if (mode === 'relative') return info.relative;
  if (mode === 'absolute') return info.formattedTime;
  return `${info.relative} · ${info.formattedTime}`;
};

/** Hover text for a time: how long ago, the local date and time, and the UTC instant. Repeats are dropped. */
export const formatTimeTooltip = (info: TimeDisplayInfo): string =>
  [...new Set([info.fullRelative, info.formattedDateTime, info.isoString].filter(Boolean))].join('\n');
