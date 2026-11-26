import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  Clock,
  ExternalLink,
  Plus,
  RefreshCw,
  Video,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
  clearGoogleAccessToken,
  getGoogleAccessToken,
  googleWorkspaceSignIn,
} from '../../lib/googleAuth';
import {
  buildGoogleCalendarTemplateUrl,
  formatCurrency,
  formatUtcInTimezone,
} from '../../lib/timezone';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface SharedAdminProps {
  data: any;
  teacherTz: string;
  onRefresh: () => void;
  onOpenSection: (section: string) => void;
  onGoogleConnected?: () => void;
}

export const AdminOverviewSection: React.FC<SharedAdminProps> = ({
  data,
  teacherTz,
  onRefresh,
  onOpenSection,
  onGoogleConnected,
}) => {
  const { overview, teachers } = data;
  const stats = overview?.stats || {};
  const nextClass = overview?.nextClass;
  const upcomingList: any[] = overview?.upcomingClasses || [];
  const bookingsList: any[] = data.bookings || [];

  const [filterSubject, setFilterSubject] = useState('All');
  const [filterStudent, setFilterStudent] = useState('');
  const [filterTeacher, setFilterTeacher] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  const [rescheduleTarget, setRescheduleTarget] = useState<any>(null);
  const [newStartLocal, setNewStartLocal] = useState('');
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [customLinkTarget, setCustomLinkTarget] = useState<any>(null);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const filteredNextFive = useMemo(() => {
    return upcomingList
      .filter((c) => {
        if (filterSubject !== 'All' && c.subject !== filterSubject) return false;
        if (
          filterStudent &&
          !(c.student_names || '').toLowerCase().includes(filterStudent.toLowerCase())
        )
          return false;
        if (filterTeacher !== 'All' && c.teacher_id !== filterTeacher) return false;
        if (filterStatus !== 'All' && c.status !== filterStatus) return false;
        return true;
      })
      .slice(0, 8);
  }, [upcomingList, filterSubject, filterStudent, filterTeacher, filterStatus]);

  const updateClassAction = async (
    classId: string,
    payload: Record<string, unknown>,
    msg: string
  ) => {
    setActionMsg('');
    try {
      await apiFetch(`/api/admin/classes/${classId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setActionMsg(msg);
      onRefresh();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const handleCreateMeeting = async (
    classId: string,
    provider: 'auto' | 'google_meet' | 'zoom' = 'google_meet'
  ) => {
    setActionMsg('');
    setCreatingId(classId);
    try {
      if ((provider === 'google_meet' || provider === 'auto') && !getGoogleAccessToken()) {
        await googleWorkspaceSignIn();
        onGoogleConnected?.();
      }

      const attempt = () =>
        apiFetch<{ meeting?: any }>(`/api/admin/classes/${classId}/meeting`, {
          method: 'POST',
          body: JSON.stringify({ provider }),
        });

      let res: { meeting?: any };
      try {
        res = await attempt();
      } catch (firstErr: any) {
        if (firstErr?.status === 401 || firstErr?.payload?.requiresGoogleSignIn) {
          clearGoogleAccessToken();
          await googleWorkspaceSignIn();
          onGoogleConnected?.();
          res = await attempt();
        } else {
          throw firstErr;
        }
      }

      const pLabel =
        res.meeting?.provider === 'google_meet'
          ? 'Added to Google Calendar with Google Meet link!'
          : 'Zoom meeting created and ready to join.';
      setActionMsg(pLabel);
      onRefresh();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Could not create meeting.');
    } finally {
      setCreatingId(null);
    }
  };

  const handleSaveCustomLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customLinkTarget || !customUrlInput) return;
    setActionMsg('');
    try {
      await apiFetch(`/api/admin/classes/${customLinkTarget.id}/meeting`, {
        method: 'POST',
        body: JSON.stringify({ customJoinUrl: customUrlInput }),
      });
      setCustomLinkTarget(null);
      setCustomUrlInput('');
      setActionMsg('Meeting link saved to session.');
      onRefresh();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Invalid URL.');
    }
  };

  const handleConfirmBooking = async (bookingId: string) => {
    setActionMsg('');
    try {
      const res = await apiFetch<{ videoNote?: string }>(`/api/admin/bookings/${bookingId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'confirmed' }),
      });
      setActionMsg(`Booking confirmed.${res.videoNote || ''}`);
      onRefresh();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Could not confirm booking.');
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget || !newStartLocal) return;
    await updateClassAction(
      rescheduleTarget.id,
      { startTimeUtc: new Date(newStartLocal).toISOString(), status: 'rescheduled' },
      'Class rescheduled.'
    );
    setRescheduleTarget(null);
    setNewStartLocal('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
            Teaching &amp; Business Overview
          </h1>
          <p className="text-xs text-[#64748B]">
            Live database metrics · Teacher Timezone: {teacherTz}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenSection('calendar')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
        >
          <Plus className="h-4 w-4" /> Schedule Class
        </button>
      </div>

      {actionMsg && (
        <div className="rounded-lg border border-[#D8D1C4] bg-white px-4 py-2.5 text-sm text-[#0F213E]">
          {actionMsg}
        </div>
      )}

      {/* Live KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
          <p className="text-xs text-[#64748B]">Total / Active Students</p>
          <p className="font-mono-num mt-1 text-2xl font-semibold text-[#0F213E]">
            {stats.totalStudents ?? 0}{' '}
            <span className="text-sm font-normal text-[#166534]">
              ({stats.activeStudents ?? 0} active)
            </span>
          </p>
        </div>
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
          <p className="text-xs text-[#64748B]">Total Parents · Upcoming / Done</p>
          <p className="font-mono-num mt-1 text-2xl font-semibold text-[#0F213E]">
            {stats.totalParents ?? 0}{' '}
            <span className="text-sm font-normal text-[#475569]">
              · {stats.upcomingClasses ?? 0} / {stats.completedClasses ?? 0}
            </span>
          </p>
        </div>
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
          <p className="text-xs text-[#64748B]">Pending Bookings / Payments</p>
          <p className="font-mono-num mt-1 text-2xl font-semibold text-[#0F213E]">
            {stats.pendingBookings ?? 0}{' '}
            <span className="text-sm font-normal text-[#9A6D14]">
              / {stats.pendingPayments ?? 0} awaiting review
            </span>
          </p>
        </div>
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
          <p className="text-xs text-[#64748B]">Outstanding &amp; Homework Queue</p>
          <p className="font-mono-num mt-1 text-sm font-semibold text-[#0F213E]">
            {(stats.outstandingBalances || []).length === 0
              ? 'KES 0'
              : (stats.outstandingBalances || [])
                  .map((b: any) => formatCurrency(b.balance, b.currency))
                  .join(' · ')}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">
            {stats.assignmentsAwaitingReview ?? 0} submissions to grade
          </p>
        </div>
      </div>

      {/* PROMINENT NEXT CLASS CARD */}
      <div className="rounded-2xl border border-[#0F213E] bg-[#0F213E] p-6 text-white">
        <p className="text-xs font-medium text-[#D6B15C]">Next Scheduled Class</p>
        {!nextClass ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-[#CBD5E1]">
              No upcoming classes are currently scheduled. Confirm a pending booking or schedule a
              new class.
            </p>
            <button
              type="button"
              onClick={() => onOpenSection('bookings')}
              className="rounded-lg bg-[#C6922C] px-4 py-2 text-xs font-semibold text-[#0F213E]"
            >
              Review Bookings ({stats.pendingBookings ?? 0})
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-4">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <h2 className="font-display text-2xl font-semibold text-white">
                  {nextClass.student_names || 'Learner'} — {nextClass.subject} (
                  {nextClass.course_title})
                </h2>
                <p className="mt-1 text-sm text-[#CBD5E1]">
                  Topic: {nextClass.topic || 'General Lesson'} · Parent:{' '}
                  {nextClass.parent_name || '—'}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#E2E8F0]">
                  <span>
                    Teacher Time ({teacherTz}):{' '}
                    <strong className="font-mono-num">
                      {formatUtcInTimezone(nextClass.start_time_utc, teacherTz)}
                    </strong>
                  </span>
                  <span>
                    Student Time ({nextClass.student_timezone || nextClass.student_timezone_booking || 'UTC'}):{' '}
                    <strong className="font-mono-num">
                      {formatUtcInTimezone(
                        nextClass.start_time_utc,
                        nextClass.student_timezone || nextClass.student_timezone_booking || 'UTC'
                      )}
                    </strong>
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#94A3B8]">
                  Provider: {nextClass.video_provider || 'Not created yet'} · Booking:{' '}
                  {nextClass.booking_status || 'Direct'} · Payment:{' '}
                  {nextClass.payment_status || 'N/A'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                {nextClass.join_url ? (
                  <>
                    <a
                      href={
                        nextClass.video_provider === 'zoom' && nextClass.host_url
                          ? nextClass.host_url
                          : nextClass.join_url
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#C6922C] px-5 py-2.5 text-xs font-semibold text-[#0F213E] hover:bg-[#D6B15C]"
                    >
                      <Video className="h-4 w-4" /> Join{' '}
                      {nextClass.video_provider === 'google_meet' ? 'Google Meet' : 'Zoom'}{' '}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {nextClass.video_provider === 'google_meet' && nextClass.host_url && (
                      <a
                        href={nextClass.host_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/10"
                      >
                        <CalendarIcon className="h-3.5 w-3.5" /> Calendar Event
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(nextClass.join_url);
                        setActionMsg('Join link copied to clipboard.');
                      }}
                      className="rounded-lg border border-white/30 px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                    >
                      Copy Link
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={creatingId === nextClass.id}
                      onClick={() => handleCreateMeeting(nextClass.id, 'google_meet')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#C6922C] px-4 py-2 text-xs font-semibold text-[#0F213E] disabled:opacity-60"
                    >
                      <Video className="h-4 w-4" />{' '}
                      {creatingId === nextClass.id
                        ? 'Creating...'
                        : 'Add to Calendar & Get Google Meet'}
                    </button>
                    <button
                      type="button"
                      disabled={creatingId === nextClass.id}
                      onClick={() => handleCreateMeeting(nextClass.id, 'zoom')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                    >
                      Use Zoom
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomLinkTarget(nextClass)}
                      className="rounded-lg border border-white/30 px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                    >
                      Paste Link
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-white/15 pt-4">
              <button
                type="button"
                onClick={() => onOpenSection('calendar')}
                className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
              >
                Schedule / Calendar
              </button>
              <button
                type="button"
                onClick={() => setRescheduleTarget(nextClass)}
                className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
              >
                Reschedule
              </button>
              <button
                type="button"
                onClick={() =>
                  updateClassAction(
                    nextClass.id,
                    { attendanceStatus: 'present' },
                    'Marked student present.'
                  )
                }
                className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
              >
                Mark Present
              </button>
              <button
                type="button"
                onClick={() =>
                  updateClassAction(
                    nextClass.id,
                    { status: 'completed', attendanceStatus: 'present' },
                    'Class marked completed.'
                  )
                }
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                Complete Class
              </button>
              <button
                type="button"
                onClick={() => setCancelTarget(nextClass)}
                className="rounded-lg border border-red-300/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/40"
              >
                Cancel Class
              </button>
            </div>
          </div>
        )}
      </div>

      {/* NEXT 5 UPCOMING CLASSES WITH FILTERS */}
      <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-[#0F213E]">
            Next 5 Scheduled Classes
          </h2>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={filterStudent}
              onChange={(e) => setFilterStudent(e.target.value)}
              placeholder="Filter student..."
              className="rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs"
            />
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="rounded-lg border border-[#D8D1C4] bg-white px-3 py-1.5 text-xs"
            >
              <option value="All">All Subjects</option>
              <option value="Mathematics">Mathematics</option>
              <option value="Coding & Computer Science">Coding &amp; CS</option>
            </select>
            <select
              value={filterTeacher}
              onChange={(e) => setFilterTeacher(e.target.value)}
              className="rounded-lg border border-[#D8D1C4] bg-white px-3 py-1.5 text-xs"
            >
              <option value="All">All Teachers</option>
              {(teachers || []).map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-[#D8D1C4] bg-white px-3 py-1.5 text-xs"
            >
              <option value="All">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="in_progress">In Progress</option>
            </select>
          </div>
        </div>

        {filteredNextFive.length === 0 ? (
          <p className="mt-4 text-sm text-[#64748B]">No matching upcoming classes.</p>
        ) : (
          <div className="mt-4 divide-y divide-[#EFEAE0]">
            {filteredNextFive.map((cls) => (
              <div
                key={cls.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-[#0F213E]">
                    {cls.student_names || 'Learner'} · {cls.subject} ({cls.topic || cls.course_title})
                  </p>
                  <p className="text-xs text-[#64748B]">
                    {formatUtcInTimezone(cls.start_time_utc, teacherTz)} · {cls.duration_minutes}m ·{' '}
                    {cls.status}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {cls.join_url ? (
                    <>
                      <a
                        href={
                          cls.video_provider === 'zoom' && cls.host_url
                            ? cls.host_url
                            : cls.join_url
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-[#0F213E] px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Join {cls.video_provider === 'google_meet' ? 'Meet' : 'Zoom'}
                      </a>
                      <a
                        href={
                          cls.video_provider === 'google_meet' && cls.host_url
                            ? cls.host_url
                            : buildGoogleCalendarTemplateUrl({
                                title: `Jey Learning Hub: ${cls.title}`,
                                startUtc: cls.start_time_utc,
                                endUtc: cls.end_time_utc,
                                durationMinutes: cls.duration_minutes,
                                location: cls.join_url,
                              })
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-[#D8D1C4] px-2.5 py-1.5 text-xs text-[#0F213E]"
                      >
                        Calendar
                      </a>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={creatingId === cls.id}
                        onClick={() => handleCreateMeeting(cls.id, 'google_meet')}
                        className="rounded-lg bg-[#C6922C] px-3 py-1.5 text-xs font-semibold text-[#0F213E] disabled:opacity-60"
                      >
                        {creatingId === cls.id ? 'Adding...' : '1-Click Calendar + Meet'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomLinkTarget(cls)}
                        className="rounded-lg border border-[#D8D1C4] px-2.5 py-1.5 text-xs text-[#0F213E]"
                      >
                        Paste Link
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline Recent / Pending Bookings */}
      {bookingsList.length > 0 && (
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
          <h2 className="font-display text-lg font-semibold text-[#0F213E]">
            Recent Bookings ({bookingsList.length})
          </h2>
          <div className="mt-3 divide-y divide-[#EFEAE0]">
            {bookingsList.slice(0, 8).map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
              >
                <div>
                  <p className="font-semibold text-[#0F213E]">
                    {b.booking_ref} · {b.learner_name} ({b.course_title})
                  </p>
                  <p className="text-[#64748B]">
                    {formatUtcInTimezone(b.scheduled_start_utc, teacherTz)} · Parent: {b.parent_name}{' '}
                    ({b.parent_email}) · Status: <strong className="uppercase">{b.status}</strong>
                  </p>
                </div>
                <div className="flex gap-2">
                  {(b.status === 'pending' || b.status === 'awaiting_payment') && (
                    <button
                      type="button"
                      onClick={() => handleConfirmBooking(b.id)}
                      className="rounded-lg bg-[#0F213E] px-3 py-1.5 font-medium text-white"
                    >
                      Confirm &amp; Add to Calendar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Meeting Link Fallback Modal */}
      {customLinkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4">
          <form
            onSubmit={handleSaveCustomLink}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 className="font-display text-lg font-semibold text-[#0F213E]">
              Save Meeting Link: {customLinkTarget.title}
            </h3>
            <p className="mt-1 text-xs text-[#64748B]">
              Paste a Google Meet (`https://meet.google.com/...`) or Zoom URL so the student can
              join immediately.
            </p>
            <input
              type="url"
              required
              value={customUrlInput}
              onChange={(e) => setCustomUrlInput(e.target.value)}
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
              className="mt-4 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCustomLinkTarget(null)}
                className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm text-white"
              >
                Save Link
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4">
          <form
            onSubmit={handleRescheduleSubmit}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 className="font-display text-lg font-semibold text-[#0F213E]">
              Reschedule: {rescheduleTarget.title}
            </h3>
            <p className="mt-1 text-xs text-[#64748B]">
              Reschedules only this single occurrence without changing sibling weekly lessons.
            </p>
            <input
              type="datetime-local"
              required
              value={newStartLocal}
              onChange={(e) => setNewStartLocal(e.target.value)}
              className="mt-4 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm text-white"
              >
                Save New Time
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel Scheduled Class?"
        message={`This will cancel "${cancelTarget?.title}" and cancel any linked Zoom or Google Calendar meeting.`}
        confirmLabel="Cancel Class"
        destructive
        onCancel={() => setCancelTarget(null)}
        onConfirm={async () => {
          if (!cancelTarget) return;
          await updateClassAction(cancelTarget.id, { status: 'cancelled' }, 'Class cancelled.');
          setCancelTarget(null);
        }}
      />
    </div>
  );
};

// ======================== CALENDAR & AVAILABILITY ========================
export const AdminCalendarAndAvailability: React.FC<SharedAdminProps> = ({
  data,
  teacherTz,
  onRefresh,
}) => {
  const classes: any[] = data.classes || [];
  const students: any[] = data.students || [];
  const courses: any[] = data.courses || [];
  const availability = data.availability || { rules: [], unavailableDates: [] };

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'list'>('week');
  const [anchorDate, setAnchorDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // New class form
  const [showCreate, setShowCreate] = useState(false);
  const [courseId, setCourseId] = useState(courses[0]?.id || '');
  const [studentId, setStudentId] = useState(students[0]?.id || '');
  const [topic, setTopic] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [privateNotes, setPrivateNotes] = useState('');
  const [instructions, setInstructions] = useState('');
  const [formMsg, setFormMsg] = useState('');

  // Availability editing
  const [availRules, setAvailRules] = useState<any[]>(availability.rules || []);
  const [unavailDate, setUnavailDate] = useState('');
  const [unavailReason, setUnavailReason] = useState('');

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg('');
    try {
      await apiFetch('/api/admin/classes', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          studentId,
          topic,
          startTimeUtc: new Date(startLocal).toISOString(),
          durationMinutes,
          repeatWeeks,
          privateTeacherNotes: privateNotes,
          studentInstructions: instructions,
        }),
      });
      setShowCreate(false);
      setTopic('');
      onRefresh();
    } catch (err: unknown) {
      setFormMsg(err instanceof Error ? err.message : 'Failed to create class.');
    }
  };

  const handleSaveAvailability = async () => {
    await apiFetch('/api/admin/availability', {
      method: 'PUT',
      body: JSON.stringify({
        teacherId: availability.teacherId,
        rules: availRules,
      }),
    });
    setFormMsg('Teaching availability updated.');
    onRefresh();
  };

  const handleAddUnavailableDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unavailDate) return;
    await apiFetch('/api/admin/unavailable-dates', {
      method: 'POST',
      body: JSON.stringify({
        teacherId: availability.teacherId,
        unavailableDate: unavailDate,
        reason: unavailReason,
      }),
    });
    setUnavailDate('');
    setUnavailReason('');
    onRefresh();
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Filter classes according to calendar mode
  const filteredClasses = useMemo(() => {
    const anchor = new Date(`${anchorDate}T00:00:00Z`).getTime();
    return classes.filter((c) => {
      const t = new Date(c.start_time_utc).getTime();
      if (viewMode === 'day') {
        return c.start_time_utc.slice(0, 10) === anchorDate;
      }
      if (viewMode === 'week') {
        return t >= anchor - 86400000 && t <= anchor + 7 * 86400000;
      }
      if (viewMode === 'month') {
        return c.start_time_utc.slice(0, 7) === anchorDate.slice(0, 7);
      }
      return true;
    });
  }, [classes, viewMode, anchorDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
            Calendar &amp; Teaching Availability
          </h1>
          <p className="text-xs text-[#64748B]">
            Single &amp; recurring classes in {teacherTz}. Conflict detection is enforced on every
            slot.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCourseId(courses[0]?.id || '');
            setStudentId(students[0]?.id || '');
            setShowCreate(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
        >
          <Plus className="h-4 w-4" /> Create Class / Recurring Series
        </button>
      </div>

      {formMsg && (
        <div className="rounded-lg border border-[#D8D1C4] bg-white px-4 py-2.5 text-sm text-[#0F213E]">
          {formMsg}
        </div>
      )}

      {/* Calendar Controls */}
      <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEAE0] pb-4">
          <div className="flex items-center gap-1 rounded-lg bg-[#EFEAE0] p-1">
            {(['day', 'week', 'month', 'list'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
                  viewMode === m ? 'bg-white text-[#0F213E] shadow-sm' : 'text-[#475569]'
                }`}
              >
                {m} View
              </button>
            ))}
          </div>
          <input
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            className="rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs"
          />
        </div>

        {filteredClasses.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#64748B]">
            No classes scheduled in this {viewMode} window.
          </p>
        ) : (
          <div className="mt-4 space-y-2.5">
            {filteredClasses.map((cls) => (
              <div
                key={cls.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-4 text-sm"
              >
                <div>
                  <p className="text-xs font-medium text-[#64748B]">
                    {cls.subject} · {cls.status}
                    {cls.recurrence_rule ? ` · ${cls.recurrence_rule}` : ''}
                  </p>
                  <p className="font-semibold text-[#0F213E]">
                    {cls.title} ({cls.student_names || 'Learner'})
                  </p>
                  <p className="text-xs text-[#475569]">
                    {formatUtcInTimezone(cls.start_time_utc, teacherTz)} · {cls.duration_minutes}m
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {cls.join_url ? (
                    <a
                      href={
                        cls.video_provider === 'zoom' && cls.host_url ? cls.host_url : cls.join_url
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-[#0F213E] px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Join {cls.video_provider === 'google_meet' ? 'Meet' : 'Zoom'}
                    </a>
                  ) : null}
                  <a
                    href={
                      cls.video_provider === 'google_meet' && cls.host_url
                        ? cls.host_url
                        : buildGoogleCalendarTemplateUrl({
                            title: `Jey Learning Hub: ${cls.title}`,
                            startUtc: cls.start_time_utc,
                            endUtc: cls.end_time_utc,
                            durationMinutes: cls.duration_minutes,
                            location: cls.join_url || 'Online Session',
                          })
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-[#D8D1C4] bg-white px-3 py-1.5 text-xs font-medium text-[#0F213E]"
                  >
                    + Calendar
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Availability Rules */}
      <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#0F213E]">
              Weekly Teaching Hours &amp; Buffer Settings
            </h2>
            <p className="text-xs text-[#64748B]">
              The public Booking page reads directly from these hours.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveAvailability}
            className="rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
          >
            Save Availability
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {availRules.map((rule, idx) => (
            <div
              key={rule.day_of_week}
              className="grid items-center gap-3 rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-3 text-xs sm:grid-cols-6"
            >
              <label className="flex items-center gap-2 font-semibold text-[#0F213E]">
                <input
                  type="checkbox"
                  checked={Boolean(rule.is_available)}
                  onChange={(e) => {
                    const next = [...availRules];
                    next[idx] = { ...rule, is_available: e.target.checked ? 1 : 0 };
                    setAvailRules(next);
                  }}
                />
                {dayNames[rule.day_of_week]}
              </label>
              <input
                type="time"
                value={rule.start_time}
                onChange={(e) => {
                  const next = [...availRules];
                  next[idx] = { ...rule, start_time: e.target.value };
                  setAvailRules(next);
                }}
                className="rounded border border-[#D8D1C4] bg-white px-2 py-1"
              />
              <input
                type="time"
                value={rule.end_time}
                onChange={(e) => {
                  const next = [...availRules];
                  next[idx] = { ...rule, end_time: e.target.value };
                  setAvailRules(next);
                }}
                className="rounded border border-[#D8D1C4] bg-white px-2 py-1"
              />
              <input
                type="time"
                value={rule.break_start || ''}
                onChange={(e) => {
                  const next = [...availRules];
                  next[idx] = { ...rule, break_start: e.target.value };
                  setAvailRules(next);
                }}
                placeholder="Break start"
                className="rounded border border-[#D8D1C4] bg-white px-2 py-1"
              />
              <input
                type="time"
                value={rule.break_end || ''}
                onChange={(e) => {
                  const next = [...availRules];
                  next[idx] = { ...rule, break_end: e.target.value };
                  setAvailRules(next);
                }}
                placeholder="Break end"
                className="rounded border border-[#D8D1C4] bg-white px-2 py-1"
              />
              <span className="font-mono-num text-[#64748B]">
                Buffer: {rule.buffer_minutes}m
              </span>
            </div>
          ))}
        </div>

        {/* Unavailable Dates */}
        <div className="mt-6 border-t border-[#EFEAE0] pt-4">
          <h3 className="text-sm font-semibold text-[#0F213E]">Blocked / Unavailable Dates</h3>
          <form onSubmit={handleAddUnavailableDate} className="mt-2 flex flex-wrap gap-2">
            <input
              type="date"
              required
              value={unavailDate}
              onChange={(e) => setUnavailDate(e.target.value)}
              className="rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs"
            />
            <input
              type="text"
              value={unavailReason}
              onChange={(e) => setUnavailReason(e.target.value)}
              placeholder="Reason (e.g. Public Holiday)"
              className="rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="rounded-lg border border-[#0F213E] px-3 py-1.5 text-xs font-medium text-[#0F213E]"
            >
              Block Date
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {(availability.unavailableDates || []).map((ud: any) => (
              <span
                key={ud.id}
                className="inline-flex items-center gap-2 rounded-lg border border-[#E5DFD3] bg-[#FAF8F4] px-3 py-1 text-xs"
              >
                {ud.unavailable_date} {ud.reason ? `(${ud.reason})` : ''}
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/admin/unavailable-dates/${ud.id}`, { method: 'DELETE' });
                    onRefresh();
                  }}
                  className="text-red-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* CREATE CLASS MODAL */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4">
          <form
            onSubmit={handleCreateClass}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 className="font-display text-xl font-semibold text-[#0F213E]">
              Schedule Class or Recurring Weekly Series
            </h3>
            {formMsg && <p className="mt-2 text-xs text-red-700">{formMsg}</p>}
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-[#475569]">Student</label>
                <select
                  required
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.grade_level})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Course</label>
                <select
                  required
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#475569]">
                    Start Date &amp; Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569]">Duration (min)</label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#475569]">Lesson Topic</label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Equivalent Fractions"
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569]">
                    Weekly Recurrence (Weeks)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={repeatWeeks}
                    onChange={(e) => setRepeatWeeks(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">
                  Student-Facing Instructions
                </label>
                <input
                  type="text"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">
                  Private Teacher Notes (Never visible to parents/students)
                </label>
                <input
                  type="text"
                  value={privateNotes}
                  onChange={(e) => setPrivateNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm font-medium text-white"
              >
                Create Class(es)
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// ======================== BOOKINGS & CLASSES ========================
export const AdminBookingsAndClasses: React.FC<
  SharedAdminProps & { mode: 'bookings' | 'classes' }
> = ({ mode, data, teacherTz, onRefresh, onGoogleConnected }) => {
  const [statusMsg, setStatusMsg] = useState('');
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<any>(null);

  const handleBookingStatus = async (bookingId: string, status: string) => {
    setStatusMsg('');
    try {
      const res = await apiFetch<{ videoNote?: string }>(`/api/admin/bookings/${bookingId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setStatusMsg(`Booking updated to ${status}.${res.videoNote || ''}`);
      onRefresh();
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const handleGenerateMeeting = async (classId: string, provider: 'zoom' | 'google_meet') => {
    setStatusMsg('');
    setCreatingId(classId);
    try {
      if (provider === 'google_meet' && !getGoogleAccessToken()) {
        await googleWorkspaceSignIn();
        onGoogleConnected?.();
      }
      const attempt = () =>
        apiFetch(`/api/admin/classes/${classId}/meeting`, {
          method: 'POST',
          body: JSON.stringify({ provider }),
        });

      try {
        await attempt();
      } catch (firstErr: any) {
        if (
          provider === 'google_meet' &&
          (firstErr?.status === 401 || firstErr?.payload?.requiresGoogleSignIn)
        ) {
          clearGoogleAccessToken();
          await googleWorkspaceSignIn();
          onGoogleConnected?.();
          await attempt();
        } else {
          throw firstErr;
        }
      }
      setStatusMsg(
        provider === 'zoom'
          ? 'Zoom meeting created.'
          : 'Added to Google Calendar with Google Meet link!'
      );
      onRefresh();
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Meeting creation failed.');
    } finally {
      setCreatingId(null);
    }
  };

  if (mode === 'bookings') {
    const bookings: any[] = data.bookings || [];
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
          Bookings Management
        </h1>
        {statusMsg && (
          <div className="rounded-lg border border-[#D8D1C4] bg-white px-4 py-2.5 text-sm text-[#0F213E]">
            {statusMsg}
          </div>
        )}
        {bookings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D8D1C4] bg-white p-8 text-center text-sm text-[#64748B]">
            No bookings received yet. Bookings submitted on the public Booking page appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-xl border border-[#E5DFD3] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono-num text-xs font-semibold text-[#9A6D14]">
                      {b.booking_ref} · {b.status.toUpperCase()}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-[#0F213E]">
                      {b.learner_name} ({b.learner_age_grade || 'Grade N/A'}) — {b.course_title}
                    </h3>
                    <p className="mt-1 text-xs text-[#475569]">
                      Parent: {b.parent_name} ({b.parent_email}) ·{' '}
                      {formatCurrency(b.quoted_amount, b.currency)}
                    </p>
                    <p className="mt-1 text-xs text-[#475569]">
                      Teacher Time: {formatUtcInTimezone(b.scheduled_start_utc, teacherTz)} · Parent
                      Time ({b.user_timezone}):{' '}
                      {formatUtcInTimezone(b.scheduled_start_utc, b.user_timezone)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(b.status === 'pending' || b.status === 'awaiting_payment') && (
                      <button
                        type="button"
                        onClick={() => handleBookingStatus(b.id, 'confirmed')}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0F213E] px-3.5 py-2 text-xs font-medium text-white"
                      >
                        <Check className="h-3.5 w-3.5" /> Confirm &amp; Create Class
                      </button>
                    )}
                    {b.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(b)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700"
                      >
                        <X className="h-3.5 w-3.5" /> Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={Boolean(confirmCancel)}
          title="Cancel Booking?"
          message={`Cancel booking ${confirmCancel?.booking_ref} for ${confirmCancel?.learner_name}?`}
          confirmLabel="Yes, Cancel Booking"
          destructive
          onCancel={() => setConfirmCancel(null)}
          onConfirm={async () => {
            await handleBookingStatus(confirmCancel.id, 'cancelled');
            setConfirmCancel(null);
          }}
        />
      </div>
    );
  }

  // Classes view
  const classes: any[] = data.classes || [];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
        All Classes &amp; Video Meetings
      </h1>
      {statusMsg && (
        <div className="rounded-lg border border-[#D8D1C4] bg-white px-4 py-2.5 text-sm text-[#0F213E]">
          {statusMsg}
        </div>
      )}
      {classes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#D8D1C4] bg-white p-8 text-center text-sm text-[#64748B]">
          No classes scheduled yet.
        </div>
      ) : (
        <div className="space-y-3">
          {classes.map((c) => (
            <div key={c.id} className="rounded-xl border border-[#E5DFD3] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-[#64748B]">
                    {c.subject} · Status: {c.status} · Attendance: {c.attendance_status}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-[#0F213E]">
                    {c.title} {c.topic ? `— ${c.topic}` : ''}
                  </h3>
                  <p className="mt-1 text-xs text-[#475569]">
                    Student: {c.student_names || '—'} ·{' '}
                    {formatUtcInTimezone(c.start_time_utc, teacherTz)} ({c.duration_minutes}m)
                  </p>
                  {c.join_url && (
                    <p className="mt-1 text-xs text-[#166534]">
                      Meeting Linked ({c.video_provider}): {c.join_url}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.join_url ? (
                    <>
                      <a
                        href={c.video_provider === 'zoom' && c.host_url ? c.host_url : c.join_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-[#0F213E] px-3.5 py-2 text-xs font-medium text-white"
                      >
                        Join {c.video_provider === 'google_meet' ? 'Google Meet' : 'Zoom'}
                      </a>
                      <a
                        href={
                          c.video_provider === 'google_meet' && c.host_url
                            ? c.host_url
                            : buildGoogleCalendarTemplateUrl({
                                title: `Jey Learning Hub: ${c.title}`,
                                startUtc: c.start_time_utc,
                                endUtc: c.end_time_utc,
                                durationMinutes: c.duration_minutes,
                                location: c.join_url,
                              })
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs font-medium text-[#0F213E]"
                      >
                        Calendar
                      </a>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={creatingId === c.id}
                        onClick={() => handleGenerateMeeting(c.id, 'google_meet')}
                        className="rounded-lg bg-[#C6922C] px-3 py-1.5 text-xs font-semibold text-[#0F213E] disabled:opacity-60"
                      >
                        {creatingId === c.id ? 'Adding...' : '1-Click Calendar + Meet'}
                      </button>
                      <button
                        type="button"
                        disabled={creatingId === c.id}
                        onClick={() => handleGenerateMeeting(c.id, 'zoom')}
                        className="rounded-lg border border-[#0F213E] px-3 py-1.5 text-xs font-medium text-[#0F213E]"
                      >
                        Create Zoom
                      </button>
                      <a
                        href={buildGoogleCalendarTemplateUrl({
                          title: `Jey Learning Hub: ${c.title}`,
                          startUtc: c.start_time_utc,
                          endUtc: c.end_time_utc,
                          durationMinutes: c.duration_minutes,
                          location: 'Online Session',
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs font-medium text-[#0F213E]"
                      >
                        + Calendar
                      </a>
                    </>
                  )}
                  {c.status !== 'completed' && c.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/classes/${c.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: 'completed', attendanceStatus: 'present' }),
                        });
                        onRefresh();
                      }}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Mark Completed
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
