import type { DatabaseSync } from 'node:sqlite';
import { logAudit } from './auth.ts';
import { dispatchNotification } from './integrations.ts';

interface UpcomingClassForReminder {
  id: string;
  title: string;
  subject: string;
  topic: string;
  start_time_utc: string;
  duration_minutes: number;
  teacher_profile_id: string | null;
  join_url: string | null;
}

/**
 * Checks upcoming scheduled/rescheduled classes and dispatches deduplicated
 * 24-hour, 1-hour, and 15-minute reminders to both the teacher and enrolled learners.
 */
export async function processUpcomingClassReminders(db: DatabaseSync): Promise<number> {
  const nowMs = Date.now();
  const maxWindowIso = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  const classes = db
    .prepare(
      `SELECT cl.id, cl.title, cl.subject, cl.topic, cl.start_time_utc, cl.duration_minutes,
              tp.id AS teacher_profile_id, vm.join_url
       FROM classes cl
       LEFT JOIN teachers t ON t.id = cl.teacher_id
       LEFT JOIN profiles tp ON tp.id = t.profile_id
       LEFT JOIN video_meetings vm ON vm.class_id = cl.id AND vm.status = 'created'
       WHERE cl.status IN ('scheduled', 'rescheduled')
         AND cl.start_time_utc > ?
         AND cl.start_time_utc <= ?`
    )
    .all(nowIso, maxWindowIso) as unknown as UpcomingClassForReminder[];

  let sentCount = 0;

  for (const cls of classes) {
    const startMs = new Date(cls.start_time_utc).getTime();
    const diffMins = Math.round((startMs - nowMs) / 60000);
    if (diffMins <= 0) continue;

    let windowKey: '15m' | '1h' | '24h' | null = null;
    let label = '';
    if (diffMins <= 20) {
      windowKey = '15m';
      label = `starting in ${diffMins} minute${diffMins === 1 ? '' : 's'}`;
    } else if (diffMins <= 70) {
      windowKey = '1h';
      label = 'starting in ~1 hour';
    } else if (diffMins <= 24 * 60) {
      windowKey = '24h';
      label = 'coming up within 24 hours';
    }

    if (!windowKey) continue;

    const dedupeKey = `${cls.id}:${windowKey}`;
    const alreadySent = db
      .prepare(
        `SELECT id FROM audit_logs WHERE action = 'class_reminder_sent' AND entity_id = ? LIMIT 1`
      )
      .get(dedupeKey);
    if (alreadySent) continue;

    const recipientRows = db
      .prepare(
        `SELECT DISTINCT s.profile_id AS student_profile_id, pp.id AS parent_profile_id
         FROM class_participants cp
         JOIN students s ON s.id = cp.student_id
         LEFT JOIN parent_students ps ON ps.student_id = s.id
         LEFT JOIN parents pa ON pa.id = ps.parent_id
         LEFT JOIN profiles pp ON pp.id = pa.profile_id
         WHERE cp.class_id = ?`
      )
      .all(cls.id) as Array<{
      student_profile_id: string | null;
      parent_profile_id: string | null;
    }>;

    const recipientIds = new Set<string>();
    if (cls.teacher_profile_id) recipientIds.add(cls.teacher_profile_id);
    for (const r of recipientRows) {
      if (r.student_profile_id) recipientIds.add(r.student_profile_id);
      if (r.parent_profile_id) recipientIds.add(r.parent_profile_id);
    }

    const title = `Class Reminder: ${cls.title} (${label})`;
    const body = `${cls.subject}${cls.topic ? ` — ${cls.topic}` : ''} is ${label} at ${cls.start_time_utc}.${
      cls.join_url ? ` Join link: ${cls.join_url}` : ''
    }`;

    for (const uid of recipientIds) {
      await dispatchNotification(db, {
        userId: uid,
        eventType: 'class_reminder',
        title,
        body,
        linkPath: '/student',
        sendEmail: true,
      });
      sentCount++;
    }

    logAudit(db, cls.teacher_profile_id, 'class_reminder_sent', 'class', dedupeKey, {
      classId: cls.id,
      windowKey,
      recipientCount: recipientIds.size,
    });
  }

  return sentCount;
}
