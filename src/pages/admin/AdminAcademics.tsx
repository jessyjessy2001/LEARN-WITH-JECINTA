import React, { useState } from 'react';
import { Lock, Plus, Search, UserPlus } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { COMMON_TIMEZONES, formatCurrency } from '../../lib/timezone';

interface AdminAcademicsProps {
  section: 'students' | 'parents' | 'teachers' | 'courses' | 'curriculum';
  data: any;
  onRefresh: () => void;
}

export const AdminAcademics: React.FC<AdminAcademicsProps> = ({
  section,
  data,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');

  // Add Student state
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [sName, setSName] = useState('');
  const [sGrade, setSGrade] = useState('');
  const [sCountry, setSCountry] = useState('Kenya');
  const [sTz, setSTz] = useState('Africa/Nairobi');
  const [sGoals, setSGoals] = useState('');
  const [sPrivateObs, setSPrivateObs] = useState('');
  const [sParentId, setSParentId] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPassword, setSPassword] = useState('');
  const [editingStudent, setEditingStudent] = useState<any>(null);

  // Add Teacher state
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [tName, setTName] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [tPass, setTPass] = useState('');
  const [tTitle, setTTitle] = useState('Coding & Math Tutor');

  // Add Course state
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [cTitle, setCTitle] = useState('');
  const [cSubject, setCSubject] = useState('Mathematics');
  const [cDesc, setCDesc] = useState('');
  const [cGrade, setCGrade] = useState('Grades 1–8');
  const [cLevel, setCLevel] = useState('Intermediate');
  const [cKes, setCKes] = useState('780');
  const [cUsd, setCUsd] = useState('6');
  const [cGbp, setCGbp] = useState('5');
  const [cEur, setCEur] = useState('5.5');

  // Curriculum Module/Lesson state
  const [modCourseId, setModCourseId] = useState(data.courses?.[0]?.id || '');
  const [modTitle, setModTitle] = useState('');
  const [lessonModId, setLessonModId] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonTopic, setLessonTopic] = useState('');
  const [lessonSkills, setLessonSkills] = useState('');

  // Enrol student state
  const [enrolCourseId, setEnrolCourseId] = useState(data.courses?.[0]?.id || '');

  if (section === 'students') {
    const students: any[] = (data.students || []).filter(
      (s: any) =>
        s.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (s.grade_level || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.country || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
              Students CRM
            </h1>
            <p className="text-xs text-[#64748B]">
              Private teacher observations are isolated and never visible to parents or students.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-[#64748B]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students..."
                className="rounded-lg border border-[#D8D1C4] bg-white py-2 pr-3 pl-9 text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowAddStudent(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
            >
              <UserPlus className="h-4 w-4" /> Add Student
            </button>
          </div>
        </div>

        {msg && <p className="text-sm text-[#166534]">{msg}</p>}

        {students.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D8D1C4] bg-white p-8 text-center text-sm text-[#64748B]">
            No students found. Add a student or wait for parent registrations.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {students.map((s) => (
              <div key={s.id} className="rounded-xl border border-[#E5DFD3] bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-[#64748B]">
                      {s.grade_level} · {s.country} · {s.timezone}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-[#0F213E]">{s.full_name}</h3>
                    <p className="mt-1 text-xs text-[#475569]">
                      Parent: {s.parent_names || 'Unlinked'} · Subjects:{' '}
                      {s.enrolled_subjects || 'None yet'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingStudent(s)}
                    className="rounded-lg border border-[#D8D1C4] px-3 py-1 text-xs font-medium text-[#0F213E]"
                  >
                    Manage
                  </button>
                </div>
                {s.private_teacher_observations && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#EADBC0] bg-[#FAF3E6] p-3 text-xs text-[#92400E]">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Private Teacher Note: {s.private_teacher_observations}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Student Modal */}
        {showAddStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/admin/students', {
                  method: 'POST',
                  body: JSON.stringify({
                    fullName: sName,
                    gradeLevel: sGrade,
                    country: sCountry,
                    timezone: sTz,
                    learningGoals: sGoals,
                    privateTeacherObservations: sPrivateObs,
                    parentId: sParentId || undefined,
                    studentEmail: sEmail || undefined,
                    studentPassword: sPassword || undefined,
                  }),
                });
                setShowAddStudent(false);
                setSName('');
                setSGrade('');
                onRefresh();
              }}
              className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-3"
            >
              <h3 className="font-display text-xl font-semibold text-[#0F213E]">Add Student</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  required
                  value={sName}
                  onChange={(e) => setSName(e.target.value)}
                  placeholder="Student Full Name"
                  className="rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  required
                  value={sGrade}
                  onChange={(e) => setSGrade(e.target.value)}
                  placeholder="Grade Level (e.g. Grade 5)"
                  className="rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={sCountry}
                  onChange={(e) => setSCountry(e.target.value)}
                  placeholder="Country"
                  className="rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
                <select
                  value={sTz}
                  onChange={(e) => setSTz(e.target.value)}
                  className="rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                >
                  {COMMON_TIMEZONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <select
                value={sParentId}
                onChange={(e) => setSParentId(e.target.value)}
                className="w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
              >
                <option value="">Link Parent (Optional)</option>
                {(data.parents || []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.email})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={sGoals}
                onChange={(e) => setSGoals(e.target.value)}
                placeholder="Learning goals"
                className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
              />
              <textarea
                rows={2}
                value={sPrivateObs}
                onChange={(e) => setSPrivateObs(e.target.value)}
                placeholder="Private teacher observations (hidden from parent/student)"
                className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="email"
                  value={sEmail}
                  onChange={(e) => setSEmail(e.target.value)}
                  placeholder="Optional student login email"
                  className="rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
                />
                <input
                  type="password"
                  value={sPassword}
                  onChange={(e) => setSPassword(e.target.value)}
                  placeholder="Optional student password"
                  className="rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStudent(false)}
                  className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm text-white"
                >
                  Create Student
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Edit / Enrol Student Modal */}
        {editingStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
              <h3 className="font-display text-xl font-semibold text-[#0F213E]">
                Manage {editingStudent.full_name}
              </h3>
              <div>
                <label className="block text-xs font-medium text-[#475569]">
                  Private Teacher Observations (Admin/Teacher Only)
                </label>
                <textarea
                  rows={3}
                  value={editingStudent.private_teacher_observations || ''}
                  onChange={(e) =>
                    setEditingStudent({
                      ...editingStudent,
                      private_teacher_observations: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>
              <div className="border-t border-[#EFEAE0] pt-3">
                <label className="block text-xs font-medium text-[#475569]">
                  Enrol in Course
                </label>
                <div className="mt-1 flex gap-2">
                  <select
                    value={enrolCourseId}
                    onChange={(e) => setEnrolCourseId(e.target.value)}
                    className="flex-1 rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
                  >
                    {(data.courses || []).map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch('/api/admin/enrolments', {
                        method: 'POST',
                        body: JSON.stringify({
                          studentId: editingStudent.id,
                          courseId: enrolCourseId,
                        }),
                      });
                      setMsg(`Enrolled ${editingStudent.full_name} in course.`);
                      onRefresh();
                    }}
                    className="rounded-lg border border-[#0F213E] px-3 py-1.5 text-xs font-medium text-[#0F213E]"
                  >
                    Enrol
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/admin/students/${editingStudent.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        privateTeacherObservations: editingStudent.private_teacher_observations,
                      }),
                    });
                    setEditingStudent(null);
                    onRefresh();
                  }}
                  className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm text-white"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (section === 'parents') {
    const parents: any[] = data.parents || [];
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-semibold text-[#0F213E]">Parents Directory</h1>
        {parents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D8D1C4] bg-white p-8 text-center text-sm text-[#64748B]">
            No registered parents yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E5DFD3] bg-white p-5">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E5DFD3] text-xs font-semibold text-[#64748B]">
                  <th className="py-2 pr-4">Parent Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Country / Timezone</th>
                  <th className="py-2 pr-4">Currency</th>
                  <th className="py-2">Children</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEAE0]">
                {parents.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 pr-4 font-medium text-[#0F213E]">{p.full_name}</td>
                    <td className="py-3 pr-4 text-[#475569]">{p.email}</td>
                    <td className="py-3 pr-4 text-xs text-[#475569]">
                      {p.country} · {p.timezone}
                    </td>
                    <td className="py-3 pr-4 font-mono-num text-xs">{p.preferred_currency}</td>
                    <td className="py-3 text-xs text-[#0F213E]">
                      {p.children_names || 'None added'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (section === 'teachers') {
    const teachers: any[] = data.teachers || [];
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#0F213E]">Teachers</h1>
            <p className="text-xs text-[#64748B]">
              Multi-teacher architecture ready for future Coding &amp; Math tutors.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddTeacher(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
          >
            <Plus className="h-4 w-4" /> Add Teacher
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {teachers.map((t) => (
            <div key={t.id} className="rounded-xl border border-[#E5DFD3] bg-white p-5">
              <p className="text-xs font-medium text-[#9A6D14]">
                {t.is_primary ? 'Primary Founder & Admin' : 'Teacher'} · {t.timezone}
              </p>
              <h3 className="mt-1 text-base font-semibold text-[#0F213E]">{t.full_name}</h3>
              <p className="text-xs text-[#475569]">{t.title} · {t.email}</p>
              <p className="mt-2 text-xs text-[#64748B]">
                Default Video Provider: {t.default_meeting_provider}
              </p>
            </div>
          ))}
        </div>

        {showAddTeacher && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/admin/teachers', {
                  method: 'POST',
                  body: JSON.stringify({
                    fullName: tName,
                    email: tEmail,
                    password: tPass,
                    title: tTitle,
                  }),
                });
                setShowAddTeacher(false);
                setTName('');
                setTEmail('');
                setTPass('');
                onRefresh();
              }}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-3"
            >
              <h3 className="font-display text-xl font-semibold text-[#0F213E]">Add Teacher</h3>
              <input
                type="text"
                required
                value={tName}
                onChange={(e) => setTName(e.target.value)}
                placeholder="Teacher Full Name"
                className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
              />
              <input
                type="email"
                required
                value={tEmail}
                onChange={(e) => setTEmail(e.target.value)}
                placeholder="Teacher Email"
                className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
              />
              <input
                type="password"
                required
                minLength={8}
                value={tPass}
                onChange={(e) => setTPass(e.target.value)}
                placeholder="Password (min 8 chars)"
                className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={tTitle}
                onChange={(e) => setTTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTeacher(false)}
                  className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm text-white">
                  Save Teacher
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  if (section === 'courses') {
    const courses: any[] = data.courses || [];
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
              Courses &amp; Pricing Manager
            </h1>
            <p className="text-xs text-[#64748B]">
              Updates reflect immediately on the public Courses, Pricing, and Booking pages.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddCourse(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
          >
            <Plus className="h-4 w-4" /> Create Course
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((c) => (
            <div key={c.id} className="rounded-xl border border-[#E5DFD3] bg-white p-5">
              <div className="flex justify-between text-xs text-[#64748B]">
                <span>{c.subject} · {c.age_or_grade_range}</span>
                <span className="font-semibold text-[#0F213E]">{c.status}</span>
              </div>
              <h3 className="mt-1 text-base font-semibold text-[#0F213E]">{c.title}</h3>
              <p className="mt-1 text-xs text-[#475569]">{c.description}</p>
              <p className="mt-3 font-mono-num text-xs font-semibold text-[#0F213E]">
                {c.original_price_usd && c.original_price_usd > c.price_usd ? (
                  <span className="mr-1.5 text-[#94A3B8] line-through">
                    {formatCurrency(c.original_price_usd, 'USD')}
                  </span>
                ) : null}
                {formatCurrency(c.price_usd, 'USD')} · {formatCurrency(c.price_kes, 'KES')} ·{' '}
                {formatCurrency(c.price_gbp, 'GBP')} · {formatCurrency(c.price_eur, 'EUR')}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/admin/courses/${c.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        status: c.status === 'published' ? 'archived' : 'published',
                      }),
                    });
                    onRefresh();
                  }}
                  className="rounded-lg border border-[#D8D1C4] px-3 py-1 text-xs font-medium text-[#0F213E]"
                >
                  {c.status === 'published' ? 'Archive' : 'Publish'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {showAddCourse && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/admin/courses', {
                  method: 'POST',
                  body: JSON.stringify({
                    title: cTitle,
                    subject: cSubject,
                    description: cDesc,
                    ageOrGradeRange: cGrade,
                    learningLevel: cLevel,
                    priceKes: Number(cKes),
                    priceUsd: Number(cUsd),
                    priceGbp: Number(cGbp),
                    priceEur: Number(cEur),
                  }),
                });
                setShowAddCourse(false);
                setCTitle('');
                setCDesc('');
                onRefresh();
              }}
              className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-3"
            >
              <h3 className="font-display text-xl font-semibold text-[#0F213E]">Create Course</h3>
              <input
                type="text"
                required
                value={cTitle}
                onChange={(e) => setCTitle(e.target.value)}
                placeholder="Course Title"
                className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <select
                  value={cSubject}
                  onChange={(e) => setCSubject(e.target.value)}
                  className="rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                >
                  <option value="Mathematics">Mathematics</option>
                  <option value="Coding & Computer Science">Coding &amp; CS</option>
                </select>
                <input
                  type="text"
                  value={cGrade}
                  onChange={(e) => setCGrade(e.target.value)}
                  placeholder="Grade / Age"
                  className="rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={cLevel}
                  onChange={(e) => setCLevel(e.target.value)}
                  placeholder="Level"
                  className="rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>
              <textarea
                rows={3}
                required
                value={cDesc}
                onChange={(e) => setCDesc(e.target.value)}
                placeholder="Course description and objectives..."
                className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-4 gap-2">
                <input
                  type="number"
                  value={cKes}
                  onChange={(e) => setCKes(e.target.value)}
                  placeholder="KES"
                  className="rounded-lg border border-[#D8D1C4] px-2.5 py-2 text-xs"
                />
                <input
                  type="number"
                  value={cUsd}
                  onChange={(e) => setCUsd(e.target.value)}
                  placeholder="USD"
                  className="rounded-lg border border-[#D8D1C4] px-2.5 py-2 text-xs"
                />
                <input
                  type="number"
                  value={cGbp}
                  onChange={(e) => setCGbp(e.target.value)}
                  placeholder="GBP"
                  className="rounded-lg border border-[#D8D1C4] px-2.5 py-2 text-xs"
                />
                <input
                  type="number"
                  value={cEur}
                  onChange={(e) => setCEur(e.target.value)}
                  placeholder="EUR"
                  className="rounded-lg border border-[#D8D1C4] px-2.5 py-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCourse(false)}
                  className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm text-white">
                  Save Course
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // Curriculum section
  const courses: any[] = data.courses || [];
  const allModules = courses.flatMap((c) =>
    (c.modules || []).map((m: any) => ({ ...m, course_title: c.title }))
  );

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
        Curriculum Builder
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await apiFetch('/api/admin/modules', {
              method: 'POST',
              body: JSON.stringify({ courseId: modCourseId, title: modTitle }),
            });
            setModTitle('');
            onRefresh();
          }}
          className="space-y-3 rounded-xl border border-[#E5DFD3] bg-white p-5"
        >
          <h2 className="text-sm font-semibold text-[#0F213E]">Add Curriculum Module</h2>
          <select
            value={modCourseId}
            onChange={(e) => setModCourseId(e.target.value)}
            className="w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <input
            type="text"
            required
            value={modTitle}
            onChange={(e) => setModTitle(e.target.value)}
            placeholder="Module Title"
            className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white">
            Add Module
          </button>
        </form>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const targetMod = lessonModId || allModules[0]?.id;
            if (!targetMod) return;
            await apiFetch('/api/admin/lessons', {
              method: 'POST',
              body: JSON.stringify({
                moduleId: targetMod,
                title: lessonTitle,
                topic: lessonTopic,
                skillsCovered: lessonSkills,
              }),
            });
            setLessonTitle('');
            setLessonTopic('');
            setLessonSkills('');
            onRefresh();
          }}
          className="space-y-3 rounded-xl border border-[#E5DFD3] bg-white p-5"
        >
          <h2 className="text-sm font-semibold text-[#0F213E]">Add Curriculum Lesson</h2>
          <select
            value={lessonModId || allModules[0]?.id || ''}
            onChange={(e) => setLessonModId(e.target.value)}
            className="w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
          >
            {allModules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.course_title} → {m.title}
              </option>
            ))}
          </select>
          <input
            type="text"
            required
            value={lessonTitle}
            onChange={(e) => setLessonTitle(e.target.value)}
            placeholder="Lesson Title"
            className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
          />
          <input
            type="text"
            required
            value={lessonTopic}
            onChange={(e) => setLessonTopic(e.target.value)}
            placeholder="Core Topic"
            className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={lessonSkills}
            onChange={(e) => setLessonSkills(e.target.value)}
            placeholder="Skills covered"
            className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white">
            Add Lesson
          </button>
        </form>
      </div>
    </div>
  );
};
