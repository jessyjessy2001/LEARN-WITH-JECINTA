import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { newId } from '../db.ts';
import {
  hashPassword,
  logAudit,
  requireAuth,
  requireRoles,
  type AuthedRequest,
} from '../auth.ts';
import { checkTeacherTimeConflict } from '../availability.ts';
import {
  cancelZoomMeeting,
  createGoogleMeetCalendarEvent,
  createZoomMeeting,
  deleteGoogleCalendarEvent,
  dispatchNotification,
  fetchGoogleMeetConferenceRecords,
  fetchZoomMeetingRecordings,
  generateGeminiLessonSummary,
  isGeminiConfigured,
  isSmtpConfigured,
  isZoomConfigured,
  provisionClassVideoMeeting,
  updateGoogleCalendarEvent,
  updateZoomMeeting,
} from '../integrations.ts';

export function createAdminRouter(db: DatabaseSync): Router {
  const router = Router();
  const auth = requireAuth(db);
  const staffOnly = requireRoles(['admin', 'teacher']);
  const adminOnly = requireRoles(['admin']);

  router.use(auth, staffOnly);

  // ======================== 1. OVERVIEW & LIVE KPIs ========================
  router.get('/overview', (req: AuthedRequest, res) => {
    const teacherFilter =
      req.user!.role === 'teacher' && req.user!.teacher_id ? req.user!.teacher_id : null;

    const totalStudents = (
      db.prepare(`SELECT COUNT(*) AS c FROM students`).get() as { c: number }
    ).c;
    const activeStudents = (
      db.prepare(`SELECT COUNT(*) AS c FROM students WHERE status = 'active'`).get() as { c: number }
    ).c;
    const totalParents = (
      db.prepare(`SELECT COUNT(*) AS c FROM parents`).get() as { c: number }
    ).c;

    const nowIso = new Date().toISOString();
    const upcomingClassesCount = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM classes
           WHERE status IN ('scheduled', 'in_progress', 'rescheduled')
             AND end_time_utc >= ?
             ${teacherFilter ? 'AND teacher_id = ?' : ''}`
        )
        .get(...(teacherFilter ? [nowIso, teacherFilter] : [nowIso])) as { c: number }
    ).c;

    const completedClassesCount = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM classes WHERE status = 'completed' ${
            teacherFilter ? 'AND teacher_id = ?' : ''
          }`
        )
        .get(...(teacherFilter ? [teacherFilter] : [])) as { c: number }
    ).c;

    const pendingBookingsCount = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM bookings WHERE status IN ('pending', 'awaiting_payment')`
        )
        .get() as { c: number }
    ).c;

    const pendingPaymentsCount = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM payments WHERE status IN ('pending', 'submitted')`)
        .get() as { c: number }
    ).c;

    const outstandingBalances = db
      .prepare(
        `SELECT currency, ROUND(SUM(total_amount - amount_paid), 2) AS balance
         FROM invoices
         WHERE status IN ('pending', 'submitted', 'partially_paid', 'overdue')
         GROUP BY currency`
      )
      .all();

    const assignmentsAwaitingReview = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM assignment_submissions WHERE status IN ('submitted', 'late')`
        )
        .get() as { c: number }
    ).c;

    const upcomingClasses = db
      .prepare(
        `SELECT cl.*, c.title AS course_title,
                tp.full_name AS teacher_name, tp.timezone AS teacher_timezone,
                vm.provider AS video_provider,
                CASE WHEN cl.status IN ('completed', 'cancelled') THEN NULL ELSE vm.join_url END AS join_url,
                vm.host_url, vm.status AS meeting_status,
                CASE WHEN cl.status IN ('completed', 'cancelled') THEN 1 ELSE 0 END AS meeting_locked,
                b.status AS booking_status, b.user_timezone AS student_timezone_booking,
                (SELECT GROUP_CONCAT(s.full_name, ', ')
                 FROM class_participants cp2
                 JOIN students s ON s.id = cp2.student_id
                 WHERE cp2.class_id = cl.id) AS student_names,
                (SELECT s.timezone
                 FROM class_participants cp2
                 JOIN students s ON s.id = cp2.student_id
                 WHERE cp2.class_id = cl.id LIMIT 1) AS student_timezone,
                (SELECT pr.full_name
                 FROM class_participants cp2
                 JOIN parent_students ps ON ps.student_id = cp2.student_id
                 JOIN parents par ON par.id = ps.parent_id
                 JOIN profiles pr ON pr.id = par.profile_id
                 WHERE cp2.class_id = cl.id LIMIT 1) AS parent_name,
                (SELECT inv.status
                 FROM invoices inv
                 WHERE inv.booking_id = cl.booking_id LIMIT 1) AS payment_status
         FROM classes cl
         JOIN courses c ON c.id = cl.course_id
         LEFT JOIN teachers t ON t.id = cl.teacher_id
         LEFT JOIN profiles tp ON tp.id = t.profile_id
         LEFT JOIN video_meetings vm ON vm.class_id = cl.id AND vm.status != 'cancelled'
         LEFT JOIN bookings b ON b.id = cl.booking_id
         WHERE cl.status IN ('scheduled', 'in_progress', 'rescheduled')
           AND cl.end_time_utc >= ?
           ${teacherFilter ? 'AND cl.teacher_id = ?' : ''}
         ORDER BY cl.start_time_utc ASC
         LIMIT 20`
      )
      .all(...(teacherFilter ? [nowIso, teacherFilter] : [nowIso]));

    res.json({
      stats: {
        totalStudents,
        activeStudents,
        totalParents,
        upcomingClasses: upcomingClassesCount,
        completedClasses: completedClassesCount,
        pendingBookings: pendingBookingsCount,
        pendingPayments: pendingPaymentsCount,
        outstandingBalances,
        assignmentsAwaitingReview,
      },
      nextClass: upcomingClasses[0] || null,
      upcomingClasses,
    });
  });

  // ======================== 2. STUDENTS, PARENTS, TEACHERS, ENROLMENTS ========================
  router.get('/students', (_req, res) => {
    const students = db
      .prepare(
        `SELECT s.*, tp.full_name AS teacher_name, sp.email AS student_login_email,
                (SELECT GROUP_CONCAT(pr.full_name, ', ')
                 FROM parent_students ps
                 JOIN parents pa ON pa.id = ps.parent_id
                 JOIN profiles pr ON pr.id = pa.profile_id
                 WHERE ps.student_id = s.id) AS parent_names,
                (SELECT GROUP_CONCAT(pr.email, ', ')
                 FROM parent_students ps
                 JOIN parents pa ON pa.id = ps.parent_id
                 JOIN profiles pr ON pr.id = pa.profile_id
                 WHERE ps.student_id = s.id) AS parent_emails,
                (SELECT GROUP_CONCAT(c.subject, ', ')
                 FROM enrolments e
                 JOIN courses c ON c.id = e.course_id
                 WHERE e.student_id = s.id AND e.status = 'active') AS enrolled_subjects
         FROM students s
         LEFT JOIN teachers t ON t.id = s.teacher_id
         LEFT JOIN profiles tp ON tp.id = t.profile_id
         LEFT JOIN profiles sp ON sp.id = s.profile_id
         ORDER BY s.created_at DESC`
      )
      .all();
    res.json({ students });
  });

  router.post('/students', (req: AuthedRequest, res) => {
    const {
      fullName,
      gradeLevel,
      age,
      country = 'Kenya',
      timezone = 'Africa/Nairobi',
      curriculumSystem = 'CBC / IGCSE',
      learningGoals = '',
      learningPreferences = '',
      privateTeacherObservations = '',
      parentId = '',
      teacherId = '',
      studentEmail = '',
      studentPassword = '',
    } = req.body || {};

    if (!fullName || !gradeLevel) {
      return res.status(400).json({ error: 'Student full name and grade level are required.' });
    }

    const primaryTeacher = db
      .prepare(`SELECT id FROM teachers WHERE is_primary = 1 LIMIT 1`)
      .get() as { id: string } | undefined;
    const assignedTeacherId = teacherId || req.user!.teacher_id || primaryTeacher?.id || null;

    let studentProfileId: string | null = null;
    if (studentEmail && studentPassword) {
      const norm = String(studentEmail).trim().toLowerCase();
      const exists = db.prepare(`SELECT id FROM profiles WHERE email = ?`).get(norm);
      if (exists) return res.status(409).json({ error: 'Student email already exists.' });
      studentProfileId = newId();
      db.prepare(
        `INSERT INTO profiles (id, email, password_hash, full_name, role, country, timezone)
         VALUES (?, ?, ?, ?, 'student', ?, ?)`
      ).run(
        studentProfileId,
        norm,
        hashPassword(String(studentPassword)),
        String(fullName).trim(),
        country,
        timezone
      );
    }

    const studentId = newId();
    db.prepare(
      `INSERT INTO students
       (id, profile_id, teacher_id, full_name, age, grade_level, curriculum_system, country, timezone, learning_goals, learning_preferences, private_teacher_observations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      studentId,
      studentProfileId,
      assignedTeacherId,
      String(fullName).trim(),
      age ? Number(age) : null,
      String(gradeLevel).trim(),
      curriculumSystem,
      country,
      timezone,
      learningGoals,
      learningPreferences,
      privateTeacherObservations
    );

    if (parentId) {
      db.prepare(
        `INSERT OR IGNORE INTO parent_students (id, parent_id, student_id) VALUES (?, ?, ?)`
      ).run(newId(), parentId, studentId);
    }

    logAudit(db, req.user!.id, 'student_created', 'student', studentId, { fullName });
    res.status(201).json({ student: db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId) });
  });

  router.patch('/students/:id', (req: AuthedRequest, res) => {
    const {
      fullName,
      gradeLevel,
      country,
      timezone,
      learningGoals,
      learningPreferences,
      privateTeacherObservations,
      status,
      teacherId,
    } = req.body || {};

    db.prepare(
      `UPDATE students
       SET full_name = COALESCE(NULLIF(?, ''), full_name),
           grade_level = COALESCE(NULLIF(?, ''), grade_level),
           country = COALESCE(NULLIF(?, ''), country),
           timezone = COALESCE(NULLIF(?, ''), timezone),
           learning_goals = COALESCE(?, learning_goals),
           learning_preferences = COALESCE(?, learning_preferences),
           private_teacher_observations = COALESCE(?, private_teacher_observations),
           status = COALESCE(NULLIF(?, ''), status),
           teacher_id = COALESCE(NULLIF(?, ''), teacher_id),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      fullName || '',
      gradeLevel || '',
      country || '',
      timezone || '',
      learningGoals ?? null,
      learningPreferences ?? null,
      privateTeacherObservations ?? null,
      status || '',
      teacherId || '',
      req.params.id
    );

    logAudit(db, req.user!.id, 'student_updated', 'student', req.params.id);
    res.json({ student: db.prepare(`SELECT * FROM students WHERE id = ?`).get(req.params.id) });
  });

  router.get('/students/:id/detail', (req, res) => {
    const student = db.prepare(`SELECT * FROM students WHERE id = ?`).get(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const enrolments = db
      .prepare(
        `SELECT e.*, c.title AS course_title, c.subject
         FROM enrolments e JOIN courses c ON c.id = e.course_id
         WHERE e.student_id = ?`
      )
      .all(req.params.id);

    const classes = db
      .prepare(
        `SELECT cl.*, cp.attendance_status AS student_attendance
         FROM class_participants cp
         JOIN classes cl ON cl.id = cp.class_id
         WHERE cp.student_id = ?
         ORDER BY cl.start_time_utc DESC`
      )
      .all(req.params.id);

    const submissions = db
      .prepare(
        `SELECT sub.*, a.title AS assignment_title, a.max_marks
         FROM assignment_submissions sub
         JOIN assignments a ON a.id = sub.assignment_id
         WHERE sub.student_id = ?
         ORDER BY sub.submitted_at DESC`
      )
      .all(req.params.id);

    res.json({ student, enrolments, classes, submissions });
  });

  router.get('/parents', (_req, res) => {
    const parents = db
      .prepare(
        `SELECT pa.*, pr.full_name, pr.email, pr.phone, pr.country, pr.timezone,
                (SELECT COUNT(*) FROM parent_students ps WHERE ps.parent_id = pa.id) AS children_count,
                (SELECT GROUP_CONCAT(s.full_name, ', ')
                 FROM parent_students ps JOIN students s ON s.id = ps.student_id
                 WHERE ps.parent_id = pa.id) AS children_names
         FROM parents pa
         JOIN profiles pr ON pr.id = pa.profile_id
         ORDER BY pa.created_at DESC`
      )
      .all();
    res.json({ parents });
  });

  router.get('/teachers', (_req, res) => {
    const teachers = db
      .prepare(
        `SELECT t.*, pr.full_name, pr.email, pr.phone, pr.country, pr.timezone
         FROM teachers t
         JOIN profiles pr ON pr.id = t.profile_id
         ORDER BY t.is_primary DESC, pr.full_name ASC`
      )
      .all();
    res.json({ teachers });
  });

  router.post('/teachers', adminOnly, (req: AuthedRequest, res) => {
    const {
      fullName,
      email,
      password,
      title = 'Subject Tutor',
      bio = '',
      qualifications = '',
      subjects = ['Mathematics'],
      timezone = 'Africa/Nairobi',
    } = req.body || {};

    if (!fullName || !email || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'Name, email, and 8+ character password are required.' });
    }
    const normEmail = String(email).trim().toLowerCase();
    if (db.prepare(`SELECT id FROM profiles WHERE email = ?`).get(normEmail)) {
      return res.status(409).json({ error: 'Email already exists.' });
    }

    const profileId = newId();
    const teacherId = newId();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO profiles (id, email, password_hash, full_name, role, timezone)
         VALUES (?, ?, ?, ?, 'teacher', ?)`
      ).run(profileId, normEmail, hashPassword(String(password)), String(fullName).trim(), timezone);

      db.prepare(
        `INSERT INTO teachers (id, profile_id, title, bio, qualifications, subjects_json, is_primary, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1)`
      ).run(teacherId, profileId, title, bio, qualifications, JSON.stringify(subjects));

      // Default availability Mon-Fri 09:00-17:00
      for (let d = 1; d <= 5; d++) {
        db.prepare(
          `INSERT INTO teacher_availability (id, teacher_id, day_of_week, start_time, end_time, teacher_timezone, is_available)
           VALUES (?, ?, ?, '09:00', '17:00', ?, 1)`
        ).run(newId(), teacherId, d, timezone);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    logAudit(db, req.user!.id, 'teacher_added', 'teacher', teacherId, { fullName, email: normEmail });
    res.status(201).json({ teacherId });
  });

  router.post('/enrolments', (req: AuthedRequest, res) => {
    const { studentId, courseId, teacherId } = req.body || {};
    if (!studentId || !courseId) {
      return res.status(400).json({ error: 'Student and course are required.' });
    }
    const id = newId();
    db.prepare(
      `INSERT OR REPLACE INTO enrolments (id, student_id, course_id, teacher_id, status)
       VALUES (?, ?, ?, ?, 'active')`
    ).run(id, studentId, courseId, teacherId || req.user!.teacher_id || null);
    logAudit(db, req.user!.id, 'student_enrolled', 'enrolment', id, { studentId, courseId });
    res.status(201).json({ id });
  });

  // ======================== 3. COURSES & CURRICULUM ========================
  router.get('/courses', (_req, res) => {
    const courses = db.prepare(`SELECT * FROM courses ORDER BY subject ASC, title ASC`).all() as Array<
      Record<string, unknown>
    >;
    const modules = db.prepare(`SELECT * FROM curriculum_modules ORDER BY sort_order ASC`).all() as Array<
      Record<string, unknown>
    >;
    const lessons = db.prepare(`SELECT * FROM curriculum_lessons ORDER BY sort_order ASC`).all() as Array<
      Record<string, unknown>
    >;

    const full = courses.map((c) => ({
      ...c,
      modules: modules
        .filter((m) => m.course_id === c.id)
        .map((m) => ({
          ...m,
          lessons: lessons.filter((l) => l.module_id === m.id),
        })),
    }));
    res.json({ courses: full });
  });

  router.post('/courses', adminOnly, (req: AuthedRequest, res) => {
    const {
      title,
      subject,
      description,
      ageOrGradeRange,
      learningLevel,
      durationWeeks = 12,
      sessionDurationMinutes = 60,
      learningObjectives,
      learningOutcomes,
      priceKes = 2500,
      priceUsd = 25,
      priceGbp = 20,
      priceEur = 23,
      pricingType = 'per_lesson',
      status = 'published',
    } = req.body || {};

    if (!title || !subject || !description) {
      return res.status(400).json({ error: 'Title, subject, and description are required.' });
    }

    const id = newId();
    const slug =
      String(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') +
      '-' +
      id.slice(0, 6);

    db.prepare(
      `INSERT INTO courses
       (id, teacher_id, title, slug, subject, description, age_or_grade_range, learning_level, duration_weeks, session_duration_minutes, learning_objectives, learning_outcomes, price_kes, price_usd, price_gbp, price_eur, pricing_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      req.user!.teacher_id || null,
      title,
      slug,
      subject,
      description,
      ageOrGradeRange || 'Grades 1–8',
      learningLevel || 'All Levels',
      Number(durationWeeks),
      Number(sessionDurationMinutes),
      learningObjectives || description,
      learningOutcomes || description,
      Number(priceKes),
      Number(priceUsd),
      Number(priceGbp),
      Number(priceEur),
      pricingType,
      status
    );

    logAudit(db, req.user!.id, 'course_created', 'course', id, { title });
    res.status(201).json({ course: db.prepare(`SELECT * FROM courses WHERE id = ?`).get(id) });
  });

  router.patch('/courses/:id', adminOnly, (req: AuthedRequest, res) => {
    const {
      title,
      description,
      ageOrGradeRange,
      learningLevel,
      priceKes,
      priceUsd,
      priceGbp,
      priceEur,
      status,
      learningObjectives,
      learningOutcomes,
    } = req.body || {};

    db.prepare(
      `UPDATE courses
       SET title = COALESCE(NULLIF(?, ''), title),
           description = COALESCE(NULLIF(?, ''), description),
           age_or_grade_range = COALESCE(NULLIF(?, ''), age_or_grade_range),
           learning_level = COALESCE(NULLIF(?, ''), learning_level),
           learning_objectives = COALESCE(NULLIF(?, ''), learning_objectives),
           learning_outcomes = COALESCE(NULLIF(?, ''), learning_outcomes),
           price_kes = COALESCE(?, price_kes),
           price_usd = COALESCE(?, price_usd),
           price_gbp = COALESCE(?, price_gbp),
           price_eur = COALESCE(?, price_eur),
           status = COALESCE(NULLIF(?, ''), status),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      title || '',
      description || '',
      ageOrGradeRange || '',
      learningLevel || '',
      learningObjectives || '',
      learningOutcomes || '',
      priceKes !== undefined ? Number(priceKes) : null,
      priceUsd !== undefined ? Number(priceUsd) : null,
      priceGbp !== undefined ? Number(priceGbp) : null,
      priceEur !== undefined ? Number(priceEur) : null,
      status || '',
      req.params.id
    );

    logAudit(db, req.user!.id, 'course_updated', 'course', req.params.id);
    res.json({ course: db.prepare(`SELECT * FROM courses WHERE id = ?`).get(req.params.id) });
  });

  router.post('/modules', adminOnly, (req, res) => {
    const { courseId, title, description = '', sortOrder = 1, status = 'published' } = req.body || {};
    if (!courseId || !title) return res.status(400).json({ error: 'Course and title required.' });
    const id = newId();
    db.prepare(
      `INSERT INTO curriculum_modules (id, course_id, title, description, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, courseId, title, description, Number(sortOrder), status);
    res.status(201).json({ module: db.prepare(`SELECT * FROM curriculum_modules WHERE id = ?`).get(id) });
  });

  router.patch('/modules/:id', adminOnly, (req, res) => {
    const { title, description, sortOrder, status } = req.body || {};
    db.prepare(
      `UPDATE curriculum_modules
       SET title = COALESCE(NULLIF(?, ''), title),
           description = COALESCE(?, description),
           sort_order = COALESCE(?, sort_order),
           status = COALESCE(NULLIF(?, ''), status),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(title || '', description ?? null, sortOrder ?? null, status || '', req.params.id);
    res.json({ ok: true });
  });

  router.post('/lessons', adminOnly, (req, res) => {
    const {
      moduleId,
      title,
      topic,
      learningObjectives = '',
      skillsCovered = '',
      sortOrder = 1,
      status = 'published',
    } = req.body || {};
    if (!moduleId || !title || !topic) {
      return res.status(400).json({ error: 'Module, title, and topic are required.' });
    }
    const id = newId();
    db.prepare(
      `INSERT INTO curriculum_lessons (id, module_id, title, topic, learning_objectives, skills_covered, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, moduleId, title, topic, learningObjectives, skillsCovered, Number(sortOrder), status);
    res.status(201).json({ lesson: db.prepare(`SELECT * FROM curriculum_lessons WHERE id = ?`).get(id) });
  });

  router.patch('/lessons/:id', adminOnly, (req, res) => {
    const { title, topic, learningObjectives, skillsCovered, sortOrder, status } = req.body || {};
    db.prepare(
      `UPDATE curriculum_lessons
       SET title = COALESCE(NULLIF(?, ''), title),
           topic = COALESCE(NULLIF(?, ''), topic),
           learning_objectives = COALESCE(?, learning_objectives),
           skills_covered = COALESCE(?, skills_covered),
           sort_order = COALESCE(?, sort_order),
           status = COALESCE(NULLIF(?, ''), status),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      title || '',
      topic || '',
      learningObjectives ?? null,
      skillsCovered ?? null,
      sortOrder ?? null,
      status || '',
      req.params.id
    );
    res.json({ ok: true });
  });

  // ======================== 4. AVAILABILITY & BOOKINGS ========================
  router.get('/availability', (req: AuthedRequest, res) => {
    const teacherId = String(req.query.teacherId || req.user!.teacher_id || '');
    const rules = db
      .prepare(`SELECT * FROM teacher_availability WHERE teacher_id = ? ORDER BY day_of_week ASC`)
      .all(teacherId);
    const unavailableDates = db
      .prepare(`SELECT * FROM teacher_unavailable_dates WHERE teacher_id = ? ORDER BY unavailable_date ASC`)
      .all(teacherId);
    res.json({ teacherId, rules, unavailableDates });
  });

  router.put('/availability', (req: AuthedRequest, res) => {
    const { teacherId, rules } = req.body || {};
    const targetTeacher = teacherId || req.user!.teacher_id;
    if (!targetTeacher || !Array.isArray(rules)) {
      return res.status(400).json({ error: 'teacherId and rules array are required.' });
    }

    const stmt = db.prepare(
      `INSERT INTO teacher_availability
       (id, teacher_id, day_of_week, start_time, end_time, break_start, break_end, teacher_timezone, min_notice_hours, max_booking_days, buffer_minutes, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(teacher_id, day_of_week) DO UPDATE SET
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         break_start = excluded.break_start,
         break_end = excluded.break_end,
         teacher_timezone = excluded.teacher_timezone,
         min_notice_hours = excluded.min_notice_hours,
         max_booking_days = excluded.max_booking_days,
         buffer_minutes = excluded.buffer_minutes,
         is_available = excluded.is_available,
         updated_at = datetime('now')`
    );

    for (const r of rules) {
      stmt.run(
        newId(),
        targetTeacher,
        Number(r.day_of_week),
        r.start_time,
        r.end_time,
        r.break_start || '',
        r.break_end || '',
        r.teacher_timezone || 'Africa/Nairobi',
        Number(r.min_notice_hours ?? 6),
        Number(r.max_booking_days ?? 60),
        Number(r.buffer_minutes ?? 15),
        r.is_available ? 1 : 0
      );
    }

    logAudit(db, req.user!.id, 'availability_updated', 'teacher', targetTeacher);
    res.json({ ok: true });
  });

  router.post('/unavailable-dates', (req: AuthedRequest, res) => {
    const { teacherId, unavailableDate, reason = '' } = req.body || {};
    const target = teacherId || req.user!.teacher_id;
    if (!target || !unavailableDate) {
      return res.status(400).json({ error: 'Date is required.' });
    }
    const id = newId();
    db.prepare(
      `INSERT OR IGNORE INTO teacher_unavailable_dates (id, teacher_id, unavailable_date, reason)
       VALUES (?, ?, ?, ?)`
    ).run(id, target, unavailableDate, reason);
    res.status(201).json({ id });
  });

  router.delete('/unavailable-dates/:id', (req, res) => {
    db.prepare(`DELETE FROM teacher_unavailable_dates WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  router.get('/bookings', (_req, res) => {
    const bookings = db
      .prepare(
        `SELECT b.*, c.title AS course_title, c.subject, tp.full_name AS teacher_name
         FROM bookings b
         JOIN courses c ON c.id = b.course_id
         LEFT JOIN teachers t ON t.id = b.teacher_id
         LEFT JOIN profiles tp ON tp.id = t.profile_id
         ORDER BY b.created_at DESC`
      )
      .all();
    res.json({ bookings });
  });

  // Confirm / Reject / Cancel / Reschedule a booking
  router.post('/bookings/:id/status', async (req: AuthedRequest, res) => {
    const { status, newStartUtc } = req.body || {};
    const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id) as
      | Record<string, any>
      | undefined;
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const allowed = ['pending', 'awaiting_payment', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid booking status.' });
    }

    let startUtc = String(booking.scheduled_start_utc);
    let endUtc = String(booking.scheduled_end_utc);
    if (newStartUtc) {
      const sMs = new Date(newStartUtc).getTime();
      if (Number.isNaN(sMs)) return res.status(400).json({ error: 'Invalid newStartUtc.' });
      startUtc = new Date(sMs).toISOString();
      endUtc = new Date(sMs + Number(booking.duration_minutes) * 60000).toISOString();
    }

    let createdClassId: string | null = null;

    db.exec('BEGIN IMMEDIATE');
    try {
      if (status === 'confirmed' || status === 'rescheduled') {
        const conflict = checkTeacherTimeConflict(
          db,
          String(booking.teacher_id),
          startUtc,
          endUtc,
          String(booking.id)
        );
        if (!conflict.ok) {
          db.exec('ROLLBACK');
          return res.status(409).json({ error: conflict.reason });
        }
      }

      db.prepare(
        `UPDATE bookings
         SET status = ?, scheduled_start_utc = ?, scheduled_end_utc = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(status, startUtc, endUtc, booking.id);

      if (status === 'confirmed') {
        const existingCls = db
          .prepare(`SELECT id FROM classes WHERE booking_id = ?`)
          .get(booking.id) as { id: string } | undefined;

        if (existingCls) {
          createdClassId = existingCls.id;
        } else {
          const course = db
            .prepare(`SELECT title, subject FROM courses WHERE id = ?`)
            .get(booking.course_id) as { title: string; subject: string };

          // Ensure student record exists or link it
          let studentId = booking.student_id ? String(booking.student_id) : null;
          if (!studentId) {
            studentId = newId();
            db.prepare(
              `INSERT INTO students (id, teacher_id, full_name, grade_level, timezone, status)
               VALUES (?, ?, ?, ?, ?, 'active')`
            ).run(
              studentId,
              booking.teacher_id,
              booking.learner_name,
              booking.learner_age_grade || 'Unspecified Grade',
              booking.user_timezone
            );
            db.prepare(`UPDATE bookings SET student_id = ? WHERE id = ?`).run(studentId, booking.id);
            if (booking.parent_id) {
              db.prepare(
                `INSERT OR IGNORE INTO parent_students (id, parent_id, student_id) VALUES (?, ?, ?)`
              ).run(newId(), booking.parent_id, studentId);
            }
          }

          db.prepare(
            `INSERT OR IGNORE INTO enrolments (id, student_id, course_id, teacher_id, status)
             VALUES (?, ?, ?, ?, 'active')`
          ).run(newId(), studentId, booking.course_id, booking.teacher_id);

          createdClassId = newId();
          db.prepare(
            `INSERT INTO classes
             (id, booking_id, course_id, teacher_id, title, subject, topic, start_time_utc, end_time_utc, duration_minutes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`
          ).run(
            createdClassId,
            booking.id,
            booking.course_id,
            booking.teacher_id,
            `${course.subject}: ${booking.learner_name}`,
            course.subject,
            course.title,
            startUtc,
            endUtc,
            booking.duration_minutes
          );

          db.prepare(
            `INSERT INTO class_participants (id, class_id, student_id) VALUES (?, ?, ?)`
          ).run(newId(), createdClassId, studentId);
        }
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    // Automatically create Google Calendar + Meet OR Zoom meeting ("whichever works")
    let videoNote = '';
    if (status === 'confirmed' && createdClassId) {
      const teacher = db
        .prepare(`SELECT default_meeting_provider FROM teachers WHERE id = ?`)
        .get(booking.teacher_id) as { default_meeting_provider: string } | undefined;

      const googleToken = req.headers['x-google-access-token'] as string | undefined;
      const provisioned = await provisionClassVideoMeeting(db, {
        classId: createdClassId,
        topic: `Jey Learning Hub — ${booking.learner_name}`,
        description: `Online tutoring lesson (${booking.booking_ref})`,
        startTimeUtc: startUtc,
        endTimeUtc: endUtc,
        durationMinutes: Number(booking.duration_minutes),
        preferredProvider: teacher?.default_meeting_provider || 'google_meet',
        googleAccessToken: googleToken,
        attendeeEmails: [String(booking.parent_email)],
      });
      videoNote = provisioned.note ? ` ${provisioned.note}` : '';
    }

    // Notify parent if registered
    if (booking.parent_id) {
      const parentRow = db
        .prepare(`SELECT profile_id FROM parents WHERE id = ?`)
        .get(booking.parent_id) as { profile_id: string } | undefined;
      if (parentRow) {
        await dispatchNotification(db, {
          userId: parentRow.profile_id,
          eventType: `booking_${status}`,
          title: `Booking ${booking.booking_ref} ${status.toUpperCase()}`,
          body: `Your booking for ${booking.learner_name} is now ${status}.${videoNote}`,
          linkPath: '/parent',
          sendEmail: true,
        });
      }
    }

    logAudit(db, req.user!.id, `booking_${status}`, 'booking', String(booking.id), {
      createdClassId,
    });

    res.json({
      booking: db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(booking.id),
      createdClassId,
      videoNote,
    });
  });

  // ======================== 5. CALENDAR & CLASSES ========================
  router.get('/classes', (_req, res) => {
    const classes = db
      .prepare(
        `SELECT cl.*, c.title AS course_title, tp.full_name AS teacher_name, tp.timezone AS teacher_timezone,
                vm.provider AS video_provider,
                CASE WHEN cl.status IN ('completed', 'cancelled') THEN NULL ELSE vm.join_url END AS join_url,
                vm.host_url, vm.external_meeting_id, vm.calendar_event_id, vm.status AS meeting_status,
                CASE WHEN cl.status IN ('completed', 'cancelled') THEN 1 ELSE 0 END AS meeting_locked,
                (SELECT GROUP_CONCAT(s.full_name, ', ')
                 FROM class_participants cp2 JOIN students s ON s.id = cp2.student_id
                 WHERE cp2.class_id = cl.id) AS student_names,
                (SELECT cp2.student_id FROM class_participants cp2 WHERE cp2.class_id = cl.id LIMIT 1) AS primary_student_id,
                (SELECT ln.status FROM lesson_notes ln WHERE ln.class_id = cl.id) AS notes_status,
                (SELECT r.status FROM recordings r WHERE r.class_id = cl.id LIMIT 1) AS recording_status
         FROM classes cl
         JOIN courses c ON c.id = cl.course_id
         LEFT JOIN teachers t ON t.id = cl.teacher_id
         LEFT JOIN profiles tp ON tp.id = t.profile_id
         LEFT JOIN video_meetings vm ON vm.class_id = cl.id AND vm.status != 'cancelled'
         ORDER BY cl.start_time_utc DESC`
      )
      .all();
    res.json({ classes });
  });

  // Create single OR recurring weekly classes (each occurrence gets its own record + Meet/Zoom link!)
  router.post('/classes', async (req: AuthedRequest, res) => {
    const {
      courseId,
      teacherId,
      studentId,
      title,
      topic = '',
      description = '',
      studentInstructions = '',
      privateTeacherNotes = '',
      startTimeUtc,
      durationMinutes = 60,
      repeatWeeks = 1,
    } = req.body || {};

    if (!courseId || !studentId || !startTimeUtc) {
      return res.status(400).json({ error: 'Course, student, and startTimeUtc are required.' });
    }

    const course = db.prepare(`SELECT * FROM courses WHERE id = ?`).get(courseId) as
      | { id: string; title: string; subject: string; teacher_id: string }
      | undefined;
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const targetTeacherId = teacherId || req.user!.teacher_id || course.teacher_id;
    const baseMs = new Date(startTimeUtc).getTime();
    if (Number.isNaN(baseMs)) return res.status(400).json({ error: 'Invalid startTimeUtc.' });

    const dur = Math.max(30, Math.min(180, Number(durationMinutes)));
    const weeks = Math.max(1, Math.min(24, Number(repeatWeeks) || 1));
    const recurrenceGroupId = weeks > 1 ? newId() : null;
    const createdIds: string[] = [];
    const createdOccurrences: Array<{ id: string; title: string; startUtc: string; endUtc: string }> = [];

    db.exec('BEGIN IMMEDIATE');
    try {
      for (let w = 0; w < weeks; w++) {
        const occStart = new Date(baseMs + w * 7 * 86400000).toISOString();
        const occEnd = new Date(baseMs + w * 7 * 86400000 + dur * 60000).toISOString();

        const conflict = checkTeacherTimeConflict(db, targetTeacherId, occStart, occEnd);
        if (!conflict.ok) {
          db.exec('ROLLBACK');
          return res.status(409).json({
            error: `Week ${w + 1} (${occStart}): ${conflict.reason}`,
          });
        }

        const clsId = newId();
        const clsTitle = title || `${course.subject}: ${course.title}`;
        db.prepare(
          `INSERT INTO classes
           (id, course_id, teacher_id, title, subject, topic, description, student_instructions, private_teacher_notes, start_time_utc, end_time_utc, duration_minutes, recurrence_group_id, recurrence_rule, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`
        ).run(
          clsId,
          course.id,
          targetTeacherId,
          clsTitle,
          course.subject,
          topic,
          description,
          studentInstructions,
          privateTeacherNotes,
          occStart,
          occEnd,
          dur,
          recurrenceGroupId,
          weeks > 1 ? `WEEKLY (${weeks} occurrences)` : ''
        );

        db.prepare(`INSERT INTO class_participants (id, class_id, student_id) VALUES (?, ?, ?)`).run(
          newId(),
          clsId,
          studentId
        );

        db.prepare(
          `INSERT OR IGNORE INTO enrolments (id, student_id, course_id, teacher_id, status) VALUES (?, ?, ?, ?, 'active')`
        ).run(newId(), studentId, course.id, targetTeacherId);

        createdIds.push(clsId);
        createdOccurrences.push({ id: clsId, title: clsTitle, startUtc: occStart, endUtc: occEnd });
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    // Auto-create Google Calendar + Meet or Zoom for each newly created occurrence
    const googleToken = req.headers['x-google-access-token'] as string | undefined;
    const teacherPref = db
      .prepare(`SELECT default_meeting_provider FROM teachers WHERE id = ?`)
      .get(targetTeacherId) as { default_meeting_provider: string } | undefined;

    const parentEmails = (
      db
        .prepare(
          `SELECT DISTINCT pr.email FROM parent_students ps
           JOIN parents pa ON pa.id = ps.parent_id
           JOIN profiles pr ON pr.id = pa.profile_id
           WHERE ps.student_id = ?`
        )
        .all(studentId) as Array<{ email: string }>
    ).map((r) => r.email);

    let meetingsCreated = 0;
    let lastVideoNote = '';
    for (const occ of createdOccurrences) {
      const prov = await provisionClassVideoMeeting(db, {
        classId: occ.id,
        topic: `${occ.title}${topic ? ` — ${topic}` : ''}`,
        description: description || course.title,
        startTimeUtc: occ.startUtc,
        endTimeUtc: occ.endUtc,
        durationMinutes: dur,
        preferredProvider: teacherPref?.default_meeting_provider || 'google_meet',
        googleAccessToken: googleToken,
        attendeeEmails: parentEmails,
      });
      if (prov.meeting) meetingsCreated++;
      lastVideoNote = prov.note;
    }

    logAudit(db, req.user!.id, 'classes_created', 'class', createdIds[0], {
      count: createdIds.length,
      meetingsCreated,
    });
    res.status(201).json({ createdIds, meetingsCreated, videoNote: lastVideoNote });
  });

  // Update, reschedule single class occurrence, mark attendance, complete, or cancel
  router.patch('/classes/:id', async (req: AuthedRequest, res) => {
    const cls = db.prepare(`SELECT * FROM classes WHERE id = ?`).get(req.params.id) as
      | Record<string, any>
      | undefined;
    if (!cls) return res.status(404).json({ error: 'Class not found.' });

    const {
      title,
      topic,
      description,
      studentInstructions,
      privateTeacherNotes,
      startTimeUtc,
      durationMinutes,
      status,
      attendanceStatus,
    } = req.body || {};

    let newStart = String(cls.start_time_utc);
    let newEnd = String(cls.end_time_utc);
    const newDur = durationMinutes ? Number(durationMinutes) : Number(cls.duration_minutes);

    if (startTimeUtc) {
      const sMs = new Date(startTimeUtc).getTime();
      if (Number.isNaN(sMs)) return res.status(400).json({ error: 'Invalid startTimeUtc.' });
      newStart = new Date(sMs).toISOString();
      newEnd = new Date(sMs + newDur * 60000).toISOString();

      const conflict = checkTeacherTimeConflict(
        db,
        String(cls.teacher_id),
        newStart,
        newEnd,
        undefined,
        String(cls.id)
      );
      if (!conflict.ok) {
        return res.status(409).json({ error: conflict.reason });
      }
    }

    db.prepare(
      `UPDATE classes
       SET title = COALESCE(NULLIF(?, ''), title),
           topic = COALESCE(?, topic),
           description = COALESCE(?, description),
           student_instructions = COALESCE(?, student_instructions),
           private_teacher_notes = COALESCE(?, private_teacher_notes),
           start_time_utc = ?,
           end_time_utc = ?,
           duration_minutes = ?,
           status = COALESCE(NULLIF(?, ''), status),
           attendance_status = COALESCE(NULLIF(?, ''), attendance_status),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      title || '',
      topic ?? null,
      description ?? null,
      studentInstructions ?? null,
      privateTeacherNotes ?? null,
      newStart,
      newEnd,
      newDur,
      status || '',
      attendanceStatus || '',
      cls.id
    );

    if (attendanceStatus) {
      db.prepare(`UPDATE class_participants SET attendance_status = ? WHERE class_id = ?`).run(
        attendanceStatus,
        cls.id
      );
    }

    // Sync video meeting reschedule/cancel if external meeting exists
    const meeting = db
      .prepare(`SELECT * FROM video_meetings WHERE class_id = ? AND status != 'cancelled'`)
      .get(cls.id) as
      | { id: string; provider: string; external_meeting_id: string; calendar_event_id: string }
      | undefined;

    if (meeting) {
      const googleToken = req.headers['x-google-access-token'] as string | undefined;
      if (status === 'cancelled') {
        try {
          if (meeting.provider === 'zoom' && isZoomConfigured() && meeting.external_meeting_id) {
            await cancelZoomMeeting(meeting.external_meeting_id);
          } else if (
            meeting.provider === 'google_meet' &&
            googleToken &&
            meeting.calendar_event_id
          ) {
            await deleteGoogleCalendarEvent(googleToken, meeting.calendar_event_id);
          }
        } catch {
          // Record cancellation locally even if remote API fails
        }
        db.prepare(`UPDATE video_meetings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(
          meeting.id
        );
      } else if (status === 'completed') {
        // Lock the classroom link once completed so it is inaccessible anymore
        db.prepare(`UPDATE video_meetings SET status = 'ended', updated_at = datetime('now') WHERE id = ?`).run(
          meeting.id
        );
      } else if (startTimeUtc) {
        try {
          if (meeting.provider === 'zoom' && isZoomConfigured() && meeting.external_meeting_id) {
            await updateZoomMeeting(meeting.external_meeting_id, {
              topic: title || String(cls.title),
              startTimeUtc: newStart,
              durationMinutes: newDur,
            });
          } else if (
            meeting.provider === 'google_meet' &&
            googleToken &&
            meeting.calendar_event_id
          ) {
            await updateGoogleCalendarEvent(googleToken, meeting.calendar_event_id, {
              summary: title || String(cls.title),
              startTimeUtc: newStart,
              endTimeUtc: newEnd,
            });
          }
        } catch {
          // Ignore remote sync failure; local class updated
        }
      }
    }

    logAudit(db, req.user!.id, 'class_updated', 'class', String(cls.id), {
      status,
      attendanceStatus,
      rescheduled: Boolean(startTimeUtc),
    });

    res.json({ class: db.prepare(`SELECT * FROM classes WHERE id = ?`).get(cls.id) });
  });

  // Mark student absent and automatically push the class forward (+7 days or next conflict-free slot)
  router.post('/classes/:id/absent', async (req: AuthedRequest, res) => {
    const cls = db.prepare(`SELECT * FROM classes WHERE id = ?`).get(req.params.id) as
      | Record<string, any>
      | undefined;
    if (!cls) return res.status(404).json({ error: 'Class not found.' });
    if (cls.status === 'completed' || cls.status === 'cancelled') {
      return res.status(400).json({ error: 'Completed or cancelled classes cannot be pushed forward.' });
    }

    const dur = Number(cls.duration_minutes) || 60;
    const origStartMs = new Date(String(cls.start_time_utc)).getTime();
    let baseNextMs = origStartMs + 7 * 86400000;
    while (baseNextMs <= Date.now()) {
      baseNextMs += 7 * 86400000;
    }

    // Check weekly offsets (+0, +7, +14, +21) first, then daily offsets (+1..+30 days)
    const candidateDayOffsets = [0, 7, 14, 21, 28, ...Array.from({ length: 30 }, (_, i) => i + 1)];
    let newStart = '';
    let newEnd = '';

    for (const dayOffset of candidateDayOffsets) {
      const sMs = baseNextMs + dayOffset * 86400000;
      const candStart = new Date(sMs).toISOString();
      const candEnd = new Date(sMs + dur * 60000).toISOString();
      const conflict = checkTeacherTimeConflict(
        db,
        String(cls.teacher_id),
        candStart,
        candEnd,
        undefined,
        String(cls.id)
      );
      if (conflict.ok) {
        newStart = candStart;
        newEnd = candEnd;
        break;
      }
    }

    if (!newStart) {
      return res.status(409).json({
        error: 'Could not find a conflict-free future slot automatically. Please use Reschedule to pick a custom time.',
      });
    }

    const absentNote = `Absent on ${String(cls.start_time_utc).slice(0, 10)} — pushed forward`;
    const mergedInstructions = cls.student_instructions
      ? `${cls.student_instructions} · ${absentNote}`
      : absentNote;

    db.prepare(
      `UPDATE classes
       SET start_time_utc = ?,
           end_time_utc = ?,
           status = 'rescheduled',
           attendance_status = 'absent',
           student_instructions = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(newStart, newEnd, mergedInstructions, cls.id);

    db.prepare(`UPDATE class_participants SET attendance_status = 'absent' WHERE class_id = ?`).run(
      cls.id
    );

    const meeting = db
      .prepare(`SELECT * FROM video_meetings WHERE class_id = ? AND status != 'cancelled'`)
      .get(cls.id) as
      | { id: string; provider: string; external_meeting_id: string; calendar_event_id: string; join_url: string }
      | undefined;

    if (meeting) {
      const googleToken = req.headers['x-google-access-token'] as string | undefined;
      try {
        if (meeting.provider === 'zoom' && isZoomConfigured() && meeting.external_meeting_id) {
          await updateZoomMeeting(meeting.external_meeting_id, {
            topic: String(cls.title),
            startTimeUtc: newStart,
            durationMinutes: dur,
          });
        } else if (
          meeting.provider === 'google_meet' &&
          googleToken &&
          meeting.calendar_event_id
        ) {
          await updateGoogleCalendarEvent(googleToken, meeting.calendar_event_id, {
            summary: String(cls.title),
            startTimeUtc: newStart,
            endTimeUtc: newEnd,
          });
        }
      } catch {
        // Local push-forward already succeeded
      }
    }

    const participantProfiles = db
      .prepare(
        `SELECT DISTINCT COALESCE(s.profile_id, pp.id) AS profile_id
         FROM class_participants cp
         JOIN students s ON s.id = cp.student_id
         LEFT JOIN parent_students ps ON ps.student_id = s.id
         LEFT JOIN parents pa ON pa.id = ps.parent_id
         LEFT JOIN profiles pp ON pp.id = pa.profile_id
         WHERE cp.class_id = ?`
      )
      .all(cls.id) as Array<{ profile_id: string | null }>;

    for (const p of participantProfiles) {
      if (p.profile_id) {
        await dispatchNotification(db, {
          userId: p.profile_id,
          eventType: 'class_absent_pushed_forward',
          title: `Class Rescheduled (Absent): ${cls.title}`,
          body: `Since today's session was marked absent, your class was automatically moved forward to ${newStart}.`,
          linkPath: '/student',
          sendEmail: true,
        });
      }
    }

    logAudit(db, req.user!.id, 'class_absent_pushed_forward', 'class', String(cls.id), {
      previousStartUtc: cls.start_time_utc,
      newStartUtc: newStart,
    });

    res.json({
      class: db.prepare(`SELECT * FROM classes WHERE id = ?`).get(cls.id),
      previousStartUtc: cls.start_time_utc,
      newStartUtc: newStart,
    });
  });

  // Send immediate 1-click reminder for a scheduled class
  router.post('/classes/:id/remind', async (req: AuthedRequest, res) => {
    const cls = db
      .prepare(
        `SELECT cl.*, vm.join_url
         FROM classes cl
         LEFT JOIN video_meetings vm ON vm.class_id = cl.id AND vm.status = 'created'
         WHERE cl.id = ?`
      )
      .get(req.params.id) as Record<string, any> | undefined;
    if (!cls) return res.status(404).json({ error: 'Class not found.' });
    if (cls.status === 'completed' || cls.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot send reminder for a completed or cancelled class.' });
    }

    const recipients = db
      .prepare(
        `SELECT DISTINCT COALESCE(s.profile_id, pp.id) AS profile_id
         FROM class_participants cp
         JOIN students s ON s.id = cp.student_id
         LEFT JOIN parent_students ps ON ps.student_id = s.id
         LEFT JOIN parents pa ON pa.id = ps.parent_id
         LEFT JOIN profiles pp ON pp.id = pa.profile_id
         WHERE cp.class_id = ?`
      )
      .all(cls.id) as Array<{ profile_id: string | null }>;

    const targetIds = new Set<string>([req.user!.id]);
    for (const r of recipients) {
      if (r.profile_id) targetIds.add(r.profile_id);
    }

    let emailed = false;
    for (const uid of targetIds) {
      const resNotif = await dispatchNotification(db, {
        userId: uid,
        eventType: 'manual_class_reminder',
        title: `Reminder: ${cls.title}`,
        body: `Upcoming ${cls.subject} class at ${cls.start_time_utc}.${
          cls.join_url ? ` Join link: ${cls.join_url}` : ''
        }`,
        linkPath: uid === req.user!.id ? '/admin' : '/student',
        sendEmail: true,
      });
      if (resNotif.emailStatus === 'sent') emailed = true;
    }

    logAudit(db, req.user!.id, 'manual_reminder_sent', 'class', String(cls.id), {
      recipients: targetIds.size,
      emailed,
    });

    res.json({
      ok: true,
      recipients: targetIds.size,
      emailed,
      message: emailed
        ? 'Reminder sent to portal notifications and email!'
        : 'In-app reminder sent! Add class to Google Calendar for email/popup alarms.',
    });
  });

  // ======================== 6. VIDEO MEETINGS & RECORDINGS ========================
  // Sync all upcoming scheduled classes missing a video meeting onto Google Calendar + Meet OR Zoom
  router.post('/classes/sync-meetings', async (req: AuthedRequest, res) => {
    const googleToken = req.headers['x-google-access-token'] as string | undefined;
    if (!googleToken && !isZoomConfigured()) {
      return res.status(400).json({
        error:
          'Connect Google Calendar & Meet first (or configure Zoom credentials) to sync meeting links.',
      });
    }

    const nowIso = new Date().toISOString();
    const unlinkedClasses = db
      .prepare(
        `SELECT cl.*, c.title AS course_title, t.default_meeting_provider,
                b.parent_email AS booking_parent_email,
                (SELECT GROUP_CONCAT(pr.email, ',')
                 FROM class_participants cp
                 JOIN parent_students ps ON ps.student_id = cp.student_id
                 JOIN parents pa ON pa.id = ps.parent_id
                 JOIN profiles pr ON pr.id = pa.profile_id
                 WHERE cp.class_id = cl.id) AS linked_parent_emails
         FROM classes cl
         JOIN courses c ON c.id = cl.course_id
         LEFT JOIN teachers t ON t.id = cl.teacher_id
         LEFT JOIN bookings b ON b.id = cl.booking_id
         WHERE cl.status IN ('scheduled', 'rescheduled', 'in_progress')
           AND cl.end_time_utc >= ?
           AND NOT EXISTS (
             SELECT 1 FROM video_meetings vm
             WHERE vm.class_id = cl.id AND vm.status != 'cancelled' AND vm.join_url != ''
           )
         ORDER BY cl.start_time_utc ASC`
      )
      .all(nowIso) as Array<Record<string, any>>;

    let syncedCount = 0;
    const errors: string[] = [];

    for (const cls of unlinkedClasses) {
      const attendees = Array.from(
        new Set(
          [cls.booking_parent_email, ...(String(cls.linked_parent_emails || '').split(','))]
            .map((s) => String(s || '').trim())
            .filter(Boolean)
        )
      );
      const prov = await provisionClassVideoMeeting(db, {
        classId: String(cls.id),
        topic: `${cls.title}${cls.topic ? ` — ${cls.topic}` : ''}`,
        description: `${cls.course_title}\n${cls.description || ''}`.trim(),
        startTimeUtc: String(cls.start_time_utc),
        endTimeUtc: String(cls.end_time_utc),
        durationMinutes: Number(cls.duration_minutes) || 60,
        preferredProvider: String(cls.default_meeting_provider || 'google_meet'),
        googleAccessToken: googleToken,
        attendeeEmails: attendees,
      });
      if (prov.meeting) syncedCount++;
      else if (prov.note) errors.push(`${cls.title}: ${prov.note}`);
    }

    return res.json({
      syncedCount,
      totalPending: unlinkedClasses.length,
      errors,
    });
  });

  router.post('/classes/:id/meeting', async (req: AuthedRequest, res) => {
    const cls = db
      .prepare(
        `SELECT cl.*, c.title AS course_title,
                b.parent_email AS booking_parent_email,
                (SELECT GROUP_CONCAT(s.full_name, ', ')
                 FROM class_participants cp2 JOIN students s ON s.id = cp2.student_id
                 WHERE cp2.class_id = cl.id) AS student_names
         FROM classes cl
         JOIN courses c ON c.id = cl.course_id
         LEFT JOIN bookings b ON b.id = cl.booking_id
         WHERE cl.id = ?`
      )
      .get(req.params.id) as Record<string, any> | undefined;

    if (!cls) return res.status(404).json({ error: 'Class not found.' });
    if (cls.status === 'completed' || cls.status === 'cancelled') {
      return res.status(400).json({
        error: 'This class is already completed or cancelled and can no longer be joined.',
      });
    }

    const { provider, customJoinUrl } = req.body || {};

    // Allow teacher to manually save a valid external Meet/Zoom URL if desired
    if (customJoinUrl && String(customJoinUrl).trim()) {
      const cleanUrl = String(customJoinUrl).trim();
      if (!/^https:\/\/.+/.test(cleanUrl)) {
        return res.status(400).json({ error: 'Meeting URL must start with https://' });
      }
      const detectedProvider = cleanUrl.includes('zoom.us') ? 'zoom' : 'google_meet';
      const safeHostUrl = cleanUrl.includes('calendar.google.com') ? cleanUrl : '';
      db.prepare(
        `INSERT OR REPLACE INTO video_meetings
         (id, class_id, provider, external_meeting_id, join_url, host_url, status, raw_metadata_json)
         VALUES (?, ?, ?, '', ?, ?, 'created', '{}')`
      ).run(newId(), cls.id, detectedProvider, cleanUrl, safeHostUrl);
      return res.status(201).json({
        meeting: db.prepare(`SELECT * FROM video_meetings WHERE class_id = ?`).get(cls.id),
      });
    }

    const teacher = db
      .prepare(`SELECT default_meeting_provider FROM teachers WHERE id = ?`)
      .get(cls.teacher_id) as { default_meeting_provider: string } | undefined;

    const googleToken = req.headers['x-google-access-token'] as string | undefined;
    const requested = provider && provider !== 'auto' ? provider : null;
    const chosenProvider = requested || teacher?.default_meeting_provider || 'google_meet';

    try {
      if (!requested) {
        // Automatic "whichever works" mode
        const prov = await provisionClassVideoMeeting(db, {
          classId: String(cls.id),
          topic: `${cls.title}${cls.topic ? ` — ${cls.topic}` : ''}`,
          description: `${cls.course_title}\nStudents: ${cls.student_names || ''}`,
          startTimeUtc: String(cls.start_time_utc),
          endTimeUtc: String(cls.end_time_utc),
          durationMinutes: Number(cls.duration_minutes) || 60,
          preferredProvider: chosenProvider,
          googleAccessToken: googleToken,
          attendeeEmails: cls.booking_parent_email ? [String(cls.booking_parent_email)] : [],
        });
        if (prov.meeting) {
          return res.status(201).json({ meeting: prov.meeting });
        }
        const expired = prov.note.includes('[GOOGLE_AUTH_EXPIRED]');
        return res.status(expired ? 401 : 400).json({
          error: prov.note.replace('[GOOGLE_AUTH_EXPIRED] ', ''),
          requiresGoogleSignIn: !googleToken || expired,
        });
      }

      if (chosenProvider === 'zoom') {
        if (!isZoomConfigured()) {
          return res.status(400).json({
            error:
              'Zoom credentials (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET) are not configured on the server.',
            needsConfiguration: true,
          });
        }
        const zoom = await createZoomMeeting({
          topic: `${cls.title}${cls.topic ? ` — ${cls.topic}` : ''}`,
          startTimeUtc: String(cls.start_time_utc),
          durationMinutes: Number(cls.duration_minutes),
          agenda: String(cls.description || cls.course_title),
          autoRecord: true,
        });

        const id = newId();
        db.prepare(
          `INSERT OR REPLACE INTO video_meetings
           (id, class_id, provider, external_meeting_id, join_url, host_url, passcode, status, raw_metadata_json)
           VALUES (?, ?, 'zoom', ?, ?, ?, ?, 'created', ?)`
        ).run(
          id,
          cls.id,
          zoom.external_meeting_id,
          zoom.join_url,
          zoom.host_url,
          zoom.passcode,
          JSON.stringify(zoom.raw)
        );
        logAudit(db, req.user!.id, 'zoom_meeting_created', 'class', String(cls.id), {
          external_meeting_id: zoom.external_meeting_id,
        });
        return res.status(201).json({
          meeting: db.prepare(`SELECT * FROM video_meetings WHERE class_id = ?`).get(cls.id),
        });
      }

      if (chosenProvider === 'google_meet') {
        if (!googleToken) {
          return res.status(401).json({
            error:
              'Click "Connect Google Calendar & Meet" to authorize Google Calendar events and Google Meet links.',
            requiresGoogleSignIn: true,
          });
        }

        const gm = await createGoogleMeetCalendarEvent(googleToken, {
          summary: String(cls.title),
          description: `${cls.course_title}\nTopic: ${cls.topic || 'Scheduled tutoring session'}\nStudents: ${cls.student_names || ''}`,
          startTimeUtc: String(cls.start_time_utc),
          endTimeUtc: String(cls.end_time_utc),
          attendeeEmails: cls.booking_parent_email ? [String(cls.booking_parent_email)] : [],
        });

        const id = newId();
        db.prepare(
          `INSERT OR REPLACE INTO video_meetings
           (id, class_id, provider, external_meeting_id, join_url, host_url, calendar_event_id, status, raw_metadata_json)
           VALUES (?, ?, 'google_meet', ?, ?, ?, ?, 'created', ?)`
        ).run(
          id,
          cls.id,
          gm.external_meeting_id,
          gm.join_url,
          gm.host_url,
          gm.calendar_event_id,
          JSON.stringify(gm.raw)
        );
        logAudit(db, req.user!.id, 'google_meet_created', 'class', String(cls.id), {
          calendar_event_id: gm.calendar_event_id,
        });
        return res.status(201).json({
          meeting: db.prepare(`SELECT * FROM video_meetings WHERE class_id = ?`).get(cls.id),
        });
      }

      return res.status(400).json({ error: 'Unsupported video provider.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create video meeting.';
      const expired = msg.includes('[GOOGLE_AUTH_EXPIRED]');
      return res.status(expired ? 401 : 502).json({
        error: msg.replace('[GOOGLE_AUTH_EXPIRED] ', ''),
        requiresGoogleSignIn: expired,
      });
    }
  });

  // Sync Zoom Cloud Recordings for a specific class
  router.post('/classes/:id/sync-zoom-recordings', async (req: AuthedRequest, res) => {
    const meeting = db
      .prepare(`SELECT * FROM video_meetings WHERE class_id = ? AND provider = 'zoom'`)
      .get(req.params.id) as { external_meeting_id: string } | undefined;

    if (!meeting?.external_meeting_id) {
      return res.status(404).json({ error: 'No Zoom meeting linked to this class.' });
    }
    if (!isZoomConfigured()) {
      return res.status(400).json({ error: 'Zoom API credentials are not configured.' });
    }

    try {
      const data = (await fetchZoomMeetingRecordings(meeting.external_meeting_id)) as {
        duration?: number;
        share_url?: string;
        recording_files?: Array<{
          id?: string;
          file_type?: string;
          play_url?: string;
          download_url?: string;
        }>;
      };

      const videoFile = data.recording_files?.find((f) => f.file_type === 'MP4') || data.recording_files?.[0];
      const recId = newId();
      const participant = db
        .prepare(`SELECT student_id FROM class_participants WHERE class_id = ? LIMIT 1`)
        .get(req.params.id) as { student_id: string } | undefined;

      db.prepare(
        `INSERT INTO recordings (id, class_id, student_id, provider, external_recording_id, playback_url, duration_seconds, status)
         VALUES (?, ?, ?, 'zoom', ?, ?, ?, 'awaiting_review')`
      ).run(
        recId,
        req.params.id,
        participant?.student_id || null,
        videoFile?.id || meeting.external_meeting_id,
        data.share_url || videoFile?.play_url || '',
        (data.duration || 0) * 60
      );

      return res.status(201).json({
        recording: db.prepare(`SELECT * FROM recordings WHERE id = ?`).get(recId),
      });
    } catch (err: unknown) {
      return res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Could not retrieve Zoom cloud recordings (verify plan supports cloud recording).',
      });
    }
  });

  router.get('/recordings', (_req, res) => {
    const recordings = db
      .prepare(
        `SELECT r.*, cl.title AS class_title, cl.subject, cl.topic, cl.start_time_utc,
                s.full_name AS student_name,
                COALESCE(
                  (SELECT MAX(rc.consent_given) FROM recording_consents rc WHERE rc.student_id = r.student_id),
                  0
                ) AS parental_consent_given
         FROM recordings r
         JOIN classes cl ON cl.id = r.class_id
         LEFT JOIN students s ON s.id = r.student_id
         ORDER BY r.created_at DESC`
      )
      .all();
    res.json({ recordings });
  });

  router.post('/recordings', (req: AuthedRequest, res) => {
    const {
      classId,
      provider = 'manual',
      playbackUrl = '',
      transcriptText = '',
      durationSeconds = 0,
      status = 'awaiting_review',
    } = req.body || {};

    if (!classId || (!playbackUrl && !transcriptText)) {
      return res.status(400).json({ error: 'Class and either a recording URL/file or transcript are required.' });
    }

    const participant = db
      .prepare(`SELECT student_id FROM class_participants WHERE class_id = ? LIMIT 1`)
      .get(classId) as { student_id: string } | undefined;

    const id = newId();
    db.prepare(
      `INSERT INTO recordings (id, class_id, student_id, provider, playback_url, transcript_text, duration_seconds, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      classId,
      participant?.student_id || null,
      provider,
      playbackUrl,
      transcriptText,
      Number(durationSeconds) || 0,
      status
    );

    logAudit(db, req.user!.id, 'recording_added', 'recording', id, { classId, provider });
    res.status(201).json({ recording: db.prepare(`SELECT * FROM recordings WHERE id = ?`).get(id) });
  });

  router.patch('/recordings/:id', async (req: AuthedRequest, res) => {
    const { status, playbackUrl, transcriptText } = req.body || {};
    const rec = db.prepare(`SELECT * FROM recordings WHERE id = ?`).get(req.params.id) as
      | Record<string, any>
      | undefined;
    if (!rec) return res.status(404).json({ error: 'Recording not found.' });

    // Verify parental consent before publishing a minor's recording
    if (status === 'published' && rec.student_id) {
      const privacyRow = db
        .prepare(`SELECT content_json FROM website_content WHERE key = 'privacy_settings'`)
        .get() as { content_json: string } | undefined;
      const requireConsent = privacyRow ? JSON.parse(privacyRow.content_json).require_parental_recording_consent : true;

      if (requireConsent) {
        const consent = db
          .prepare(`SELECT consent_given FROM recording_consents WHERE student_id = ? AND consent_given = 1`)
          .get(rec.student_id);
        if (!consent) {
          return res.status(403).json({
            error:
              'Parental recording consent has not been granted for this student. Obtain consent in the Parent Portal before publishing.',
          });
        }
      }
    }

    db.prepare(
      `UPDATE recordings
       SET status = COALESCE(NULLIF(?, ''), status),
           playback_url = COALESCE(?, playback_url),
           transcript_text = COALESCE(?, transcript_text),
           published_at = CASE WHEN ? = 'published' THEN datetime('now') ELSE published_at END,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(status || '', playbackUrl ?? null, transcriptText ?? null, status || '', rec.id);

    if (status === 'published' && rec.student_id) {
      const stu = db
        .prepare(`SELECT profile_id FROM students WHERE id = ?`)
        .get(rec.student_id) as { profile_id: string | null } | undefined;
      if (stu?.profile_id) {
        await dispatchNotification(db, {
          userId: stu.profile_id,
          eventType: 'recording_published',
          title: 'Lesson Recording Published',
          body: 'A reviewed lesson recording is now available in your student dashboard.',
          linkPath: `/student`,
        });
      }
    }

    logAudit(db, req.user!.id, 'recording_updated', 'recording', String(rec.id), { status });
    res.json({ recording: db.prepare(`SELECT * FROM recordings WHERE id = ?`).get(rec.id) });
  });

  // ======================== 7. AI LESSON SUMMARIES & NOTES EDITOR ========================
  router.get('/lesson-notes', (_req, res) => {
    const notes = db
      .prepare(
        `SELECT ln.*, cl.title AS class_title, cl.subject, cl.topic, cl.start_time_utc,
                (SELECT GROUP_CONCAT(s.full_name, ', ')
                 FROM class_participants cp2 JOIN students s ON s.id = cp2.student_id
                 WHERE cp2.class_id = cl.id) AS student_names
         FROM lesson_notes ln
         JOIN classes cl ON cl.id = ln.class_id
         ORDER BY ln.updated_at DESC`
      )
      .all();
    res.json({ notes });
  });

  router.get('/lesson-notes/:id/versions', (req, res) => {
    const versions = db
      .prepare(
        `SELECT v.*, p.full_name AS editor_name
         FROM lesson_note_versions v
         LEFT JOIN profiles p ON p.id = v.edited_by
         WHERE v.lesson_note_id = ?
         ORDER BY v.version_number DESC`
      )
      .all(req.params.id);
    res.json({ versions });
  });

  // Generate AI Draft Summary via Gemini — ALWAYS saved as 'draft', NEVER auto-published!
  router.post('/classes/:id/generate-summary', async (req: AuthedRequest, res) => {
    const cls = db
      .prepare(
        `SELECT cl.*, c.title AS course_title, c.age_or_grade_range,
                (SELECT GROUP_CONCAT(s.full_name, ', ')
                 FROM class_participants cp2 JOIN students s ON s.id = cp2.student_id
                 WHERE cp2.class_id = cl.id) AS student_names
         FROM classes cl
         JOIN courses c ON c.id = cl.course_id
         WHERE cl.id = ?`
      )
      .get(req.params.id) as Record<string, any> | undefined;

    if (!cls) return res.status(404).json({ error: 'Class not found.' });

    const { transcript = '', teacherContext = '' } = req.body || {};
    let sourceTranscript = String(transcript).trim();
    if (!sourceTranscript) {
      const rec = db
        .prepare(`SELECT transcript_text FROM recordings WHERE class_id = ? AND transcript_text != '' LIMIT 1`)
        .get(cls.id) as { transcript_text: string } | undefined;
      sourceTranscript = rec?.transcript_text || '';
    }

    if (!sourceTranscript && !String(teacherContext).trim()) {
      return res.status(400).json({
        error:
          'Please paste or upload a lesson transcript or teacher bullet summary before generating AI notes.',
      });
    }

    if (!isGeminiConfigured()) {
      return res.status(400).json({
        error:
          'GEMINI_API_KEY is not configured in server secrets. You can still write and publish lesson notes manually.',
        needsConfiguration: true,
      });
    }

    try {
      const summary = await generateGeminiLessonSummary({
        title: String(cls.title),
        date: String(cls.start_time_utc).slice(0, 10),
        subject: String(cls.subject),
        gradeLevel: String(cls.age_or_grade_range || 'Grades 1–8'),
        topic: String(cls.topic || cls.course_title),
        studentName: String(cls.student_names || 'Student'),
        transcript: sourceTranscript,
        teacherContext: String(teacherContext),
      });

      const existing = db
        .prepare(`SELECT id FROM lesson_notes WHERE class_id = ?`)
        .get(cls.id) as { id: string } | undefined;

      const noteId = existing?.id || newId();
      const homeworkText = summary.homeworkRecommendations.join('\n');

      if (existing) {
        db.prepare(
          `UPDATE lesson_notes
           SET title = ?, content_markdown = ?, structured_summary_json = ?, homework_instructions = ?,
               is_ai_generated = 1, ai_model = 'gemini-4-hydrogen', status = 'draft', updated_at = datetime('now')
           WHERE id = ?`
        ).run(
          summary.lessonTitle,
          summary.markdownDraft,
          JSON.stringify(summary),
          homeworkText,
          noteId
        );
      } else {
        db.prepare(
          `INSERT INTO lesson_notes
           (id, class_id, teacher_id, title, content_markdown, structured_summary_json, homework_instructions, is_ai_generated, ai_model, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'gemini-4-hydrogen', 'draft')`
        ).run(
          noteId,
          cls.id,
          cls.teacher_id,
          summary.lessonTitle,
          summary.markdownDraft,
          JSON.stringify(summary),
          homeworkText
        );
      }

      const maxVer = (
        db
          .prepare(`SELECT COALESCE(MAX(version_number), 0) AS v FROM lesson_note_versions WHERE lesson_note_id = ?`)
          .get(noteId) as { v: number }
      ).v;

      db.prepare(
        `INSERT INTO lesson_note_versions (id, lesson_note_id, version_number, content_markdown, edited_by, change_summary)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        newId(),
        noteId,
        maxVer + 1,
        summary.markdownDraft,
        req.user!.id,
        'AI Draft generated via Gemini (awaiting teacher review)'
      );

      logAudit(db, req.user!.id, 'ai_lesson_summary_drafted', 'lesson_note', noteId, {
        classId: cls.id,
      });

      return res.status(201).json({
        note: db.prepare(`SELECT * FROM lesson_notes WHERE id = ?`).get(noteId),
        summary,
      });
    } catch (err: unknown) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Gemini API call failed.',
      });
    }
  });

  // Save manual/edited notes, private observations, or publish/unpublish
  router.put('/classes/:id/notes', async (req: AuthedRequest, res) => {
    const cls = db.prepare(`SELECT * FROM classes WHERE id = ?`).get(req.params.id) as
      | Record<string, any>
      | undefined;
    if (!cls) return res.status(404).json({ error: 'Class not found.' });

    const {
      title,
      contentMarkdown,
      homeworkInstructions = '',
      privateObservations = '',
      status = 'draft',
      changeSummary = 'Teacher edit',
    } = req.body || {};

    if (!contentMarkdown && !title) {
      return res.status(400).json({ error: 'Lesson title or note content is required.' });
    }

    const validStatus = ['draft', 'published', 'unpublished'].includes(status) ? status : 'draft';
    const existing = db
      .prepare(`SELECT id, is_ai_generated FROM lesson_notes WHERE class_id = ?`)
      .get(cls.id) as { id: string; is_ai_generated: number } | undefined;

    const noteId = existing?.id || newId();
    if (existing) {
      db.prepare(
        `UPDATE lesson_notes
         SET title = COALESCE(NULLIF(?, ''), title),
             content_markdown = ?,
             homework_instructions = ?,
             private_observations = ?,
             status = ?,
             published_at = CASE WHEN ? = 'published' THEN datetime('now') ELSE published_at END,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        title || '',
        contentMarkdown || '',
        homeworkInstructions,
        privateObservations,
        validStatus,
        validStatus,
        noteId
      );
    } else {
      db.prepare(
        `INSERT INTO lesson_notes
         (id, class_id, teacher_id, title, content_markdown, homework_instructions, private_observations, is_ai_generated, status, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, CASE WHEN ? = 'published' THEN datetime('now') ELSE NULL END)`
      ).run(
        noteId,
        cls.id,
        cls.teacher_id,
        title || String(cls.title),
        contentMarkdown || '',
        homeworkInstructions,
        privateObservations,
        validStatus,
        validStatus
      );
    }

    const maxVer = (
      db
        .prepare(`SELECT COALESCE(MAX(version_number), 0) AS v FROM lesson_note_versions WHERE lesson_note_id = ?`)
        .get(noteId) as { v: number }
    ).v;

    db.prepare(
      `INSERT INTO lesson_note_versions (id, lesson_note_id, version_number, content_markdown, edited_by, change_summary)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(newId(), noteId, maxVer + 1, contentMarkdown || '', req.user!.id, changeSummary);

    // Notify student and parent when published
    if (validStatus === 'published') {
      const participants = db
        .prepare(
          `SELECT s.profile_id AS student_profile_id, par.profile_id AS parent_profile_id
           FROM class_participants cp
           JOIN students s ON s.id = cp.student_id
           LEFT JOIN parent_students ps ON ps.student_id = s.id
           LEFT JOIN parents par ON par.id = ps.parent_id
           WHERE cp.class_id = ?`
        )
        .all(cls.id) as Array<{ student_profile_id: string | null; parent_profile_id: string | null }>;

      for (const p of participants) {
        if (p.student_profile_id) {
          await dispatchNotification(db, {
            userId: p.student_profile_id,
            eventType: 'notes_published',
            title: `Lesson Notes Published: ${title || cls.title}`,
            body: 'Your teacher has published the notes and homework for your recent class.',
            linkPath: `/student`,
            sendEmail: true,
          });
        }
        if (p.parent_profile_id) {
          await dispatchNotification(db, {
            userId: p.parent_profile_id,
            eventType: 'notes_published',
            title: `Lesson Summary Published: ${title || cls.title}`,
            body: 'New teacher-reviewed lesson notes are now available in your Parent Portal.',
            linkPath: `/parent`,
            sendEmail: true,
          });
        }
      }
    }

    logAudit(db, req.user!.id, `lesson_notes_${validStatus}`, 'lesson_note', noteId);
    res.json({ note: db.prepare(`SELECT * FROM lesson_notes WHERE id = ?`).get(noteId) });
  });

  // ======================== 8. ASSIGNMENTS, SUBMISSIONS, RESOURCES ========================
  router.get('/assignments', (_req, res) => {
    const assignments = db
      .prepare(
        `SELECT a.*, c.title AS course_title, c.subject, s.full_name AS student_name
         FROM assignments a
         JOIN courses c ON c.id = a.course_id
         LEFT JOIN students s ON s.id = a.student_id
         ORDER BY a.created_at DESC`
      )
      .all();
    res.json({ assignments });
  });

  router.post('/assignments', async (req: AuthedRequest, res) => {
    const {
      courseId,
      classId = null,
      studentId = null,
      title,
      instructions,
      questions = [],
      attachmentUrl = '',
      externalLink = '',
      dueDateUtc = null,
      maxMarks = 100,
      status = 'published',
    } = req.body || {};

    if (!courseId || !title || !instructions) {
      return res.status(400).json({ error: 'Course, title, and instructions are required.' });
    }

    const id = newId();
    const teacherId = req.user!.teacher_id || (db.prepare(`SELECT id FROM teachers LIMIT 1`).get() as { id: string }).id;

    db.prepare(
      `INSERT INTO assignments
       (id, course_id, class_id, teacher_id, student_id, title, instructions, questions_json, attachment_url, external_link, due_date_utc, max_marks, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      courseId,
      classId || null,
      teacherId,
      studentId || null,
      title,
      instructions,
      JSON.stringify(questions),
      attachmentUrl,
      externalLink,
      dueDateUtc || null,
      Number(maxMarks) || 100,
      status
    );

    if (status === 'published' && studentId) {
      const stu = db.prepare(`SELECT profile_id FROM students WHERE id = ?`).get(studentId) as
        | { profile_id: string | null }
        | undefined;
      if (stu?.profile_id) {
        await dispatchNotification(db, {
          userId: stu.profile_id,
          eventType: 'new_assignment',
          title: `New Assignment: ${title}`,
          body: instructions.slice(0, 140),
          linkPath: '/student',
          sendEmail: true,
        });
      }
    }

    logAudit(db, req.user!.id, 'assignment_created', 'assignment', id, { title });
    res.status(201).json({ assignment: db.prepare(`SELECT * FROM assignments WHERE id = ?`).get(id) });
  });

  router.get('/submissions', (_req, res) => {
    const submissions = db
      .prepare(
        `SELECT sub.*, a.title AS assignment_title, a.max_marks, c.subject, s.full_name AS student_name
         FROM assignment_submissions sub
         JOIN assignments a ON a.id = sub.assignment_id
         JOIN courses c ON c.id = a.course_id
         JOIN students s ON s.id = sub.student_id
         ORDER BY sub.submitted_at DESC`
      )
      .all();
    res.json({ submissions });
  });

  router.post('/submissions/:id/review', async (req: AuthedRequest, res) => {
    const { marksAwarded, teacherFeedback = '', status = 'reviewed' } = req.body || {};
    const sub = db
      .prepare(
        `SELECT sub.*, a.title AS assignment_title, s.profile_id AS student_profile_id
         FROM assignment_submissions sub
         JOIN assignments a ON a.id = sub.assignment_id
         JOIN students s ON s.id = sub.student_id
         WHERE sub.id = ?`
      )
      .get(req.params.id) as Record<string, any> | undefined;

    if (!sub) return res.status(404).json({ error: 'Submission not found.' });

    db.prepare(
      `UPDATE assignment_submissions
       SET marks_awarded = ?, teacher_feedback = ?, status = ?, reviewed_at = datetime('now')
       WHERE id = ?`
    ).run(
      marksAwarded !== undefined && marksAwarded !== '' ? Number(marksAwarded) : null,
      String(teacherFeedback),
      String(status),
      sub.id
    );

    if (sub.student_profile_id) {
      await dispatchNotification(db, {
        userId: String(sub.student_profile_id),
        eventType: 'assignment_feedback',
        title: `Assignment Reviewed: ${sub.assignment_title}`,
        body: `Status: ${status}${marksAwarded !== undefined ? ` · Marks: ${marksAwarded}` : ''}`,
        linkPath: '/student',
        sendEmail: true,
      });
    }

    logAudit(db, req.user!.id, 'submission_reviewed', 'assignment_submission', String(sub.id));
    res.json({ submission: db.prepare(`SELECT * FROM assignment_submissions WHERE id = ?`).get(sub.id) });
  });

  router.get('/resources', (_req, res) => {
    const resources = db
      .prepare(
        `SELECT r.*, c.title AS course_title, s.full_name AS student_name
         FROM resources r
         LEFT JOIN courses c ON c.id = r.course_id
         LEFT JOIN students s ON s.id = r.student_id
         ORDER BY r.created_at DESC`
      )
      .all();
    res.json({ resources });
  });

  router.post('/resources', (req: AuthedRequest, res) => {
    const {
      title,
      description = '',
      resourceType = 'pdf',
      fileUrl,
      courseId = null,
      classId = null,
      studentId = null,
      isPublished = true,
    } = req.body || {};

    if (!title || !fileUrl) {
      return res.status(400).json({ error: 'Title and file URL or uploaded file are required.' });
    }

    const teacherId = req.user!.teacher_id || (db.prepare(`SELECT id FROM teachers LIMIT 1`).get() as { id: string }).id;
    const id = newId();
    db.prepare(
      `INSERT INTO resources (id, teacher_id, course_id, class_id, student_id, title, description, resource_type, file_url, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, teacherId, courseId, classId, studentId, title, description, resourceType, fileUrl, isPublished ? 1 : 0);

    res.status(201).json({ resource: db.prepare(`SELECT * FROM resources WHERE id = ?`).get(id) });
  });

  router.delete('/resources/:id', (req, res) => {
    db.prepare(`DELETE FROM resources WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ======================== 9. INVOICES & MANUAL PAYMENTS ========================
  router.get('/invoices', (_req, res) => {
    const invoices = db
      .prepare(
        `SELECT i.*, pr.full_name AS parent_name, pr.email AS parent_email, s.full_name AS student_name
         FROM invoices i
         JOIN parents pa ON pa.id = i.parent_id
         JOIN profiles pr ON pr.id = pa.profile_id
         LEFT JOIN students s ON s.id = i.student_id
         ORDER BY i.created_at DESC`
      )
      .all();
    res.json({ invoices });
  });

  router.post('/invoices', adminOnly, async (req: AuthedRequest, res) => {
    const {
      parentId,
      studentId = null,
      currency = 'KES',
      dueDate,
      items = [],
    } = req.body || {};

    if (!parentId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Parent and at least one invoice line item are required.' });
    }

    const payRow = db
      .prepare(`SELECT content_json FROM website_content WHERE key = 'payment_settings'`)
      .get() as { content_json: string } | undefined;
    const paySettings = payRow ? JSON.parse(payRow.content_json) : {};
    const instr = [paySettings.mpesa_instructions, paySettings.international_instructions]
      .filter(Boolean)
      .join('\n\n');

    const totalAmount = items.reduce(
      (sum: number, it: { quantity?: number; unitPrice?: number }) =>
        sum + Number(it.quantity || 1) * Number(it.unitPrice || 0),
      0
    );

    const invId = newId();
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const invNum = `INV-${dateStamp}-${Math.floor(1000 + Math.random() * 9000)}`;
    const safeDue = dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO invoices (id, invoice_number, parent_id, student_id, currency, total_amount, amount_paid, due_date, status, payment_instructions)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'pending', ?)`
      ).run(invId, invNum, parentId, studentId, currency, totalAmount, safeDue, instr);

      const insItem = db.prepare(
        `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const it of items) {
        const q = Number(it.quantity || 1);
        const u = Number(it.unitPrice || 0);
        insItem.run(newId(), invId, it.description || 'Tutoring Lesson', q, u, q * u);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const par = db.prepare(`SELECT profile_id FROM parents WHERE id = ?`).get(parentId) as
      | { profile_id: string }
      | undefined;
    if (par) {
      await dispatchNotification(db, {
        userId: par.profile_id,
        eventType: 'invoice_generated',
        title: `New Invoice ${invNum} (${currency} ${totalAmount})`,
        body: `An invoice for ${currency} ${totalAmount} has been issued, due ${safeDue}.`,
        linkPath: '/parent',
        sendEmail: true,
      });
    }

    logAudit(db, req.user!.id, 'invoice_created', 'invoice', invId, { invNum, totalAmount });
    res.status(201).json({ invoice: db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(invId) });
  });

  router.get('/payments', (_req, res) => {
    const payments = db
      .prepare(
        `SELECT p.*, i.invoice_number, i.total_amount AS invoice_total, pr.full_name AS parent_name,
                s.full_name AS student_name
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         JOIN parents pa ON pa.id = p.parent_id
         JOIN profiles pr ON pr.id = pa.profile_id
         LEFT JOIN students s ON s.id = p.student_id
         ORDER BY p.submitted_at DESC`
      )
      .all();
    res.json({ payments });
  });

  // Verify or Reject submitted manual payment (generates receipt & updates invoice atomically)
  router.post('/payments/:id/verify', adminOnly, async (req: AuthedRequest, res) => {
    const { decision, adminNotes = '' } = req.body || {};
    if (!['verified', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be verified or rejected.' });
    }

    const pay = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(req.params.id) as
      | {
          id: string;
          invoice_id: string;
          parent_id: string;
          amount: number;
          currency: string;
          transaction_reference: string;
          receipt_number: string | null;
        }
      | undefined;
    if (!pay) return res.status(404).json({ error: 'Payment record not found.' });

    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const receiptNum =
      decision === 'verified'
        ? pay.receipt_number || `JLH-RCP-${dateStamp}-${Math.floor(1000 + Math.random() * 9000)}`
        : null;

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `UPDATE payments
         SET status = ?, admin_notes = ?, receipt_number = ?, verified_at = datetime('now'), verified_by = ?
         WHERE id = ?`
      ).run(decision, adminNotes, receiptNum, req.user!.id, pay.id);

      const sumRow = db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ? AND status = 'verified'`
        )
        .get(pay.invoice_id) as { paid: number };

      const inv = db
        .prepare(`SELECT total_amount, booking_id FROM invoices WHERE id = ?`)
        .get(pay.invoice_id) as { total_amount: number; booking_id: string | null };

      let invStatus = 'pending';
      if (sumRow.paid >= inv.total_amount) invStatus = 'paid';
      else if (sumRow.paid > 0) invStatus = 'partially_paid';

      db.prepare(`UPDATE invoices SET amount_paid = ?, status = ?, updated_at = datetime('now') WHERE id = ?`).run(
        sumRow.paid,
        invStatus,
        pay.invoice_id
      );

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const par = db.prepare(`SELECT profile_id FROM parents WHERE id = ?`).get(pay.parent_id) as
      | { profile_id: string }
      | undefined;
    if (par) {
      await dispatchNotification(db, {
        userId: par.profile_id,
        eventType: `payment_${decision}`,
        title: `Payment ${decision === 'verified' ? 'Verified' : 'Rejected'} (${pay.transaction_reference})`,
        body:
          decision === 'verified'
            ? `Your payment of ${pay.currency} ${pay.amount} has been verified. Receipt: ${receiptNum}.`
            : `Your payment submission (${pay.transaction_reference}) was rejected. ${adminNotes}`,
        linkPath: '/parent',
        sendEmail: true,
      });
    }

    logAudit(db, req.user!.id, `payment_${decision}`, 'payment', pay.id, { receiptNum });
    res.json({ payment: db.prepare(`SELECT * FROM payments WHERE id = ?`).get(pay.id) });
  });

  // ======================== 10. MESSAGES, REPORTS, CONTENT, SETTINGS, INTEGRATIONS ========================
  router.get('/messages', (req: AuthedRequest, res) => {
    const messages = db
      .prepare(
        `SELECT m.*, sp.full_name AS sender_name, sp.role AS sender_role,
                rp.full_name AS recipient_name, s.full_name AS student_name
         FROM messages m
         JOIN profiles sp ON sp.id = m.sender_id
         JOIN profiles rp ON rp.id = m.recipient_id
         LEFT JOIN students s ON s.id = m.student_id
         ORDER BY m.created_at DESC`
      )
      .all();
    res.json({ messages });
  });

  router.post('/messages', async (req: AuthedRequest, res) => {
    const { recipientId, studentId = null, category = 'general', subject, body } = req.body || {};
    if (!recipientId || !subject || !body) {
      return res.status(400).json({ error: 'Recipient, subject, and body are required.' });
    }
    const id = newId();
    db.prepare(
      `INSERT INTO messages (id, sender_id, recipient_id, student_id, category, subject, body)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.user!.id, recipientId, studentId, category, subject, body);

    await dispatchNotification(db, {
      userId: recipientId,
      eventType: 'teacher_message',
      title: `Message from ${req.user!.full_name}: ${subject}`,
      body,
      linkPath: '/parent',
      sendEmail: true,
    });

    res.status(201).json({ message: db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) });
  });

  router.get('/reports', (req, res) => {
    const { fromDate = '2000-01-01', toDate = '2099-12-31', subject = '', studentId = '', teacherId = '' } =
      req.query as Record<string, string>;

    const bookingStats = db
      .prepare(
        `SELECT
           COUNT(*) AS total_bookings,
           SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_bookings,
           SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_bookings,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_bookings
         FROM bookings
         WHERE date(scheduled_start_utc) BETWEEN date(?) AND date(?)
           AND (? = '' OR teacher_id = ?)`
      )
      .get(fromDate, toDate, teacherId, teacherId);

    const classStats = db
      .prepare(
        `SELECT
           COUNT(*) AS total_classes,
           SUM(CASE WHEN cl.status = 'completed' THEN 1 ELSE 0 END) AS completed_classes,
           SUM(CASE WHEN cl.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_classes,
           SUM(CASE WHEN cl.attendance_status = 'present' THEN 1 ELSE 0 END) AS attended_classes,
           SUM(CASE WHEN cl.attendance_status = 'absent' THEN 1 ELSE 0 END) AS missed_classes
         FROM classes cl
         WHERE date(cl.start_time_utc) BETWEEN date(?) AND date(?)
           AND (? = '' OR cl.subject = ?)
           AND (? = '' OR cl.teacher_id = ?)`
      )
      .get(fromDate, toDate, subject, subject, teacherId, teacherId);

    const revenueByCurrency = db
      .prepare(
        `SELECT currency,
                ROUND(SUM(CASE WHEN status = 'verified' THEN amount ELSE 0 END), 2) AS verified_revenue,
                ROUND(SUM(CASE WHEN status IN ('pending', 'submitted') THEN amount ELSE 0 END), 2) AS pending_verification
         FROM payments
         WHERE date(submitted_at) BETWEEN date(?) AND date(?)
         GROUP BY currency`
      )
      .all(fromDate, toDate);

    const outstandingByCurrency = db
      .prepare(
        `SELECT currency, ROUND(SUM(total_amount - amount_paid), 2) AS outstanding_balance
         FROM invoices
         WHERE status IN ('pending', 'submitted', 'partially_paid', 'overdue')
         GROUP BY currency`
      )
      .all();

    const studentProgress = db
      .prepare(
        `SELECT s.id, s.full_name, s.grade_level, s.country,
                COUNT(DISTINCT CASE WHEN cl.status = 'completed' THEN cl.id END) AS completed_lessons,
                COUNT(DISTINCT CASE WHEN cp.attendance_status = 'absent' THEN cl.id END) AS missed_lessons,
                ROUND(AVG(sub.marks_awarded), 1) AS avg_assignment_marks
         FROM students s
         LEFT JOIN class_participants cp ON cp.student_id = s.id
         LEFT JOIN classes cl ON cl.id = cp.class_id
         LEFT JOIN assignment_submissions sub ON sub.student_id = s.id AND sub.status = 'reviewed'
         WHERE (? = '' OR s.id = ?)
         GROUP BY s.id
         ORDER BY s.full_name ASC`
      )
      .all(studentId, studentId);

    res.json({
      bookingStats,
      classStats,
      revenueByCurrency,
      outstandingByCurrency,
      studentProgress,
    });
  });

  router.get('/reports/export.csv', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT cl.id, cl.title, cl.subject, cl.topic, cl.start_time_utc, cl.duration_minutes,
                cl.status, cl.attendance_status,
                (SELECT GROUP_CONCAT(s.full_name, ' | ')
                 FROM class_participants cp JOIN students s ON s.id = cp.student_id
                 WHERE cp.class_id = cl.id) AS students
         FROM classes cl
         ORDER BY cl.start_time_utc DESC`
      )
      .all() as Array<Record<string, unknown>>;

    const header = 'Class ID,Title,Subject,Topic,Start UTC,Duration (min),Status,Attendance,Students\n';
    const csvCell = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const body = rows
      .map((r) =>
        [
          r.id,
          r.title,
          r.subject,
          r.topic,
          r.start_time_utc,
          r.duration_minutes,
          r.status,
          r.attendance_status,
          r.students,
        ]
          .map(csvCell)
          .join(',')
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="jey-learning-hub-classes-report.csv"');
    res.send(header + body);
  });

  // Testimonials CRUD (Admin adds real parent/student testimonials; none fabricated)
  router.get('/testimonials', (_req, res) => {
    res.json({ testimonials: db.prepare(`SELECT * FROM testimonials ORDER BY created_at DESC`).all() });
  });

  router.post('/testimonials', adminOnly, (req, res) => {
    const { authorName, authorRole, location = '', quote, outcome = '', isPublished = true } = req.body || {};
    if (!authorName || !authorRole || !quote) {
      return res.status(400).json({ error: 'Author name, role, and quote are required.' });
    }
    const id = newId();
    db.prepare(
      `INSERT INTO testimonials (id, author_name, author_role, location, quote, outcome, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, authorName, authorRole, location, quote, outcome, isPublished ? 1 : 0);
    res.status(201).json({ testimonial: db.prepare(`SELECT * FROM testimonials WHERE id = ?`).get(id) });
  });

  router.patch('/testimonials/:id', adminOnly, (req, res) => {
    const { isPublished } = req.body || {};
    db.prepare(`UPDATE testimonials SET is_published = ? WHERE id = ?`).run(
      isPublished ? 1 : 0,
      req.params.id
    );
    res.json({ ok: true });
  });

  router.delete('/testimonials/:id', adminOnly, (req, res) => {
    db.prepare(`DELETE FROM testimonials WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // Settings & Website Content
  router.get('/settings', (_req, res) => {
    const rows = db.prepare(`SELECT key, content_json FROM website_content`).all() as Array<{
      key: string;
      content_json: string;
    }>;
    const settings: Record<string, unknown> = {};
    for (const r of rows) settings[r.key] = JSON.parse(r.content_json);
    res.json({ settings });
  });

  router.put('/settings/:key', adminOnly, (req: AuthedRequest, res) => {
    const allowedKeys = [
      'business_settings',
      'payment_settings',
      'privacy_settings',
      'about_content',
      'home_content',
      'pricing_packages',
    ];
    if (!allowedKeys.includes(req.params.key)) {
      return res.status(400).json({ error: 'Invalid settings key.' });
    }
    db.prepare(
      `INSERT INTO website_content (key, content_json, updated_by, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         content_json = excluded.content_json,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`
    ).run(req.params.key, JSON.stringify(req.body || {}), req.user!.id);

    logAudit(db, req.user!.id, 'settings_updated', 'website_content', req.params.key);
    res.json({ ok: true });
  });

  // Integrations status & test endpoints
  router.get('/integrations/status', (req: AuthedRequest, res) => {
    const teacher = db
      .prepare(`SELECT default_meeting_provider FROM teachers WHERE is_primary = 1 LIMIT 1`)
      .get() as { default_meeting_provider: string } | undefined;

    res.json({
      defaultVideoProvider: teacher?.default_meeting_provider || 'zoom',
      zoom: {
        configured: isZoomConfigured(),
        requiredEnvVars: ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'],
      },
      googleMeet: {
        oauthProvisioned: true,
        hasActiveSessionToken: Boolean(req.headers['x-google-access-token']),
      },
      gemini: {
        configured: isGeminiConfigured(),
        model: 'gemini-4-hydrogen',
      },
      email: {
        configured: isSmtpConfigured(),
        requiredEnvVars: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'],
      },
      database: {
        connected: true,
        engine: 'SQLite (Local Runtime) + Supabase PostgreSQL Migrations Ready',
      },
    });
  });

  router.post('/integrations/provider', adminOnly, (req: AuthedRequest, res) => {
    const { defaultVideoProvider } = req.body || {};
    if (!['zoom', 'google_meet'].includes(defaultVideoProvider)) {
      return res.status(400).json({ error: 'Provider must be zoom or google_meet.' });
    }
    db.prepare(`UPDATE teachers SET default_meeting_provider = ? WHERE is_primary = 1`).run(
      defaultVideoProvider
    );
    logAudit(db, req.user!.id, 'default_video_provider_changed', 'teacher', 'primary', {
      defaultVideoProvider,
    });
    res.json({ ok: true, defaultVideoProvider });
  });

  router.post('/integrations/zoom/test', adminOnly, async (_req, res) => {
    if (!isZoomConfigured()) {
      return res.status(400).json({
        connected: false,
        error: 'ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET are not configured.',
      });
    }
    try {
      const { getZoomAccessToken } = await import('../integrations.ts');
      await getZoomAccessToken();
      return res.json({ connected: true, message: 'Zoom Server-to-Server OAuth token verified.' });
    } catch (err: unknown) {
      return res.status(502).json({
        connected: false,
        error: err instanceof Error ? err.message : 'Zoom test failed.',
      });
    }
  });

  router.post('/integrations/google/test', adminOnly, async (req, res) => {
    const googleToken = req.headers['x-google-access-token'] as string | undefined;
    if (!googleToken) {
      return res.status(401).json({
        connected: false,
        error: 'Sign in with Google first to test Google Calendar & Meet connectivity.',
      });
    }
    try {
      const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
        headers: { Authorization: `Bearer ${googleToken}` },
      });
      if (!calRes.ok) {
        return res.status(502).json({
          connected: false,
          error: `Google Calendar returned HTTP ${calRes.status}`,
        });
      }
      const calData = (await calRes.json()) as { summary?: string; timeZone?: string };
      let meetNote = '';
      try {
        await fetchGoogleMeetConferenceRecords(googleToken);
        meetNote = ' & Meet API accessible';
      } catch {
        meetNote = ' (Calendar & Meet links enabled)';
      }
      return res.json({
        connected: true,
        message: `Connected to Google Calendar (${calData.summary || 'primary'}, ${calData.timeZone || 'UTC'})${meetNote}.`,
      });
    } catch (err: unknown) {
      return res.status(502).json({
        connected: false,
        error: err instanceof Error ? err.message : 'Google test failed.',
      });
    }
  });

  router.get('/audit-logs', adminOnly, (_req, res) => {
    const logs = db
      .prepare(
        `SELECT a.*, p.full_name AS actor_name, p.email AS actor_email
         FROM audit_logs a
         LEFT JOIN profiles p ON p.id = a.actor_id
         ORDER BY a.created_at DESC
         LIMIT 100`
      )
      .all();
    res.json({ logs });
  });

  return router;
}
