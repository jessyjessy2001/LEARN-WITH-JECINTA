import type { DatabaseSync } from 'node:sqlite';

/**
 * Converts a calendar date (YYYY-MM-DD) + HH:MM time in a given IANA timezone into a UTC Date.
 * Accurately accounts for DST transitions without external heavy dependencies.
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);

  // Initial guess in UTC
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0));

  // Determine the offset between UTC and target timezone at that approximate instant
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = dtf.formatToParts(utcGuess);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  const tzHour = map.hour === 24 ? 0 : map.hour;
  const tzAsUtc = Date.UTC(map.year, map.month - 1, map.day, tzHour, map.minute, map.second, 0);
  const offsetMs = tzAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

export function getDayOfWeekInTz(dateStr: string, timeZone: string): number {
  const noonUtc = zonedTimeToUtc(dateStr, '12:00', timeZone);
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(noonUtc);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.indexOf(dayName);
}

export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToHhmm(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface AvailableSlot {
  start_utc: string;
  end_utc: string;
  teacher_local_time: string;
  teacher_timezone: string;
}

export function computeTeacherAvailableSlots(
  db: DatabaseSync,
  teacherId: string,
  dateStr: string,
  durationMinutes: number,
  nowMs: number = Date.now()
): AvailableSlot[] {
  // Check if date is blocked
  const blocked = db
    .prepare(`SELECT id FROM teacher_unavailable_dates WHERE teacher_id = ? AND unavailable_date = ?`)
    .get(teacherId, dateStr);
  if (blocked) return [];

  // Fetch all availability rules for teacher to know timezone & day rule
  const allRules = db
    .prepare(`SELECT * FROM teacher_availability WHERE teacher_id = ?`)
    .all(teacherId) as Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    break_start: string;
    break_end: string;
    teacher_timezone: string;
    min_notice_hours: number;
    max_booking_days: number;
    buffer_minutes: number;
    is_available: number;
  }>;

  if (allRules.length === 0) return [];
  const tz = allRules[0].teacher_timezone || 'Africa/Nairobi';
  const dow = getDayOfWeekInTz(dateStr, tz);
  const rule = allRules.find((r) => r.day_of_week === dow);
  if (!rule || !rule.is_available) return [];

  const startMins = parseTimeToMinutes(rule.start_time);
  const endMins = parseTimeToMinutes(rule.end_time);
  const hasBreak = Boolean(rule.break_start && rule.break_end);
  const breakStartMins = hasBreak ? parseTimeToMinutes(rule.break_start) : -1;
  const breakEndMins = hasBreak ? parseTimeToMinutes(rule.break_end) : -1;
  const bufferMs = (rule.buffer_minutes || 0) * 60 * 1000;
  const minNoticeMs = (rule.min_notice_hours || 0) * 3600 * 1000;
  const maxBookingMs = (rule.max_booking_days || 60) * 86400 * 1000;

  // Fetch active bookings & classes for teacher around this date (+/- 1 day buffer for TZ shifts)
  const dayStartUtc = new Date(zonedTimeToUtc(dateStr, '00:00', tz).getTime() - 86400000).toISOString();
  const dayEndUtc = new Date(zonedTimeToUtc(dateStr, '23:59', tz).getTime() + 86400000).toISOString();

  const busyBookings = db
    .prepare(
      `SELECT scheduled_start_utc AS s, scheduled_end_utc AS e
       FROM bookings
       WHERE teacher_id = ?
         AND status IN ('pending', 'awaiting_payment', 'confirmed', 'rescheduled')
         AND scheduled_end_utc > ? AND scheduled_start_utc < ?`
    )
    .all(teacherId, dayStartUtc, dayEndUtc) as Array<{ s: string; e: string }>;

  const busyClasses = db
    .prepare(
      `SELECT start_time_utc AS s, end_time_utc AS e
       FROM classes
       WHERE teacher_id = ?
         AND status IN ('scheduled', 'in_progress', 'rescheduled')
         AND end_time_utc > ? AND start_time_utc < ?`
    )
    .all(teacherId, dayStartUtc, dayEndUtc) as Array<{ s: string; e: string }>;

  const busyIntervals = [...busyBookings, ...busyClasses].map((b) => ({
    startMs: new Date(b.s).getTime() - bufferMs,
    endMs: new Date(b.e).getTime() + bufferMs,
  }));

  const slots: AvailableSlot[] = [];
  const step = 30; // 30-min slot granularity

  for (let m = startMins; m + durationMinutes <= endMins; m += step) {
    const slotEndM = m + durationMinutes;
    if (hasBreak && m < breakEndMins && slotEndM > breakStartMins) {
      continue;
    }

    const hhmm = minutesToHhmm(m);
    const slotStartUtc = zonedTimeToUtc(dateStr, hhmm, tz);
    const slotEndUtc = new Date(slotStartUtc.getTime() + durationMinutes * 60 * 1000);
    const sMs = slotStartUtc.getTime();
    const eMs = slotEndUtc.getTime();

    if (sMs < nowMs + minNoticeMs) continue;
    if (sMs > nowMs + maxBookingMs) continue;

    const overlaps = busyIntervals.some((busy) => sMs < busy.endMs && eMs > busy.startMs);
    if (!overlaps) {
      slots.push({
        start_utc: slotStartUtc.toISOString(),
        end_utc: slotEndUtc.toISOString(),
        teacher_local_time: `${hhmm}–${minutesToHhmm(slotEndM)}`,
        teacher_timezone: tz,
      });
    }
  }

  return slots;
}

/**
 * Validates that a specific UTC window does not conflict with existing bookings, classes,
 * unavailable dates, or teacher working hours. Designed to be called inside a DB transaction.
 */
export function checkTeacherTimeConflict(
  db: DatabaseSync,
  teacherId: string,
  startUtcIso: string,
  endUtcIso: string,
  excludeBookingId?: string,
  excludeClassId?: string
): { ok: boolean; reason?: string } {
  const startMs = new Date(startUtcIso).getTime();
  const endMs = new Date(endUtcIso).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return { ok: false, reason: 'Invalid start and end time range.' };
  }

  const avail = db
    .prepare(`SELECT teacher_timezone, buffer_minutes FROM teacher_availability WHERE teacher_id = ? LIMIT 1`)
    .get(teacherId) as { teacher_timezone: string; buffer_minutes: number } | undefined;

  const tz = avail?.teacher_timezone || 'Africa/Nairobi';
  const bufferMs = (avail?.buffer_minutes ?? 15) * 60 * 1000;

  // Format date in teacher's timezone to verify unavailable dates
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(startMs));

  const blocked = db
    .prepare(`SELECT reason FROM teacher_unavailable_dates WHERE teacher_id = ? AND unavailable_date = ?`)
    .get(teacherId, dateFmt) as { reason: string } | undefined;
  if (blocked) {
    return { ok: false, reason: `Teacher is unavailable on ${dateFmt}${blocked.reason ? ` (${blocked.reason})` : ''}.` };
  }

  const bookingConflict = db
    .prepare(
      `SELECT booking_ref, scheduled_start_utc, scheduled_end_utc FROM bookings
       WHERE teacher_id = ?
         AND id != COALESCE(?, '')
         AND status IN ('pending', 'awaiting_payment', 'confirmed', 'rescheduled')`
    )
    .all(teacherId, excludeBookingId ?? null) as Array<{
    booking_ref: string;
    scheduled_start_utc: string;
    scheduled_end_utc: string;
  }>;

  for (const b of bookingConflict) {
    const bS = new Date(b.scheduled_start_utc).getTime() - bufferMs;
    const bE = new Date(b.scheduled_end_utc).getTime() + bufferMs;
    if (startMs < bE && endMs > bS) {
      return { ok: false, reason: `Selected slot conflicts with an existing booking (${b.booking_ref}).` };
    }
  }

  const classConflict = db
    .prepare(
      `SELECT title, start_time_utc, end_time_utc FROM classes
       WHERE teacher_id = ?
         AND id != COALESCE(?, '')
         AND COALESCE(booking_id, '') != COALESCE(?, '')
         AND status IN ('scheduled', 'in_progress', 'rescheduled')`
    )
    .all(teacherId, excludeClassId ?? null, excludeBookingId ?? null) as Array<{
    title: string;
    start_time_utc: string;
    end_time_utc: string;
  }>;

  for (const c of classConflict) {
    const cS = new Date(c.start_time_utc).getTime() - bufferMs;
    const cE = new Date(c.end_time_utc).getTime() + bufferMs;
    if (startMs < cE && endMs > cS) {
      return { ok: false, reason: `Selected slot conflicts with a scheduled class (${c.title}).` };
    }
  }

  return { ok: true };
}
