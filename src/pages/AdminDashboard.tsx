import React, { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  Globe2,
  GraduationCap,
  Layers,
  Menu,
  MessageSquare,
  RefreshCw,
  Settings,
  Video,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  clearGoogleAccessToken,
  getGoogleAccessToken,
  getGoogleUser,
  googleWorkspaceSignIn,
} from '../lib/googleAuth';
import type { AuthUser } from '../lib/types';
import {
  AdminBookingsAndClasses,
  AdminCalendarAndAvailability,
  AdminOverviewSection,
} from './admin/AdminOverviewAndCalendar';
import { AdminAcademics } from './admin/AdminAcademics';
import { AdminNotesRecordingsAssignments } from './admin/AdminNotesRecordingsAssignments';
import { AdminFinanceAndSettings } from './admin/AdminFinanceAndSettings';

export type AdminSection =
  | 'sessions'
  | 'calendar'
  | 'academics'
  | 'catalog'
  | 'finance'
  | 'settings';

const WORKSPACES: Array<{ id: AdminSection; label: string; icon: React.ComponentType<any> }> = [
  { id: 'sessions', label: 'Live Sessions & Bookings', icon: Video },
  { id: 'calendar', label: 'Calendar & Hours', icon: Calendar },
  { id: 'academics', label: 'Students, Notes & Homework', icon: GraduationCap },
  { id: 'catalog', label: 'Courses & Website', icon: Layers },
  { id: 'finance', label: 'Payments & Reports', icon: CreditCard },
  { id: 'settings', label: 'Messages & Settings', icon: Settings },
];

interface AdminDashboardProps {
  user: AuthUser;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user }) => {
  const [section, setSection] = useState<AdminSection>('sessions');
  const [academicTab, setAcademicTab] = useState<
    'students' | 'parents' | 'notes' | 'recordings' | 'assignments' | 'submissions' | 'resources'
  >('students');
  const [catalogTab, setCatalogTab] = useState<'courses' | 'curriculum' | 'teachers' | 'website'>(
    'courses'
  );
  const [financeTab, setFinanceTab] = useState<'payments' | 'invoices' | 'reports'>('payments');
  const [settingsTab, setSettingsTab] = useState<
    'integrations' | 'messages' | 'notifications' | 'settings'
  >('integrations');

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [syncIsError, setSyncIsError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(Boolean(getGoogleAccessToken()));
  const [googleEmail, setGoogleEmail] = useState(getGoogleUser()?.email || '');
  const [data, setData] = useState<any>({});

  const loadAdminBundle = useCallback(async () => {
    setError('');
    try {
      const [
        overview,
        bookingsRes,
        classesRes,
        studentsRes,
        parentsRes,
        teachersRes,
        coursesRes,
        availabilityRes,
        notesRes,
        recordingsRes,
        assignmentsRes,
        submissionsRes,
        resourcesRes,
        paymentsRes,
        invoicesRes,
        messagesRes,
        notificationsRes,
        settingsRes,
        integrationsRes,
        testimonialsRes,
      ] = await Promise.all([
        apiFetch('/api/admin/overview'),
        apiFetch('/api/admin/bookings'),
        apiFetch('/api/admin/classes'),
        apiFetch('/api/admin/students'),
        apiFetch('/api/admin/parents'),
        apiFetch('/api/admin/teachers'),
        apiFetch('/api/admin/courses'),
        apiFetch('/api/admin/availability'),
        apiFetch('/api/admin/lesson-notes'),
        apiFetch('/api/admin/recordings'),
        apiFetch('/api/admin/assignments'),
        apiFetch('/api/admin/submissions'),
        apiFetch('/api/admin/resources'),
        apiFetch('/api/admin/payments'),
        apiFetch('/api/admin/invoices'),
        apiFetch('/api/admin/messages'),
        apiFetch('/api/notifications'),
        apiFetch('/api/admin/settings'),
        apiFetch('/api/admin/integrations/status'),
        apiFetch('/api/admin/testimonials'),
      ]);

      let auditLogs: any[] = [];
      if (user.role === 'admin') {
        try {
          const auditRes = await apiFetch<{ logs: any[] }>('/api/admin/audit-logs');
          auditLogs = auditRes.logs || [];
        } catch {
          auditLogs = [];
        }
      }

      setData({
        overview,
        bookings: bookingsRes.bookings || [],
        classes: classesRes.classes || [],
        students: studentsRes.students || [],
        parents: parentsRes.parents || [],
        teachers: teachersRes.teachers || [],
        courses: coursesRes.courses || [],
        availability: availabilityRes,
        lessonNotes: notesRes.notes || [],
        recordings: recordingsRes.recordings || [],
        assignments: assignmentsRes.assignments || [],
        submissions: submissionsRes.submissions || [],
        resources: resourcesRes.resources || [],
        payments: paymentsRes.payments || [],
        invoices: invoicesRes.invoices || [],
        messages: messagesRes.messages || [],
        notifications: notificationsRes.notifications || [],
        settings: settingsRes.settings || {},
        integrations: integrationsRes,
        testimonials: testimonialsRes.testimonials || [],
        auditLogs,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [user.role]);

  useEffect(() => {
    loadAdminBundle();
  }, [loadAdminBundle]);

  const handleSyncAllMeetings = async () => {
    setSyncing(true);
    setSyncMsg('');
    setSyncIsError(false);
    try {
      const res = await apiFetch<{ syncedCount: number; totalPending: number; errors: string[] }>(
        '/api/admin/classes/sync-meetings',
        { method: 'POST', body: JSON.stringify({}) }
      );
      if (res.syncedCount > 0) {
        setSyncMsg(
          `Synced ${res.syncedCount} upcoming session(s) to Google Calendar with Google Meet links.`
        );
      } else if (res.totalPending === 0) {
        setSyncMsg('All upcoming sessions are already on Google Calendar with meeting links.');
      } else if (res.errors?.length) {
        setSyncIsError(true);
        setSyncMsg(res.errors[0].replace('[GOOGLE_AUTH_EXPIRED] ', ''));
      }
      loadAdminBundle();
    } catch (err: unknown) {
      setSyncIsError(true);
      setSyncMsg(err instanceof Error ? err.message : 'Calendar sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectGoogleCalendar = async () => {
    setSyncMsg('');
    setSyncIsError(false);
    try {
      clearGoogleAccessToken();
      const res = await googleWorkspaceSignIn();
      setGoogleConnected(true);
      setGoogleEmail(res.user.email || '');
      await handleSyncAllMeetings();
    } catch (err: unknown) {
      setSyncIsError(true);
      setSyncMsg(err instanceof Error ? err.message : 'Google Calendar connection cancelled.');
    }
  };

  const teacherTz = user.timezone || 'Africa/Nairobi';
  const zoomConfigured = Boolean(data.integrations?.zoom?.configured);

  const handleOpenSectionCompat = (target: string) => {
    if (target === 'calendar' || target === 'classes') {
      setSection('calendar');
    } else if (target === 'bookings') {
      setSection('sessions');
    } else {
      setSection('sessions');
    }
  };

  const renderSection = () => {
    if (section === 'sessions') {
      return (
        <div className="space-y-8">
          <AdminOverviewSection
            data={data}
            teacherTz={teacherTz}
            onRefresh={loadAdminBundle}
            onOpenSection={handleOpenSectionCompat}
            onGoogleConnected={() => {
              setGoogleConnected(true);
              setGoogleEmail(getGoogleUser()?.email || '');
            }}
          />
          <AdminBookingsAndClasses
            mode="classes"
            data={data}
            teacherTz={teacherTz}
            onRefresh={loadAdminBundle}
            onOpenSection={handleOpenSectionCompat}
            onGoogleConnected={() => {
              setGoogleConnected(true);
              setGoogleEmail(getGoogleUser()?.email || '');
            }}
          />
        </div>
      );
    }

    if (section === 'calendar') {
      return (
        <AdminCalendarAndAvailability
          data={data}
          teacherTz={teacherTz}
          onRefresh={loadAdminBundle}
          onOpenSection={handleOpenSectionCompat}
        />
      );
    }

    if (section === 'academics') {
      return (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#E5DFD3] bg-white p-1.5">
            {(
              [
                ['students', 'Students'],
                ['parents', 'Parents'],
                ['notes', 'Lesson Notes & AI'],
                ['recordings', 'Recordings'],
                ['assignments', 'Assignments'],
                ['submissions', 'Submissions'],
                ['resources', 'Resources'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAcademicTab(id)}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                  academicTab === id ? 'bg-[#0F213E] text-white' : 'text-[#475569] hover:bg-[#FAF8F4]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {academicTab === 'students' || academicTab === 'parents' ? (
            <AdminAcademics section={academicTab} data={data} onRefresh={loadAdminBundle} />
          ) : (
            <AdminNotesRecordingsAssignments
              section={academicTab}
              data={data}
              teacherTz={teacherTz}
              onRefresh={loadAdminBundle}
            />
          )}
        </div>
      );
    }

    if (section === 'catalog') {
      return (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#E5DFD3] bg-white p-1.5">
            {(
              [
                ['courses', 'Courses & Pricing'],
                ['curriculum', 'Curriculum'],
                ['teachers', 'Teachers'],
                ['website', 'Website & Testimonials'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCatalogTab(id)}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                  catalogTab === id ? 'bg-[#0F213E] text-white' : 'text-[#475569] hover:bg-[#FAF8F4]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {catalogTab === 'website' ? (
            <AdminFinanceAndSettings
              section="website"
              data={data}
              teacherTz={teacherTz}
              onRefresh={loadAdminBundle}
            />
          ) : (
            <AdminAcademics section={catalogTab} data={data} onRefresh={loadAdminBundle} />
          )}
        </div>
      );
    }

    if (section === 'finance') {
      return (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#E5DFD3] bg-white p-1.5">
            {(
              [
                ['payments', 'Verify Payments'],
                ['invoices', 'Invoices & Receipts'],
                ['reports', 'Reports & CSV'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFinanceTab(id)}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                  financeTab === id ? 'bg-[#0F213E] text-white' : 'text-[#475569] hover:bg-[#FAF8F4]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <AdminFinanceAndSettings
            section={financeTab}
            data={data}
            teacherTz={teacherTz}
            onRefresh={loadAdminBundle}
          />
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#E5DFD3] bg-white p-1.5">
          {(
            [
              ['integrations', 'Calendar, Meet & Zoom'],
              ['messages', 'Parent Messages'],
              ['notifications', 'Notifications'],
              ['settings', 'Business Settings & Audit'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSettingsTab(id)}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                settingsTab === id ? 'bg-[#0F213E] text-white' : 'text-[#475569] hover:bg-[#FAF8F4]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <AdminFinanceAndSettings
          section={settingsTab}
          data={data}
          teacherTz={teacherTz}
          onRefresh={loadAdminBundle}
        />
      </div>
    );
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-1">
      {/* Compact 6-item Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-[#E5DFD3] bg-white px-3 py-6 lg:block no-print">
        <div className="mb-5 px-3">
          <p className="text-xs font-semibold text-[#9A6D14]">
            {user.role === 'admin' ? 'Lead Tutor & Admin' : 'Subject Teacher'}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[#0F213E]">{user.full_name}</p>
        </div>
        <nav className="space-y-1">
          {WORKSPACES.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#0F213E] text-white'
                    : 'text-[#475569] hover:bg-[#FAF8F4] hover:text-[#0F213E]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile Header Bar */}
        <div className="flex items-center justify-between border-b border-[#E5DFD3] bg-white px-4 py-3 lg:hidden no-print">
          <span className="text-xs font-semibold text-[#0F213E]">
            {WORKSPACES.find((i) => i.id === section)?.label}
          </span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8D1C4] px-3 py-1.5 text-xs font-medium text-[#0F213E]"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />} Menu
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-b border-[#E5DFD3] bg-white p-3 lg:hidden no-print">
            <div className="grid grid-cols-2 gap-1.5">
              {WORKSPACES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium ${
                      section === item.id ? 'bg-[#0F213E] text-white' : 'text-[#475569] bg-[#FAF8F4]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <main className="flex-1 space-y-5 p-4 sm:p-6 lg:p-8">
          {/* Direct 1-Click Google Calendar & Meet Sync Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D8D1C4] bg-white px-4 py-3 no-print">
            <div className="flex items-center gap-2.5 text-xs">
              <Globe2
                className={`h-4 w-4 shrink-0 ${
                  googleConnected ? 'text-[#166534]' : 'text-[#9A6D14]'
                }`}
              />
              <div>
                {googleConnected ? (
                  <p className="font-semibold text-[#166534]">
                    Google Calendar &amp; Meet Connected ({googleEmail || 'Active'}) · New
                    sessions auto-book with Google Meet links
                  </p>
                ) : (
                  <p className="font-semibold text-[#0F213E]">
                    Connect Google Calendar &amp; Meet to auto-book sessions &amp; generate Meet
                    links {zoomConfigured ? '(Zoom fallback active)' : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!googleConnected ? (
                <button
                  type="button"
                  onClick={handleConnectGoogleCalendar}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F213E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1B355E]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#D6B15C]" /> Connect Google Calendar
                  &amp; Meet
                </button>
              ) : (
                <button
                  type="button"
                  disabled={syncing}
                  onClick={handleSyncAllMeetings}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F213E] px-3.5 py-1.5 text-xs font-medium text-[#0F213E] disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync Missing Sessions to Calendar'}
                </button>
              )}
            </div>
          </div>

          {syncMsg && (
            <div
              className={`rounded-lg border px-4 py-2.5 text-xs ${
                syncIsError
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-emerald-200 bg-emerald-50 text-[#166534]'
              }`}
            >
              {syncMsg}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading ? (
            <div className="h-64 animate-pulse rounded-2xl border border-[#E5DFD3] bg-white" />
          ) : (
            renderSection()
          )}
        </main>
      </div>
    </div>
  );
};
