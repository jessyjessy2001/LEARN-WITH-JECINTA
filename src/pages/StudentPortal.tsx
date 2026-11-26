import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Upload,
  Video,
} from 'lucide-react';
import { apiFetch, getSessionToken } from '../lib/api';
import {
  buildGoogleCalendarTemplateUrl,
  formatCountdown,
  formatUtcInTimezone,
} from '../lib/timezone';
import type { AuthUser } from '../lib/types';
import { LessonReviewModal } from '../components/LessonReviewModal';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

interface StudentPortalProps {
  user: AuthUser;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({ user }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewClassId, setReviewClassId] = useState<string | null>(null);

  // Assignment submission state
  const [activeAssignment, setActiveAssignment] = useState<any>(null);
  const [writtenAnswer, setWrittenAnswer] = useState('');
  const [submissionLink, setSubmissionLink] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  const loadDashboard = () => {
    setLoading(true);
    apiFetch('/api/student/dashboard')
      .then((res) => setData(res))
      .catch((err) => setError(err.message || 'Could not load dashboard.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const tz = data?.student?.timezone || user.timezone || 'Africa/Nairobi';

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await apiFetch<{ fileUrl: string }>('/api/uploads', {
          method: 'POST',
          body: JSON.stringify({
            filename: file.name,
            dataBase64: reader.result,
          }),
        });
        setAttachmentUrl(res.fileUrl);
      } catch (err: unknown) {
        setSubmitMsg(err instanceof Error ? err.message : 'File upload failed');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAssignment) return;
    setSubmitting(true);
    setSubmitMsg('');
    try {
      await apiFetch(`/api/student/assignments/${activeAssignment.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ writtenAnswer, submissionLink, attachmentUrl }),
      });
      setActiveAssignment(null);
      setWrittenAnswer('');
      setSubmissionLink('');
      setAttachmentUrl('');
      loadDashboard();
    } catch (err: unknown) {
      setSubmitMsg(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadFile = async (url: string) => {
    if (!url.startsWith('/api/files/')) return;
    const token = getSessionToken();
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = url.split('/').pop() || 'file';
    a.click();
    URL.revokeObjectURL(objUrl);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="h-48 animate-pulse rounded-2xl border border-[#E5DFD3] bg-white" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {error || 'Student profile not linked yet. Please ask your parent or teacher.'}
        </div>
      </div>
    );
  }

  const classes: any[] = data.classes || [];
  const upcomingOrActive = classes.filter(
    (c) => c.status === 'scheduled' || c.status === 'in_progress' || c.status === 'rescheduled'
  );
  const completedClasses = classes.filter((c) => c.status === 'completed').reverse();
  const nextClass = upcomingOrActive[0] || completedClasses[0] || null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium text-[#9A6D14]">
            Student Learning Space · {data.student?.grade_level}
          </p>
          <h1 className="font-display mt-1 text-3xl font-semibold text-[#0F213E]">
            Welcome, {data.student?.full_name || user.full_name}
          </h1>
        </div>
        <p className="text-xs text-[#64748B]">All times shown in your timezone: {tz}</p>
      </div>

      {/* NEXT CLASS HERO CARD */}
      <section className="mt-6 rounded-2xl border border-[#0F213E] bg-[#0F213E] p-6 text-white sm:p-8">
        {!nextClass ? (
          <div>
            <p className="text-xs font-medium text-[#D6B15C]">Your Next Lesson</p>
            <h2 className="font-display mt-1 text-2xl font-semibold">
              No lessons scheduled yet
            </h2>
            <p className="mt-2 text-sm text-[#CBD5E1]">
              Once your parent or teacher schedules a class, your Join Class button will appear
              right here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-medium text-[#D6B15C]">
                {nextClass.status === 'completed'
                  ? 'Most Recent Completed Lesson'
                  : `Next Scheduled Lesson · ${formatCountdown(nextClass.start_time_utc)}`}
              </p>
              <h2 className="font-display mt-1.5 text-2xl font-semibold text-white sm:text-3xl">
                {nextClass.subject}: {nextClass.topic || nextClass.course_title}
              </h2>
              <p className="mt-2 text-sm text-[#CBD5E1]">
                {formatUtcInTimezone(nextClass.start_time_utc, tz)} · {nextClass.duration_minutes}{' '}
                minutes · Teacher: {nextClass.teacher_name || 'Jecinta Maina'}
              </p>
              {nextClass.student_instructions && (
                <p className="mt-2 text-xs text-[#E2E8F0]">
                  Note: {nextClass.student_instructions}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {nextClass.status === 'completed' ? (
                <button
                  type="button"
                  onClick={() => setReviewClassId(nextClass.id)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#C6922C] px-5 py-3 text-sm font-semibold text-[#0F213E] transition-colors hover:bg-[#D6B15C]"
                >
                  <BookOpen className="h-4 w-4" />
                  Review Lesson
                </button>
              ) : (
                <>
                  {nextClass.join_url ? (
                    <a
                      href={nextClass.join_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-[#C6922C] px-5 py-3 text-sm font-semibold text-[#0F213E] transition-colors hover:bg-[#D6B15C]"
                    >
                      <Video className="h-4 w-4" />
                      Join Class ({nextClass.video_provider === 'google_meet' ? 'Google Meet' : 'Zoom'})
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="rounded-lg border border-white/20 px-4 py-2.5 text-xs text-[#CBD5E1]">
                      Meeting link pending teacher setup
                    </span>
                  )}
                  <a
                    href={buildGoogleCalendarTemplateUrl({
                      title: `Jey Learning Hub: ${nextClass.subject} — ${nextClass.topic || nextClass.course_title}`,
                      startUtc: nextClass.start_time_utc,
                      endUtc: nextClass.end_time_utc,
                      durationMinutes: nextClass.duration_minutes,
                      location: nextClass.join_url || 'Online Lesson',
                      description: `Teacher: ${nextClass.teacher_name || 'Jecinta Maina'}${
                        nextClass.join_url ? `\nJoin Link: ${nextClass.join_url}` : ''
                      }`,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-4 py-2.5 text-xs font-medium text-white hover:bg-white/10"
                  >
                    <Calendar className="h-4 w-4" /> Add to Calendar
                  </a>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Course Progress */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold text-[#0F213E]">
          Enrolled Courses &amp; Progress
        </h2>
        {data.enrolments.length === 0 ? (
          <p className="mt-3 rounded-xl border border-[#E5DFD3] bg-white p-5 text-sm text-[#64748B]">
            No active course enrolments yet.
          </p>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {data.enrolments.map((enr: any) => {
              const total = Math.max(1, Number(enr.total_curriculum_lessons || 0));
              const done = Number(enr.completed_classes_count || 0);
              const pct = Math.min(100, Math.round((done / total) * 100));
              return (
                <div key={enr.id} className="rounded-xl border border-[#E5DFD3] bg-white p-5">
                  <p className="text-xs font-medium text-[#64748B]">
                    {enr.subject} · {enr.learning_level}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-[#0F213E]">
                    {enr.course_title}
                  </h3>
                  <div className="mt-4 flex items-center justify-between text-xs text-[#475569]">
                    <span className="font-mono-num">
                      {done} / {enr.total_curriculum_lessons || 0} lessons completed
                    </span>
                    <span className="font-mono-num font-semibold text-[#0F213E]">{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#EFEAE0]">
                    <div
                      className="h-full rounded-full bg-[#0F213E]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Timetable & Completed Lessons */}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section className="rounded-xl border border-[#E5DFD3] bg-white p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#0F213E]">
            <Calendar className="h-4 w-4 text-[#C6922C]" /> Upcoming Timetable
          </h2>
          {upcomingOrActive.length === 0 ? (
            <p className="mt-4 text-sm text-[#64748B]">No upcoming classes scheduled.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {upcomingOrActive.map((cls) => (
                <div
                  key={cls.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#0F213E]">
                      {cls.subject} — {cls.topic || cls.course_title}
                    </p>
                    <p className="mt-0.5 text-xs text-[#475569]">
                      {formatUtcInTimezone(cls.start_time_utc, tz)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {cls.join_url ? (
                      <a
                        href={cls.join_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-[#0F213E] px-3.5 py-2 text-xs font-medium text-white"
                      >
                        Join {cls.video_provider === 'google_meet' ? 'Meet' : 'Zoom'}
                      </a>
                    ) : (
                      <span className="text-xs text-[#64748B]">Link pending</span>
                    )}
                    <a
                      href={buildGoogleCalendarTemplateUrl({
                        title: `Jey Learning Hub: ${cls.subject} — ${cls.topic || cls.course_title}`,
                        startUtc: cls.start_time_utc,
                        endUtc: cls.end_time_utc,
                        durationMinutes: cls.duration_minutes,
                        location: cls.join_url || 'Online Lesson',
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs font-medium text-[#0F213E]"
                    >
                      + Calendar
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#E5DFD3] bg-white p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#0F213E]">
            <CheckCircle2 className="h-4 w-4 text-[#166534]" /> Completed Lessons &amp; Recordings
          </h2>
          {completedClasses.length === 0 ? (
            <p className="mt-4 text-sm text-[#64748B]">Completed lessons will appear here.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {completedClasses.map((cls) => (
                <div
                  key={cls.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#0F213E]">
                      {cls.subject} — {cls.topic || cls.title}
                    </p>
                    <p className="mt-0.5 text-xs text-[#64748B]">
                      {formatUtcInTimezone(cls.start_time_utc, tz)}
                      {cls.has_published_notes > 0 ? ' · Notes available' : ''}
                      {cls.has_published_recording > 0 ? ' · Recording available' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewClassId(cls.id)}
                    className="rounded-lg border border-[#0F213E] px-3.5 py-1.5 text-xs font-semibold text-[#0F213E] hover:bg-[#0F213E] hover:text-white"
                  >
                    Review Lesson
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Assignments & Homework */}
      <section className="mt-8 rounded-xl border border-[#E5DFD3] bg-white p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#0F213E]">
          <ClipboardList className="h-4 w-4 text-[#C6922C]" /> Assignments &amp; Teacher Feedback
        </h2>
        {data.assignments.length === 0 ? (
          <p className="mt-4 text-sm text-[#64748B]">No published assignments right now.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {data.assignments.map((a: any) => (
              <div
                key={a.id}
                className="rounded-xl border border-[#EFEAE0] bg-[#FAF8F4] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-[#64748B]">
                      {a.subject} · {a.course_title}
                      {a.due_date_utc
                        ? ` · Due ${formatUtcInTimezone(a.due_date_utc, tz)}`
                        : ''}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-[#0F213E]">{a.title}</h3>
                    <p className="mt-1 text-sm text-[#475569]">{a.instructions}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-[#0F213E]">
                      Status: {a.submission_status || 'Not submitted'}
                    </span>
                    {a.marks_awarded !== null && a.marks_awarded !== undefined && (
                      <p className="font-mono-num mt-1 text-sm font-semibold text-[#166534]">
                        Score: {a.marks_awarded} / {a.max_marks}
                      </p>
                    )}
                  </div>
                </div>

                {a.teacher_feedback && (
                  <div className="mt-3 rounded-lg border border-[#D1E7D8] bg-[#EDF6F0] p-3 text-xs text-[#0F213E]">
                    <strong>Teacher Feedback:</strong> {a.teacher_feedback}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAssignment(a);
                      setWrittenAnswer(a.written_answer || '');
                      setSubmissionLink(a.submission_link || '');
                      setAttachmentUrl(a.submission_attachment || '');
                    }}
                    className="rounded-lg bg-[#0F213E] px-3.5 py-1.5 text-xs font-medium text-white"
                  >
                    {a.submission_id ? 'Update Submission' : 'Submit Homework'}
                  </button>
                  {a.external_link && (
                    <a
                      href={a.external_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-[#1E40AF] underline"
                    >
                      Open Worksheet Link
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Published Notes & Learning Resources */}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section className="rounded-xl border border-[#E5DFD3] bg-white p-6">
          <h2 className="font-display text-lg font-semibold text-[#0F213E]">
            Recent Lesson Summaries
          </h2>
          {data.publishedNotes.length === 0 ? (
            <p className="mt-4 text-sm text-[#64748B]">No published lesson notes yet.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {data.publishedNotes.slice(0, 3).map((n: any) => (
                <div key={n.id} className="rounded-lg border border-[#EFEAE0] p-4">
                  <p className="text-xs text-[#64748B]">
                    {n.subject} · {formatUtcInTimezone(n.start_time_utc, tz)}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-[#0F213E]">{n.title}</h3>
                  <div className="mt-2 max-h-40 overflow-y-auto">
                    <MarkdownRenderer content={n.content_markdown} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewClassId(n.class_id)}
                    className="mt-2 text-xs font-semibold text-[#0F213E] underline"
                  >
                    Open Full Lesson Page
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#E5DFD3] bg-white p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#0F213E]">
            <FileText className="h-4 w-4 text-[#C6922C]" /> Learning Resources Library
          </h2>
          {data.resources.length === 0 ? (
            <p className="mt-4 text-sm text-[#64748B]">No shared resources yet.</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {data.resources.map((r: any) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-[#0F213E]">{r.title}</p>
                    <p className="text-xs text-[#64748B]">{r.resource_type}</p>
                  </div>
                  {r.file_url.startsWith('/api/files/') ? (
                    <button
                      type="button"
                      onClick={() => downloadFile(r.file_url)}
                      className="text-xs font-semibold text-[#1E40AF] underline"
                    >
                      Download
                    </button>
                  ) : (
                    <a
                      href={r.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[#1E40AF] underline"
                    >
                      Open
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Homework Submission Modal */}
      {activeAssignment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSubmitAssignment}
            className="w-full max-w-lg rounded-2xl border border-[#E5DFD3] bg-white p-6 shadow-xl"
          >
            <h3 className="font-display text-xl font-semibold text-[#0F213E]">
              Submit: {activeAssignment.title}
            </h3>
            {submitMsg && (
              <p className="mt-2 text-xs text-red-700">{submitMsg}</p>
            )}
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#475569]">Written Answer</label>
                <textarea
                  rows={4}
                  value={writtenAnswer}
                  onChange={(e) => setWrittenAnswer(e.target.value)}
                  placeholder="Write your solutions or explanation..."
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">
                  Project / Document Link (Optional)
                </label>
                <input
                  type="url"
                  value={submissionLink}
                  onChange={(e) => setSubmissionLink(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">
                  Upload Homework File (PDF / Image)
                </label>
                <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#D8D1C4] px-3 py-2.5 text-xs text-[#475569] hover:border-[#0F213E]">
                  <Upload className="h-4 w-4" />
                  <span>{attachmentUrl ? `Uploaded: ${attachmentUrl}` : 'Choose file to upload'}</span>
                  <input type="file" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveAssignment(null)}
                className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm font-medium text-white"
              >
                {submitting ? 'Submitting...' : 'Save Submission'}
              </button>
            </div>
          </form>
        </div>
      )}

      <LessonReviewModal
        classId={reviewClassId}
        timezone={tz}
        onClose={() => setReviewClassId(null)}
      />
    </div>
  );
};
