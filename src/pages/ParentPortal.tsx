import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CreditCard,
  ExternalLink,
  MessageSquare,
  Plus,
  Printer,
  ShieldCheck,
  UserPlus,
  Video,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  buildGoogleCalendarTemplateUrl,
  COMMON_TIMEZONES,
  formatCurrency,
  formatUtcInTimezone,
} from '../lib/timezone';
import type { AuthUser } from '../lib/types';
import type { RouteName } from '../components/Navbar';
import { LessonReviewModal } from '../components/LessonReviewModal';

interface ParentPortalProps {
  user: AuthUser;
  onNavigate: (route: RouteName) => void;
}

export const ParentPortal: React.FC<ParentPortalProps> = ({ user, onNavigate }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'payments' | 'messages'>('overview');
  const [reviewClassId, setReviewClassId] = useState<string | null>(null);

  // Add Child Modal
  const [showAddChild, setShowAddChild] = useState(false);
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [childGrade, setChildGrade] = useState('');
  const [childTz, setChildTz] = useState(user.timezone || 'Africa/Nairobi');
  const [childGoals, setChildGoals] = useState('');
  const [childConsent, setChildConsent] = useState(true);
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [childError, setChildError] = useState('');

  // Payment Submission Modal
  const [payingInvoice, setPayingInvoice] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('mpesa');
  const [payRef, setPayRef] = useState('');
  const [payProof, setPayProof] = useState('');
  const [payError, setPayError] = useState('');

  // Receipt / Invoice Print Modal
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);

  // Message Form
  const [msgCategory, setMsgCategory] = useState('general');
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [msgSent, setMsgSent] = useState('');

  const loadData = () => {
    setLoading(true);
    apiFetch('/api/parent/dashboard')
      .then((res) => {
        setData(res);
        if (res.children?.length > 0 && !selectedChildId) {
          setSelectedChildId(res.children[0].id);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();
    setChildError('');
    try {
      const res = await apiFetch<{ student: any }>('/api/parent/children', {
        method: 'POST',
        body: JSON.stringify({
          fullName: childName,
          age: childAge ? Number(childAge) : null,
          gradeLevel: childGrade,
          timezone: childTz,
          learningGoals: childGoals,
          recordingConsent: childConsent,
          studentEmail: studentEmail || undefined,
          studentPassword: studentPassword || undefined,
        }),
      });
      setShowAddChild(false);
      setChildName('');
      setChildAge('');
      setChildGrade('');
      setChildGoals('');
      setStudentEmail('');
      setStudentPassword('');
      setSelectedChildId(res.student.id);
      loadData();
    } catch (err: unknown) {
      setChildError(err instanceof Error ? err.message : 'Failed to add child.');
    }
  };

  const handleToggleConsent = async (studentId: string, nextValue: boolean) => {
    await apiFetch(`/api/parent/children/${studentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ recordingConsent: nextValue }),
    });
    loadData();
  };

  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const res = await apiFetch<{ fileUrl: string }>('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, dataBase64: reader.result }),
      });
      setPayProof(res.fileUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError('');
    try {
      await apiFetch('/api/parent/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: payingInvoice.id,
          amount: Number(payAmount),
          paymentMethod: payMethod,
          transactionReference: payRef,
          proofUrl: payProof,
        }),
      });
      setPayingInvoice(null);
      setPayRef('');
      setPayProof('');
      loadData();
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : 'Could not submit payment.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsgSent('');
    await apiFetch('/api/parent/messages', {
      method: 'POST',
      body: JSON.stringify({
        studentId: selectedChildId || null,
        category: msgCategory,
        subject: msgSubject,
        body: msgBody,
      }),
    });
    setMsgSubject('');
    setMsgBody('');
    setMsgSent('Message sent to Jecinta.');
    loadData();
  };

  const openInvoiceReceipt = async (invoiceId: string) => {
    const detail = await apiFetch(`/api/invoices/${invoiceId}/detail`);
    setInvoiceDetail(detail);
  };

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="h-64 animate-pulse rounded-2xl border border-[#E5DFD3] bg-white" />
      </div>
    );
  }

  const children: any[] = data.children || [];
  const activeChild = children.find((c) => c.id === selectedChildId) || children[0] || null;
  const tz = activeChild?.timezone || user.timezone || 'Africa/Nairobi';

  const childClasses = (data.classes || []).filter(
    (c: any) => !activeChild || c.student_id === activeChild.id
  );
  const childNotes = (data.lessonNotes || []).filter(
    (n: any) => !activeChild || n.student_id === activeChild.id
  );
  const childRecordings = (data.recordings || []).filter(
    (r: any) => !activeChild || r.student_id === activeChild.id
  );
  const childAssignments = (data.assignments || []).filter(
    (a: any) => !activeChild || a.student_id === activeChild.id
  );
  const childEnrolments = (data.enrolments || []).filter(
    (e: any) => !activeChild || e.student_id === activeChild.id
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Bar */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium text-[#9A6D14]">Parent Portal · {user.timezone}</p>
          <h1 className="font-display mt-1 text-3xl font-semibold text-[#0F213E]">
            Welcome, {user.full_name}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAddChild(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F213E] bg-white px-4 py-2 text-sm font-medium text-[#0F213E] hover:bg-[#FAF8F4]"
          >
            <UserPlus className="h-4 w-4" />
            Add Child
          </button>
          <button
            type="button"
            onClick={() => onNavigate('book')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-4 py-2 text-sm font-medium text-white hover:bg-[#1B355E]"
          >
            <Plus className="h-4 w-4" />
            Book a Lesson
          </button>
        </div>
      </div>

      {/* Multi-Child Switcher */}
      {children.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-[#E5DFD3] pb-4">
          <span className="text-xs font-medium text-[#64748B] mr-2">Viewing Child:</span>
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => setSelectedChildId(child.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeChild?.id === child.id
                  ? 'bg-[#0F213E] text-white'
                  : 'border border-[#D8D1C4] bg-white text-[#0F213E] hover:bg-[#FAF8F4]'
              }`}
            >
              {child.full_name} ({child.grade_level})
            </button>
          ))}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="mt-5 flex flex-wrap items-center gap-1 rounded-lg bg-[#EFEAE0] p-1 w-fit">
        {[
          { id: 'overview', label: 'Schedule & Progress' },
          { id: 'notes', label: 'Notes, Recordings & Homework' },
          { id: 'payments', label: 'Invoices & Payments' },
          { id: 'messages', label: 'Contact Teacher' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === tab.id ? 'bg-white text-[#0F213E] shadow-sm' : 'text-[#475569]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Empty State if no children yet */}
      {children.length === 0 && activeTab !== 'payments' && activeTab !== 'messages' && (
        <div className="mt-8 rounded-2xl border border-dashed border-[#D8D1C4] bg-white p-10 text-center">
          <h2 className="font-display text-xl font-semibold text-[#0F213E]">
            Add Your First Child Profile
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#475569]">
            Create a learner profile for your child, optionally set their student login, and manage
            recording consent before booking lessons.
          </p>
          <button
            type="button"
            onClick={() => setShowAddChild(true)}
            className="mt-5 rounded-lg bg-[#0F213E] px-5 py-2.5 text-sm font-medium text-white"
          >
            Add Child Profile
          </button>
        </div>
      )}

      {/* TAB: OVERVIEW */}
      {activeTab === 'overview' && activeChild && (
        <div className="mt-6 space-y-6">
          {/* Child Profile & Consent Summary */}
          <div className="grid gap-6 rounded-xl border border-[#E5DFD3] bg-white p-6 md:grid-cols-3">
            <div>
              <p className="text-xs text-[#64748B]">Child Profile</p>
              <p className="mt-1 text-lg font-semibold text-[#0F213E]">{activeChild.full_name}</p>
              <p className="text-xs text-[#475569]">
                {activeChild.grade_level} · {activeChild.curriculum_system} · {activeChild.timezone}
              </p>
              {activeChild.student_login_email && (
                <p className="mt-1 text-xs text-[#166534]">
                  Student login active: {activeChild.student_login_email}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-[#64748B]">Enrolled Courses &amp; Teacher</p>
              <p className="mt-1 text-sm font-medium text-[#0F213E]">
                Teacher: {activeChild.teacher_name || 'Jecinta Maina'}
              </p>
              <p className="mt-1 text-xs text-[#475569]">
                {childEnrolments.length > 0
                  ? childEnrolments.map((e: any) => e.course_title).join(', ')
                  : 'No active course enrolments yet'}
              </p>
            </div>
            <div className="flex flex-col justify-between">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#9A6D14]" />
                <div>
                  <p className="text-xs font-semibold text-[#0F213E]">
                    Lesson Recording Consent
                  </p>
                  <p className="text-xs text-[#475569]">
                    {activeChild.consent_given
                      ? 'Parental consent granted for educational review recordings.'
                      : 'Consent not granted — recordings will not be published.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleToggleConsent(activeChild.id, !activeChild.consent_given)}
                className="mt-3 w-fit rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs font-medium text-[#0F213E] hover:bg-[#FAF8F4]"
              >
                {activeChild.consent_given ? 'Revoke Consent' : 'Grant Recording Consent'}
              </button>
            </div>
          </div>

          {/* Upcoming & Completed Classes */}
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#0F213E]">
              <Calendar className="h-4 w-4 text-[#C6922C]" /> Classes &amp; Weekly Timetable ({tz})
            </h2>
            {childClasses.length === 0 ? (
              <p className="mt-4 text-sm text-[#64748B]">
                No scheduled classes yet for {activeChild.full_name}.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {childClasses.map((cls: any) => (
                  <div
                    key={cls.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-4"
                  >
                    <div>
                      <p className="text-xs font-medium text-[#64748B]">
                        {cls.subject} · {cls.status} · Attendance: {cls.attendance_status}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-[#0F213E]">
                        {cls.title} {cls.topic ? `— ${cls.topic}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-[#475569]">
                        {formatUtcInTimezone(cls.start_time_utc, tz)} ({cls.duration_minutes} min)
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {cls.status !== 'completed' && cls.status !== 'cancelled' && (
                        <>
                          {cls.join_url ? (
                            <a
                              href={cls.join_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1B355E]"
                            >
                              <Video className="h-3.5 w-3.5" /> Join{' '}
                              {cls.video_provider === 'google_meet' ? 'Google Meet' : 'Zoom'}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="rounded-lg border border-[#D8D1C4] bg-white px-3 py-1.5 text-xs text-[#64748B]">
                              Meeting link pending
                            </span>
                          )}
                          <a
                            href={
                              cls.video_provider === 'google_meet' && cls.host_url
                                ? cls.host_url
                                : buildGoogleCalendarTemplateUrl({
                                    title: `Jey Learning Hub: ${cls.title}`,
                                    startUtc: cls.start_time_utc,
                                    endUtc: cls.end_time_utc,
                                    durationMinutes: cls.duration_minutes,
                                    location: cls.join_url || 'Online Lesson',
                                    description: `Teacher: ${cls.teacher_name || 'Jecinta Maina'}${
                                      cls.join_url ? `\nJoin Link: ${cls.join_url}` : ''
                                    }`,
                                  })
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs font-medium text-[#0F213E] hover:bg-[#FAF8F4]"
                          >
                            <Calendar className="h-3.5 w-3.5" /> Add to Calendar
                          </a>
                        </>
                      )}
                      {cls.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => setReviewClassId(cls.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F213E] px-3.5 py-1.5 text-xs font-semibold text-[#0F213E]"
                        >
                          <BookOpen className="h-3.5 w-3.5" /> Review Lesson
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: NOTES, RECORDINGS & HOMEWORK */}
      {activeTab === 'notes' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-[#0F213E]">
              Published Lesson Notes
            </h2>
            {childNotes.length === 0 ? (
              <p className="mt-3 text-sm text-[#64748B]">No published lesson notes yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {childNotes.map((n: any) => (
                  <div key={n.id} className="rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-4">
                    <p className="text-xs text-[#64748B]">
                      {n.subject} · {formatUtcInTimezone(n.start_time_utc, tz)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#0F213E]">{n.title}</p>
                    <button
                      type="button"
                      onClick={() => setReviewClassId(n.class_id)}
                      className="mt-2 text-xs font-semibold text-[#1E40AF] underline"
                    >
                      Read Full Lesson Summary &amp; Homework
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
              <h2 className="font-display text-lg font-semibold text-[#0F213E]">
                Available Recordings
              </h2>
              {childRecordings.length === 0 ? (
                <p className="mt-3 text-sm text-[#64748B]">No published recordings available.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {childRecordings.map((r: any) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-[#EFEAE0] p-3.5 text-sm"
                    >
                      <div>
                        <p className="font-medium text-[#0F213E]">{r.class_title}</p>
                        <p className="text-xs text-[#64748B]">
                          {formatUtcInTimezone(r.start_time_utc, tz)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReviewClassId(r.class_id)}
                        className="rounded-lg bg-[#0F213E] px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Watch
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
              <h2 className="font-display text-lg font-semibold text-[#0F213E]">
                Assignments &amp; Teacher Feedback
              </h2>
              {childAssignments.length === 0 ? (
                <p className="mt-3 text-sm text-[#64748B]">No assignments posted yet.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {childAssignments.map((a: any) => (
                    <div key={a.id} className="rounded-lg border border-[#EFEAE0] p-3.5 text-sm">
                      <div className="flex justify-between">
                        <p className="font-semibold text-[#0F213E]">{a.title}</p>
                        <span className="text-xs font-medium text-[#475569]">
                          {a.submission_status || 'Pending'}
                        </span>
                      </div>
                      {a.marks_awarded !== null && a.marks_awarded !== undefined && (
                        <p className="mt-1 font-mono-num text-xs font-semibold text-[#166534]">
                          Marks: {a.marks_awarded} / {a.max_marks}
                        </p>
                      )}
                      {a.teacher_feedback && (
                        <p className="mt-1 text-xs text-[#475569]">
                          Feedback: {a.teacher_feedback}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: PAYMENTS & INVOICES */}
      {activeTab === 'payments' && (
        <div className="mt-6 space-y-6">
          {/* Payment Instructions */}
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#0F213E]">
              <CreditCard className="h-4 w-4 text-[#C6922C]" /> Payment Instructions
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 text-xs leading-relaxed text-[#475569]">
              <div className="rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-4">
                <p className="font-semibold text-[#0F213E]">M-Pesa Instructions</p>
                <p className="mt-1">Paybill / Till: {data.paymentSettings?.mpesa_paybill_or_till}</p>
                <p>Account Name: {data.paymentSettings?.mpesa_account_name}</p>
                <p className="mt-1.5">{data.paymentSettings?.mpesa_instructions}</p>
              </div>
              <div className="rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-4">
                <p className="font-semibold text-[#0F213E]">Bank &amp; International Transfers</p>
                <p className="mt-1">
                  {data.paymentSettings?.bank_name} · Acc: {data.paymentSettings?.bank_account_number}
                </p>
                <p>SWIFT / Branch: {data.paymentSettings?.bank_branch_or_swift}</p>
                <p className="mt-1.5">{data.paymentSettings?.international_instructions}</p>
              </div>
            </div>
          </div>

          {/* Invoices Table */}
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-[#0F213E]">Your Invoices</h2>
            {data.invoices.length === 0 ? (
              <p className="mt-3 text-sm text-[#64748B]">No invoices issued yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E5DFD3] text-xs font-semibold text-[#64748B]">
                      <th className="py-2.5 pr-4">Invoice #</th>
                      <th className="py-2.5 pr-4">Student</th>
                      <th className="py-2.5 pr-4">Due Date</th>
                      <th className="py-2.5 pr-4 text-right">Total</th>
                      <th className="py-2.5 pr-4 text-right">Paid</th>
                      <th className="py-2.5 pr-4">Status</th>
                      <th className="py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEAE0]">
                    {data.invoices.map((inv: any) => (
                      <tr key={inv.id}>
                        <td className="py-3 pr-4 font-mono-num font-medium text-[#0F213E]">
                          {inv.invoice_number}
                        </td>
                        <td className="py-3 pr-4 text-[#475569]">{inv.student_name || 'General'}</td>
                        <td className="py-3 pr-4 font-mono-num text-xs text-[#475569]">
                          {inv.due_date}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono-num">
                          {formatCurrency(inv.total_amount, inv.currency)}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono-num">
                          {formatCurrency(inv.amount_paid, inv.currency)}
                        </td>
                        <td className="py-3 pr-4 text-xs font-semibold text-[#0F213E]">
                          {inv.status}
                        </td>
                        <td className="py-3 text-right space-x-2">
                          {inv.status !== 'paid' && (
                            <button
                              type="button"
                              onClick={() => {
                                setPayingInvoice(inv);
                                setPayAmount(String(inv.total_amount - inv.amount_paid));
                              }}
                              className="rounded-md bg-[#0F213E] px-3 py-1 text-xs font-medium text-white"
                            >
                              Submit Payment
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openInvoiceReceipt(inv.id)}
                            className="text-xs font-medium text-[#1E40AF] underline"
                          >
                            View / Receipt
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payment History */}
          {data.payments.length > 0 && (
            <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
              <h3 className="text-base font-semibold text-[#0F213E]">Submitted Payment History</h3>
              <div className="mt-3 space-y-2 text-sm">
                {data.payments.map((p: any) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between rounded-lg border border-[#EFEAE0] px-4 py-2.5"
                  >
                    <div>
                      <span className="font-mono-num font-semibold text-[#0F213E]">
                        {formatCurrency(p.amount, p.currency)}
                      </span>{' '}
                      · {p.payment_method} · Ref: {p.transaction_reference}
                      {p.receipt_number && (
                        <span className="ml-2 text-xs font-semibold text-[#166534]">
                          Receipt: {p.receipt_number}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-[#475569]">{p.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: MESSAGES */}
      {activeTab === 'messages' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleSendMessage}
            className="space-y-4 rounded-xl border border-[#E5DFD3] bg-white p-6 lg:col-span-5"
          >
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#0F213E]">
              <MessageSquare className="h-4 w-4 text-[#C6922C]" /> Message Teacher
            </h2>
            <div>
              <label className="block text-xs font-medium text-[#475569]">Topic Category</label>
              <select
                value={msgCategory}
                onChange={(e) => setMsgCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
              >
                <option value="general">General Enquiry</option>
                <option value="lesson_enquiry">Ask About a Lesson</option>
                <option value="reschedule_request">Request a Reschedule</option>
                <option value="extra_classes">Request Additional Classes</option>
                <option value="payment_query">Payment Query</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569]">Subject</label>
              <input
                type="text"
                required
                value={msgSubject}
                onChange={(e) => setMsgSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569]">Message</label>
              <textarea
                rows={4}
                required
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm font-medium text-white"
            >
              Send Message
            </button>
            {msgSent && <p className="text-xs font-medium text-[#166534]">{msgSent}</p>}
          </form>

          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6 lg:col-span-7">
            <h2 className="font-display text-lg font-semibold text-[#0F213E]">Conversation History</h2>
            {data.messages.length === 0 ? (
              <p className="mt-4 text-sm text-[#64748B]">No messages yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {data.messages.map((m: any) => (
                  <div key={m.id} className="rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-4">
                    <div className="flex justify-between text-xs text-[#64748B]">
                      <span>
                        <strong>{m.sender_name}</strong> → {m.recipient_name} · {m.category}
                      </span>
                      <span>{formatUtcInTimezone(m.created_at, tz)}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[#0F213E]">{m.subject}</p>
                    <p className="mt-1 text-sm text-[#334155]">{m.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADD CHILD MODAL */}
      {showAddChild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleAddChild}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E5DFD3] bg-white p-6 shadow-xl"
          >
            <h3 className="font-display text-xl font-semibold text-[#0F213E]">Add Child Profile</h3>
            {childError && <p className="mt-2 text-xs text-red-700">{childError}</p>}
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#475569]">Child Full Name</label>
                  <input
                    type="text"
                    required
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569]">Grade / Level</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Grade 5"
                    value={childGrade}
                    onChange={(e) => setChildGrade(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#475569]">Age</label>
                  <input
                    type="number"
                    value={childAge}
                    onChange={(e) => setChildAge(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569]">Child Timezone</label>
                  <select
                    value={childTz}
                    onChange={(e) => setChildTz(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                  >
                    {Array.from(new Set([childTz, ...COMMON_TIMEZONES])).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Learning Goals</label>
                <textarea
                  rows={2}
                  value={childGoals}
                  onChange={(e) => setChildGoals(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-3">
                <p className="text-xs font-semibold text-[#0F213E]">
                  Optional Student Login Account
                </p>
                <p className="text-xs text-[#64748B]">
                  Create dedicated sign-in credentials so your child can view their Student Dashboard.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input
                    type="email"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    placeholder="student@email.com"
                    className="rounded-lg border border-[#D8D1C4] bg-white px-3 py-1.5 text-xs"
                  />
                  <input
                    type="password"
                    value={studentPassword}
                    onChange={(e) => setStudentPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="rounded-lg border border-[#D8D1C4] bg-white px-3 py-1.5 text-xs"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-[#334155]">
                <input
                  type="checkbox"
                  checked={childConsent}
                  onChange={(e) => setChildConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I grant parental consent for my child’s tutoring sessions to be recorded for
                  private educational review.
                </span>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddChild(false)}
                className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm font-medium text-white"
              >
                Save Child Profile
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBMIT PAYMENT MODAL */}
      {payingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleSubmitPayment}
            className="w-full max-w-md rounded-2xl border border-[#E5DFD3] bg-white p-6 shadow-xl"
          >
            <h3 className="font-display text-xl font-semibold text-[#0F213E]">
              Submit Payment Reference
            </h3>
            <p className="mt-1 text-xs text-[#475569]">
              Invoice {payingInvoice.invoice_number}. Your payment will appear as pending until
              verified by Jey Learning Hub.
            </p>
            {payError && <p className="mt-2 text-xs text-red-700">{payError}</p>}
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#475569]">
                  Amount Paid ({payingInvoice.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-sm"
                >
                  <option value="mpesa">M-Pesa</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="international_wire">International Transfer / Wise</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">
                  Transaction Reference / M-Pesa Code
                </label>
                <input
                  type="text"
                  required
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="e.g. UGK89X12PQ"
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">
                  Proof of Payment Screenshot/PDF (Optional)
                </label>
                <input type="file" onChange={handleProofUpload} className="mt-1 block text-xs" />
                {payProof && <p className="mt-1 text-xs text-[#166534]">Proof attached.</p>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPayingInvoice(null)}
                className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm font-medium text-white"
              >
                Submit for Verification
              </button>
            </div>
          </form>
        </div>
      )}

      {/* INVOICE / RECEIPT PRINTABLE MODAL */}
      {invoiceDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl rounded-2xl border border-[#E5DFD3] bg-white p-8 shadow-xl">
            <div className="flex items-start justify-between border-b border-[#EFEAE0] pb-4">
              <div>
                <p className="font-display text-xl font-semibold text-[#0F213E]">
                  {invoiceDetail.business?.business_name || 'Jey Learning Hub'}
                </p>
                <p className="text-xs text-[#64748B]">
                  Invoice {invoiceDetail.invoice.invoice_number} · Issued{' '}
                  {invoiceDetail.invoice.issue_date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="no-print inline-flex items-center gap-1.5 rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs font-medium"
              >
                <Printer className="h-3.5 w-3.5" /> Print / Save PDF
              </button>
            </div>

            <div className="mt-4 text-sm">
              <p>
                <strong>Parent:</strong> {invoiceDetail.invoice.parent_name} (
                {invoiceDetail.invoice.parent_email})
              </p>
              {invoiceDetail.invoice.student_name && (
                <p>
                  <strong>Student:</strong> {invoiceDetail.invoice.student_name}
                </p>
              )}
              <p>
                <strong>Status:</strong> {invoiceDetail.invoice.status}
              </p>
            </div>

            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E5DFD3] text-xs text-[#64748B]">
                  <th className="py-2">Description</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoiceDetail.items.map((it: any) => (
                  <tr key={it.id} className="border-b border-[#EFEAE0]">
                    <td className="py-2">{it.description}</td>
                    <td className="py-2 text-right font-mono-num">
                      {formatCurrency(it.line_total, invoiceDetail.invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {invoiceDetail.payments?.filter((p: any) => p.status === 'verified').length > 0 && (
              <div className="mt-4 rounded-lg border border-[#D1E7D8] bg-[#EDF6F0] p-3 text-xs text-[#166534]">
                <p className="font-semibold">Verified Receipts</p>
                {invoiceDetail.payments
                  .filter((p: any) => p.status === 'verified')
                  .map((p: any) => (
                    <p key={p.id}>
                      {p.receipt_number} — {formatCurrency(p.amount, p.currency)} ({p.payment_method}{' '}
                      {p.transaction_reference})
                    </p>
                  ))}
              </div>
            )}

            <div className="mt-6 flex justify-end no-print">
              <button
                type="button"
                onClick={() => setInvoiceDetail(null)}
                className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm text-white"
              >
                Close
              </button>
            </div>
          </div>
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
