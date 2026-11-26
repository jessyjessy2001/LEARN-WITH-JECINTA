import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { newId } from '../db.ts';
import {
  hashPassword,
  logAudit,
  requireAuth,
  requireRoles,
  type AuthedRequest,
} from '../auth.ts';
import { dispatchNotification } from '../integrations.ts';

export function createPortalRouter(db: DatabaseSync): Router {
  const router = Router();
  const auth = requireAuth(db);

  // ======================== PARENT PORTAL ========================

  router.get('/parent/dashboard', auth, requireRoles(['parent']), (req: AuthedRequest, res) => {
    const parentId = req.user!.parent_id!;

    const children = db
      .prepare(
        `SELECT s.id, s.profile_id, s.teacher_id, s.full_name, s.date_of_birth, s.age, s.grade_level,
                s.curriculum_system, s.country, s.timezone, s.learning_goals, s.learning_preferences,
                s.status, s.enrolment_date,
                p.email AS student_login_email,
                tp.full_name AS teacher_name,
                rc.consent_given, rc.consented_at
         FROM parent_students ps
         JOIN students s ON s.id = ps.student_id
         LEFT JOIN profiles p ON p.id = s.profile_id
         LEFT JOIN teachers t ON t.id = s.teacher_id
         LEFT JOIN profiles tp ON tp.id = t.profile_id
         LEFT JOIN recording_consents rc ON rc.student_id = s.id AND rc.parent_id = ps.parent_id
         WHERE ps.parent_id = ?
         ORDER BY s.created_at ASC`
      )
      .all(parentId) as Array<Record<string, unknown>>;

    const childIds = children.map((c) => String(c.id));
    const placeholders = childIds.map(() => '?').join(',');

    const enrolments =
      childIds.length > 0
        ? db
            .prepare(
              `SELECT e.*, c.title AS course_title, c.subject, c.learning_level, p.full_name AS teacher_name
               FROM enrolments e
               JOIN courses c ON c.id = e.course_id
               LEFT JOIN teachers t ON t.id = e.teacher_id
               LEFT JOIN profiles p ON p.id = t.profile_id
               WHERE e.student_id IN (${placeholders})`
            )
            .all(...childIds)
        : [];

    // Classes for parent's children — explicitly omit private_teacher_notes and lock completed/cancelled meetings
    const classes =
      childIds.length > 0
        ? db
            .prepare(
              `SELECT cl.id, cl.course_id, cl.teacher_id, cl.title, cl.subject, cl.topic, cl.description,
                      cl.student_instructions, cl.start_time_utc, cl.end_time_utc, cl.duration_minutes,
                      cl.status, cp.student_id, cp.attendance_status,
                      c.title AS course_title, tp.full_name AS teacher_name,
                      vm.provider AS video_provider,
                      CASE WHEN cl.status IN ('completed', 'cancelled') THEN NULL ELSE vm.join_url END AS join_url,
                      vm.host_url, vm.status AS meeting_status,
                      CASE WHEN cl.status IN ('completed', 'cancelled') THEN 1 ELSE 0 END AS meeting_locked
               FROM class_participants cp
               JOIN classes cl ON cl.id = cp.class_id
               JOIN courses c ON c.id = cl.course_id
               LEFT JOIN teachers t ON t.id = cl.teacher_id
               LEFT JOIN profiles tp ON tp.id = t.profile_id
               LEFT JOIN video_meetings vm ON vm.class_id = cl.id AND vm.status NOT IN ('cancelled', 'ended')
               WHERE cp.student_id IN (${placeholders})
               ORDER BY cl.start_time_utc ASC`
            )
            .all(...childIds)
        : [];

    // Only PUBLISHED lesson notes, NEVER private_observations
    const lessonNotes =
      childIds.length > 0
        ? db
            .prepare(
              `SELECT ln.id, ln.class_id, ln.title, ln.content_markdown, ln.homework_instructions,
                      ln.is_ai_generated, ln.published_at, cl.subject, cl.topic, cl.start_time_utc,
                      cp.student_id
               FROM lesson_notes ln
               JOIN classes cl ON cl.id = ln.class_id
               JOIN class_participants cp ON cp.class_id = cl.id
               WHERE ln.status = 'published' AND cp.student_id IN (${placeholders})
               ORDER BY cl.start_time_utc DESC`
            )
            .all(...childIds)
        : [];

    // Only PUBLISHED recordings
    const recordings =
      childIds.length > 0
        ? db
            .prepare(
              `SELECT r.id, r.class_id, r.provider, r.playback_url, r.duration_seconds, r.published_at,
                      cl.title AS class_title, cl.subject, cl.topic, cl.start_time_utc, cp.student_id
               FROM recordings r
               JOIN classes cl ON cl.id = r.class_id
               JOIN class_participants cp ON cp.class_id = cl.id
               WHERE r.status = 'published' AND cp.student_id IN (${placeholders})`
            )
            .all(...childIds)
        : [];

    const assignments =
      childIds.length > 0
        ? db
            .prepare(
              `SELECT a.*, c.title AS course_title, c.subject,
                      sub.id AS submission_id, sub.status AS submission_status, sub.marks_awarded,
                      sub.teacher_feedback, sub.submitted_at, sub.reviewed_at
               FROM assignments a
               JOIN courses c ON c.id = a.course_id
               LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = a.student_id
               WHERE a.status = 'published' AND a.student_id IN (${placeholders})
               ORDER BY a.due_date_utc ASC`
            )
            .all(...childIds)
        : [];

    const bookings = db
      .prepare(
        `SELECT b.*, c.title AS course_title, c.subject
         FROM bookings b
         JOIN courses c ON c.id = b.course_id
         WHERE b.parent_id = ?
         ORDER BY b.created_at DESC`
      )
      .all(parentId);

    const invoices = db
      .prepare(
        `SELECT i.*, s.full_name AS student_name
         FROM invoices i
         LEFT JOIN students s ON s.id = i.student_id
         WHERE i.parent_id = ?
         ORDER BY i.created_at DESC`
      )
      .all(parentId);

    const payments = db
      .prepare(
        `SELECT p.*, i.invoice_number
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         WHERE p.parent_id = ?
         ORDER BY p.submitted_at DESC`
      )
      .all(parentId);

    const paySettingsRow = db
      .prepare(`SELECT content_json FROM website_content WHERE key = 'payment_settings'`)
      .get() as { content_json: string } | undefined;

    const privacyRow = db
      .prepare(`SELECT content_json FROM website_content WHERE key = 'privacy_settings'`)
      .get() as { content_json: string } | undefined;

    const messages = db
      .prepare(
        `SELECT m.*, sp.full_name AS sender_name, rp.full_name AS recipient_name
         FROM messages m
         JOIN profiles sp ON sp.id = m.sender_id
         JOIN profiles rp ON rp.id = m.recipient_id
         WHERE m.sender_id = ? OR m.recipient_id = ?
         ORDER BY m.created_at DESC`
      )
      .all(req.user!.id, req.user!.id);

    res.json({
      children,
      enrolments,
      classes,
      lessonNotes,
      recordings,
      assignments,
      bookings,
      invoices,
      payments,
      paymentSettings: paySettingsRow ? JSON.parse(paySettingsRow.content_json) : {},
      privacySettings: privacyRow ? JSON.parse(privacyRow.content_json) : {},
      messages,
    });
  });

  // Parent adds a child (and optionally creates a secure student login account)
  router.post('/parent/children', auth, requireRoles(['parent']), (req: AuthedRequest, res) => {
    const parentId = req.user!.parent_id!;
    const {
      fullName,
      age,
      gradeLevel,
      curriculumSystem = 'CBC / IGCSE',
      country = req.user!.country,
      timezone = req.user!.timezone,
      learningGoals = '',
      learningPreferences = '',
      recordingConsent = false,
      studentEmail = '',
      studentPassword = '',
    } = req.body || {};

    if (!fullName || !gradeLevel) {
      return res.status(400).json({ error: 'Child full name and grade/level are required.' });
    }

    let studentProfileId: string | null = null;
    if (studentEmail && studentPassword) {
      if (String(studentPassword).length < 6) {
        return res.status(400).json({ error: 'Student password must be at least 6 characters.' });
      }
      const normEmail = String(studentEmail).trim().toLowerCase();
      const exists = db.prepare(`SELECT id FROM profiles WHERE email = ?`).get(normEmail);
      if (exists) {
        return res.status(409).json({ error: 'That student login email is already registered.' });
      }
      studentProfileId = newId();
      db.prepare(
        `INSERT INTO profiles (id, email, password_hash, full_name, role, country, timezone)
         VALUES (?, ?, ?, ?, 'student', ?, ?)`
      ).run(
        studentProfileId,
        normEmail,
        hashPassword(String(studentPassword)),
        String(fullName).trim(),
        String(country).trim(),
        String(timezone).trim()
      );
    }

    const primaryTeacher = db
      .prepare(`SELECT id FROM teachers WHERE is_primary = 1 LIMIT 1`)
      .get() as { id: string } | undefined;

    const studentId = newId();
    const privacyRow = db
      .prepare(`SELECT content_json FROM website_content WHERE key = 'privacy_settings'`)
      .get() as { content_json: string } | undefined;
    const consentText = privacyRow
      ? JSON.parse(privacyRow.content_json).consent_text
      : 'Parental consent for educational lesson recordings.';

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO students
         (id, profile_id, teacher_id, full_name, age, grade_level, curriculum_system, country, timezone, learning_goals, learning_preferences)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        studentId,
        studentProfileId,
        primaryTeacher?.id || null,
        String(fullName).trim(),
        age ? Number(age) : null,
        String(gradeLevel).trim(),
        String(curriculumSystem).trim(),
        String(country).trim(),
        String(timezone).trim(),
        String(learningGoals).trim(),
        String(learningPreferences).trim()
      );

      db.prepare(
        `INSERT INTO parent_students (id, parent_id, student_id, relationship, is_primary)
         VALUES (?, ?, ?, 'Parent/Guardian', 1)`
      ).run(newId(), parentId, studentId);

      db.prepare(
        `INSERT INTO recording_consents (id, student_id, parent_id, consent_given, consent_text, consented_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        newId(),
        studentId,
        parentId,
        recordingConsent ? 1 : 0,
        consentText,
        recordingConsent ? new Date().toISOString() : null
      );

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    logAudit(db, req.user!.id, 'child_added', 'student', studentId, { fullName });
    const created = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId);
    return res.status(201).json({ student: created });
  });

  // Parent updates their own child profile / recording consent
  router.patch('/parent/children/:studentId', auth, requireRoles(['parent']), (req: AuthedRequest, res) => {
    const parentId = req.user!.parent_id!;
    const { studentId } = req.params;

    const ownership = db
      .prepare(`SELECT id FROM parent_students WHERE parent_id = ? AND student_id = ?`)
      .get(parentId, studentId);
    if (!ownership) {
      return res.status(403).json({ error: 'You can only update your own child’s profile.' });
    }

    const { fullName, gradeLevel, timezone, learningGoals, learningPreferences, recordingConsent } =
      req.body || {};

    db.prepare(
      `UPDATE students
       SET full_name = COALESCE(NULLIF(?, ''), full_name),
           grade_level = COALESCE(NULLIF(?, ''), grade_level),
           timezone = COALESCE(NULLIF(?, ''), timezone),
           learning_goals = COALESCE(?, learning_goals),
           learning_preferences = COALESCE(?, learning_preferences),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      fullName || '',
      gradeLevel || '',
      timezone || '',
      learningGoals ?? null,
      learningPreferences ?? null,
      studentId
    );

    if (typeof recordingConsent === 'boolean') {
      db.prepare(
        `UPDATE recording_consents
         SET consent_given = ?,
             consented_at = CASE WHEN ? = 1 THEN datetime('now') ELSE consented_at END,
             revoked_at = CASE WHEN ? = 0 THEN datetime('now') ELSE NULL END
         WHERE student_id = ? AND parent_id = ?`
      ).run(recordingConsent ? 1 : 0, recordingConsent ? 1 : 0, recordingConsent ? 1 : 0, studentId, parentId);
    }

    return res.json({ ok: true });
  });

  // Parent or Student submits manual payment reference (NEVER auto-verified!)
  router.post(
    '/parent/payments',
    auth,
    requireRoles(['parent', 'student']),
    async (req: AuthedRequest, res) => {
      const parentId = req.user!.parent_id || null;
      const studentId = req.user!.student_id || null;
      const { invoiceId, amount, paymentMethod, transactionReference, proofUrl = '' } = req.body || {};

      if (!invoiceId || !amount || !paymentMethod || !transactionReference) {
        return res.status(400).json({
          error: 'Invoice, amount paid, payment method, and transaction reference are required.',
        });
      }

      const invoice = db
        .prepare(
          `SELECT * FROM invoices WHERE id = ? AND (parent_id = ? OR student_id = ?)`
        )
        .get(invoiceId, parentId || '', studentId || '') as
        | { id: string; parent_id: string; student_id: string | null; currency: string; invoice_number: string }
        | undefined;

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found for your account.' });
      }

      const payId = newId();
      db.prepare(
        `INSERT INTO payments (id, invoice_id, parent_id, student_id, amount, currency, payment_method, transaction_reference, proof_url, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`
      ).run(
        payId,
        invoice.id,
        invoice.parent_id,
        invoice.student_id,
        Number(amount),
        invoice.currency,
        paymentMethod,
        String(transactionReference).trim(),
        String(proofUrl).trim()
      );

      db.prepare(
        `UPDATE invoices SET status = 'submitted', updated_at = datetime('now') WHERE id = ? AND status = 'pending'`
      ).run(invoice.id);

      const admin = db.prepare(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`).get() as
        | { id: string }
        | undefined;
      if (admin) {
        await dispatchNotification(db, {
          userId: admin.id,
          eventType: 'payment_submitted',
          title: `Payment Submitted for ${invoice.invoice_number}`,
          body: `${req.user!.full_name} submitted ${invoice.currency} ${amount} via ${paymentMethod} (Ref: ${transactionReference}). Pending verification.`,
          linkPath: '/admin/payments',
          sendEmail: true,
        });
      }

      logAudit(db, req.user!.id, 'payment_submitted', 'payment', payId, {
        invoiceId: invoice.id,
        transactionReference,
      });

      const created = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(payId);
      return res.status(201).json({ payment: created });
    }
  );

  // Parent or Student sends message to teacher/admin
  router.post(
    '/parent/messages',
    auth,
    requireRoles(['parent', 'student']),
    async (req: AuthedRequest, res) => {
      const parentId = req.user!.parent_id || null;
      const targetStudentId =
        req.user!.role === 'student' ? req.user!.student_id || null : req.body?.studentId || null;
      const { category = 'general', subject, body } = req.body || {};

      if (!subject || !body) {
        return res.status(400).json({ error: 'Subject and message body are required.' });
      }

      if (req.user!.role === 'parent' && targetStudentId && parentId) {
        const own = db
          .prepare(`SELECT id FROM parent_students WHERE parent_id = ? AND student_id = ?`)
          .get(parentId, targetStudentId);
        if (!own) return res.status(403).json({ error: 'Invalid child selection.' });
      }

    const admin = db.prepare(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`).get() as
      | { id: string }
      | undefined;
    if (!admin) return res.status(404).json({ error: 'No recipient teacher found.' });

    const msgId = newId();
    db.prepare(
      `INSERT INTO messages (id, sender_id, recipient_id, student_id, category, subject, body)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(msgId, req.user!.id, admin.id, targetStudentId, category, String(subject).trim(), String(body).trim());

    await dispatchNotification(db, {
      userId: admin.id,
      eventType: 'parent_message',
      title: `Message from ${req.user!.full_name}: ${subject}`,
      body: String(body).trim(),
      linkPath: '/admin/messages',
      sendEmail: true,
    });

    const created = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(msgId);
    return res.status(201).json({ message: created });
  });

  // ======================== STUDENT PORTAL ========================

  router.get('/student/dashboard', auth, requireRoles(['student']), (req: AuthedRequest, res) => {
    const studentId = req.user!.student_id!;

    const student = db
      .prepare(
        `SELECT s.id, s.full_name, s.grade_level, s.curriculum_system, s.country, s.timezone,
                s.learning_goals, s.enrolment_date, tp.full_name AS teacher_name
         FROM students s
         LEFT JOIN teachers t ON t.id = s.teacher_id
         LEFT JOIN profiles tp ON tp.id = t.profile_id
         WHERE s.id = ?`
      )
      .get(studentId);

    // Enrolled courses with real progress calculated from curriculum & completed classes
    const enrolments = db
      .prepare(
        `SELECT e.*, c.title AS course_title, c.subject, c.learning_level, c.duration_weeks,
                (SELECT COUNT(*) FROM curriculum_lessons cl2
                 JOIN curriculum_modules cm2 ON cm2.id = cl2.module_id
                 WHERE cm2.course_id = c.id AND cl2.status = 'published') AS total_curriculum_lessons,
                (SELECT COUNT(*) FROM classes cls
                 JOIN class_participants cp2 ON cp2.class_id = cls.id
                 WHERE cls.course_id = c.id AND cp2.student_id = e.student_id AND cls.status = 'completed') AS completed_classes_count
         FROM enrolments e
         JOIN courses c ON c.id = e.course_id
         WHERE e.student_id = ?`
      )
      .all(studentId);

    // Student classes — NEVER return private_teacher_notes and lock meeting links once completed/cancelled
    const classes = db
      .prepare(
        `SELECT cl.id, cl.course_id, cl.title, cl.subject, cl.topic, cl.description,
                cl.student_instructions, cl.start_time_utc, cl.end_time_utc, cl.duration_minutes,
                cl.status, cp.attendance_status,
                c.title AS course_title, tp.full_name AS teacher_name,
                vm.provider AS video_provider,
                CASE WHEN cl.status IN ('completed', 'cancelled') THEN NULL ELSE vm.join_url END AS join_url,
                vm.host_url, vm.status AS meeting_status,
                CASE WHEN cl.status IN ('completed', 'cancelled') THEN 1 ELSE 0 END AS meeting_locked,
                (SELECT COUNT(*) FROM lesson_notes ln WHERE ln.class_id = cl.id AND ln.status = 'published') AS has_published_notes,
                (SELECT COUNT(*) FROM recordings r WHERE r.class_id = cl.id AND r.status = 'published') AS has_published_recording
         FROM class_participants cp
         JOIN classes cl ON cl.id = cp.class_id
         JOIN courses c ON c.id = cl.course_id
         LEFT JOIN teachers t ON t.id = cl.teacher_id
         LEFT JOIN profiles tp ON tp.id = t.profile_id
         LEFT JOIN video_meetings vm ON vm.class_id = cl.id AND vm.status NOT IN ('cancelled', 'ended')
         WHERE cp.student_id = ?
         ORDER BY cl.start_time_utc ASC`
      )
      .all(studentId);

    const publishedNotes = db
      .prepare(
        `SELECT ln.id, ln.class_id, ln.title, ln.content_markdown, ln.homework_instructions,
                ln.is_ai_generated, ln.published_at, cl.subject, cl.topic, cl.start_time_utc
         FROM lesson_notes ln
         JOIN classes cl ON cl.id = ln.class_id
         JOIN class_participants cp ON cp.class_id = cl.id
         WHERE ln.status = 'published' AND cp.student_id = ?
         ORDER BY cl.start_time_utc DESC`
      )
      .all(studentId);

    const publishedRecordings = db
      .prepare(
        `SELECT r.id, r.class_id, r.provider, r.playback_url, r.duration_seconds, r.published_at,
                cl.title AS class_title, cl.subject, cl.topic, cl.start_time_utc
         FROM recordings r
         JOIN classes cl ON cl.id = r.class_id
         JOIN class_participants cp ON cp.class_id = cl.id
         WHERE r.status = 'published' AND cp.student_id = ?
         ORDER BY cl.start_time_utc DESC`
      )
      .all(studentId);

    const assignments = db
      .prepare(
        `SELECT a.*, c.title AS course_title, c.subject,
                sub.id AS submission_id, sub.written_answer, sub.attachment_url AS submission_attachment,
                sub.submission_link, sub.marks_awarded, sub.teacher_feedback, sub.status AS submission_status,
                sub.submitted_at, sub.reviewed_at
         FROM assignments a
         JOIN courses c ON c.id = a.course_id
         LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = ?
         WHERE a.status = 'published'
           AND (a.student_id = ? OR (a.student_id IS NULL AND a.course_id IN (SELECT course_id FROM enrolments WHERE student_id = ?)))
         ORDER BY a.due_date_utc ASC`
      )
      .all(studentId, studentId, studentId);

    const resources = db
      .prepare(
        `SELECT r.*
         FROM resources r
         WHERE r.is_published = 1
           AND (
             r.student_id = ?
             OR (r.student_id IS NULL AND r.course_id IN (SELECT course_id FROM enrolments WHERE student_id = ?))
             OR r.class_id IN (SELECT class_id FROM class_participants WHERE student_id = ?)
           )
         ORDER BY r.created_at DESC`
      )
      .all(studentId, studentId, studentId);

    const parentId = req.user!.parent_id || '';
    const invoices = db
      .prepare(
        `SELECT i.*, s.full_name AS student_name
         FROM invoices i
         LEFT JOIN students s ON s.id = i.student_id
         WHERE i.student_id = ? OR i.parent_id = ?
         ORDER BY i.created_at DESC`
      )
      .all(studentId, parentId);

    const payments = db
      .prepare(
        `SELECT p.*, i.invoice_number
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         WHERE p.student_id = ? OR p.parent_id = ?
         ORDER BY p.submitted_at DESC`
      )
      .all(studentId, parentId);

    const paySettingsRow = db
      .prepare(`SELECT content_json FROM website_content WHERE key = 'payment_settings'`)
      .get() as { content_json: string } | undefined;

    const notifications = db
      .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`)
      .all(req.user!.id);

    const messages = db
      .prepare(
        `SELECT m.*, sp.full_name AS sender_name, rp.full_name AS recipient_name
         FROM messages m
         JOIN profiles sp ON sp.id = m.sender_id
         JOIN profiles rp ON rp.id = m.recipient_id
         WHERE m.sender_id = ? OR m.recipient_id = ?
         ORDER BY m.created_at DESC`
      )
      .all(req.user!.id, req.user!.id);

    res.json({
      student,
      enrolments,
      classes,
      publishedNotes,
      publishedRecordings,
      assignments,
      resources,
      invoices,
      payments,
      paymentSettings: paySettingsRow ? JSON.parse(paySettingsRow.content_json) : {},
      notifications,
      messages,
    });
  });

  // Individual lesson review page — strictly scoped to participating student or linked parent or teacher/admin
  router.get('/lessons/:classId/review', auth, (req: AuthedRequest, res) => {
    const { classId } = req.params;
    const user = req.user!;

    const cls = db
      .prepare(
        `SELECT cl.id, cl.course_id, cl.teacher_id, cl.title, cl.subject, cl.topic, cl.description,
                cl.student_instructions, cl.start_time_utc, cl.end_time_utc, cl.duration_minutes,
                cl.status, c.title AS course_title, tp.full_name AS teacher_name
         FROM classes cl
         JOIN courses c ON c.id = cl.course_id
         LEFT JOIN teachers t ON t.id = cl.teacher_id
         LEFT JOIN profiles tp ON tp.id = t.profile_id
         WHERE cl.id = ?`
      )
      .get(classId) as Record<string, unknown> | undefined;

    if (!cls) return res.status(404).json({ error: 'Lesson not found.' });

    // Authorization check
    let authorized = user.role === 'admin' || user.role === 'teacher';
    if (user.role === 'student' && user.student_id) {
      const part = db
        .prepare(`SELECT id FROM class_participants WHERE class_id = ? AND student_id = ?`)
        .get(classId, user.student_id);
      authorized = Boolean(part);
    } else if (user.role === 'parent' && user.parent_id) {
      const part = db
        .prepare(
          `SELECT cp.id FROM class_participants cp
           JOIN parent_students ps ON ps.student_id = cp.student_id
           WHERE cp.class_id = ? AND ps.parent_id = ?`
        )
        .get(classId, user.parent_id);
      authorized = Boolean(part);
    }

    if (!authorized) {
      return res.status(403).json({ error: 'You are not authorized to view this lesson.' });
    }

    const isStaff = user.role === 'admin' || user.role === 'teacher';

    // NEVER return private_observations or unpublished notes to students/parents
    const note = db
      .prepare(
        `SELECT id, class_id, title, content_markdown, homework_instructions, is_ai_generated, status, published_at
         ${isStaff ? ', private_observations' : ''}
         FROM lesson_notes
         WHERE class_id = ? ${isStaff ? '' : "AND status = 'published'"}`
      )
      .get(classId);

    const recordings = db
      .prepare(
        `SELECT id, class_id, provider, playback_url, duration_seconds, status, published_at
         FROM recordings
         WHERE class_id = ? ${isStaff ? '' : "AND status = 'published'"}`
      )
      .all(classId);

    const resources = db
      .prepare(`SELECT * FROM resources WHERE class_id = ? AND is_published = 1`)
      .all(classId);

    const assignments = db
      .prepare(`SELECT * FROM assignments WHERE class_id = ? AND status = 'published'`)
      .all(classId);

    const isLocked = cls.status === 'completed' || cls.status === 'cancelled';
    const meeting = isLocked
      ? null
      : db
          .prepare(
            `SELECT provider, join_url, status FROM video_meetings WHERE class_id = ? AND status NOT IN ('cancelled', 'ended')`
          )
          .get(classId);

    return res.json({
      lesson: cls,
      note: note || null,
      recordings,
      resources,
      assignments,
      meeting: meeting || null,
    });
  });

  // Student submits assignment
  router.post(
    '/student/assignments/:assignmentId/submit',
    auth,
    requireRoles(['student']),
    async (req: AuthedRequest, res) => {
      const studentId = req.user!.student_id!;
      const { assignmentId } = req.params;
      const { writtenAnswer = '', attachmentUrl = '', submissionLink = '' } = req.body || {};

      if (!writtenAnswer && !attachmentUrl && !submissionLink) {
        return res.status(400).json({ error: 'Please provide a written answer, file, or link.' });
      }

      const assignment = db
        .prepare(`SELECT * FROM assignments WHERE id = ? AND status = 'published'`)
        .get(assignmentId) as
        | { id: string; title: string; teacher_id: string; student_id: string | null; due_date_utc: string | null }
        | undefined;

      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found.' });
      }
      if (assignment.student_id && assignment.student_id !== studentId) {
        return res.status(403).json({ error: 'This assignment is not assigned to your account.' });
      }

      const isLate =
        assignment.due_date_utc && new Date(assignment.due_date_utc).getTime() < Date.now();
      const status = isLate ? 'late' : 'submitted';

      const existing = db
        .prepare(`SELECT id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?`)
        .get(assignmentId, studentId) as { id: string } | undefined;

      const subId = existing?.id || newId();
      if (existing) {
        db.prepare(
          `UPDATE assignment_submissions
           SET written_answer = ?, attachment_url = ?, submission_link = ?, status = ?, submitted_at = datetime('now')
           WHERE id = ?`
        ).run(writtenAnswer, attachmentUrl, submissionLink, status, subId);
      } else {
        db.prepare(
          `INSERT INTO assignment_submissions (id, assignment_id, student_id, written_answer, attachment_url, submission_link, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(subId, assignmentId, studentId, writtenAnswer, attachmentUrl, submissionLink, status);
      }

      const teacher = db
        .prepare(`SELECT profile_id FROM teachers WHERE id = ?`)
        .get(assignment.teacher_id) as { profile_id: string } | undefined;
      if (teacher) {
        await dispatchNotification(db, {
          userId: teacher.profile_id,
          eventType: 'assignment_submitted',
          title: `Homework Submitted: ${assignment.title}`,
          body: `${req.user!.full_name} submitted their work for "${assignment.title}".`,
          linkPath: '/admin/submissions',
          sendEmail: true,
        });
      }

      const saved = db.prepare(`SELECT * FROM assignment_submissions WHERE id = ?`).get(subId);
      return res.status(201).json({ submission: saved });
    }
  );

  // ======================== SHARED AUTHENTICATED ROUTES ========================

  router.get('/notifications', auth, (req: AuthedRequest, res) => {
    const items = db
      .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`)
      .all(req.user!.id);
    res.json({ notifications: items });
  });

  router.post('/notifications/:id/read', auth, (req: AuthedRequest, res) => {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(
      req.params.id,
      req.user!.id
    );
    res.json({ ok: true });
  });

  router.post('/notifications/read-all', auth, (req: AuthedRequest, res) => {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.user!.id);
    res.json({ ok: true });
  });

  // Printable Invoice & Receipt detail
  router.get('/invoices/:id/detail', auth, (req: AuthedRequest, res) => {
    const invoice = db
      .prepare(
        `SELECT i.*, p.profile_id AS parent_profile_id, pr.full_name AS parent_name, pr.email AS parent_email,
                s.full_name AS student_name
         FROM invoices i
         JOIN parents p ON p.id = i.parent_id
         JOIN profiles pr ON pr.id = p.profile_id
         LEFT JOIN students s ON s.id = i.student_id
         WHERE i.id = ?`
      )
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    const isOwner =
      invoice.parent_profile_id === req.user!.id ||
      (req.user!.student_id && invoice.student_id === req.user!.student_id);
    if (req.user!.role !== 'admin' && !isOwner) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const items = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ?`).all(req.params.id);
    const payments = db
      .prepare(`SELECT * FROM payments WHERE invoice_id = ? ORDER BY submitted_at DESC`)
      .all(req.params.id);
    const bizRow = db
      .prepare(`SELECT content_json FROM website_content WHERE key = 'business_settings'`)
      .get() as { content_json: string } | undefined;

    return res.json({
      invoice,
      items,
      payments,
      business: bizRow ? JSON.parse(bizRow.content_json) : {},
    });
  });

  // Secure file upload (base64 JSON) confined strictly inside data/uploads
  router.post('/uploads', auth, (req: AuthedRequest, res) => {
    const { filename, dataBase64 } = req.body || {};
    if (!filename || !dataBase64) {
      return res.status(400).json({ error: 'Filename and base64 file content are required.' });
    }
    const cleanBase = path.basename(String(filename)).replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = `${Date.now()}-${newId().slice(0, 8)}-${cleanBase}`;
    const uploadDir = path.resolve(process.cwd(), 'data', 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });

    const rawBase64 = String(dataBase64).includes(',')
      ? String(dataBase64).split(',')[1]
      : String(dataBase64);
    const buf = Buffer.from(rawBase64, 'base64');
    if (buf.length > 15 * 1024 * 1024) {
      return res.status(413).json({ error: 'File exceeds 15MB maximum size.' });
    }

    const resolved = path.resolve(uploadDir, safeName);
    if (!resolved.startsWith(uploadDir + path.sep)) {
      return res.status(400).json({ error: 'Invalid upload path.' });
    }
    fs.writeFileSync(resolved, buf);
    return res.status(201).json({ fileUrl: `/api/files/${safeName}`, filename: safeName });
  });

  // Authenticated file download (prevents unauthenticated public listing of student uploads/recordings)
  router.get('/files/:filename', auth, (req: AuthedRequest, res) => {
    const uploadDir = path.resolve(process.cwd(), 'data', 'uploads');
    const safeName = path.basename(String(req.params.filename));
    const resolved = path.resolve(uploadDir, safeName);
    if (!resolved.startsWith(uploadDir + path.sep) || !fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'File not found.' });
    }
    return res.sendFile(resolved);
  });

  return router;
}
