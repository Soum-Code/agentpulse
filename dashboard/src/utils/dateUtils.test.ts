import { describe, it, expect } from 'vitest';
import {
  parseDateTimeToMs,
  formatRelativeTime,
  formatFullRelativeTime,
  getTimeDisplayInfo,
  formatTimeForMode,
  formatTimeTooltip,
} from './dateUtils';

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('dateUtils', () => {
  const baseNow = new Date('2026-10-19T10:00:00.000Z').getTime();

  describe('parseDateTimeToMs', () => {
    it('reads a date-time with no zone as UTC, which is how the backend stores it', () => {
      // The shape /v1/traces sends: naive UTC, six fractional digits, no Z.
      const expected = Date.UTC(2026, 9, 21, 8, 44, 42, 963);
      expect(parseDateTimeToMs('2026-10-21T08:44:42.963349')).toBe(expected);
      expect(parseDateTimeToMs('2026-10-21 08:44:42.963')).toBe(expected);
    });

    it('takes a zoned timestamp as written', () => {
      expect(parseDateTimeToMs('2026-10-21T08:44:42Z')).toBe(Date.UTC(2026, 9, 21, 8, 44, 42));
      expect(parseDateTimeToMs('2026-10-21T14:14:42+05:30')).toBe(Date.UTC(2026, 9, 21, 8, 44, 42));
    });

    it('orders a time of day against other times of day', () => {
      expect(parseDateTimeToMs('10:32:15')).toBe((10 * 3600 + 32 * 60 + 15) * 1000);
      expect(parseDateTimeToMs('2:30 PM')).toBe((14 * 3600 + 30 * 60) * 1000);
      expect(parseDateTimeToMs('12:05 AM')).toBe(5 * 60 * 1000);
    });

    it('returns 0 for missing or unreadable input', () => {
      expect(parseDateTimeToMs(undefined)).toBe(0);
      expect(parseDateTimeToMs(null)).toBe(0);
      expect(parseDateTimeToMs('')).toBe(0);
      expect(parseDateTimeToMs('   ')).toBe(0);
      expect(parseDateTimeToMs('not a time')).toBe(0);
    });
  });

  describe('formatRelativeTime', () => {
    it('formats small second deltas', () => {
      expect(formatRelativeTime(baseNow - 2 * SEC, baseNow)).toBe('2s ago');
      expect(formatRelativeTime(baseNow - 15 * SEC, baseNow)).toBe('15s ago');
      expect(formatRelativeTime(baseNow - 59 * SEC, baseNow)).toBe('59s ago');
    });

    it('says "just now" for under a second', () => {
      expect(formatRelativeTime(baseNow - 500, baseNow)).toBe('just now');
      expect(formatRelativeTime(baseNow, baseNow)).toBe('just now');
    });

    it('formats minutes, hours and days', () => {
      expect(formatRelativeTime(baseNow - 3 * MIN, baseNow)).toBe('3m ago');
      expect(formatRelativeTime(baseNow - 2 * HOUR, baseNow)).toBe('2h ago');
      expect(formatRelativeTime(baseNow - DAY, baseNow)).toBe('yesterday');
      expect(formatRelativeTime(baseNow - 3 * DAY, baseNow)).toBe('3d ago');
    });

    it('never reads a month or a year as zero', () => {
      // 28 and 29 days used to fall between "weeks" and "months" and print "0mo ago".
      expect(formatRelativeTime(baseNow - 28 * DAY, baseNow)).toBe('4w ago');
      expect(formatRelativeTime(baseNow - 29 * DAY, baseNow)).toBe('4w ago');
      expect(formatRelativeTime(baseNow - 30 * DAY, baseNow)).toBe('1mo ago');
      // 360 to 364 days likewise printed "0y ago".
      expect(formatRelativeTime(baseNow - 364 * DAY, baseNow)).toBe('12mo ago');
      expect(formatRelativeTime(baseNow - 365 * DAY, baseNow)).toBe('1y ago');
      expect(formatRelativeTime(baseNow - 800 * DAY, baseNow)).toBe('2y ago');
    });

    it('treats a few seconds of clock drift as "just now"', () => {
      expect(formatRelativeTime(baseNow + 5 * SEC, baseNow)).toBe('just now');
      expect(formatRelativeTime(baseNow + MIN, baseNow)).toBe('just now');
    });

    it('does not call a time hours in the future "just now"', () => {
      const future = baseNow + 3 * HOUR;
      const label = formatRelativeTime(future, baseNow);
      expect(label).not.toBe('just now');
      expect(label).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('reads a backend timestamp as UTC, whatever zone the browser is in', () => {
      const now = Date.UTC(2026, 9, 21, 8, 45, 42);
      expect(formatRelativeTime('2026-10-21T08:44:42.963349', now)).toBe('59s ago');
      expect(formatRelativeTime('2026-10-21T07:44:42', now)).toBe('1h ago');
    });

    it('gives N/A for missing or unreadable input', () => {
      expect(formatRelativeTime(undefined, baseNow)).toBe('N/A');
      expect(formatRelativeTime(null, baseNow)).toBe('N/A');
      expect(formatRelativeTime('', baseNow)).toBe('N/A');
      expect(formatRelativeTime('garbage', baseNow)).toBe('N/A');
    });

    it('accepts a Date and a number as well as a string', () => {
      expect(formatRelativeTime(new Date(baseNow - 2 * MIN), baseNow)).toBe('2m ago');
      expect(formatRelativeTime(baseNow - 2 * MIN, baseNow)).toBe('2m ago');
    });
  });

  describe('formatFullRelativeTime', () => {
    it('formats full descriptive relative text', () => {
      expect(formatFullRelativeTime(baseNow - 2 * SEC, baseNow)).toBe('2 seconds ago');
      expect(formatFullRelativeTime(baseNow - 1 * SEC, baseNow)).toBe('1 second ago');
      expect(formatFullRelativeTime(baseNow - MIN, baseNow)).toBe('1 minute ago');
      expect(formatFullRelativeTime(baseNow - 2 * MIN, baseNow)).toBe('2 minutes ago');
      expect(formatFullRelativeTime(baseNow - HOUR, baseNow)).toBe('1 hour ago');
      expect(formatFullRelativeTime(baseNow - 2 * DAY, baseNow)).toBe('2 days ago');
      expect(formatFullRelativeTime(baseNow - 14 * DAY, baseNow)).toBe('2 weeks ago');
      expect(formatFullRelativeTime(baseNow - 29 * DAY, baseNow)).toBe('4 weeks ago');
      expect(formatFullRelativeTime(baseNow - 364 * DAY, baseNow)).toBe('12 months ago');
      expect(formatFullRelativeTime(baseNow - 365 * DAY, baseNow)).toBe('1 year ago');
    });

    it('gives N/A for missing input', () => {
      expect(formatFullRelativeTime(undefined, baseNow)).toBe('N/A');
    });
  });

  describe('getTimeDisplayInfo', () => {
    it('returns complete structured display info for tooltips and columns', () => {
      const ts = baseNow - 2 * SEC;
      const info = getTimeDisplayInfo(ts, baseNow);
      expect(info.relative).toBe('2s ago');
      expect(info.fullRelative).toBe('2 seconds ago');
      expect(info.timestampMs).toBe(ts);
      expect(info.isoString).toBe('2026-10-19T09:59:58.000Z');

      // The clock and date are the viewer's local ones, so compare with Date's own local getters.
      const d = new Date(ts);
      const pad = (n: number) => n.toString().padStart(2, '0');
      expect(info.formattedTime).toBe(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
      expect(info.formattedDate).toBe(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      expect(info.formattedDateTime).toBe(`${info.formattedDate} ${info.formattedTime}`);
    });

    it('passes unreadable input through as written and invents no time', () => {
      const info = getTimeDisplayInfo('garbage', baseNow);
      expect(info.relative).toBe('garbage');
      expect(info.fullRelative).toBe('garbage');
      expect(info.isoString).toBe('');
      expect(info.timestampMs).toBe(0);
    });

    it('does not turn a time of day into a real instant', () => {
      // "10:32:15" has no date, so there is no honest "x ago" for it.
      const info = getTimeDisplayInfo('10:32:15', baseNow);
      expect(info.relative).toBe('10:32:15');
      expect(info.isoString).toBe('');
    });

    it('shows N/A for a missing timestamp', () => {
      const info = getTimeDisplayInfo(undefined, baseNow);
      expect(info.relative).toBe('N/A');
      expect(info.formattedTime).toBe('--:--:--');
      expect(info.timestampMs).toBe(0);
    });
  });

  describe('formatTimeForMode', () => {
    it('picks the label for each mode', () => {
      const info = getTimeDisplayInfo(baseNow - 2 * MIN, baseNow);
      expect(formatTimeForMode(info, 'relative')).toBe('2m ago');
      expect(formatTimeForMode(info, 'absolute')).toBe(info.formattedTime);
      expect(formatTimeForMode(info, 'dual')).toBe(`2m ago · ${info.formattedTime}`);
    });

    it('shows an unreadable time once, whatever the mode', () => {
      const info = getTimeDisplayInfo('garbage', baseNow);
      expect(formatTimeForMode(info, 'relative')).toBe('garbage');
      expect(formatTimeForMode(info, 'absolute')).toBe('garbage');
      expect(formatTimeForMode(info, 'dual')).toBe('garbage');
      expect(formatTimeForMode(getTimeDisplayInfo(undefined, baseNow), 'dual')).toBe('N/A');
    });
  });

  describe('formatTimeTooltip', () => {
    it('lists the long relative time, the local date-time and the UTC instant', () => {
      const info = getTimeDisplayInfo(baseNow - 2 * MIN, baseNow);
      expect(formatTimeTooltip(info).split('\n')).toEqual([
        '2 minutes ago',
        info.formattedDateTime,
        '2026-10-19T09:58:00.000Z',
      ]);
    });

    it('does not repeat unreadable input three times', () => {
      expect(formatTimeTooltip(getTimeDisplayInfo('garbage', baseNow))).toBe('garbage');
    });
  });
});
