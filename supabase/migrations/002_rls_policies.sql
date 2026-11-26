-- Jey Learning Hub — Supabase Row Level Security (RLS) Policies
-- Ensures parents only view their own children, students only view their own records,
-- and private teacher notes never leak to parents or students.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_note_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recording_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: current user role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Public read access for published catalog and website content
CREATE POLICY "Public courses readable" ON public.courses
  FOR SELECT USING (status = 'published' OR public.current_user_role() IN ('admin', 'teacher'));

CREATE POLICY "Public curriculum readable" ON public.curriculum_modules
  FOR SELECT USING (status = 'published' OR public.current_user_role() IN ('admin', 'teacher'));

CREATE POLICY "Public lessons readable" ON public.curriculum_lessons
  FOR SELECT USING (status = 'published' OR public.current_user_role() IN ('admin', 'teacher'));

CREATE POLICY "Public testimonials readable" ON public.testimonials
  FOR SELECT USING (is_published = TRUE OR public.current_user_role() = 'admin');

CREATE POLICY "Public website content readable" ON public.website_content
  FOR SELECT USING (TRUE);

-- Profiles: own profile or admin
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.current_user_role() = 'admin');

-- Students: only admin, assigned teacher, linked parent, or the student themselves
CREATE POLICY "Student isolation" ON public.students
  FOR SELECT USING (
    public.current_user_role() = 'admin'
    OR profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.parent_students ps
      JOIN public.parents p ON p.id = ps.parent_id
      WHERE ps.student_id = students.id AND p.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = students.teacher_id AND t.profile_id = auth.uid()
    )
  );

-- Published lesson notes only for students and parents (never drafts/unpublished)
CREATE POLICY "Published lesson notes access" ON public.lesson_notes
  FOR SELECT USING (
    public.current_user_role() = 'admin'
    OR EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = lesson_notes.teacher_id AND t.profile_id = auth.uid())
    OR (
      status = 'published' AND EXISTS (
        SELECT 1 FROM public.class_participants cp
        JOIN public.students s ON s.id = cp.student_id
        LEFT JOIN public.parent_students ps ON ps.student_id = s.id
        LEFT JOIN public.parents p ON p.id = ps.parent_id
        WHERE cp.class_id = lesson_notes.class_id
          AND (s.profile_id = auth.uid() OR p.profile_id = auth.uid())
      )
    )
  );

-- Published recordings only for authorized student/parent
CREATE POLICY "Published recordings access" ON public.recordings
  FOR SELECT USING (
    public.current_user_role() = 'admin'
    OR (
      status = 'published' AND EXISTS (
        SELECT 1 FROM public.class_participants cp
        JOIN public.students s ON s.id = cp.student_id
        LEFT JOIN public.parent_students ps ON ps.student_id = s.id
        LEFT JOIN public.parents p ON p.id = ps.parent_id
        WHERE cp.class_id = recordings.class_id
          AND (s.profile_id = auth.uid() OR p.profile_id = auth.uid())
      )
    )
  );

-- Invoices & payments isolated to parent owner or admin
CREATE POLICY "Invoice access" ON public.invoices
  FOR SELECT USING (
    public.current_user_role() = 'admin'
    OR EXISTS (SELECT 1 FROM public.parents p WHERE p.id = invoices.parent_id AND p.profile_id = auth.uid())
  );

CREATE POLICY "Payment access" ON public.payments
  FOR SELECT USING (
    public.current_user_role() = 'admin'
    OR EXISTS (SELECT 1 FROM public.parents p WHERE p.id = payments.parent_id AND p.profile_id = auth.uid())
  );

-- Notifications & messages isolated to recipient/sender
CREATE POLICY "Notifications access" ON public.notifications
  FOR ALL USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

CREATE POLICY "Messages access" ON public.messages
  FOR ALL USING (sender_id = auth.uid() OR recipient_id = auth.uid() OR public.current_user_role() = 'admin');
