import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function newId(): string {
  return crypto.randomUUID();
}

export function initDatabase(dbFilePath?: string): DatabaseSync {
  const targetPath =
    dbFilePath || path.resolve(process.cwd(), 'data', 'jey_learning_hub.db');

  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  const db = new DatabaseSync(targetPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    -- 1. profiles
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'parent', 'student')),
      phone TEXT DEFAULT '',
      country TEXT DEFAULT 'Kenya',
      timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
      avatar_url TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- sessions (Bearer tokens hashed with SHA-256)
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. parents
    CREATE TABLE IF NOT EXISTS parents (
      id TEXT PRIMARY KEY,
      profile_id TEXT UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      preferred_currency TEXT NOT NULL DEFAULT 'KES' CHECK (preferred_currency IN ('KES', 'USD', 'GBP', 'EUR')),
      billing_address TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 5. teachers
    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY,
      profile_id TEXT UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      title TEXT DEFAULT 'Founder & Lead Educator',
      bio TEXT DEFAULT '',
      qualifications TEXT DEFAULT '',
      subjects_json TEXT NOT NULL DEFAULT '["Mathematics","Coding & Computer Science"]',
      default_meeting_provider TEXT NOT NULL DEFAULT 'zoom' CHECK (default_meeting_provider IN ('zoom', 'google_meet')),
      is_primary INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 3. students
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      profile_id TEXT UNIQUE REFERENCES profiles(id) ON DELETE SET NULL,
      teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      date_of_birth TEXT DEFAULT '',
      age INTEGER,
      grade_level TEXT NOT NULL,
      curriculum_system TEXT DEFAULT 'CBC / IGCSE / International',
      country TEXT DEFAULT 'Kenya',
      timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
      learning_goals TEXT DEFAULT '',
      learning_preferences TEXT DEFAULT '',
      private_teacher_observations TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
      enrolment_date TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. parent_students
    CREATE TABLE IF NOT EXISTS parent_students (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      relationship TEXT DEFAULT 'Parent/Guardian',
      is_primary INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (parent_id, student_id)
    );

    -- 6. courses
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      subject TEXT NOT NULL CHECK (subject IN ('Mathematics', 'Coding & Computer Science', 'Science')),
      description TEXT NOT NULL,
      age_or_grade_range TEXT NOT NULL,
      learning_level TEXT NOT NULL,
      duration_weeks INTEGER NOT NULL DEFAULT 12,
      session_duration_minutes INTEGER NOT NULL DEFAULT 60,
      learning_objectives TEXT NOT NULL,
      learning_outcomes TEXT NOT NULL,
      price_kes REAL NOT NULL DEFAULT 780,
      price_usd REAL NOT NULL DEFAULT 6,
      price_gbp REAL NOT NULL DEFAULT 5,
      price_eur REAL NOT NULL DEFAULT 5.5,
      original_price_kes REAL NOT NULL DEFAULT 1300,
      original_price_usd REAL NOT NULL DEFAULT 10,
      original_price_gbp REAL NOT NULL DEFAULT 8,
      original_price_eur REAL NOT NULL DEFAULT 9,
      pricing_type TEXT NOT NULL DEFAULT 'per_lesson' CHECK (pricing_type IN ('trial', 'per_lesson', 'package', 'weekly_recurring')),
      package_lessons_count INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 7. curriculum_modules
    CREATE TABLE IF NOT EXISTS curriculum_modules (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      grade_or_age TEXT DEFAULT '',
      learning_level TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 8. curriculum_lessons
    CREATE TABLE IF NOT EXISTS curriculum_lessons (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL REFERENCES curriculum_modules(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      learning_objectives TEXT DEFAULT '',
      skills_covered TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 9. enrolments
    CREATE TABLE IF NOT EXISTS enrolments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
      enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (student_id, course_id)
    );

    -- 10. teacher_availability
    CREATE TABLE IF NOT EXISTS teacher_availability (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      break_start TEXT DEFAULT '',
      break_end TEXT DEFAULT '',
      teacher_timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
      min_notice_hours INTEGER NOT NULL DEFAULT 12,
      max_booking_days INTEGER NOT NULL DEFAULT 60,
      buffer_minutes INTEGER NOT NULL DEFAULT 15,
      allowed_durations_json TEXT NOT NULL DEFAULT '[45,60,90]',
      is_available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (teacher_id, day_of_week)
    );

    -- teacher_unavailable_dates
    CREATE TABLE IF NOT EXISTS teacher_unavailable_dates (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      unavailable_date TEXT NOT NULL,
      reason TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (teacher_id, unavailable_date)
    );

    -- 11. bookings
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      booking_ref TEXT UNIQUE NOT NULL,
      parent_id TEXT REFERENCES parents(id) ON DELETE SET NULL,
      student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      lesson_type TEXT NOT NULL DEFAULT 'individual' CHECK (lesson_type IN ('trial', 'individual', 'package', 'recurring_weekly')),
      scheduled_start_utc TEXT NOT NULL,
      scheduled_end_utc TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      learner_name TEXT NOT NULL,
      learner_age_grade TEXT DEFAULT '',
      parent_name TEXT NOT NULL,
      parent_email TEXT NOT NULL,
      parent_phone TEXT DEFAULT '',
      user_timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
      currency TEXT NOT NULL DEFAULT 'KES',
      quoted_amount REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'awaiting_payment', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 12. classes
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      curriculum_lesson_id TEXT REFERENCES curriculum_lessons(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT DEFAULT '',
      description TEXT DEFAULT '',
      student_instructions TEXT DEFAULT '',
      private_teacher_notes TEXT DEFAULT '',
      start_time_utc TEXT NOT NULL,
      end_time_utc TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      recurrence_group_id TEXT,
      recurrence_rule TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled', 'no_show')),
      attendance_status TEXT DEFAULT 'pending' CHECK (attendance_status IN ('pending', 'present', 'late', 'absent', 'excused')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 13. class_participants
    CREATE TABLE IF NOT EXISTS class_participants (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      attendance_status TEXT DEFAULT 'pending' CHECK (attendance_status IN ('pending', 'present', 'late', 'absent', 'excused')),
      joined_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (class_id, student_id)
    );

    -- 14. video_meetings
    CREATE TABLE IF NOT EXISTS video_meetings (
      id TEXT PRIMARY KEY,
      class_id TEXT UNIQUE NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('zoom', 'google_meet')),
      external_meeting_id TEXT DEFAULT '',
      join_url TEXT DEFAULT '',
      host_url TEXT DEFAULT '',
      passcode TEXT DEFAULT '',
      calendar_event_id TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'active', 'ended', 'cancelled', 'failed')),
      raw_metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 15. recordings
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
      provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('zoom', 'google_meet', 'manual')),
      external_recording_id TEXT DEFAULT '',
      storage_path TEXT DEFAULT '',
      playback_url TEXT DEFAULT '',
      transcript_text TEXT DEFAULT '',
      duration_seconds INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'awaiting_review' CHECK (status IN ('processing', 'available', 'awaiting_review', 'published', 'unpublished', 'failed')),
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 16. lesson_notes
    CREATE TABLE IF NOT EXISTS lesson_notes (
      id TEXT PRIMARY KEY,
      class_id TEXT UNIQUE NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content_markdown TEXT NOT NULL DEFAULT '',
      structured_summary_json TEXT DEFAULT '{}',
      homework_instructions TEXT DEFAULT '',
      private_observations TEXT DEFAULT '',
      is_ai_generated INTEGER NOT NULL DEFAULT 0,
      ai_model TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'unpublished')),
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 17. lesson_note_versions
    CREATE TABLE IF NOT EXISTS lesson_note_versions (
      id TEXT PRIMARY KEY,
      lesson_note_id TEXT NOT NULL REFERENCES lesson_notes(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      content_markdown TEXT NOT NULL,
      edited_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      change_summary TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 18. assignments
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      questions_json TEXT DEFAULT '[]',
      attachment_url TEXT DEFAULT '',
      external_link TEXT DEFAULT '',
      due_date_utc TEXT,
      max_marks INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 19. assignment_submissions
    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      written_answer TEXT DEFAULT '',
      attachment_url TEXT DEFAULT '',
      submission_link TEXT DEFAULT '',
      marks_awarded REAL,
      teacher_feedback TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('in_progress', 'submitted', 'late', 'correction_requested', 'reviewed')),
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,
      UNIQUE (assignment_id, student_id)
    );

    -- 20. resources
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
      student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      resource_type TEXT NOT NULL CHECK (resource_type IN ('worksheet', 'pdf', 'presentation', 'link', 'video', 'other')),
      file_url TEXT NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 22. invoices
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
      booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
      currency TEXT NOT NULL DEFAULT 'KES' CHECK (currency IN ('KES', 'USD', 'GBP', 'EUR')),
      total_amount REAL NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0,
      issue_date TEXT NOT NULL DEFAULT (date('now')),
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'partially_paid', 'paid', 'overdue', 'refunded', 'cancelled')),
      payment_instructions TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 23. invoice_items
    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL
    );

    -- 21. payments
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'KES',
      payment_method TEXT NOT NULL CHECK (payment_method IN ('mpesa', 'bank_transfer', 'international_wire', 'other')),
      transaction_reference TEXT NOT NULL,
      proof_url TEXT DEFAULT '',
      receipt_number TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('pending', 'submitted', 'verified', 'rejected', 'refunded')),
      admin_notes TEXT DEFAULT '',
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      verified_at TEXT,
      verified_by TEXT REFERENCES profiles(id) ON DELETE SET NULL
    );

    -- 24. notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'both')),
      email_status TEXT DEFAULT 'not_applicable' CHECK (email_status IN ('not_applicable', 'queued', 'sent', 'not_configured', 'failed')),
      email_error TEXT DEFAULT '',
      link_path TEXT DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 25. messages
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
      category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'lesson_enquiry', 'reschedule_request', 'extra_classes', 'payment_query')),
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 26. testimonials
    CREATE TABLE IF NOT EXISTS testimonials (
      id TEXT PRIMARY KEY,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      location TEXT DEFAULT '',
      quote TEXT NOT NULL,
      outcome TEXT DEFAULT '',
      is_published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 27. website_content
    CREATE TABLE IF NOT EXISTS website_content (
      key TEXT PRIMARY KEY,
      content_json TEXT NOT NULL,
      updated_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 28. integration_settings
    CREATE TABLE IF NOT EXISTS integration_settings (
      provider TEXT PRIMARY KEY,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'not_configured',
      last_checked_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 29. recording_consents
    CREATE TABLE IF NOT EXISTS recording_consents (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      consent_given INTEGER NOT NULL DEFAULT 0,
      consent_text TEXT NOT NULL,
      consented_at TEXT,
      revoked_at TEXT,
      UNIQUE (student_id, parent_id)
    );

    -- 30. audit_logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT DEFAULT '',
      details_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_teacher_time ON bookings(teacher_id, scheduled_start_utc, scheduled_end_utc);
    CREATE INDEX IF NOT EXISTS idx_classes_teacher_time ON classes(teacher_id, start_time_utc, end_time_utc);
    CREATE INDEX IF NOT EXISTS idx_class_participants_student ON class_participants(student_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_invoices_parent_status ON invoices(parent_id, status);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  `);

  // Safe schema migration for existing SQLite databases
  const courseCols = db.prepare(`PRAGMA table_info(courses)`).all() as Array<{ name: string }>;
  const hasOriginalPrice = courseCols.some((c) => c.name === 'original_price_usd');
  if (!hasOriginalPrice) {
    db.exec(`
      ALTER TABLE courses ADD COLUMN original_price_kes REAL NOT NULL DEFAULT 1300;
      ALTER TABLE courses ADD COLUMN original_price_usd REAL NOT NULL DEFAULT 10;
      ALTER TABLE courses ADD COLUMN original_price_gbp REAL NOT NULL DEFAULT 8;
      ALTER TABLE courses ADD COLUMN original_price_eur REAL NOT NULL DEFAULT 9;
    `);
  }

  // Ensure Add-to-Calendar never opens a Google Meet link from an old host_url row
  db.prepare(
    `UPDATE video_meetings
     SET host_url = ''
     WHERE provider = 'google_meet'
       AND host_url != ''
       AND host_url NOT LIKE '%calendar.google.com%'`
  ).run();

  seedPlatformDefaults(db);
  return db;
}

function seedPlatformDefaults(db: DatabaseSync) {
  // 1. Ensure primary founder / Super Admin profile (Jecinta Maina) exists WITHOUT a hardcoded password.
  // Password is claimed securely via first-run Admin Setup or ADMIN_PASSCODE env var.
  const existingAdmin = db
    .prepare(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`)
    .get() as { id: string } | undefined;

  let primaryTeacherId: string;

  if (!existingAdmin) {
    const adminProfileId = newId();
    primaryTeacherId = newId();
    db.prepare(
      `INSERT INTO profiles (id, email, password_hash, full_name, role, phone, country, timezone)
       VALUES (?, ?, NULL, ?, 'admin', ?, 'Kenya', 'Africa/Nairobi')`
    ).run(adminProfileId, 'mainajecinta81@gmail.com', 'Jecinta Maina', '+254 700 000 000');

    db.prepare(
      `INSERT INTO teachers (id, profile_id, title, bio, qualifications, subjects_json, default_meeting_provider, is_primary, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 'google_meet', 1, 1)`
    ).run(
      primaryTeacherId,
      adminProfileId,
      'Founder & Lead Coding and Math Educator',
      'Jecinta Maina is an educator and software specialist dedicated to making Mathematics and Coding clear, practical, and confidence-building for learners in Kenya and worldwide.',
      'B.Ed. Mathematics & Computer Science · Certified Online Educator · Curriculum Designer (CBC, IGCSE, IB & US Common Core)',
      JSON.stringify(['Mathematics', 'Coding & Computer Science'])
    );
  } else {
    const teacherRow = db
      .prepare(`SELECT id, subjects_json FROM teachers WHERE profile_id = ?`)
      .get(existingAdmin.id) as { id: string; subjects_json: string } | undefined;
    primaryTeacherId = teacherRow?.id || newId();
    if (teacherRow && teacherRow.subjects_json.includes('Science')) {
      db.prepare(
        `UPDATE teachers
         SET title = ?, bio = ?, qualifications = ?, subjects_json = ?
         WHERE id = ?`
      ).run(
        'Founder & Lead Coding and Math Educator',
        'Jecinta Maina is an educator and software specialist dedicated to making Mathematics and Coding clear, practical, and confidence-building for learners in Kenya and worldwide.',
        'B.Ed. Mathematics & Computer Science · Certified Online Educator · Curriculum Designer (CBC, IGCSE, IB & US Common Core)',
        JSON.stringify(['Mathematics', 'Coding & Computer Science']),
        teacherRow.id
      );
    }
  }

  // 2. Seed default teacher availability (Mon-Sat, 08:00-18:00 Africa/Nairobi) if none exists
  const availCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM teacher_availability WHERE teacher_id = ?`).get(primaryTeacherId) as { c: number }
  ).c;

  if (availCount === 0) {
    const stmt = db.prepare(
      `INSERT INTO teacher_availability
       (id, teacher_id, day_of_week, start_time, end_time, break_start, break_end, teacher_timezone, min_notice_hours, max_booking_days, buffer_minutes, allowed_durations_json, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Africa/Nairobi', 6, 60, 15, '[45,60,90]', ?)`
    );
    // 0=Sun (off), 1-5=Mon-Fri (08:00-18:00, lunch 13:00-14:00), 6=Sat (09:00-15:00)
    stmt.run(newId(), primaryTeacherId, 0, '09:00', '13:00', '', '', 0);
    for (let d = 1; d <= 5; d++) {
      stmt.run(newId(), primaryTeacherId, d, '08:00', '18:00', '13:00', '14:00', 1);
    }
    stmt.run(newId(), primaryTeacherId, 6, '09:00', '15:00', '12:00', '12:30', 1);
  }

  // 3. Seed published Courses & Curriculum if empty (real catalog, editable from Admin Dashboard)
  const courseCount = (db.prepare(`SELECT COUNT(*) AS c FROM courses`).get() as { c: number }).c;
  if (courseCount === 0) {
    const courses = [
      {
        slug: 'foundations-mathematics-g1-4',
        title: 'Foundations of Mathematics (Grades 1–4)',
        subject: 'Mathematics',
        description:
          'Number sense, mental arithmetic, fractions, measurement, and visual geometry tailored for lower primary learners across CBC, IGCSE, and international frameworks.',
        age_or_grade_range: 'Grades 1–4 (Ages 6–10)',
        learning_level: 'Foundational',
        duration_weeks: 12,
        session_duration_minutes: 45,
        learning_objectives:
          'Build fluent place-value understanding, addition/subtraction/multiplication mastery, fraction sense, and word-problem reasoning.',
        learning_outcomes:
          'Learners solve multi-step problems confidently without rote memorization and explain mathematical thinking clearly.',
        price_kes: 780,
        price_usd: 6,
        price_gbp: 5,
        price_eur: 5.5,
        original_price_kes: 1300,
        original_price_usd: 10,
        original_price_gbp: 8,
        original_price_eur: 9,
        pricing_type: 'per_lesson',
        package_lessons_count: 1,
        modules: [
          {
            title: 'Number Sense & Place Value',
            lessons: [
              { title: 'Whole Numbers & Place Value Mastery', topic: 'Hundreds, thousands, and number lines', skills: 'Estimation, comparing, rounding' },
              { title: 'Mental Strategies for Operations', topic: 'Regrouping and multiplication arrays', skills: 'Mental fluency, fact families' },
            ],
          },
          {
            title: 'Fractions, Measurement & Geometry',
            lessons: [
              { title: 'Visual Fractions & Equivalence', topic: 'Fraction bars, halves, quarters, thirds', skills: 'Equivalent fractions, visual modeling' },
              { title: 'Shapes, Perimeter & Time', topic: '2D polygons, clock reading, metric units', skills: 'Spatial reasoning, unit conversion' },
            ],
          },
        ],
      },
      {
        slug: 'intermediate-mathematics-g5-8',
        title: 'Upper Primary & Middle School Mathematics (Grades 5–8)',
        subject: 'Mathematics',
        description:
          'Rigorous problem solving covering ratios, percentages, pre-algebra, linear equations, coordinate geometry, and data interpretation.',
        age_or_grade_range: 'Grades 5–8 (Ages 10–14)',
        learning_level: 'Intermediate',
        duration_weeks: 16,
        session_duration_minutes: 60,
        learning_objectives:
          'Master proportional reasoning, algebraic expressions, linear equations, geometric proofs, and exam-ready problem structuring.',
        learning_outcomes:
          'Students transition smoothly into secondary algebra and international checkpoint assessments with strong analytical habits.',
        price_kes: 780,
        price_usd: 6,
        price_gbp: 5,
        price_eur: 5.5,
        original_price_kes: 1300,
        original_price_usd: 10,
        original_price_gbp: 8,
        original_price_eur: 9,
        pricing_type: 'per_lesson',
        package_lessons_count: 1,
        modules: [
          {
            title: 'Ratios, Proportions & Percentages',
            lessons: [
              { title: 'Ratios & Rate Applications', topic: 'Unit rates, scaling, and speed problems', skills: 'Proportional reasoning' },
              { title: 'Percentages & Financial Literacy', topic: 'Discounts, interest, percentage change', skills: 'Real-world numeracy' },
            ],
          },
          {
            title: 'Pre-Algebra & Linear Equations',
            lessons: [
              { title: 'Algebraic Expressions & Simplification', topic: 'Variables, terms, distributive property', skills: 'Symbolic manipulation' },
              { title: 'Solving One- & Two-Step Equations', topic: 'Balancing equations and word problems', skills: 'Algebraic modeling' },
            ],
          },
        ],
      },
      {
        slug: 'creative-coding-scratch-ages-6-10',
        title: 'Creative Coding & Computational Thinking (Ages 6–10)',
        subject: 'Coding & Computer Science',
        description:
          'Interactive block-based programming in Scratch, logical sequencing, loops, events, and storytelling games that introduce real computer science principles.',
        age_or_grade_range: 'Ages 6–10 (Grades 1–5)',
        learning_level: 'Beginner',
        duration_weeks: 10,
        session_duration_minutes: 45,
        learning_objectives:
          'Understand algorithms, sequence, loops, conditionals, variables, and debugging through guided creative projects.',
        learning_outcomes:
          'Students design and present their own interactive animations, math quizzes, and playable mini-games.',
        price_kes: 780,
        price_usd: 6,
        price_gbp: 5,
        price_eur: 5.5,
        original_price_kes: 1300,
        original_price_usd: 10,
        original_price_gbp: 8,
        original_price_eur: 9,
        pricing_type: 'per_lesson',
        package_lessons_count: 1,
        modules: [
          {
            title: 'Logic, Loops & Events',
            lessons: [
              { title: 'Algorithms & Step-by-Step Thinking', topic: 'Commands, sprites, and motion coordinates', skills: 'Sequencing, Cartesian coordinates' },
              { title: 'Loops, Conditionals & Scoreboards', topic: 'Repeat blocks, if/then logic, variables', skills: 'Control flow, state tracking' },
            ],
          },
        ],
      },
      {
        slug: 'python-web-engineering-ages-11-16',
        title: 'Python Programming & Web Foundations (Ages 11–16)',
        subject: 'Coding & Computer Science',
        description:
          'Text-based programming in Python, data structures, functions, problem solving, and foundational HTML/CSS/JavaScript web projects.',
        age_or_grade_range: 'Ages 11–16 (Grades 6–10)',
        learning_level: 'Intermediate to Advanced',
        duration_weeks: 16,
        session_duration_minutes: 60,
        learning_objectives:
          'Write clean Python programs using functions, lists, dictionaries, file handling, and build structured web interfaces.',
        learning_outcomes:
          'Learners build portfolio-ready coding projects and develop algorithmic thinking aligned with IGCSE/GCSE Computer Science.',
        price_kes: 780,
        price_usd: 6,
        price_gbp: 5,
        price_eur: 5.5,
        original_price_kes: 1300,
        original_price_usd: 10,
        original_price_gbp: 8,
        original_price_eur: 9,
        pricing_type: 'per_lesson',
        package_lessons_count: 1,
        modules: [
          {
            title: 'Python Core Programming',
            lessons: [
              { title: 'Variables, Types & Control Flow', topic: 'Strings, integers, loops, and functions', skills: 'Python syntax, decomposition' },
              { title: 'Lists, Dictionaries & Mini-Apps', topic: 'Data structures and CLI problem solving', skills: 'Data modeling, debugging' },
            ],
          },
        ],
      },
    ];

    const insertCourse = db.prepare(
      `INSERT INTO courses (id, teacher_id, title, slug, subject, description, age_or_grade_range, learning_level, duration_weeks, session_duration_minutes, learning_objectives, learning_outcomes, price_kes, price_usd, price_gbp, price_eur, original_price_kes, original_price_usd, original_price_gbp, original_price_eur, pricing_type, package_lessons_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`
    );
    const insertMod = db.prepare(
      `INSERT INTO curriculum_modules (id, course_id, title, description, grade_or_age, learning_level, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'published')`
    );
    const insertLesson = db.prepare(
      `INSERT INTO curriculum_lessons (id, module_id, title, topic, learning_objectives, skills_covered, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'published')`
    );

    for (const c of courses) {
      const courseId = newId();
      insertCourse.run(
        courseId,
        primaryTeacherId,
        c.title,
        c.slug,
        c.subject,
        c.description,
        c.age_or_grade_range,
        c.learning_level,
        c.duration_weeks,
        c.session_duration_minutes,
        c.learning_objectives,
        c.learning_outcomes,
        c.price_kes,
        c.price_usd,
        c.price_gbp,
        c.price_eur,
        c.original_price_kes,
        c.original_price_usd,
        c.original_price_gbp,
        c.original_price_eur,
        c.pricing_type,
        c.package_lessons_count
      );
      c.modules.forEach((m, mi) => {
        const modId = newId();
        insertMod.run(modId, courseId, m.title, c.description, c.age_or_grade_range, c.learning_level, mi + 1);
        m.lessons.forEach((l, li) => {
          insertLesson.run(newId(), modId, l.title, l.topic, c.learning_objectives, l.skills, li + 1);
        });
      });
    }
  } else {
    // Update previously seeded default prices (20/25/30 USD) to the discounted $6 USD (was $10 USD) rate
    db.prepare(
      `UPDATE courses
       SET price_kes = 780, price_usd = 6, price_gbp = 5, price_eur = 5.5,
           original_price_kes = 1300, original_price_usd = 10, original_price_gbp = 8, original_price_eur = 9
       WHERE slug IN (
         'foundations-mathematics-g1-4',
         'intermediate-mathematics-g5-8',
         'creative-coding-scratch-ages-6-10',
         'python-web-engineering-ages-11-16'
       ) AND price_usd IN (20, 25, 30)`
    ).run();

    // Archive previously seeded Science courses since Jecinta teaches Coding and Mathematics only
    db.prepare(
      `UPDATE courses
       SET status = 'archived'
       WHERE subject = 'Science'
         AND slug IN ('integrated-science-g1-4', 'integrated-science-g5-8')`
    ).run();
  }

  // 4. Seed editable website_content (Home, About, Business, Payment Instructions, Privacy)
  const upsertContent = db.prepare(
    `INSERT OR IGNORE INTO website_content (key, content_json) VALUES (?, ?)`
  );

  upsertContent.run(
    'business_settings',
    JSON.stringify({
      business_name: 'Jey Learning Hub',
      personal_identity: 'Learn with Jecinta',
      tagline: 'Learn. Create. Grow.',
      founder_name: 'Jecinta Maina',
      contact_email: 'mainajecinta81@gmail.com',
      contact_phone: '+254 700 000 000',
      location: 'Nairobi, Kenya (Serving Worldwide)',
      default_timezone: 'Africa/Nairobi',
      manual_approval_required: false,
      supported_currencies: ['KES', 'USD', 'GBP', 'EUR'],
      social_links: {
        linkedin: '',
        youtube: '',
        instagram: '',
      },
      cancellation_policy: 'Classes may be rescheduled or cancelled up to 12 hours before the scheduled start time.',
    })
  );

  upsertContent.run(
    'payment_settings',
    JSON.stringify({
      mpesa_enabled: true,
      mpesa_paybill_or_till: 'Configure Paybill / Till in Admin Settings',
      mpesa_account_name: 'Jey Learning Hub',
      mpesa_instructions: '1. Go to M-Pesa -> Lipa na M-Pesa. 2. Enter the configured Paybill/Till and Account Name (Student Full Name). 3. Submit the M-Pesa confirmation code on your invoice.',
      bank_enabled: true,
      bank_name: 'Configure Bank Name in Admin Settings',
      bank_account_name: 'Jey Learning Hub',
      bank_account_number: 'Configure Account Number in Admin Settings',
      bank_branch_or_swift: 'Configure Branch / SWIFT Code',
      international_instructions: 'For USD, GBP, and EUR transfers, use SWIFT/Wise transfer to the configured account and submit your transfer reference on the invoice page.',
    })
  );

  upsertContent.run(
    'privacy_settings',
    JSON.stringify({
      require_parental_recording_consent: true,
      consent_text:
        'I, as the parent or legal guardian, consent to online tutoring sessions for my child being recorded solely for educational review by my child, myself, and the assigned teacher, in accordance with Kenya Data Protection Act and international child privacy safeguards.',
      retention_days: 365,
      allow_student_recording_playback: true,
    })
  );

  const newAboutContent = JSON.stringify({
    headline: 'Meet Jecinta Maina — Founder & Lead Educator',
    subtitle: 'Learn with Jecinta · Practical, structured, and deeply personal online Coding & Math tutoring.',
    bio_paragraphs: [
      'Jey Learning Hub was founded by Jecinta Maina to give primary and middle school learners a calm, structured, and encouraging environment to master Mathematics and Coding & Computer Science.',
      'Whether a family is following the Kenyan CBC, British IGCSE, IB, or an international curriculum across timezones, every learner receives an individual learning path, clear conceptual explanations, and measurable weekly progress.',
      'After every lesson, parents and students receive structured lesson notes, targeted practice assignments, and optional reviewed lesson recordings—so learning continues smoothly beyond the live session.'
    ],
    qualifications: [
      'Specialist Educator in Mathematics and Coding & Computer Science',
      'Experience across Kenyan CBC, Cambridge IGCSE, and International Curricula',
      '1-on-1 & Small-Group Online Pedagogy with Project-Based Coding & Math Mastery'
    ],
    philosophy:
      'Students thrive when concepts are broken down visually, connected to real-world problem solving, and reinforced with thoughtful feedback—never rushed or reduced to memorization.'
  });
  upsertContent.run('about_content', newAboutContent);
  const existingAboutRow = db
    .prepare(`SELECT content_json FROM website_content WHERE key = 'about_content'`)
    .get() as { content_json: string } | undefined;
  if (existingAboutRow && existingAboutRow.content_json.includes('Science')) {
    db.prepare(`UPDATE website_content SET content_json = ? WHERE key = 'about_content'`).run(newAboutContent);
  }

  const newHomeContent = JSON.stringify({
    hero_headline: 'Personalised Mathematics & Coding Tutoring for Curious Young Minds',
    hero_subheadline:
      'Live 1-on-1 and guided online lessons led by Jecinta Maina. Serving learners across Kenya, the UK, Europe, and North America in your local timezone.',
    why_choose: [
      {
        title: 'Personalised Learning Paths',
        detail: 'Diagnostic pacing matched to your child’s curriculum (CBC, IGCSE, IB, or US) and confidence level.'
      },
      {
        title: 'Transparent Parent Visibility',
        detail: 'Structured post-lesson summaries, attendance records, graded homework, and reviewed recordings in one parent portal.'
      },
      {
        title: 'Built for Global Timezones',
        detail: 'Every class time automatically adapts to your family’s local timezone with automated reminders.'
      },
      {
        title: 'Practical Coding & Math Fluency',
        detail: 'From fraction mastery and algebra to Scratch and Python code, students build lasting analytical habits.'
      }
    ],
    how_it_works: [
      { step: '01', title: 'Choose Subject & Time', detail: 'Select Mathematics or Coding & Computer Science and pick an available slot in your local timezone.' },
      { step: '02', title: 'Join Live Interactive Class', detail: 'Enter your dedicated Google Meet or Zoom classroom directly from your student or parent portal.' },
      { step: '03', title: 'Review Notes, Recording & Practice', detail: 'Access teacher-approved lesson summaries, reviewed recordings, and guided homework after class.' }
    ]
  });
  upsertContent.run('home_content', newHomeContent);
  const existingHomeRow = db
    .prepare(`SELECT content_json FROM website_content WHERE key = 'home_content'`)
    .get() as { content_json: string } | undefined;
  if (existingHomeRow && existingHomeRow.content_json.includes('Science')) {
    db.prepare(`UPDATE website_content SET content_json = ? WHERE key = 'home_content'`).run(newHomeContent);
  }

  const newPricingPackages = JSON.stringify([
    {
      id: 'trial',
      name: 'Diagnostic Trial Session',
      billing: '45-minute assessment & mini-lesson (40% Off)',
      description:
        'Meet Jecinta, assess current mastery, and build a tailored learning roadmap — discounted from $10 to $6.',
      prices: { KES: 780, USD: 6, GBP: 5, EUR: 5.5 },
      original_prices: { KES: 1300, USD: 10, GBP: 8, EUR: 9 },
    },
    {
      id: 'individual',
      name: 'Single 1-on-1 Session',
      billing: 'Pay-as-you-go per live session (40% Off)',
      description:
        'Flexible scheduling for targeted topic support, exam revision, or coding projects — $6 USD per session (normally $10 USD).',
      prices: { KES: 780, USD: 6, GBP: 5, EUR: 5.5 },
      original_prices: { KES: 1300, USD: 10, GBP: 8, EUR: 9 },
    },
    {
      id: 'weekly_4',
      name: 'Monthly 4-Session Bundle',
      billing: '4 sessions / month ($6 per session)',
      description:
        'Consistent weekly momentum with structured lesson summaries, assignments, and parent progress updates.',
      prices: { KES: 3120, USD: 24, GBP: 20, EUR: 22 },
      original_prices: { KES: 5200, USD: 40, GBP: 32, EUR: 36 },
    },
    {
      id: 'weekly_8',
      name: 'Intensive 8-Session Bundle',
      billing: '8 sessions / month ($6 per session)',
      description:
        'Recommended for accelerated mastery, multi-subject learners, or upcoming checkpoint examinations.',
      prices: { KES: 6240, USD: 48, GBP: 40, EUR: 44 },
      original_prices: { KES: 10400, USD: 80, GBP: 64, EUR: 72 },
    },
  ]);

  upsertContent.run('pricing_packages', newPricingPackages);
  // Migrate existing untouched pricing_packages row on disk from old $25 pricing to $10 -> $6
  const existingPkgRow = db
    .prepare(`SELECT content_json FROM website_content WHERE key = 'pricing_packages'`)
    .get() as { content_json: string } | undefined;
  if (existingPkgRow && existingPkgRow.content_json.includes('"USD":25')) {
    db.prepare(`UPDATE website_content SET content_json = ? WHERE key = 'pricing_packages'`).run(
      newPricingPackages
    );
  }

  // 5. Integration settings rows
  const upsertIntegration = db.prepare(
    `INSERT OR IGNORE INTO integration_settings (provider, is_enabled, config_json, status) VALUES (?, ?, ?, ?)`
  );
  upsertIntegration.run('zoom', 1, JSON.stringify({ auto_cloud_recording: true, waiting_room: true }), 'env_check');
  upsertIntegration.run('google_meet', 1, JSON.stringify({ create_calendar_event: true }), 'oauth_ready');
  upsertIntegration.run('gemini', 1, JSON.stringify({ model: 'gemini-4-hydrogen', require_teacher_review: true }), 'env_check');
  upsertIntegration.run('email', 0, JSON.stringify({ reminders_24h: true, reminders_1h: true, reminders_15m: true }), 'env_check');
}
