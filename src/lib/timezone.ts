export const COMMON_TIMEZONES = [
  'Africa/Nairobi',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'UTC',
];

export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi';
  } catch {
    return 'Africa/Nairobi';
  }
}

export function formatUtcInTimezone(
  utcIso: string | null | undefined,
  timeZone: string,
  options: { includeDate?: boolean; includeTime?: boolean; includeTz?: boolean } = {}
): string {
  if (!utcIso) return '—';
  const { includeDate = true, includeTime = true, includeTz = true } = options;
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) return String(utcIso);

  const fmtOpts: Intl.DateTimeFormatOptions = {
    timeZone: timeZone || 'UTC',
  };
  if (includeDate) {
    fmtOpts.weekday = 'short';
    fmtOpts.year = 'numeric';
    fmtOpts.month = 'short';
    fmtOpts.day = 'numeric';
  }
  if (includeTime) {
    fmtOpts.hour = '2-digit';
    fmtOpts.minute = '2-digit';
  }
  if (includeTz) {
    fmtOpts.timeZoneName = 'short';
  }

  try {
    return new Intl.DateTimeFormat('en-GB', fmtOpts).format(date);
  } catch {
    return date.toISOString();
  }
}

export function formatCurrency(amount: number, currency: string): string {
  const num = Number(amount || 0);
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: currency === 'KES' ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

export function formatCountdown(utcIso: string): string {
  const target = new Date(utcIso).getTime();
  const diff = target - Date.now();
  if (diff <= 0) return 'In progress / Ready to join';
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `In ${days}d ${hours % 24}h`;
  if (hours > 0) return `In ${hours}h ${mins % 60}m`;
  return `Starts in ${mins} min`;
}

/**
 * Generates a standard 1-click Google Calendar "Add Event" link so teachers,
 * parents, and students can add any session directly to Google Calendar in 1 click.
 */
export function buildGoogleCalendarTemplateUrl(params: {
  title: string;
  startUtc: string;
  endUtc?: string;
  durationMinutes?: number;
  description?: string;
  location?: string;
}): string {
  const start = new Date(params.startUtc);
  if (Number.isNaN(start.getTime())) {
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  }
  const end = params.endUtc
    ? new Date(params.endUtc)
    : new Date(start.getTime() + (params.durationMinutes || 60) * 60000);

  const fmtCalUtc = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');

  const query = new URLSearchParams({
    action: 'TEMPLATE',
    text: params.title,
    dates: `${fmtCalUtc(start)}/${fmtCalUtc(end)}`,
  });
  if (params.description) query.set('details', params.description);
  if (params.location) query.set('location', params.location);

  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}
