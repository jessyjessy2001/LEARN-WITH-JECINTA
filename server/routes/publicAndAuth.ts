import { Router } from 'express';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { newId } from '../db.ts';
import {
  createSession,
  hashPassword,
  hashToken,
  hydrateAuthUser,
  isAdminBootstrapNeeded,
  logAudit,
  resolveSessionUser,
  verifyPassword,
} from '../auth.ts';
import { checkTeacherTimeConflict, computeTeacherAvailableSlots } from '../availability.ts';
import { dispatchNotification, provisionClassVideoMeeting } from '../integrations.ts';

export function createPublicAndAuthRouter(db: DatabaseSync): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Public site bootstrap (courses, curriculum, pricing, about, published testimonials, teachers)
  router.get('/public/home', (_req, res) => {
    const contentRows = db.prepare(`SELECT key, content_json FROM website_content`).all() as Array<{
      key: string;
      content_json: string;
    }>;
    const content: Record<string, unknown> = {};
    for (const row of contentRows) {
      try {
        content[row.key] = JSON.parse(row.content_json);
      } catch {
        content[row.key] = {};
      }
    }

    const courses = db
      .prepare(
        `SELECT c.*, p.full_name AS teacher_name
         FROM courses c
         LEFT JOIN teachers t ON t.id = c.teacher_id
         LEFT JOIN profiles p ON p.id = t.profile_id
         WHERE c.status = 'published'
         ORDER BY c.subject ASC, c.price_kes ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const modules = db
      .prepare(`SELECT * FROM curriculum_modules WHERE status = 'published' ORDER BY sort_order ASC`)
      .all() as Array<Record<string, unknown>>;

    const lessons = db
      .prepare(`SELECT * FROM curriculum_lessons WHERE status = 'published' ORDER BY sort_order ASC`)
      .all() as Array<Record<string, unknown>>;

    const enrichedCourses = courses.map((course) => {
      const courseModules = modules
        .filter((m) => m.course_id === course.id)
        .map((m) => ({
          ...m,
          lessons: lessons.filter((l) => l.module_id === m.id),
        }));
      return { ...course, modules: courseModules };
    });

    const testimonials = db
      .prepare(
        `SELECT id, author_name, author_role, location, quote, outcome, created_at
         FROM testimonials WHERE is_published = 1 ORDER BY created_at DESC`
      )
      .all();

    const teachers = db
      .prepare(
        `SELECT t.id, p.full_name, t.title, t.bio, t.qualifications, t.subjects_json, p.timezone
         FROM teachers t
         JOIN profiles p ON p.id = t.profile_id
         WHERE t.is_active = 1
         ORDER BY t.is_primary DESC, p.full_name ASC`
      )
      .all();

    res.json({
      content,
      courses: enrichedCourses,
      testimonials,
      teachers,
    });
  });

  // Public live availability slots
  router.get('/public/availability', (req, res) => {
    const teacherId = String(req.query.teacherId || '');
    const dateStr = String(req.query.date || '');
    const duration = Number(req.query.duration || 60);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required.' });
    }

    let targetTeacherId = teacherId;
    if (!targetTeacherId) {
      const primary = db.prepare(`SELECT id FROM teachers WHERE is_primary = 1 LIMIT 1`).get() as
        | { id: string }
        | undefined;
      targetTeacherId = primary?.id || '';
    }
    if (!targetTeacherId) {
      return res.status(404).json({ error: 'No active teacher found.' });
    }

    const slots = computeTeacherAvailableSlots(db, targetTeacherId, dateStr, duration);
    return res.json({ teacherId: targetTeacherId, date: dateStr, duration, slots });
  });

  // Public booking submission with atomic double-booking prevention
  router.post('/public/bookings', async (req, res) => {
    try {
      const {
        courseId,
        teacherId,
        lessonType = 'individual',
        scheduledStartUtc,
        durationMinutes = 60,
        learnerName,
        learnerAgeGrade = '',
        parentName,
        parentEmail,
        parentPhone = '',
        userTimezone = 'Africa/Nairobi',
        currency = 'KES',
        notes = '',
        studentId = null,
      } = req.body || {};

      const resolvedEmail = String(parentEmail || req.body?.email || '').trim().toLowerCase();
      const resolvedContactName = String(parentName || learnerName || '').trim();

      if (!courseId || !scheduledStartUtc || !learnerName || !resolvedEmail) {
        return res.status(400).json({
          error: 'Course, date/time slot, learner name, and email address are required.',
        });
      }

      const course = db.prepare(`SELECT * FROM courses WHERE id = ? AND status = 'published'`).get(courseId) as
        | {
            id: string;
            title: string;
            teacher_id: string;
            price_kes: number;
            price_usd: number;
            price_gbp: number;
            price_eur: number;
          }
        | undefined;

      if (!course) {
        return res.status(404).json({ error: 'Selected course was not found.' });
      }

      const targetTeacherId = teacherId || course.teacher_id;
      const startMs = new Date(scheduledStartUtc).getTime();
      if (Number.isNaN(startMs)) {
        return res.status(400).json({ error: 'Invalid scheduledStartUtc timestamp.' });
      }
      const dur = Math.max(30, Math.min(180, Number(durationMinutes) || 60));
      const startIso = new Date(startMs).toISOString();
      const endIso = new Date(startMs + dur * 60 * 1000).toISOString();

      const currMap: Record<string, number> = {
        KES: course.price_kes,
        USD: course.price_usd,
        GBP: course.price_gbp,
        EUR: course.price_eur,
      };
      const safeCurrency = ['KES', 'USD', 'GBP', 'EUR'].includes(currency) ? currency : 'USD';
      const unitAmount = currMap[safeCurrency] ?? course.price_usd;
      const quotedAmount = lessonType === 'package' ? unitAmount * 4 : unitAmount;

      const sessionUser = resolveSessionUser(db, req.headers.authorization);
      const parentId = sessionUser?.parent_id || null;
      const linkedStudentId =
        sessionUser?.role === 'student'
          ? sessionUser.student_id || null
          : sessionUser?.role === 'parent'
          ? studentId
          : null;

      const bookingId = newId();
      const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const bookingRef = `JLH-${dateStamp}-${Math.floor(1000 + Math.random() * 9000)}`;
      let createdClassId: string | null = null;
      let autoConfirmed = false;
      let courseSubject = 'Mathematics';

      // Atomic transaction to prevent simultaneous double booking
      db.exec('BEGIN IMMEDIATE');
      try {
        const conflict = checkTeacherTimeConflict(db, targetTeacherId, startIso, endIso);
        if (!conflict.ok) {
          db.exec('ROLLBACK');
          return res.status(409).json({ error: conflict.reason });
        }

        const courseMeta = db.prepare(`SELECT subject FROM courses WHERE id = ?`).get(course.id) as
          | { subject: string }
          | undefined;
        courseSubject = courseMeta?.subject || 'Tutoring';

        const bizRow = db
          .prepare(`SELECT content_json FROM website_content WHERE key = 'business_settings'`)
          .get() as { content_json: string } | undefined;
        const biz = bizRow ? JSON.parse(bizRow.content_json) : { manual_approval_required: false };
        autoConfirmed = !biz.manual_approval_required;
        const initialStatus = autoConfirmed ? 'confirmed' : 'pending';

        let resolvedStudentId: string | null = linkedStudentId;

        if (autoConfirmed && !resolvedStudentId) {
          resolvedStudentId = newId();
          db.prepare(
            `INSERT INTO students (id, teacher_id, full_name, grade_level, timezone, status)
             VALUES (?, ?, ?, ?, ?, 'active')`
          ).run(
            resolvedStudentId,
            targetTeacherId,
            String(learnerName).trim(),
            String(learnerAgeGrade || 'Unspecified Grade').trim(),
            String(userTimezone || 'Africa/Nairobi')
          );
          if (parentId) {
            db.prepare(
              `INSERT OR IGNORE INTO parent_students (id, parent_id, student_id) VALUES (?, ?, ?)`
            ).run(newId(), parentId, resolvedStudentId);
          }
        }

        db.prepare(
          `INSERT INTO bookings
           (id, booking_ref, parent_id, student_id, teacher_id, course_id, lesson_type, scheduled_start_utc, scheduled_end_utc, duration_minutes, learner_name, learner_age_grade, parent_name, parent_email, parent_phone, user_timezone, currency, quoted_amount, notes, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          bookingId,
          bookingRef,
          parentId,
          resolvedStudentId,
          targetTeacherId,
          course.id,
          lessonType,
          startIso,
          endIso,
          dur,
          String(learnerName).trim(),
          String(learnerAgeGrade || '').trim(),
          resolvedContactName,
          resolvedEmail,
          String(parentPhone || '').trim(),
          String(userTimezone || 'Africa/Nairobi'),
          safeCurrency,
          quotedAmount,
          String(notes || '').trim(),
          initialStatus
        );

        if (autoConfirmed && resolvedStudentId) {
          db.prepare(
            `INSERT OR IGNORE INTO enrolments (id, student_id, course_id, teacher_id, status)
             VALUES (?, ?, ?, ?, 'active')`
          ).run(newId(), resolvedStudentId, course.id, targetTeacherId);

          createdClassId = newId();
          db.prepare(
            `INSERT INTO classes
             (id, booking_id, course_id, teacher_id, title, subject, topic, start_time_utc, end_time_utc, duration_minutes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`
          ).run(
            createdClassId,
            bookingId,
            course.id,
            targetTeacherId,
            `${courseSubject}: ${String(learnerName).trim()}`,
            courseSubject,
            course.title,
            startIso,
            endIso,
            dur
          );

          db.prepare(
            `INSERT INTO class_participants (id, class_id, student_id) VALUES (?, ?, ?)`
          ).run(newId(), createdClassId, resolvedStudentId);
        }

        // If parent account is linked, automatically generate an invoice
        if (parentId && quotedAmount > 0) {
          const payRow = db
            .prepare(`SELECT content_json FROM website_content WHERE key = 'payment_settings'`)
            .get() as { content_json: string } | undefined;
          const paySettings = payRow ? JSON.parse(payRow.content_json) : {};
          const instr = [paySettings.mpesa_instructions, paySettings.international_instructions]
            .filter(Boolean)
            .join('\n\n');
          const invId = newId();
          const invNum = `INV-${dateStamp}-${Math.floor(1000 + Math.random() * 9000)}`;
          const dueDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

          db.prepare(
            `INSERT INTO invoices (id, invoice_number, parent_id, student_id, booking_id, currency, total_amount, amount_paid, due_date, status, payment_instructions)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', ?)`
          ).run(invId, invNum, parentId, resolvedStudentId, bookingId, safeCurrency, quotedAmount, dueDate, instr);

          db.prepare(
            `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, line_total)
             VALUES (?, ?, ?, 1, ?, ?)`
          ).run(newId(), invId, `${course.title} (${lessonType}) — ${learnerName}`, quotedAmount, quotedAmount);
        }

        db.exec('COMMIT');
      } catch (txErr) {
        db.exec('ROLLBACK');
        throw txErr;
      }

      // Immediately provision Google Calendar + Meet OR Zoom ("whichever works") when auto-confirmed
      let meeting: Record<string, any> | null = null;
      let videoNote = '';
      if (createdClassId) {
        const teacherPref = db
          .prepare(`SELECT default_meeting_provider FROM teachers WHERE id = ?`)
          .get(targetTeacherId) as { default_meeting_provider: string } | undefined;

        const googleToken = req.headers['x-google-access-token'] as string | undefined;
        const provisioned = await provisionClassVideoMeeting(db, {
          classId: createdClassId,
          topic: `Jey Learning Hub — ${String(learnerName).trim()} (${courseSubject})`,
          description: `Online tutoring session (${bookingRef})\nCourse: ${course.title}\nContact: ${resolvedContactName} (${resolvedEmail})`,
          startTimeUtc: startIso,
          endTimeUtc: endIso,
          durationMinutes: dur,
          preferredProvider: teacherPref?.default_meeting_provider || 'google_meet',
          googleAccessToken: googleToken,
          attendeeEmails: [resolvedEmail],
        });
        meeting = provisioned.meeting;
        videoNote = provisioned.note;
      }

      // Notify teacher/admin
      const teacherRow = db
        .prepare(`SELECT profile_id FROM teachers WHERE id = ?`)
        .get(targetTeacherId) as { profile_id: string } | undefined;

      if (teacherRow) {
        await dispatchNotification(db, {
          userId: teacherRow.profile_id,
          eventType: 'new_booking',
          title: `New Booking ${bookingRef}: ${learnerName}`,
          body: `${resolvedContactName} booked ${course.title} (${lessonType}) for ${startIso} UTC. ${videoNote}`,
          linkPath: '/admin',
          sendEmail: true,
        });
      }

      if (sessionUser) {
        await dispatchNotification(db, {
          userId: sessionUser.id,
          eventType: 'new_booking',
          title: `Booking Confirmed (${bookingRef})`,
          body: `Your session for ${learnerName} in ${course.title} is scheduled.${meeting?.join_url ? ` Join link: ${meeting.join_url}` : ''}`,
          linkPath: sessionUser.role === 'student' ? '/student' : '/parent',
          sendEmail: true,
        });
      }

      logAudit(db, sessionUser?.id || null, 'booking_created', 'booking', bookingId, {
        bookingRef,
        courseId: course.id,
        createdClassId,
        provider: meeting?.provider || null,
      });

      const created = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(bookingId);
      return res.status(201).json({ booking: created, createdClassId, meeting, videoNote });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create booking.';
      return res.status(500).json({ error: msg });
    }
  });

  // Public contact form -> routes to primary teacher inbox
  router.post('/public/contact', async (req, res) => {
    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required.' });
    }
    const admin = db.prepare(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`).get() as
      | { id: string }
      | undefined;

    if (admin) {
      await dispatchNotification(db, {
        userId: admin.id,
        eventType: 'public_enquiry',
        title: `Enquiry from ${name}: ${subject || 'General Enquiry'}`,
        body: `From: ${name} (${email})\n\n${message}`,
        linkPath: '/admin/messages',
        sendEmail: true,
      });
    }
    return res.status(201).json({ ok: true, message: 'Thank you. Your message has been sent to Jecinta.' });
  });

  // ======================== AUTHENTICATION ========================

  router.get('/auth/status', (_req, res) => {
    const admin = db
      .prepare(`SELECT email, full_name FROM profiles WHERE role = 'admin' LIMIT 1`)
      .get() as { email: string; full_name: string } | undefined;

    res.json({
      needsAdminSetup: isAdminBootstrapNeeded(db),
      adminEmailHint: admin?.email || 'mainajecinta81@gmail.com',
    });
  });

  // One-time secure first-run Admin password claim (locks permanently once claimed or if ADMIN_PASSCODE is set)
  router.post('/auth/claim-admin', (req, res) => {
    if (!isAdminBootstrapNeeded(db)) {
      return res.status(403).json({
        error: 'Admin account is already configured. Please sign in with your password.',
      });
    }
    const { password, fullName, timezone } = req.body || {};
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'Admin password must be at least 8 characters.' });
    }

    const admin = db
      .prepare(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`)
      .get() as { id: string } | undefined;
    if (!admin) {
      return res.status(404).json({ error: 'Admin profile not found.' });
    }

    const pwHash = hashPassword(String(password));
    db.prepare(
      `UPDATE profiles
       SET password_hash = ?,
           full_name = COALESCE(NULLIF(?, ''), full_name),
           timezone = COALESCE(NULLIF(?, ''), timezone),
           updated_at = datetime('now')
       WHERE id = ? AND password_hash IS NULL`
    ).run(pwHash, fullName || '', timezone || '', admin.id);

    const token = createSession(db, admin.id);
    const user = hydrateAuthUser(db, admin.id);
    logAudit(db, admin.id, 'admin_account_claimed', 'profile', admin.id);

    return res.status(201).json({ token, user });
  });

  // Single learner/student account registration (no separate parent + child account split)
  router.post('/auth/register', async (req, res) => {
    const {
      email,
      password,
      fullName,
      gradeLevel = 'Grade 5',
      age = null,
      phone = '',
      country = 'Kenya',
      timezone = 'Africa/Nairobi',
      preferredCurrency = 'USD',
      learningGoals = '',
      recordingConsent = true,
      accountType = 'student',
    } = req.body || {};

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Full name, email, and password are required.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const exists = db.prepare(`SELECT id FROM profiles WHERE email = ?`).get(normalizedEmail);
    if (exists) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const profileId = newId();
    const parentId = newId();
    const studentId = accountType === 'parent' ? null : newId();
    const pwHash = hashPassword(String(password));
    const safeCurr = ['KES', 'USD', 'GBP', 'EUR'].includes(preferredCurrency)
      ? preferredCurrency
      : 'USD';

    const primaryTeacher = db
      .prepare(`SELECT id FROM teachers WHERE is_primary = 1 LIMIT 1`)
      .get() as { id: string } | undefined;

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO profiles (id, email, password_hash, full_name, role, phone, country, timezone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        profileId,
        normalizedEmail,
        pwHash,
        String(fullName).trim(),
        accountType === 'parent' ? 'parent' : 'student',
        String(phone).trim(),
        String(country).trim(),
        String(timezone).trim() || 'Africa/Nairobi'
      );

      // Keep billing/consent foreign keys satisfied under the single account
      db.prepare(
        `INSERT INTO parents (id, profile_id, preferred_currency) VALUES (?, ?, ?)`
      ).run(parentId, profileId, safeCurr);

      if (studentId) {
        db.prepare(
          `INSERT INTO students
           (id, profile_id, teacher_id, full_name, age, grade_level, country, timezone, learning_goals)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          studentId,
          profileId,
          primaryTeacher?.id || null,
          String(fullName).trim(),
          age ? Number(age) : null,
          String(gradeLevel || 'Grade 5').trim(),
          String(country).trim(),
          String(timezone).trim() || 'Africa/Nairobi',
          String(learningGoals || '').trim()
        );

        db.prepare(
          `INSERT INTO parent_students (id, parent_id, student_id, relationship, is_primary)
           VALUES (?, ?, ?, 'Self / Guardian', 1)`
        ).run(newId(), parentId, studentId);

        db.prepare(
          `INSERT INTO recording_consents (id, student_id, parent_id, consent_given, consent_text, consented_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          newId(),
          studentId,
          parentId,
          recordingConsent ? 1 : 0,
          'Educational recording review consent.',
          recordingConsent ? new Date().toISOString() : null
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    // Link any previous guest bookings matching this email to the student's single account
    db.prepare(`UPDATE bookings SET parent_id = ? WHERE parent_email = ? AND parent_id IS NULL`).run(
      parentId,
      normalizedEmail
    );
    if (studentId) {
      db.prepare(
        `UPDATE bookings SET student_id = ? WHERE parent_email = ? AND student_id IS NULL`
      ).run(studentId, normalizedEmail);
    }

    const token = createSession(db, profileId);
    const user = hydrateAuthUser(db, profileId);
    logAudit(
      db,
      profileId,
      accountType === 'parent' ? 'parent_registered' : 'student_registered',
      accountType === 'parent' ? 'parent' : 'student',
      studentId || parentId,
      { email: normalizedEmail }
    );

    return res.status(201).json({ token, user });
  });

  // Login for all roles (admin, teacher, parent, student)
  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const row = db
      .prepare(`SELECT id, role, password_hash, is_active FROM profiles WHERE email = ?`)
      .get(normalizedEmail) as
      | { id: string; role: string; password_hash: string | null; is_active: number }
      | undefined;

    if (!row || !row.is_active) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    let valid = false;
    if (
      row.role === 'admin' &&
      process.env.ADMIN_PASSCODE &&
      process.env.ADMIN_PASSCODE.trim().length > 0
    ) {
      const a = Buffer.from(String(password));
      const b = Buffer.from(process.env.ADMIN_PASSCODE);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        valid = true;
      }
    }

    if (!valid && row.password_hash) {
      valid = verifyPassword(String(password), row.password_hash);
    }

    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = createSession(db, row.id);
    const user = hydrateAuthUser(db, row.id);
    logAudit(db, row.id, 'user_logged_in', 'profile', row.id);

    return res.json({ token, user });
  });

  router.post('/auth/logout', (req, res) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const raw = auth.slice(7).trim();
      db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(raw));
    }
    res.json({ ok: true });
  });

  router.get('/auth/me', (req, res) => {
    const user = resolveSessionUser(db, req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    return res.json({ user });
  });

  return router;
}
