/**
 * Utility functions for parsing timestamps and date strings across telemetry, traces, and incidents.
 */

export const parseDateTimeToMs = (dateStr?: string | null): number => {
  if (!dateStr) return 0;
  const trimmed = dateStr.trim();
  if (!trimmed) return 0;

  // 1. Full date format (e.g. "2026-08-31 10:32:15" or ISO)
  const normalizedIso = trimmed.includes(' ') && !trimmed.match(/\b(am|pm)\b/i)
    ? trimmed.replace(' ', 'T')
    : trimmed;
  const parsedDirect = Date.parse(normalizedIso);
  if (!isNaN(parsedDirect)) {
    return parsedDirect;
  }

  // 2. Time string e.g. "10:32:15", "10:32:15 AM", "2:30 PM"
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

  // 3. Fallback to Date.parse
  const fallback = Date.parse(trimmed);
  if (!isNaN(fallback)) return fallback;

  return 0;
};
