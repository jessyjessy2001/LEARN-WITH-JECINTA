import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Code2,
  Compass,
  Globe2,
  Send,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  buildGoogleCalendarTemplateUrl,
  COMMON_TIMEZONES,
  detectBrowserTimezone,
  formatCurrency,
  formatUtcInTimezone,
} from '../lib/timezone';
import type {
  AuthUser,
  AvailableSlot,
  Course,
  CurrencyCode,
  TeacherPublic,
  Testimonial,
} from '../lib/types';
import type { RouteName } from '../components/Navbar';

export interface PublicBundle {
  content: Record<string, any>;
  courses: Course[];
  testimonials: Testimonial[];
  teachers: TeacherPublic[];
}

interface PublicPagesProps {
  route: RouteName;
  bundle: PublicBundle | null;
  user: AuthUser | null;
  preselectedCourseId: string | null;
  onSelectCourseForBooking: (courseId: string) => void;
  onNavigate: (route: RouteName) => void;
}

export const PublicPages: React.FC<PublicPagesProps> = ({
  route,
  bundle,
  user,
  preselectedCourseId,
  onSelectCourseForBooking,
  onNavigate,
}) => {
  const [currency, setCurrency] = useState<CurrencyCode>('USD');

  if (!bundle) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="h-64 animate-pulse rounded-2xl border border-[#E5DFD3] bg-white" />
      </div>
    );
  }

  if (route === 'about') {
    return <AboutView bundle={bundle} onNavigate={onNavigate} />;
  }
  if (route === 'courses') {
    return (
      <CoursesView
        bundle={bundle}
        currency={currency}
        setCurrency={setCurrency}
        onBookCourse={onSelectCourseForBooking}
        onNavigate={onNavigate}
      />
    );
  }
  if (route === 'curriculum') {
    return <CurriculumView bundle={bundle} onBookCourse={onSelectCourseForBooking} />;
  }
  if (route === 'pricing') {
    return (
      <PricingView
        bundle={bundle}
        currency={currency}
        setCurrency={setCurrency}
        onBookCourse={onSelectCourseForBooking}
        onNavigate={onNavigate}
      />
    );
  }
  if (route === 'book') {
    return (
      <BookingView
        bundle={bundle}
        user={user}
        initialCourseId={preselectedCourseId}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <HomeView
      bundle={bundle}
      currency={currency}
      onBookCourse={onSelectCourseForBooking}
      onNavigate={onNavigate}
    />
  );
};

// ======================== HOMEPAGE ========================
const HomeView: React.FC<{
  bundle: PublicBundle;
  currency: CurrencyCode;
  onBookCourse: (courseId: string) => void;
  onNavigate: (route: RouteName) => void;
}> = ({ bundle, onBookCourse, onNavigate }) => {
  const home = bundle.content.home_content || {};
  const business = bundle.content.business_settings || {};
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMsg, setContactMsg] = useState('');
  const [contactStatus, setContactStatus] = useState('');

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactStatus('sending');
    try {
      await apiFetch('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          subject: contactSubject,
          message: contactMsg,
        }),
      });
      setContactStatus('sent');
      setContactName('');
      setContactEmail('');
      setContactSubject('');
      setContactMsg('');
    } catch {
      setContactStatus('error');
    }
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid items-stretch gap-10 lg:grid-cols-12">
          <div className="flex flex-col justify-center lg:col-span-6">
            <p className="text-sm font-medium text-[#9A6D14]">
              {business.personal_identity || 'Learn with Jecinta'} ·{' '}
              {business.tagline || 'Learn. Create. Grow.'}
            </p>
            <h1
              className="font-display mt-3 text-4xl font-semibold tracking-tight text-[#0F213E] sm:text-5xl"
              style={{ textWrap: 'balance' }}
            >
              {home.hero_headline ||
                'Personalised Mathematics & Coding Tutoring for Curious Young Minds'}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#475569]">
              {home.hero_subheadline ||
                'Live 1-on-1 and guided online lessons led by Jecinta Maina. Serving Kenyan and international families in your local timezone.'}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => onNavigate('book')}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F213E] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1B355E] whitespace-nowrap shrink-0"
              >
                Book a Lesson
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('courses')}
                className="inline-flex items-center gap-2 rounded-lg border border-[#D8D1C4] bg-white px-5 py-3 text-sm font-medium text-[#0F213E] transition-colors hover:bg-[#F6F3EC] whitespace-nowrap shrink-0"
              >
                Explore Courses
              </button>
              <button
                type="button"
                onClick={() => onNavigate('curriculum')}
                className="text-sm font-medium text-[#0F213E] underline decoration-[#C6922C] underline-offset-4 hover:text-[#1B355E] whitespace-nowrap shrink-0"
              >
                View Curriculum
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[300px] overflow-hidden rounded-2xl border border-[#E5DFD3] bg-[#0F213E]">
              <img
                src="/src/assets/images/hero_tutoring_session_1795692507292.jpg"
                alt="Online tutoring workspace with geometry and coding lessons"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* Full-width summary bar below hero */}
        <div className="mt-10 grid gap-4 rounded-xl border border-[#E5DFD3] bg-white p-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-[#64748B]">Subjects</p>
            <p className="mt-1 text-sm font-semibold text-[#0F213E]">
              Mathematics · Coding &amp; CS
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[#64748B]">Age &amp; Grade Range</p>
            <p className="mt-1 text-sm font-semibold text-[#0F213E]">
              Grades 1–8 · Ages 6–16
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[#64748B]">Curricula Supported</p>
            <p className="mt-1 text-sm font-semibold text-[#0F213E]">
              CBC · IGCSE · IB · International
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[#64748B]">Session Rate (40% Off)</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#0F213E]">
              <span className="font-mono-num text-xs text-[#64748B] line-through">USD 10.00</span>
              <span className="font-mono-num text-[#166534]">USD 6.00 / session</span>
            </p>
          </div>
        </div>
      </section>

      {/* Core Subjects */}
      <section className="border-t border-[#E5DFD3] bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-semibold text-[#0F213E]">
              Core Subjects Taught
            </h2>
            <p className="mt-2 text-sm text-[#475569]">
              Structured courses loaded directly from our curriculum catalog, tailored to your
              child’s pace and school framework.
            </p>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {/* Mathematics */}
            <div className="flex flex-col overflow-hidden rounded-xl border border-[#E5DFD3] bg-[#FAF8F4]">
              <div className="aspect-[4/3] overflow-hidden bg-[#EEF4FA]">
                <img
                  src="/src/assets/images/subject_mathematics_visual_1795692508535.jpg"
                  alt="Geometric solids, brass compass, and algebra notebook"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <p className="text-xs font-medium text-[#1E40AF]">Grades 1–8 · Visual &amp; Analytical</p>
                <h3 className="mt-1.5 font-display text-xl font-semibold text-[#0F213E]">
                  Mathematics
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[#475569]">
                  Number sense, fractions, ratios, geometry, and pre-algebra taught with step-by-step
                  reasoning and problem-solving confidence.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const m = bundle.courses.find((c) => c.subject === 'Mathematics');
                    if (m) onBookCourse(m.id);
                    else onNavigate('courses');
                  }}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#0F213E] hover:text-[#9A6D14]"
                >
                  Book Mathematics Lesson <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Coding & Computer Science */}
            <div className="flex flex-col overflow-hidden rounded-xl border border-[#E5DFD3] bg-[#FAF8F4]">
              <div className="aspect-[4/3] flex flex-col justify-between bg-[#EDF6F0] p-6">
                <Code2 className="h-9 w-9 text-[#166534]" />
                <div className="rounded-lg border border-[#D1E7D8] bg-white p-4 font-mono text-xs text-[#0F213E]">
                  <p className="text-[#166534]">def build_project(student):</p>
                  <p className="pl-4">logic = [&quot;Scratch&quot;, &quot;Python&quot;, &quot;Web&quot;]</p>
                  <p className="pl-4">return f&quot;Create with &#123;logic&#125;&quot;</p>
                </div>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <p className="text-xs font-medium text-[#166534]">Ages 6–16 · Project-Based</p>
                <h3 className="mt-1.5 font-display text-xl font-semibold text-[#0F213E]">
                  Coding &amp; Computer Science
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[#475569]">
                  From Scratch computational thinking for younger learners to Python programming,
                  algorithms, and foundational web engineering.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const c = bundle.courses.find((x) => x.subject === 'Coding & Computer Science');
                    if (c) onBookCourse(c.id);
                    else onNavigate('courses');
                  }}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#0F213E] hover:text-[#9A6D14]"
                >
                  Book Coding Lesson <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose & How It Works */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-semibold text-[#0F213E]">
              Why Families Choose Jey Learning Hub
            </h2>
            <div className="mt-6 space-y-5">
              {(home.why_choose || []).map((item: { title: string; detail: string }, idx: number) => (
                <div
                  key={idx}
                  className="rounded-xl border border-[#E5DFD3] bg-white p-5"
                >
                  <h3 className="text-base font-semibold text-[#0F213E]">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#475569]">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-display text-3xl font-semibold text-[#0F213E]">
              How Online Lessons Work
            </h2>
            <div className="mt-6 space-y-5">
              {(home.how_it_works || []).map(
                (step: { step: string; title: string; detail: string }, idx: number) => (
                  <div
                    key={idx}
                    className="flex gap-4 rounded-xl border border-[#E5DFD3] bg-white p-5"
                  >
                    <span className="font-mono-num text-lg font-semibold text-[#C6922C]">
                      {step.step}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-[#0F213E]">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#475569]">{step.detail}</p>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Admin-managed Testimonials (never fabricated) */}
      <section className="border-t border-[#E5DFD3] bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-display text-3xl font-semibold text-[#0F213E]">
                Parent &amp; Student Feedback
              </h2>
              <p className="mt-1.5 text-sm text-[#475569]">
                Verified testimonials published directly by Jey Learning Hub.
              </p>
            </div>
          </div>

          {bundle.testimonials.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#D8D1C4] bg-[#FAF8F4] p-8 text-center">
              <p className="text-sm text-[#475569]">
                Parent testimonials will appear here once published from the Administrator Dashboard.
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {bundle.testimonials.map((t) => (
                <div key={t.id} className="rounded-xl border border-[#E5DFD3] bg-[#FAF8F4] p-6">
                  <p className="text-sm leading-relaxed text-[#1E293B]">&ldquo;{t.quote}&rdquo;</p>
                  {t.outcome && (
                    <p className="mt-3 text-xs font-medium text-[#166534]">{t.outcome}</p>
                  )}
                  <div className="mt-4 border-t border-[#E5DFD3] pt-3 text-xs text-[#475569]">
                    <span className="font-semibold text-[#0F213E]">{t.author_name}</span> ·{' '}
                    <span>{t.author_role}</span>
                    {t.location ? ` · ${t.location}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 rounded-2xl border border-[#E5DFD3] bg-white p-6 sm:p-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="font-display text-3xl font-semibold text-[#0F213E]">
              Speak with Jecinta
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#475569]">
              Have questions about grade placement, CBC/IGCSE alignment, or scheduling across
              timezones? Send an enquiry directly to Jey Learning Hub.
            </p>
            <div className="mt-6 space-y-2 text-sm text-[#334155]">
              <p>Email: {business.contact_email || 'mainajecinta81@gmail.com'}</p>
              <p>Phone: {business.contact_phone || '+254 700 000 000'}</p>
              <p>Base Timezone: {business.default_timezone || 'Africa/Nairobi'}</p>
            </div>
          </div>

          <form onSubmit={handleContactSubmit} className="space-y-4 lg:col-span-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                type="text"
                required
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Parent / Guardian Name"
                className="w-full rounded-lg border border-[#D8D1C4] px-3.5 py-2.5 text-sm"
              />
              <input
                type="email"
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Email Address"
                className="w-full rounded-lg border border-[#D8D1C4] px-3.5 py-2.5 text-sm"
              />
            </div>
            <input
              type="text"
              value={contactSubject}
              onChange={(e) => setContactSubject(e.target.value)}
              placeholder="Subject & Grade (e.g. Grade 6 Mathematics)"
              className="w-full rounded-lg border border-[#D8D1C4] px-3.5 py-2.5 text-sm"
            />
            <textarea
              required
              rows={3}
              value={contactMsg}
              onChange={(e) => setContactMsg(e.target.value)}
              placeholder="Tell us about your child's learning goals..."
              className="w-full rounded-lg border border-[#D8D1C4] px-3.5 py-2.5 text-sm"
            />
            <div className="flex items-center justify-between gap-4">
              <button
                type="submit"
                disabled={contactStatus === 'sending'}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F213E] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1B355E]"
              >
                <Send className="h-4 w-4" />
                {contactStatus === 'sending' ? 'Sending...' : 'Send Enquiry'}
              </button>
              {contactStatus === 'sent' && (
                <span className="text-sm font-medium text-[#166534]">
                  Message delivered to Jecinta.
                </span>
              )}
              {contactStatus === 'error' && (
                <span className="text-sm font-medium text-red-700">
                  Unable to send right now.
                </span>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
};

// ======================== ABOUT PAGE ========================
const AboutView: React.FC<{
  bundle: PublicBundle;
  onNavigate: (route: RouteName) => void;
}> = ({ bundle, onNavigate }) => {
  const about = bundle.content.about_content || {};
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid items-start gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="overflow-hidden rounded-2xl border border-[#E5DFD3] bg-white">
            <img
              src="/src/assets/images/founder_jecinta_portrait_1795692507513.jpg"
              alt="Jecinta Maina, Founder and Lead Educator at Jey Learning Hub"
              referrerPolicy="no-referrer"
              className="aspect-[3/4] w-full object-cover"
            />
          </div>
        </div>
        <div className="lg:col-span-7">
          <p className="text-sm font-medium text-[#9A6D14]">Founder &amp; Lead Educator</p>
          <h1 className="font-display mt-2 text-3xl font-semibold text-[#0F213E] sm:text-4xl">
            {about.headline || 'Meet Jecinta Maina'}
          </h1>
          <p className="mt-2 text-base font-medium text-[#334155]">
            {about.subtitle || 'Learn with Jecinta · Practical, interactive and personalised learning'}
          </p>

          <div className="mt-6 space-y-4 text-sm leading-relaxed text-[#475569]">
            {(about.bio_paragraphs || []).map((p: string, i: number) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <div className="mt-8 rounded-xl border border-[#E5DFD3] bg-white p-6">
            <h2 className="text-base font-semibold text-[#0F213E]">
              Qualifications &amp; Teaching Background
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-[#475569]">
              {(about.qualifications || []).map((q: string, i: number) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#C6922C]" />
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>

          {about.philosophy && (
            <div className="mt-6 rounded-xl border border-[#E5DFD3] bg-[#FAF3E6]/60 p-6">
              <p className="text-xs font-semibold text-[#9A6D14]">Teaching Philosophy</p>
              <p className="mt-2 text-sm italic leading-relaxed text-[#0F213E]">
                &ldquo;{about.philosophy}&rdquo;
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onNavigate('book')}
              className="rounded-lg bg-[#0F213E] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1B355E]"
            >
              Book a Lesson with Jecinta
            </button>
            <button
              type="button"
              onClick={() => onNavigate('curriculum')}
              className="rounded-lg border border-[#D8D1C4] bg-white px-5 py-2.5 text-sm font-medium text-[#0F213E]"
            >
              Explore Curriculum
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ======================== COURSES, CURRICULUM & PRICING PAGE ========================
const CoursesView: React.FC<{
  bundle: PublicBundle;
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  onBookCourse: (courseId: string) => void;
  onNavigate: (route: RouteName) => void;
}> = ({ bundle, currency, setCurrency, onBookCourse, onNavigate }) => {
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const subjects = ['All', 'Mathematics', 'Coding & Computer Science'];
  const packages = bundle.content.pricing_packages || [];

  const filtered = bundle.courses.filter(
    (c) => subjectFilter === 'All' || c.subject === subjectFilter
  );

  const getPrice = (c: Course) => {
    if (currency === 'USD') return c.price_usd;
    if (currency === 'GBP') return c.price_gbp;
    if (currency === 'EUR') return c.price_eur;
    return c.price_kes;
  };

  const getOriginalPrice = (c: Course) => {
    if (currency === 'USD') return c.original_price_usd ?? 10;
    if (currency === 'GBP') return c.original_price_gbp ?? 8;
    if (currency === 'EUR') return c.original_price_eur ?? 9;
    return c.original_price_kes ?? 1300;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#0F213E]">
            Courses, Curriculum &amp; Pricing
          </h1>
          <p className="mt-1.5 text-sm text-[#475569]">
            Live courses, module topics, and transparent rates in KES, USD, GBP, and EUR.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-[#EFEAE0] p-1">
            {subjects.map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => setSubjectFilter(sub)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  subjectFilter === sub ? 'bg-white text-[#0F213E] shadow-sm' : 'text-[#475569]'
                }`}
              >
                {sub}
              </button>
            ))}
          </div>

          <select
            aria-label="Select currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            className="rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs font-medium text-[#0F213E]"
          >
            <option value="KES">KES (Kenyan Shilling)</option>
            <option value="USD">USD (US Dollar)</option>
            <option value="GBP">GBP (British Pound)</option>
            <option value="EUR">EUR (Euro)</option>
          </select>
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {filtered.map((course) => {
          const isExpanded = expandedCourseId === course.id;
          return (
            <div
              key={course.id}
              className="flex flex-col rounded-xl border border-[#E5DFD3] bg-white p-6"
            >
              <div className="text-xs font-medium text-[#64748B]">
                <span>{course.subject}</span>
                <span className="mx-1.5">·</span>
                <span>{course.age_or_grade_range}</span>
                <span className="mx-1.5">·</span>
                <span>{course.learning_level}</span>
              </div>

              <h2 className="font-display mt-2 text-xl font-semibold text-[#0F213E]">
                {course.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#475569]">{course.description}</p>

              <div className="mt-4 space-y-2 border-t border-[#EFEAE0] pt-4 text-xs text-[#475569]">
                <p>
                  <strong className="text-[#0F213E]">Objectives:</strong> {course.learning_objectives}
                </p>
                <p>
                  <strong className="text-[#0F213E]">Outcomes:</strong> {course.learning_outcomes}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <p>
                    <strong className="text-[#0F213E]">Format:</strong> {course.duration_weeks} weeks ·{' '}
                    {course.session_duration_minutes} mins/lesson ·{' '}
                    {course.modules?.length || 0} module(s)
                  </p>
                  {course.modules && course.modules.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedCourseId(isExpanded ? null : course.id)}
                      className="text-xs font-semibold text-[#9A6D14] underline underline-offset-2"
                    >
                      {isExpanded ? 'Hide Curriculum' : 'View Curriculum Topics'}
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && course.modules && course.modules.length > 0 && (
                <div className="mt-4 space-y-3 rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-4 text-xs">
                  {course.modules.map((mod, mIdx) => (
                    <div key={mod.id}>
                      <p className="font-semibold text-[#0F213E]">
                        Module {mIdx + 1}: {mod.title}
                      </p>
                      <ul className="mt-1 space-y-1 text-[#475569]">
                        {mod.lessons.map((lesson, lIdx) => (
                          <li key={lesson.id}>
                            {mIdx + 1}.{lIdx + 1} {lesson.title} — {lesson.topic}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex items-center justify-between border-t border-[#EFEAE0] pt-4">
                <div>
                  <p className="text-xs text-[#64748B]">Per Session Rate (40% Off)</p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono-num text-xs text-[#64748B] line-through">
                      {formatCurrency(getOriginalPrice(course), currency)}
                    </span>
                    <p className="font-mono-num text-lg font-semibold text-[#0F213E]">
                      {formatCurrency(getPrice(course), currency)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onBookCourse(course.id)}
                  className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm font-medium text-white hover:bg-[#1B355E] whitespace-nowrap"
                >
                  Book This Course
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Packages Section */}
      {packages.length > 0 && (
        <div className="mt-14 border-t border-[#E5DFD3] pt-10">
          <h2 className="font-display text-2xl font-semibold text-[#0F213E]">
            Lesson Packages &amp; Trials ({currency})
          </h2>
          <p className="mt-1 text-sm text-[#475569]">
            Every session is normally $10 USD, discounted to $6 USD (40% off).
          </p>
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {packages.map((pkg: any) => (
              <div
                key={pkg.id}
                className="flex flex-col rounded-xl border border-[#E5DFD3] bg-white p-6"
              >
                <p className="text-xs font-medium text-[#9A6D14]">{pkg.billing}</p>
                <h3 className="font-display mt-1.5 text-xl font-semibold text-[#0F213E]">
                  {pkg.name}
                </h3>
                <div className="mt-4 flex items-baseline gap-2">
                  {pkg.original_prices?.[currency] && (
                    <span className="font-mono-num text-sm text-[#64748B] line-through">
                      {formatCurrency(pkg.original_prices[currency], currency)}
                    </span>
                  )}
                  <p className="font-mono-num text-2xl font-semibold text-[#0F213E]">
                    {formatCurrency(pkg.prices?.[currency] || 0, currency)}
                  </p>
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-[#475569]">
                  {pkg.description}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('book')}
                  className="mt-6 w-full rounded-lg bg-[#0F213E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1B355E]"
                >
                  Book Now
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ======================== CURRICULUM PAGE ========================
const CurriculumView: React.FC<{
  bundle: PublicBundle;
  onBookCourse: (courseId: string) => void;
}> = ({ bundle, onBookCourse }) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const courses = bundle.courses.filter(
    (c) => selectedSubject === 'All' || c.subject === selectedSubject
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#0F213E]">
            Structured Curriculum &amp; Progression
          </h1>
          <p className="mt-1.5 text-sm text-[#475569]">
            Modules, topics, learning objectives, and skills covered across Mathematics and Coding
            &amp; Computer Science.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-[#EFEAE0] p-1">
          {['All', 'Mathematics', 'Coding & Computer Science'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSelectedSubject(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                selectedSubject === s ? 'bg-white text-[#0F213E] shadow-sm' : 'text-[#475569]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-8">
        {courses.map((course) => (
          <div key={course.id} className="rounded-xl border border-[#E5DFD3] bg-white p-6">
            <div className="flex flex-col justify-between gap-4 border-b border-[#EFEAE0] pb-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-medium text-[#64748B]">
                  {course.subject} · {course.age_or_grade_range} · {course.learning_level}
                </p>
                <h2 className="font-display mt-1 text-xl font-semibold text-[#0F213E]">
                  {course.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onBookCourse(course.id)}
                className="rounded-lg border border-[#0F213E] px-4 py-2 text-xs font-medium text-[#0F213E] hover:bg-[#0F213E] hover:text-white whitespace-nowrap shrink-0"
              >
                Enrol / Book Lesson
              </button>
            </div>

            {!course.modules || course.modules.length === 0 ? (
              <p className="mt-4 text-sm text-[#64748B]">
                Modules for this course are being organized by the educator.
              </p>
            ) : (
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                {course.modules.map((mod, mIdx) => (
                  <div key={mod.id} className="rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-4">
                    <p className="text-xs font-semibold text-[#9A6D14]">
                      Module {String(mIdx + 1).padStart(2, '0')}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-[#0F213E]">{mod.title}</h3>
                    <div className="mt-3 space-y-2.5">
                      {mod.lessons.map((lesson, lIdx) => (
                        <div key={lesson.id} className="border-t border-[#E5DFD3] pt-2.5 text-xs">
                          <p className="font-semibold text-[#0F213E]">
                            {mIdx + 1}.{lIdx + 1} {lesson.title}
                          </p>
                          <p className="mt-0.5 text-[#475569]">Topic: {lesson.topic}</p>
                          {lesson.skills_covered && (
                            <p className="mt-0.5 text-[#64748B]">Skills: {lesson.skills_covered}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ======================== PRICING PAGE ========================
const PricingView: React.FC<{
  bundle: PublicBundle;
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  onBookCourse: (courseId: string) => void;
  onNavigate: (route: RouteName) => void;
}> = ({ bundle, currency, setCurrency, onBookCourse, onNavigate }) => {
  const packages = bundle.content.pricing_packages || [];
  const getCoursePrice = (c: Course) =>
    currency === 'USD'
      ? c.price_usd
      : currency === 'GBP'
      ? c.price_gbp
      : currency === 'EUR'
      ? c.price_eur
      : c.price_kes;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#0F213E]">
            Transparent Multi-Currency Pricing
          </h1>
          <p className="mt-1.5 text-sm text-[#475569]">
            Flexible individual lessons, trial assessments, and monthly packages in KES, USD, GBP,
            and EUR.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-[#EFEAE0] p-1">
          {(['KES', 'USD', 'GBP', 'EUR'] as CurrencyCode[]).map((curr) => (
            <button
              key={curr}
              type="button"
              onClick={() => setCurrency(curr)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                currency === curr ? 'bg-[#0F213E] text-white' : 'text-[#475569]'
              }`}
            >
              {curr}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {packages.map((pkg: any) => (
          <div key={pkg.id} className="flex flex-col rounded-xl border border-[#E5DFD3] bg-white p-6">
            <p className="text-xs font-medium text-[#9A6D14]">{pkg.billing}</p>
            <h2 className="font-display mt-1.5 text-xl font-semibold text-[#0F213E]">{pkg.name}</h2>
            <p className="font-mono-num mt-4 text-2xl font-semibold text-[#0F213E]">
              {formatCurrency(pkg.prices?.[currency] || 0, currency)}
            </p>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-[#475569]">{pkg.description}</p>
            <button
              type="button"
              onClick={() => onNavigate('book')}
              className="mt-6 w-full rounded-lg bg-[#0F213E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1B355E]"
            >
              Book Now
            </button>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-[#E5DFD3] bg-white p-6">
        <h2 className="font-display text-xl font-semibold text-[#0F213E]">
          Per-Course Lesson Rates ({currency})
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5DFD3] text-xs font-semibold text-[#64748B]">
                <th className="py-3 pr-4">Course</th>
                <th className="py-3 pr-4">Subject</th>
                <th className="py-3 pr-4">Grade / Age</th>
                <th className="py-3 pr-4">Duration</th>
                <th className="py-3 pr-4 text-right">Rate</th>
                <th className="py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE0]">
              {bundle.courses.map((c) => (
                <tr key={c.id} className="hover:bg-[#FAF8F4]">
                  <td className="py-3.5 pr-4 font-medium text-[#0F213E]">{c.title}</td>
                  <td className="py-3.5 pr-4 text-[#475569]">{c.subject}</td>
                  <td className="py-3.5 pr-4 text-[#475569]">{c.age_or_grade_range}</td>
                  <td className="py-3.5 pr-4 font-mono-num text-[#475569]">
                    {c.session_duration_minutes}m
                  </td>
                  <td className="py-3.5 pr-4 text-right font-mono-num font-semibold text-[#0F213E]">
                    {formatCurrency(getCoursePrice(c), currency)}
                  </td>
                  <td className="py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => onBookCourse(c.id)}
                      className="text-xs font-semibold text-[#0F213E] underline decoration-[#C6922C] underline-offset-4"
                    >
                      Book
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ======================== BOOKING PAGE ========================
const BookingView: React.FC<{
  bundle: PublicBundle;
  user: AuthUser | null;
  initialCourseId: string | null;
  onNavigate: (route: RouteName) => void;
}> = ({ bundle, user, initialCourseId, onNavigate }) => {
  const [subject, setSubject] = useState<string>('All');
  const [courseId, setCourseId] = useState<string>(
    initialCourseId || bundle.courses[0]?.id || ''
  );
  const [teacherId, setTeacherId] = useState<string>(bundle.teachers[0]?.id || '');
  const [lessonType, setLessonType] = useState<'trial' | 'individual' | 'package' | 'recurring_weekly'>('individual');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);

  const getNextOpenDate = () => {
    const d = new Date(Date.now() + 86400000);
    if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); // Skip Sunday
    return d.toISOString().slice(0, 10);
  };
  const [selectedDate, setSelectedDate] = useState<string>(getNextOpenDate);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);

  const [userTimezone, setUserTimezone] = useState<string>(
    user?.timezone || detectBrowserTimezone()
  );
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [learnerName, setLearnerName] = useState('');
  const [learnerAgeGrade, setLearnerAgeGrade] = useState('');
  const [parentName, setParentName] = useState(user?.full_name || '');
  const [parentEmail, setParentEmail] = useState(user?.email || '');
  const [parentPhone, setParentPhone] = useState(user?.phone || '');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmedResult, setConfirmedResult] = useState<{
    booking: any;
    meeting?: any;
    videoNote?: string;
  } | null>(null);

  const selectedCourse = bundle.courses.find((c) => c.id === courseId) || bundle.courses[0];

  useEffect(() => {
    if (selectedCourse) {
      setDurationMinutes(
        lessonType === 'trial' ? 45 : selectedCourse.session_duration_minutes || 60
      );
      if (selectedCourse.teacher_id) setTeacherId(selectedCourse.teacher_id);
    }
  }, [courseId, lessonType]);

  useEffect(() => {
    if (!teacherId || !selectedDate) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    apiFetch<{ slots: AvailableSlot[] }>(
      `/api/public/availability?teacherId=${encodeURIComponent(teacherId)}&date=${encodeURIComponent(
        selectedDate
      )}&duration=${durationMinutes}`
    )
      .then((res) => setSlots(res.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [teacherId, selectedDate, durationMinutes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) {
      setError('Please select an available date and time slot.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{ booking: any; meeting?: any; videoNote?: string }>(
        '/api/public/bookings',
        {
          method: 'POST',
          body: JSON.stringify({
            courseId: selectedCourse.id,
            teacherId,
            lessonType,
            scheduledStartUtc: selectedSlot.start_utc,
            durationMinutes,
            learnerName,
            learnerAgeGrade,
            parentName,
            parentEmail,
            parentPhone,
            userTimezone,
            currency,
            notes,
          }),
        }
      );
      setConfirmedResult({
        booking: res.booking,
        meeting: res.meeting || null,
        videoNote: res.videoNote || '',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Booking submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmedResult) {
    const confirmedBooking = confirmedResult.booking;
    const meeting = confirmedResult.meeting;
    const oneClickCalendarUrl =
      meeting?.host_url && meeting.provider === 'google_meet'
        ? meeting.host_url
        : buildGoogleCalendarTemplateUrl({
            title: `Jey Learning Hub: ${selectedCourse?.title || 'Tutoring Session'} (${confirmedBooking.learner_name})`,
            startUtc: confirmedBooking.scheduled_start_utc,
            endUtc: confirmedBooking.scheduled_end_utc,
            durationMinutes: confirmedBooking.duration_minutes,
            description: `Booking Ref: ${confirmedBooking.booking_ref}${
              meeting?.join_url ? `\nJoin Link: ${meeting.join_url}` : ''
            }`,
            location: meeting?.join_url || 'Online Session',
          });
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-[#E5DFD3] bg-white p-8">
          <CheckCircle2 className="h-10 w-10 text-[#166534]" />
          <h1 className="font-display mt-4 text-2xl font-semibold text-[#0F213E]">
            Session {confirmedBooking.status === 'confirmed' ? 'Confirmed' : 'Submitted'} —{' '}
            {confirmedBooking.booking_ref}
          </h1>
          <p className="mt-2 text-sm text-[#475569]">
            {meeting?.join_url
              ? 'Your live session is booked and ready to join.'
              : confirmedResult.videoNote ||
                'Your session is scheduled. Add it to your calendar in 1 click below.'}
          </p>

          <div className="mt-6 space-y-2 rounded-xl border border-[#EFEAE0] bg-[#FAF8F4] p-5 text-sm">
            <p>
              <strong>Learner:</strong> {confirmedBooking.learner_name}
            </p>
            <p>
              <strong>Course:</strong> {selectedCourse?.title}
            </p>
            <p>
              <strong>Your Local Time ({confirmedBooking.user_timezone}):</strong>{' '}
              {formatUtcInTimezone(
                confirmedBooking.scheduled_start_utc,
                confirmedBooking.user_timezone
              )}
            </p>
            <p>
              <strong>Session Fee (40% Discount):</strong>{' '}
              <span className="font-mono-num font-semibold">
                {formatCurrency(confirmedBooking.quoted_amount, confirmedBooking.currency)}
              </span>
            </p>
            {meeting?.join_url && (
              <p className="pt-2">
                <strong>Video Room ({meeting.provider === 'google_meet' ? 'Google Meet' : 'Zoom'}):</strong>{' '}
                <a
                  href={meeting.join_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#0F213E] underline"
                >
                  {meeting.join_url}
                </a>
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {meeting?.join_url && (
              <a
                href={meeting.join_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#C6922C] px-5 py-2.5 text-sm font-semibold text-[#0F213E]"
              >
                Join {meeting.provider === 'google_meet' ? 'Google Meet' : 'Zoom'}
              </a>
            )}
            <a
              href={oneClickCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[#0F213E] px-4 py-2.5 text-sm font-medium text-[#0F213E] hover:bg-[#FAF8F4]"
            >
              <Calendar className="h-4 w-4" />
              Add to Google Calendar
            </a>
            {user?.role === 'parent' ? (
              <button
                type="button"
                onClick={() => onNavigate('parent')}
                className="rounded-lg bg-[#0F213E] px-5 py-2.5 text-sm font-medium text-white"
              >
                Go to Parent Portal
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="rounded-lg bg-[#0F213E] px-5 py-2.5 text-sm font-medium text-white"
              >
                Portal Login
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmedResult(null)}
              className="rounded-lg border border-[#D8D1C4] px-5 py-2.5 text-sm font-medium text-[#0F213E]"
            >
              Book Another Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredCourses = bundle.courses.filter(
    (c) => subject === 'All' || c.subject === subject
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-semibold text-[#0F213E]">
          Book an Online Lesson
        </h1>
        <p className="mt-1.5 text-sm text-[#475569]">
          Available times are checked live against the teacher’s schedule and displayed in your
          local timezone.
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          {/* Step 1: Course & Lesson Type */}
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
            <h2 className="text-base font-semibold text-[#0F213E]">
              1. Subject, Course &amp; Lesson Type
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#475569]">Filter Subject</label>
                <select
                  value={subject}
                  onChange={(e) => {
                    const nextSub = e.target.value;
                    setSubject(nextSub);
                    const first = bundle.courses.find(
                      (c) => nextSub === 'All' || c.subject === nextSub
                    );
                    if (first) setCourseId(first.id);
                  }}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                >
                  <option value="All">All Subjects</option>
                  <option value="Mathematics">Mathematics</option>
                  <option value="Coding & Computer Science">Coding &amp; Computer Science</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Lesson Type</label>
                <select
                  value={lessonType}
                  onChange={(e) => setLessonType(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                >
                  <option value="individual">Individual Lesson</option>
                  <option value="trial">Trial / Diagnostic Lesson (45 min)</option>
                  <option value="package">Monthly Package</option>
                  <option value="recurring_weekly">Recurring Weekly</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-[#475569]">Course</label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
              >
                {filteredCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.age_or_grade_range})
                  </option>
                ))}
              </select>
            </div>

            {bundle.teachers.length > 1 && (
              <div className="mt-4">
                <label className="block text-xs font-medium text-[#475569]">Teacher</label>
                <select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                >
                  {bundle.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} — {t.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Step 2: Timezone & Available Slots */}
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-[#0F213E]">
                2. Select Date &amp; Time in Your Timezone
              </h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-[#475569]">
                <Globe2 className="h-3.5 w-3.5" /> {userTimezone}
              </span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#475569]">Preferred Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Your Timezone</label>
                <select
                  value={userTimezone}
                  onChange={(e) => setUserTimezone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                >
                  {Array.from(new Set([userTimezone, ...COMMON_TIMEZONES])).map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-[#475569]">
                Available Slots ({durationMinutes} minutes)
              </p>
              {loadingSlots ? (
                <p className="mt-2 text-sm text-[#64748B]">Checking live availability...</p>
              ) : slots.length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-[#D8D1C4] p-4 text-sm text-[#64748B]">
                  No open slots on this date. Try another weekday or Saturday.
                </p>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {slots.map((slot) => {
                    const active = selectedSlot?.start_utc === slot.start_utc;
                    const localTime = formatUtcInTimezone(slot.start_utc, userTimezone, {
                      includeDate: false,
                      includeTime: true,
                      includeTz: true,
                    });
                    return (
                      <button
                        key={slot.start_utc}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                          active
                            ? 'border-[#0F213E] bg-[#0F213E] text-white'
                            : 'border-[#D8D1C4] bg-[#FAF8F4] text-[#0F213E] hover:border-[#0F213E]'
                        }`}
                      >
                        <div className="font-mono-num font-semibold">{localTime}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Step 3: Learner & Parent Contact Details */}
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
            <h2 className="text-base font-semibold text-[#0F213E]">
              3. Learner &amp; Parent Details
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#475569]">Learner Full Name</label>
                <input
                  type="text"
                  required
                  value={learnerName}
                  onChange={(e) => setLearnerName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Age / Grade Level</label>
                <input
                  type="text"
                  value={learnerAgeGrade}
                  onChange={(e) => setLearnerAgeGrade(e.target.value)}
                  placeholder="e.g. Grade 5 / Age 10"
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Parent / Guardian Name</label>
                <input
                  type="text"
                  required
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Parent Email</label>
                <input
                  type="email"
                  required
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Phone / WhatsApp</label>
                <input
                  type="tel"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Preferred Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                >
                  <option value="KES">KES</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-[#475569]">
                Learning Goals / Curriculum Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Preparing for Grade 6 CBC fractions or IGCSE algebra..."
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Review Sidebar */}
        <div className="lg:col-span-5">
          <div className="sticky top-24 rounded-xl border border-[#E5DFD3] bg-white p-6">
            <h2 className="font-display text-xl font-semibold text-[#0F213E]">
              Booking Summary
            </h2>
            <div className="mt-4 space-y-3 border-t border-[#EFEAE0] pt-4 text-sm">
              <div>
                <p className="text-xs text-[#64748B]">Course</p>
                <p className="font-medium text-[#0F213E]">{selectedCourse?.title || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Lesson Type &amp; Duration</p>
                <p className="font-medium text-[#0F213E]">
                  {lessonType.replace('_', ' ')} · {durationMinutes} minutes
                </p>
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Selected Time ({userTimezone})</p>
                <p className="font-medium text-[#0F213E]">
                  {selectedSlot
                    ? formatUtcInTimezone(selectedSlot.start_utc, userTimezone)
                    : 'No time selected yet'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Session Rate (40% Discount)</p>
                {selectedCourse && (
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="font-mono-num text-xs text-[#64748B] line-through">
                      {formatCurrency(
                        (currency === 'USD'
                          ? selectedCourse.original_price_usd ?? 10
                          : currency === 'GBP'
                          ? selectedCourse.original_price_gbp ?? 8
                          : currency === 'EUR'
                          ? selectedCourse.original_price_eur ?? 9
                          : selectedCourse.original_price_kes ?? 1300) *
                          (lessonType === 'package' ? 4 : 1),
                        currency
                      )}
                    </span>
                    <span className="font-mono-num text-lg font-semibold text-[#166534]">
                      {formatCurrency(
                        (currency === 'USD'
                          ? selectedCourse.price_usd
                          : currency === 'GBP'
                          ? selectedCourse.price_gbp
                          : currency === 'EUR'
                          ? selectedCourse.price_eur
                          : selectedCourse.price_kes) *
                          (lessonType === 'package' ? 4 : 1),
                        currency
                      )}
                    </span>
                  </div>
                )}
              </div>
              {selectedSlot && (
                <div>
                  <p className="text-xs text-[#64748B]">
                    Teacher Time ({selectedSlot.teacher_timezone})
                  </p>
                  <p className="text-xs font-mono-num text-[#475569]">
                    {selectedSlot.teacher_local_time}
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedSlot}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F213E] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1B355E] disabled:opacity-50"
            >
              <Calendar className="h-4 w-4" />
              {submitting ? 'Submitting Booking...' : 'Confirm & Submit Booking'}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-[#64748B]">
              Double-booking is prevented automatically at the database level. You will receive a
              unique booking reference immediately.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
};
