import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Globe2,
  Mail,
  MessageSquare,
  Plus,
  Printer,
  Send,
  Shield,
  Sparkles,
  Trash2,
  Video,
  XCircle,
} from 'lucide-react';
import { apiFetch, getSessionToken } from '../../lib/api';
import { formatCurrency, formatUtcInTimezone } from '../../lib/timezone';
import {
  getGoogleAccessToken,
  getGoogleUser,
  googleWorkspaceLogout,
  googleWorkspaceSignIn,
} from '../../lib/googleAuth';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface Props {
  section:
    | 'payments'
    | 'invoices'
    | 'messages'
    | 'notifications'
    | 'reports'
    | 'website'
    | 'integrations'
    | 'settings';
  data: any;
  teacherTz: string;
  onRefresh: () => void;
}

export const AdminFinanceAndSettings: React.FC<Props> = ({
  section,
  data,
  teacherTz,
  onRefresh,
}) => {
  const parents: any[] = data.parents || [];
  const students: any[] = data.students || [];
  const teachers: any[] = data.teachers || [];
  const payments: any[] = data.payments || [];
  const invoices: any[] = data.invoices || [];
  const messages: any[] = data.messages || [];
  const notifications: any[] = data.notifications || [];
  const settings: Record<string, any> = data.settings || {};
  const testimonials: any[] = data.testimonials || [];
  const integrations: any = data.integrations || {};
  const auditLogs: any[] = data.auditLogs || [];

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // ================= INVOICE CREATION & DETAIL =================
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [invParentId, setInvParentId] = useState(parents[0]?.id || '');
  const [invStudentId, setInvStudentId] = useState('');
  const [invCurrency, setInvCurrency] = useState('KES');
  const [invDueDate, setInvDueDate] = useState('');
  const [invDesc, setInvDesc] = useState('1-on-1 Tutoring Package (4 Sessions)');
  const [invQty, setInvQty] = useState('4');
  const [invPrice, setInvPrice] = useState('2500');
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);

  // ================= PAYMENT VERIFICATION =================
  const [verifyNotes, setVerifyNotes] = useState<Record<string, string>>({});

  // ================= MESSAGES =================
  const [msgParentProfileId, setMsgParentProfileId] = useState('');
  const [msgStudentId, setMsgStudentId] = useState('');
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');

  // ================= REPORTS =================
  const [repFrom, setRepFrom] = useState('2025-01-01');
  const [repTo, setRepTo] = useState('2027-12-31');
  const [repSubject, setRepSubject] = useState('');
  const [repStudentId, setRepStudentId] = useState('');
  const [repTeacherId, setRepTeacherId] = useState('');
  const [reportData, setReportData] = useState<any>(null);

  useEffect(() => {
    if (section === 'reports') {
      const q = new URLSearchParams({
        fromDate: repFrom,
        toDate: repTo,
        subject: repSubject,
        studentId: repStudentId,
        teacherId: repTeacherId,
      });
      apiFetch(`/api/admin/reports?${q.toString()}`)
        .then(setReportData)
        .catch(() => {});
    }
  }, [section, repFrom, repTo, repSubject, repStudentId, repTeacherId]);

  // ================= WEBSITE CONTENT & TESTIMONIALS =================
  const [homeForm, setHomeForm] = useState<any>(settings.home_content || {});
  const [aboutForm, setAboutForm] = useState<any>(settings.about_content || {});
  const [tAuthor, setTAuthor] = useState('');
  const [tRole, setTRole] = useState('Parent');
  const [tLocation, setTLocation] = useState('Nairobi, Kenya');
  const [tQuote, setTQuote] = useState('');
  const [tOutcome, setTOutcome] = useState('');
  const [deleteTestimonialId, setDeleteTestimonialId] = useState<string | null>(null);

  // ================= SETTINGS FORMS =================
  const [bizForm, setBizForm] = useState<any>(settings.business_settings || {});
  const [paySettingsForm, setPaySettingsForm] = useState<any>(settings.payment_settings || {});
  const [privacyForm, setPrivacyForm] = useState<any>(settings.privacy_settings || {});

  useEffect(() => {
    setHomeForm(settings.home_content || {});
    setAboutForm(settings.about_content || {});
    setBizForm(settings.business_settings || {});
    setPaySettingsForm(settings.payment_settings || {});
    setPrivacyForm(settings.privacy_settings || {});
  }, [settings]);

  // ================= INTEGRATIONS STATE =================
  const [googleUser, setGoogleUser] = useState<any>(getGoogleUser());
  const [googleTokenPresent, setGoogleTokenPresent] = useState(Boolean(getGoogleAccessToken()));
  const [testingIntegration, setTestingIntegration] = useState('');

  const handleOpenInvoiceDetail = async (id: string) => {
    try {
      const res = await apiFetch(`/api/invoices/${id}/detail`);
      setInvoiceDetail(res);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Could not load invoice detail.');
    }
  };

  // ================= RENDER: PAYMENTS =================
  if (section === 'payments') {
    const handleVerifyPayment = async (paymentId: string, decision: 'verified' | 'rejected') => {
      setMsg('');
      setErr('');
      try {
        const res = await apiFetch<{ payment: any }>(`/api/admin/payments/${paymentId}/verify`, {
          method: 'POST',
          body: JSON.stringify({
            decision,
            adminNotes: verifyNotes[paymentId] || '',
          }),
        });
        setMsg(
          decision === 'verified'
            ? `Payment verified. Receipt ${res.payment?.receipt_number || ''} generated and invoice updated.`
            : 'Payment submission marked rejected.'
        );
        onRefresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Verification failed.');
      }
    };

    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
            Manual Payment Verification Queue
          </h1>
          <p className="text-xs text-[#64748B]">
            Verify parent-submitted M-Pesa, bank transfer, or international payment references to
            issue receipts and mark invoices paid.
          </p>
        </div>

        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-[#166534]">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {err}
          </div>
        )}

        {payments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D8D1C4] bg-white p-8 text-center text-sm text-[#64748B]">
            No payment submissions yet.
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((p) => (
              <div key={p.id} className="rounded-xl border border-[#E5DFD3] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono-num text-xs font-semibold text-[#9A6D14]">
                      {p.invoice_number} · {p.status.toUpperCase()}
                      {p.receipt_number ? ` · Receipt: ${p.receipt_number}` : ''}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-[#0F213E]">
                      {formatCurrency(p.amount, p.currency)} via {p.payment_method.toUpperCase()} —{' '}
                      Ref: <span className="font-mono-num">{p.transaction_reference}</span>
                    </h3>
                    <p className="mt-1 text-xs text-[#475569]">
                      Parent: {p.parent_name} · Student: {p.student_name || '—'} · Submitted:{' '}
                      {formatUtcInTimezone(p.submitted_at, teacherTz)}
                    </p>
                  </div>

                  {(p.status === 'pending' || p.status === 'submitted') && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Verification note (optional)"
                        value={verifyNotes[p.id] || ''}
                        onChange={(e) =>
                          setVerifyNotes({ ...verifyNotes, [p.id]: e.target.value })
                        }
                        className="rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleVerifyPayment(p.id, 'verified')}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0F213E] px-3.5 py-2 text-xs font-medium text-white"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Verify &amp; Issue Receipt
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerifyPayment(p.id, 'rejected')}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ================= RENDER: INVOICES =================
  if (section === 'invoices') {
    const handleCreateInvoice = async (e: React.FormEvent) => {
      e.preventDefault();
      setMsg('');
      setErr('');
      try {
        await apiFetch('/api/admin/invoices', {
          method: 'POST',
          body: JSON.stringify({
            parentId: invParentId,
            studentId: invStudentId || null,
            currency: invCurrency,
            dueDate: invDueDate || undefined,
            items: [
              {
                description: invDesc,
                quantity: Number(invQty) || 1,
                unitPrice: Number(invPrice) || 0,
              },
            ],
          }),
        });
        setShowCreateInvoice(false);
        setMsg('Invoice created and parent notified.');
        onRefresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Could not create invoice.');
      }
    };

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
            Invoices &amp; Official Receipts
          </h1>
          <button
            type="button"
            onClick={() => {
              setInvParentId(parents[0]?.id || '');
              setShowCreateInvoice(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
          >
            <Plus className="h-4 w-4" /> Create Invoice
          </button>
        </div>

        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-[#166534]">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {err}
          </div>
        )}

        {invoices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D8D1C4] bg-white p-8 text-center text-sm text-[#64748B]">
            No invoices yet. Invoices are automatically created on bookings or manually via Create
            Invoice.
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#E5DFD3] bg-white p-5"
              >
                <div>
                  <p className="font-mono-num text-xs font-semibold text-[#9A6D14]">
                    {inv.invoice_number} · {inv.status.toUpperCase()}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-[#0F213E]">
                    {inv.parent_name} ({inv.student_name || 'Learner'})
                  </h3>
                  <p className="mt-1 text-xs text-[#475569]">
                    Total: {formatCurrency(inv.total_amount, inv.currency)} · Paid:{' '}
                    {formatCurrency(inv.amount_paid, inv.currency)} · Due: {inv.due_date}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenInvoiceDetail(inv.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8D1C4] px-3.5 py-2 text-xs font-medium text-[#0F213E]"
                >
                  <Printer className="h-3.5 w-3.5" /> View / Print Invoice &amp; Receipt
                </button>
              </div>
            ))}
          </div>
        )}

        {showCreateInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4">
            <form
              onSubmit={handleCreateInvoice}
              className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-3"
            >
              <h3 className="font-display text-lg font-semibold text-[#0F213E]">Create Invoice</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#475569]">Parent</label>
                  <select
                    required
                    value={invParentId}
                    onChange={(e) => setInvParentId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
                  >
                    {parents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569]">
                    Student (Optional)
                  </label>
                  <select
                    value={invStudentId}
                    onChange={(e) => setInvStudentId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
                  >
                    <option value="">General</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#475569]">Currency</label>
                  <select
                    value={invCurrency}
                    onChange={(e) => setInvCurrency(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
                  >
                    <option value="KES">KES</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569]">Due Date</label>
                  <input
                    type="date"
                    value={invDueDate}
                    onChange={(e) => setInvDueDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569]">Line Item</label>
                <input
                  type="text"
                  required
                  value={invDesc}
                  onChange={(e) => setInvDesc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#475569]">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={invQty}
                    onChange={(e) => setInvQty(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569]">Unit Price</label>
                  <input
                    type="number"
                    min={0}
                    value={invPrice}
                    onChange={(e) => setInvPrice(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateInvoice(false)}
                  className="rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm font-medium text-white"
                >
                  Issue Invoice
                </button>
              </div>
            </form>
          </div>
        )}

        {invoiceDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F213E]/60 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-8 shadow-xl">
              <div className="flex items-start justify-between border-b border-[#EFEAE0] pb-4">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-[#0F213E]">
                    {invoiceDetail.business?.business_name || 'Jey Learning Hub'}
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    {invoiceDetail.business?.contact_email || 'mainajecinta81@gmail.com'} ·{' '}
                    {invoiceDetail.business?.location || 'Nairobi, Kenya'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono-num text-sm font-bold text-[#0F213E]">
                    {invoiceDetail.invoice.invoice_number}
                  </p>
                  <p className="text-xs uppercase text-[#9A6D14]">
                    {invoiceDetail.invoice.status}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 text-xs text-[#475569]">
                <div>
                  <p className="font-semibold text-[#0F213E]">Billed To:</p>
                  <p>{invoiceDetail.invoice.parent_name}</p>
                  <p>{invoiceDetail.invoice.parent_email}</p>
                </div>
                <div className="sm:text-right">
                  <p>Due Date: {invoiceDetail.invoice.due_date}</p>
                  <p>
                    Total:{' '}
                    {formatCurrency(
                      invoiceDetail.invoice.total_amount,
                      invoiceDetail.invoice.currency
                    )}
                  </p>
                  <p>
                    Paid:{' '}
                    {formatCurrency(
                      invoiceDetail.invoice.amount_paid,
                      invoiceDetail.invoice.currency
                    )}
                  </p>
                </div>
              </div>

              <table className="mt-5 w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E5DFD3] text-left text-[#64748B]">
                    <th className="py-2">Description</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Unit Price</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoiceDetail.items || []).map((it: any) => (
                    <tr key={it.id} className="border-b border-[#EFEAE0]">
                      <td className="py-2">{it.description}</td>
                      <td className="py-2 text-right font-mono-num">{it.quantity}</td>
                      <td className="py-2 text-right font-mono-num">
                        {formatCurrency(it.unit_price, invoiceDetail.invoice.currency)}
                      </td>
                      <td className="py-2 text-right font-mono-num font-semibold">
                        {formatCurrency(it.line_total, invoiceDetail.invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(invoiceDetail.payments || []).length > 0 && (
                <div className="mt-4 rounded-lg bg-[#FAF8F4] p-3 text-xs">
                  <p className="font-semibold text-[#0F213E]">Recorded Payments &amp; Receipts</p>
                  {invoiceDetail.payments.map((pay: any) => (
                    <p key={pay.id} className="mt-1">
                      {pay.receipt_number || 'Pending'} · {pay.payment_method.toUpperCase()} (
                      {pay.transaction_reference}) — {formatCurrency(pay.amount, pay.currency)} [
                      {pay.status}]
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F213E] px-4 py-2 text-xs font-medium text-[#0F213E]"
                >
                  <Printer className="h-3.5 w-3.5" /> Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceDetail(null)}
                  className="rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================= RENDER: MESSAGES =================
  if (section === 'messages') {
    const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      setMsg('');
      setErr('');
      try {
        await apiFetch('/api/admin/messages', {
          method: 'POST',
          body: JSON.stringify({
            recipientId: msgParentProfileId,
            studentId: msgStudentId || null,
            subject: msgSubject,
            body: msgBody,
          }),
        });
        setMsgSubject('');
        setMsgBody('');
        setMsg('Message sent to parent.');
        onRefresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Could not send message.');
      }
    };

    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
          Parent &amp; Teacher Messages
        </h1>
        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-[#166534]">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleSendMessage}
            className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3"
          >
            <h2 className="font-display text-base font-semibold text-[#0F213E]">
              Send Message to Parent
            </h2>
            <div>
              <label className="block text-xs font-medium text-[#475569]">Recipient Parent</label>
              <select
                required
                value={msgParentProfileId}
                onChange={(e) => setMsgParentProfileId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
              >
                <option value="">Select parent...</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.profile_id}>
                    {p.full_name} ({p.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569]">
                Regarding Child (Optional)
              </label>
              <select
                value={msgStudentId}
                onChange={(e) => setMsgStudentId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] bg-white px-3 py-2 text-xs"
              >
                <option value="">General</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569]">Subject</label>
              <input
                type="text"
                required
                value={msgSubject}
                onChange={(e) => setMsgSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569]">Message</label>
              <textarea
                rows={4}
                required
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
            >
              <Send className="h-3.5 w-3.5" /> Send Message
            </button>
          </form>

          <div className="lg:col-span-2 space-y-3">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D8D1C4] bg-white p-8 text-center text-sm text-[#64748B]">
                No parent messages yet.
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="rounded-xl border border-[#E5DFD3] bg-white p-4">
                  <div className="flex items-center justify-between text-xs text-[#64748B]">
                    <span>
                      {m.sender_name} ({m.sender_role}) → {m.recipient_name}{' '}
                      {m.student_name ? `· Re: ${m.student_name}` : ''}
                    </span>
                    <span>{formatUtcInTimezone(m.created_at, teacherTz)}</span>
                  </div>
                  <h3 className="mt-1 text-sm font-semibold text-[#0F213E]">{m.subject}</h3>
                  <p className="mt-1 text-sm text-[#334155] whitespace-pre-wrap">{m.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ================= RENDER: NOTIFICATIONS =================
  if (section === 'notifications') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
            Notifications &amp; Delivery Log
          </h1>
          <button
            type="button"
            onClick={async () => {
              await apiFetch('/api/notifications/read-all', { method: 'POST' });
              onRefresh();
            }}
            className="rounded-lg border border-[#D8D1C4] bg-white px-3.5 py-2 text-xs font-medium text-[#0F213E]"
          >
            Mark All Read
          </button>
        </div>

        {notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D8D1C4] bg-white p-8 text-center text-sm text-[#64748B]">
            No notifications yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`rounded-xl border p-4 ${
                  n.is_read ? 'border-[#E5DFD3] bg-white' : 'border-[#C6922C] bg-[#FAF8F4]'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-[#64748B]">
                  <span>
                    {n.event_type} · Email: {n.email_status}
                  </span>
                  <span>{formatUtcInTimezone(n.created_at, teacherTz)}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-[#0F213E]">{n.title}</p>
                <p className="mt-0.5 text-xs text-[#475569]">{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ================= RENDER: REPORTS =================
  if (section === 'reports') {
    const handleDownloadCsv = async () => {
      const token = getSessionToken();
      const res = await fetch('/api/admin/reports/export.csv', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'jey-learning-hub-classes-report.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };

    const bs = reportData?.bookingStats || {};
    const cs = reportData?.classStats || {};

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
            Academic &amp; Business Reports
          </h1>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
          >
            <Download className="h-4 w-4" /> Export Classes CSV
          </button>
        </div>

        {/* Filters */}
        <div className="grid gap-3 rounded-xl border border-[#E5DFD3] bg-white p-4 sm:grid-cols-5 text-xs">
          <div>
            <label className="block text-[#64748B]">From</label>
            <input
              type="date"
              value={repFrom}
              onChange={(e) => setRepFrom(e.target.value)}
              className="mt-1 w-full rounded border border-[#D8D1C4] px-2 py-1.5"
            />
          </div>
          <div>
            <label className="block text-[#64748B]">To</label>
            <input
              type="date"
              value={repTo}
              onChange={(e) => setRepTo(e.target.value)}
              className="mt-1 w-full rounded border border-[#D8D1C4] px-2 py-1.5"
            />
          </div>
          <div>
            <label className="block text-[#64748B]">Subject</label>
            <select
              value={repSubject}
              onChange={(e) => setRepSubject(e.target.value)}
              className="mt-1 w-full rounded border border-[#D8D1C4] bg-white px-2 py-1.5"
            >
              <option value="">All Subjects</option>
              <option value="Mathematics">Mathematics</option>
              <option value="Coding & Computer Science">Coding &amp; CS</option>
            </select>
          </div>
          <div>
            <label className="block text-[#64748B]">Student</label>
            <select
              value={repStudentId}
              onChange={(e) => setRepStudentId(e.target.value)}
              className="mt-1 w-full rounded border border-[#D8D1C4] bg-white px-2 py-1.5"
            >
              <option value="">All Students</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[#64748B]">Teacher</label>
            <select
              value={repTeacherId}
              onChange={(e) => setRepTeacherId(e.target.value)}
              className="mt-1 w-full rounded border border-[#D8D1C4] bg-white px-2 py-1.5"
            >
              <option value="">All Teachers</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
            <p className="text-xs text-[#64748B]">Bookings (Total / Confirmed)</p>
            <p className="font-mono-num mt-1 text-2xl font-semibold text-[#0F213E]">
              {bs.total_bookings ?? 0} / {bs.confirmed_bookings ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
            <p className="text-xs text-[#64748B]">Classes (Done / Cancelled)</p>
            <p className="font-mono-num mt-1 text-2xl font-semibold text-[#0F213E]">
              {cs.completed_classes ?? 0} / {cs.cancelled_classes ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
            <p className="text-xs text-[#64748B]">Verified Revenue</p>
            <div className="mt-1 space-y-0.5 font-mono-num text-sm font-semibold text-[#166534]">
              {(reportData?.revenueByCurrency || []).length === 0
                ? 'KES 0'
                : reportData.revenueByCurrency.map((r: any) => (
                    <p key={r.currency}>{formatCurrency(r.verified_revenue || 0, r.currency)}</p>
                  ))}
            </div>
          </div>
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
            <p className="text-xs text-[#64748B]">Outstanding Balance</p>
            <div className="mt-1 space-y-0.5 font-mono-num text-sm font-semibold text-[#9A6D14]">
              {(reportData?.outstandingByCurrency || []).length === 0
                ? 'KES 0'
                : reportData.outstandingByCurrency.map((o: any) => (
                    <p key={o.currency}>
                      {formatCurrency(o.outstanding_balance || 0, o.currency)}
                    </p>
                  ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
          <h2 className="font-display text-lg font-semibold text-[#0F213E]">
            Student Attendance &amp; Academic Progress
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DFD3] text-[#64748B]">
                  <th className="py-2">Student</th>
                  <th className="py-2">Grade</th>
                  <th className="py-2">Country</th>
                  <th className="py-2 text-right">Completed Lessons</th>
                  <th className="py-2 text-right">Missed</th>
                  <th className="py-2 text-right">Avg Marks</th>
                </tr>
              </thead>
              <tbody>
                {(reportData?.studentProgress || []).map((sp: any) => (
                  <tr key={sp.id} className="border-b border-[#EFEAE0]">
                    <td className="py-2.5 font-semibold text-[#0F213E]">{sp.full_name}</td>
                    <td className="py-2.5">{sp.grade_level}</td>
                    <td className="py-2.5">{sp.country}</td>
                    <td className="py-2.5 text-right font-mono-num">{sp.completed_lessons}</td>
                    <td className="py-2.5 text-right font-mono-num">{sp.missed_lessons}</td>
                    <td className="py-2.5 text-right font-mono-num">
                      {sp.avg_assignment_marks ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ================= RENDER: WEBSITE CONTENT & TESTIMONIALS =================
  if (section === 'website') {
    const handleSaveKey = async (key: string, body: any) => {
      setMsg('');
      setErr('');
      try {
        await apiFetch(`/api/admin/settings/${key}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        setMsg(`Updated ${key.replace('_', ' ')} on the public website.`);
        onRefresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Save failed.');
      }
    };

    const handleAddTestimonial = async (e: React.FormEvent) => {
      e.preventDefault();
      setMsg('');
      setErr('');
      try {
        await apiFetch('/api/admin/testimonials', {
          method: 'POST',
          body: JSON.stringify({
            authorName: tAuthor,
            authorRole: tRole,
            location: tLocation,
            quote: tQuote,
            outcome: tOutcome,
            isPublished: true,
          }),
        });
        setTAuthor('');
        setTQuote('');
        setTOutcome('');
        setMsg('Verified testimonial published.');
        onRefresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Could not save testimonial.');
      }
    };

    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
          Website Content &amp; Verified Testimonials
        </h1>
        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-[#166534]">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-[#0F213E]">
              Home Page Headline &amp; Intro
            </h2>
            <input
              type="text"
              value={homeForm.hero_headline || ''}
              onChange={(e) => setHomeForm({ ...homeForm, hero_headline: e.target.value })}
              placeholder="Hero Headline"
              className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
            />
            <textarea
              rows={3}
              value={homeForm.hero_subheadline || ''}
              onChange={(e) => setHomeForm({ ...homeForm, hero_subheadline: e.target.value })}
              placeholder="Hero Subheadline"
              className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={() => handleSaveKey('home_content', homeForm)}
              className="rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
            >
              Save Home Copy
            </button>
          </div>

          <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-[#0F213E]">
              About Jecinta Maina Page
            </h2>
            <input
              type="text"
              value={aboutForm.headline || ''}
              onChange={(e) => setAboutForm({ ...aboutForm, headline: e.target.value })}
              placeholder="About Headline"
              className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-sm"
            />
            <textarea
              rows={3}
              value={aboutForm.founder_story || ''}
              onChange={(e) => setAboutForm({ ...aboutForm, founder_story: e.target.value })}
              placeholder="Founder Story"
              className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={() => handleSaveKey('about_content', aboutForm)}
              className="rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
            >
              Save About Copy
            </button>
          </div>
        </div>

        {/* Testimonials CRUD */}
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-6 space-y-4">
          <h2 className="font-display text-lg font-semibold text-[#0F213E]">
            Parent &amp; Student Testimonials (Only real verified quotes you add appear publicly)
          </h2>
          <form onSubmit={handleAddTestimonial} className="grid gap-3 sm:grid-cols-3 text-xs">
            <input
              type="text"
              required
              placeholder="Parent or Student Name"
              value={tAuthor}
              onChange={(e) => setTAuthor(e.target.value)}
              className="rounded-lg border border-[#D8D1C4] px-3 py-2"
            />
            <input
              type="text"
              required
              placeholder="Role (e.g. Grade 6 Parent)"
              value={tRole}
              onChange={(e) => setTRole(e.target.value)}
              className="rounded-lg border border-[#D8D1C4] px-3 py-2"
            />
            <input
              type="text"
              placeholder="Location (e.g. London, UK)"
              value={tLocation}
              onChange={(e) => setTLocation(e.target.value)}
              className="rounded-lg border border-[#D8D1C4] px-3 py-2"
            />
            <textarea
              rows={2}
              required
              placeholder="Genuine quote..."
              value={tQuote}
              onChange={(e) => setTQuote(e.target.value)}
              className="sm:col-span-2 rounded-lg border border-[#D8D1C4] px-3 py-2"
            />
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Outcome (Optional)"
                value={tOutcome}
                onChange={(e) => setTOutcome(e.target.value)}
                className="rounded-lg border border-[#D8D1C4] px-3 py-2"
              />
              <button
                type="submit"
                className="rounded-lg bg-[#0F213E] px-4 py-2 font-medium text-white"
              >
                Add Testimonial
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {testimonials.map((t) => (
              <div
                key={t.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-[#EFEAE0] bg-[#FAF8F4] p-3 text-xs"
              >
                <div>
                  <p className="font-semibold text-[#0F213E]">
                    {t.author_name} · {t.author_role} ({t.location})
                  </p>
                  <p className="mt-1 text-[#334155]">"{t.quote}"</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTestimonialId(t.id)}
                  className="text-red-700"
                  aria-label="Delete testimonial"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <ConfirmDialog
          open={Boolean(deleteTestimonialId)}
          title="Delete Testimonial?"
          message="Remove this testimonial from the website?"
          confirmLabel="Delete"
          destructive
          onCancel={() => setDeleteTestimonialId(null)}
          onConfirm={async () => {
            if (!deleteTestimonialId) return;
            await apiFetch(`/api/admin/testimonials/${deleteTestimonialId}`, { method: 'DELETE' });
            setDeleteTestimonialId(null);
            onRefresh();
          }}
        />
      </div>
    );
  }

  // ================= RENDER: INTEGRATIONS =================
  if (section === 'integrations') {
    const handleSetDefaultProvider = async (provider: 'zoom' | 'google_meet') => {
      setMsg('');
      setErr('');
      try {
        await apiFetch('/api/admin/integrations/provider', {
          method: 'POST',
          body: JSON.stringify({ defaultVideoProvider: provider }),
        });
        setMsg(`Default video meeting provider set to ${provider === 'zoom' ? 'Zoom' : 'Google Meet'}.`);
        onRefresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Could not update provider.');
      }
    };

    const handleTestZoom = async () => {
      setMsg('');
      setErr('');
      setTestingIntegration('zoom');
      try {
        const res = await apiFetch<{ message: string }>('/api/admin/integrations/zoom/test', {
          method: 'POST',
        });
        setMsg(res.message);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Zoom test failed.');
      } finally {
        setTestingIntegration('');
      }
    };

    const handleTestGoogle = async () => {
      setMsg('');
      setErr('');
      setTestingIntegration('google');
      try {
        const res = await apiFetch<{ message: string }>('/api/admin/integrations/google/test', {
          method: 'POST',
        });
        setMsg(res.message);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Google Calendar & Meet test failed.');
      } finally {
        setTestingIntegration('');
      }
    };

    const handleGoogleSignIn = async () => {
      setMsg('');
      setErr('');
      try {
        const res = await googleWorkspaceSignIn();
        setGoogleUser(res.user);
        setGoogleTokenPresent(true);
        setMsg(`Connected Google Workspace account: ${res.user.email}`);
        onRefresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Google Sign-In failed.');
      }
    };

    const handleGoogleSignOut = async () => {
      await googleWorkspaceLogout();
      setGoogleUser(null);
      setGoogleTokenPresent(false);
      setMsg('Signed out of Google Workspace session.');
    };

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
            Live Integrations &amp; Video Providers
          </h1>
          <p className="text-xs text-[#64748B]">
            Real external API connections only. Configure server environment secrets in AI Studio /
            deployment settings, or sign in with Google below for Google Calendar &amp; Meet.
          </p>
        </div>

        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-[#166534]">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {err}
          </div>
        )}

        {/* Default Video Provider */}
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-5">
          <h2 className="font-display text-base font-semibold text-[#0F213E]">
            Default Video Conferencing Provider for New Bookings
          </h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleSetDefaultProvider('zoom')}
              className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
                integrations.defaultVideoProvider === 'zoom'
                  ? 'border-[#0F213E] bg-[#0F213E] text-white'
                  : 'border-[#D8D1C4] bg-white text-[#0F213E]'
              }`}
            >
              Zoom (Default)
            </button>
            <button
              type="button"
              onClick={() => handleSetDefaultProvider('google_meet')}
              className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
                integrations.defaultVideoProvider === 'google_meet'
                  ? 'border-[#0F213E] bg-[#0F213E] text-white'
                  : 'border-[#D8D1C4] bg-white text-[#0F213E]'
              }`}
            >
              Google Meet + Calendar
            </button>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Zoom S2S OAuth */}
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-[#0F213E]" />
                <h3 className="font-display text-base font-semibold text-[#0F213E]">
                  Zoom Server-to-Server OAuth
                </h3>
              </div>
              <span
                className={`text-xs font-semibold ${
                  integrations.zoom?.configured ? 'text-[#166534]' : 'text-[#9A6D14]'
                }`}
              >
                {integrations.zoom?.configured ? 'Configured' : 'Needs Env Vars'}
              </span>
            </div>
            <p className="text-xs text-[#475569]">
              Required server secrets: <code>ZOOM_ACCOUNT_ID</code>, <code>ZOOM_CLIENT_ID</code>,{' '}
              <code>ZOOM_CLIENT_SECRET</code>, and optional <code>ZOOM_WEBHOOK_SECRET_TOKEN</code>.
            </p>
            <button
              type="button"
              disabled={testingIntegration === 'zoom'}
              onClick={handleTestZoom}
              className="rounded-lg border border-[#0F213E] px-3.5 py-2 text-xs font-medium text-[#0F213E]"
            >
              {testingIntegration === 'zoom' ? 'Testing Zoom...' : 'Test Zoom Connection'}
            </button>
          </div>

          {/* Google Calendar & Meet (Client-side OAuth per Workspace skill) */}
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe2 className="h-5 w-5 text-[#0F213E]" />
                <h3 className="font-display text-base font-semibold text-[#0F213E]">
                  Google Calendar &amp; Google Meet
                </h3>
              </div>
              <span
                className={`text-xs font-semibold ${
                  googleTokenPresent ? 'text-[#166534]' : 'text-[#9A6D14]'
                }`}
              >
                {googleTokenPresent ? 'Session Active' : 'Sign In Required'}
              </span>
            </div>
            <p className="text-xs text-[#475569]">
              Authorize your Google account with Calendar &amp; Meet scopes to automatically create
              Google Meet rooms and Calendar events on class confirmation.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {!googleTokenPresent ? (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="gsi-material-button"
                >
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">Sign in with Google</span>
                  </div>
                </button>
              ) : (
                <>
                  <span className="text-xs text-[#166534]">
                    Signed in as {googleUser?.email || 'Google Account'}
                  </span>
                  <button
                    type="button"
                    disabled={testingIntegration === 'google'}
                    onClick={handleTestGoogle}
                    className="rounded-lg border border-[#0F213E] px-3 py-1.5 text-xs font-medium text-[#0F213E]"
                  >
                    Test Calendar &amp; Meet
                  </button>
                  <button
                    type="button"
                    onClick={handleGoogleSignOut}
                    className="rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs text-[#475569]"
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Gemini AI Status (never ask user for GEMINI_API_KEY in UI) */}
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#C6922C]" />
                <h3 className="font-display text-base font-semibold text-[#0F213E]">
                  Gemini AI Lesson Notes
                </h3>
              </div>
              <span
                className={`text-xs font-semibold ${
                  integrations.gemini?.configured ? 'text-[#166534]' : 'text-[#9A6D14]'
                }`}
              >
                {integrations.gemini?.configured ? 'Configured' : 'Server Secret Pending'}
              </span>
            </div>
            <p className="text-xs text-[#475569]">
              Uses server-side Gemini API (<code>{integrations.gemini?.model || 'gemini-4-hydrogen'}</code>
              ) configured via AI Studio Secrets. Drafts always require manual teacher review before
              publishing.
            </p>
          </div>

          {/* SMTP Email Status */}
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-[#0F213E]" />
                <h3 className="font-display text-base font-semibold text-[#0F213E]">
                  Transactional Email (SMTP)
                </h3>
              </div>
              <span
                className={`text-xs font-semibold ${
                  integrations.email?.configured ? 'text-[#166534]' : 'text-[#9A6D14]'
                }`}
              >
                {integrations.email?.configured ? 'Configured' : 'Not Configured'}
              </span>
            </div>
            <p className="text-xs text-[#475569]">
              In-app notifications always work immediately. Configure <code>SMTP_HOST</code>,{' '}
              <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>, and{' '}
              <code>SMTP_FROM</code> in server environment variables for external email delivery.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ================= RENDER: SETTINGS & AUDIT LOGS =================
  const handleSaveSetting = async (key: string, payload: any) => {
    setMsg('');
    setErr('');
    try {
      await apiFetch(`/api/admin/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setMsg(`Saved ${key.replace('_', ' ')}.`);
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-[#0F213E]">
        Platform Settings, Payments &amp; Audit Logs
      </h1>
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-[#166534]">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-[#0F213E]">
            Business Identity &amp; Contact
          </h2>
          <input
            type="text"
            value={bizForm.business_name || ''}
            onChange={(e) => setBizForm({ ...bizForm, business_name: e.target.value })}
            placeholder="Business Name"
            className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
          />
          <input
            type="text"
            value={bizForm.contact_email || ''}
            onChange={(e) => setBizForm({ ...bizForm, contact_email: e.target.value })}
            placeholder="Contact Email"
            className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
          />
          <input
            type="text"
            value={bizForm.contact_phone || ''}
            onChange={(e) => setBizForm({ ...bizForm, contact_phone: e.target.value })}
            placeholder="Phone / WhatsApp"
            className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={() => handleSaveSetting('business_settings', bizForm)}
            className="rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
          >
            Save Business Settings
          </button>
        </div>

        <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-[#0F213E]">
            M-Pesa, Bank &amp; International Payment Instructions
          </h2>
          <textarea
            rows={2}
            value={paySettingsForm.mpesa_instructions || ''}
            onChange={(e) =>
              setPaySettingsForm({ ...paySettingsForm, mpesa_instructions: e.target.value })
            }
            placeholder="M-Pesa Paybill / Till Instructions"
            className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
          />
          <textarea
            rows={2}
            value={paySettingsForm.bank_instructions || ''}
            onChange={(e) =>
              setPaySettingsForm({ ...paySettingsForm, bank_instructions: e.target.value })
            }
            placeholder="Local Bank Transfer Instructions"
            className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
          />
          <textarea
            rows={2}
            value={paySettingsForm.international_instructions || ''}
            onChange={(e) =>
              setPaySettingsForm({ ...paySettingsForm, international_instructions: e.target.value })
            }
            placeholder="International Transfer / Wise / Remitly Instructions"
            className="w-full rounded-lg border border-[#D8D1C4] px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={() => handleSaveSetting('payment_settings', paySettingsForm)}
            className="rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
          >
            Save Payment Instructions
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-3">
        <h2 className="font-display text-base font-semibold text-[#0F213E]">
          Child Privacy &amp; Recording Consent Policy
        </h2>
        <label className="flex items-center gap-2 text-xs text-[#0F213E]">
          <input
            type="checkbox"
            checked={privacyForm.require_parental_recording_consent !== false}
            onChange={(e) =>
              setPrivacyForm({
                ...privacyForm,
                require_parental_recording_consent: e.target.checked,
              })
            }
          />
          Enforce verified parental consent before any minor&apos;s class recording can be published
        </label>
        <button
          type="button"
          onClick={() => handleSaveSetting('privacy_settings', privacyForm)}
          className="rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-medium text-white"
        >
          Save Privacy Policy
        </button>
      </div>

      <div className="rounded-xl border border-[#E5DFD3] bg-white p-6">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#0F213E]" />
          <h2 className="font-display text-lg font-semibold text-[#0F213E]">
            Security &amp; Audit Logs (Latest 100)
          </h2>
        </div>
        <div className="mt-4 max-h-72 overflow-y-auto divide-y divide-[#EFEAE0] text-xs">
          {auditLogs.map((log) => (
            <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <span className="font-semibold text-[#0F213E]">{log.action}</span> ·{' '}
                <span className="text-[#475569]">
                  {log.entity_type} ({log.entity_id})
                </span>
              </div>
              <span className="text-[#64748B]">
                {log.actor_name || 'System'} · {formatUtcInTimezone(log.created_at, teacherTz)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
