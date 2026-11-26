-- Jey Learning Hub — Supabase PostgreSQL Initial Schema (30 Core Tables)
-- Run via `supabase db push` or Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'parent', 'student')),
  phone TEXT,
  country TEXT DEFAULT 'Kenya',
  timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. parents
CREATE TABLE IF NOT EXISTS public.parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  preferred_currency TEXT NOT NULL DEFAULT 'KES' CHECK (preferred_currency IN ('KES', 'USD', 'GBP', 'EUR')),
  billing_address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. teachers (created before students/courses for FK)
CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'Founder & Lead Educator',
  bio TEXT,
  qualifications TEXT,
  subjects TEXT[] DEFAULT ARRAY['Mathematics', 'Coding & Computer Science', 'Science'],
  default_meeting_provider TEXT NOT NULL DEFAULT 'zoom' CHECK (default_meeting_provider IN ('zoom', 'google_meet')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. students
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  age INTEGER,
  grade_level TEXT NOT NULL,
  curriculum_system TEXT DEFAULT 'CBC / IGCSE / International',
  country TEXT DEFAULT 'Kenya',
  timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  learning_goals TEXT,
  learning_preferences TEXT,
  private_teacher_observations TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  enrolment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. parent_students
CREATE TABLE IF NOT EXISTS public.parent_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  relationship TEXT DEFAULT 'Parent/Guardian',
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parent_id, student_id)
);

-- 6. courses
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
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
  price_kes NUMERIC(12,2) NOT NULL DEFAULT 2500,
  price_usd NUMERIC(12,2) NOT NULL DEFAULT 25,
  price_gbp NUMERIC(12,2) NOT NULL DEFAULT 20,
  price_eur NUMERIC(12,2) NOT NULL DEFAULT 23,
  pricing_type TEXT NOT NULL DEFAULT 'per_lesson' CHECK (pricing_type IN ('trial', 'per_lesson', 'package', 'weekly_recurring')),
  package_lessons_count INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. curriculum_modules
CREATE TABLE IF NOT EXISTS public.curriculum_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  grade_or_age TEXT,
  learning_level TEXT,
  sort_order INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. curriculum_lessons
CREATE TABLE IF NOT EXISTS public.curriculum_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.curriculum_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  learning_objectives TEXT,
  skills_covered TEXT,
  sort_order INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. enrolments
CREATE TABLE IF NOT EXISTS public.enrolments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, course_id)
);

-- 10. teacher_availability
CREATE TABLE IF NOT EXISTS public.teacher_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_start TEXT,
  break_end TEXT,
  teacher_timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  min_notice_hours INTEGER NOT NULL DEFAULT 12,
  max_booking_days INTEGER NOT NULL DEFAULT 60,
  buffer_minutes INTEGER NOT NULL DEFAULT 15,
  allowed_durations INTEGER[] DEFAULT ARRAY[45, 60, 90],
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. bookings
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref TEXT UNIQUE NOT NULL,
  parent_id UUID REFERENCES public.parents(id) ON DELETE SET NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  lesson_type TEXT NOT NULL DEFAULT 'individual' CHECK (lesson_type IN ('trial', 'individual', 'package', 'recurring_weekly')),
  scheduled_start_utc TIMESTAMPTZ NOT NULL,
  scheduled_end_utc TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  learner_name TEXT NOT NULL,
  learner_age_grade TEXT,
  parent_name TEXT NOT NULL,
  parent_email TEXT NOT NULL,
  parent_phone TEXT,
  user_timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  currency TEXT NOT NULL DEFAULT 'KES',
  quoted_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'awaiting_payment', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. classes
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  curriculum_lesson_id UUID REFERENCES public.curriculum_lessons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT,
  description TEXT,
  student_instructions TEXT,
  private_teacher_notes TEXT,
  start_time_utc TIMESTAMPTZ NOT NULL,
  end_time_utc TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  recurrence_group_id UUID,
  recurrence_rule TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled', 'no_show')),
  attendance_status TEXT DEFAULT 'pending' CHECK (attendance_status IN ('pending', 'present', 'late', 'absent', 'excused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. class_participants
CREATE TABLE IF NOT EXISTS public.class_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attendance_status TEXT DEFAULT 'pending' CHECK (attendance_status IN ('pending', 'present', 'late', 'absent', 'excused')),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, student_id)
);

-- 14. video_meetings
CREATE TABLE IF NOT EXISTS public.video_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID UNIQUE NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('zoom', 'google_meet')),
  external_meeting_id TEXT,
  join_url TEXT,
  host_url TEXT,
  passcode TEXT,
  calendar_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'active', 'ended', 'cancelled', 'failed')),
  raw_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. recordings
CREATE TABLE IF NOT EXISTS public.recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('zoom', 'google_meet', 'manual')),
  external_recording_id TEXT,
  storage_path TEXT,
  playback_url TEXT,
  transcript_text TEXT,
  duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'awaiting_review' CHECK (status IN ('processing', 'available', 'awaiting_review', 'published', 'unpublished', 'failed')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. lesson_notes
CREATE TABLE IF NOT EXISTS public.lesson_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID UNIQUE NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  structured_summary JSONB,
  homework_instructions TEXT,
  private_observations TEXT,
  is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ai_model TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'unpublished')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. lesson_note_versions
CREATE TABLE IF NOT EXISTS public.lesson_note_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_note_id UUID NOT NULL REFERENCES public.lesson_notes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content_markdown TEXT NOT NULL,
  edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. assignments
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  questions_json JSONB,
  attachment_url TEXT,
  external_link TEXT,
  due_date_utc TIMESTAMPTZ,
  max_marks INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. assignment_submissions
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  written_answer TEXT,
  attachment_url TEXT,
  submission_link TEXT,
  marks_awarded NUMERIC(6,2),
  teacher_feedback TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('in_progress', 'submitted', 'late', 'correction_requested', 'reviewed')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (assignment_id, student_id)
);

-- 20. resources
CREATE TABLE IF NOT EXISTS public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('worksheet', 'pdf', 'presentation', 'link', 'video', 'other')),
  file_url TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 22. invoices (created before payments for FK)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  currency TEXT NOT NULL DEFAULT 'KES' CHECK (currency IN ('KES', 'USD', 'GBP', 'EUR')),
  total_amount NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'partially_paid', 'paid', 'overdue', 'refunded', 'cancelled')),
  payment_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 23. invoice_items
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL
);

-- 21. payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('mpesa', 'bank_transfer', 'international_wire', 'other')),
  transaction_reference TEXT NOT NULL,
  proof_url TEXT,
  receipt_number TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('pending', 'submitted', 'verified', 'rejected', 'refunded')),
  admin_notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 24. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'both')),
  email_status TEXT DEFAULT 'not_applicable' CHECK (email_status IN ('not_applicable', 'queued', 'sent', 'not_configured', 'failed')),
  email_error TEXT,
  link_path TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 25. messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'lesson_enquiry', 'reschedule_request', 'extra_classes', 'payment_query')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 26. testimonials
CREATE TABLE IF NOT EXISTS public.testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  location TEXT,
  quote TEXT NOT NULL,
  outcome TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 27. website_content
CREATE TABLE IF NOT EXISTS public.website_content (
  key TEXT PRIMARY KEY,
  content_json JSONB NOT NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 28. integration_settings
CREATE TABLE IF NOT EXISTS public.integration_settings (
  provider TEXT PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'not_configured',
  last_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 29. recording_consents
CREATE TABLE IF NOT EXISTS public.recording_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  consent_text TEXT NOT NULL,
  consented_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE (student_id, parent_id)
);

-- 30. audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Essential indexes for scheduling, permissions, and reporting
CREATE INDEX IF NOT EXISTS idx_bookings_teacher_time ON public.bookings(teacher_id, scheduled_start_utc, scheduled_end_utc);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_time ON public.classes(teacher_id, start_time_utc, end_time_utc);
CREATE INDEX IF NOT EXISTS idx_class_participants_student ON public.class_participants(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_invoices_parent_status ON public.invoices(parent_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
