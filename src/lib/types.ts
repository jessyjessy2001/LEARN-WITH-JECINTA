export type UserRole = 'admin' | 'teacher' | 'parent' | 'student';
export type CurrencyCode = 'KES' | 'USD' | 'GBP' | 'EUR';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string;
  country: string;
  timezone: string;
  teacher_id?: string;
  parent_id?: string;
  student_id?: string;
}

export interface CurriculumLesson {
  id: string;
  module_id: string;
  title: string;
  topic: string;
  learning_objectives: string;
  skills_covered: string;
  sort_order: number;
  status: 'draft' | 'published' | 'archived';
}

export interface CurriculumModule {
  id: string;
  course_id: string;
  title: string;
  description: string;
  sort_order: number;
  status: 'draft' | 'published' | 'archived';
  lessons: CurriculumLesson[];
}

export interface Course {
  id: string;
  teacher_id: string;
  teacher_name?: string;
  title: string;
  slug: string;
  subject: 'Mathematics' | 'Coding & Computer Science';
  description: string;
  age_or_grade_range: string;
  learning_level: string;
  duration_weeks: number;
  session_duration_minutes: number;
  learning_objectives: string;
  learning_outcomes: string;
  price_kes: number;
  price_usd: number;
  price_gbp: number;
  price_eur: number;
  original_price_kes?: number;
  original_price_usd?: number;
  original_price_gbp?: number;
  original_price_eur?: number;
  pricing_type: string;
  status: 'draft' | 'published' | 'archived';
  modules?: CurriculumModule[];
}

export interface Testimonial {
  id: string;
  author_name: string;
  author_role: string;
  location: string;
  quote: string;
  outcome: string;
  is_published: number;
  created_at: string;
}

export interface TeacherPublic {
  id: string;
  full_name: string;
  title: string;
  bio: string;
  qualifications: string;
  subjects_json: string;
  timezone: string;
}

export interface AvailableSlot {
  start_utc: string;
  end_utc: string;
  teacher_local_time: string;
  teacher_timezone: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  body: string;
  channel: string;
  email_status: string;
  email_error: string;
  link_path: string;
  is_read: number;
  created_at: string;
}
