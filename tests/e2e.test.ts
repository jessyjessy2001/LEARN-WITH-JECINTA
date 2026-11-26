import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../server.ts';

let server: Server;
let baseUrl = '';

async function reqJson<T = any>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

function getNextMondayDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((1 + 7 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

describe('Jey Learning Hub End-to-End Platform Workflows', () => {
  let adminToken = '';
  let parentToken = '';
  let studentToken = '';
  let courseId = '';
  let slotStartUtc = '';
  let bookingId = '';
  let createdClassId = '';
  let child1Id = '';
  let child2Id = '';
  let recordingId = '';
  let assignmentId = '';
  let submissionId = '';
  let invoiceId = '';
  let paymentId = '';

  beforeAll(async () => {
    const { app } = createApp(':memory:');
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('1. Admin first-run claim succeeds once and permanently locks afterwards', async () => {
    const statusRes = await reqJson('/api/auth/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.needsAdminSetup).toBe(true);

    const claimRes = await reqJson('/api/auth/claim-admin', {
      method: 'POST',
      body: { password: 'AdminStrongPassword1!', fullName: 'Jecinta Maina', timezone: 'Africa/Nairobi' },
    });
    expect(claimRes.status).toBe(201);
    expect(claimRes.data.user.role).toBe('admin');
    adminToken = claimRes.data.token;

    // Second claim attempt must be rejected
    const secondClaim = await reqJson('/api/auth/claim-admin', {
      method: 'POST',
      body: { password: 'AnotherPassword1!' },
    });
    expect(secondClaim.status).toBe(403);
  });

  it('2. Parent registers, adds two children (with student login), and strictly enforces role isolation', async () => {
    const regRes = await reqJson('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Beatrice Kamau',
        email: 'beatrice.parent@example.com',
        password: 'ParentPass123!',
        phone: '+254722111222',
        country: 'Kenya',
        timezone: 'Africa/Nairobi',
        preferredCurrency: 'KES',
      },
    });
    expect(regRes.status).toBe(201);
    expect(regRes.data.user.role).toBe('parent');
    parentToken = regRes.data.token;

    // Parent cannot access admin routes
    const forbiddenAdmin = await reqJson('/api/admin/overview', { token: parentToken });
    expect(forbiddenAdmin.status).toBe(403);

    // Add child 1 with student account (initially recordingConsent: false)
    const c1 = await reqJson('/api/parent/children', {
      method: 'POST',
      token: parentToken,
      body: {
        fullName: 'Zuri Kamau',
        age: 11,
        gradeLevel: 'Grade 6',
        timezone: 'Africa/Nairobi',
        learningGoals: 'Fractions and Python loops',
        recordingConsent: false,
        studentEmail: 'zuri.student@example.com',
        studentPassword: 'StudentPass123!',
      },
    });
    expect(c1.status).toBe(201);
    child1Id = c1.data.student.id;

    // Add child 2 without separate login
    const c2 = await reqJson('/api/parent/children', {
      method: 'POST',
      token: parentToken,
      body: {
        fullName: 'Tobi Kamau',
        age: 8,
        gradeLevel: 'Grade 3',
        timezone: 'Africa/Nairobi',
        recordingConsent: false,
      },
    });
    expect(c2.status).toBe(201);
    child2Id = c2.data.student.id;

    // Student logs in and cannot access admin or parent endpoints
    const stuLogin = await reqJson('/api/auth/login', {
      method: 'POST',
      body: { email: 'zuri.student@example.com', password: 'StudentPass123!' },
    });
    expect(stuLogin.status).toBe(200);
    expect(stuLogin.data.user.role).toBe('student');
    studentToken = stuLogin.data.token;

    const stuForbiddenParent = await reqJson('/api/parent/dashboard', { token: studentToken });
    expect(stuForbiddenParent.status).toBe(403);
    const stuForbiddenAdmin = await reqJson('/api/admin/students', { token: studentToken });
    expect(stuForbiddenAdmin.status).toBe(403);
  });

  it('3. Availability, booking creation, invoice auto-generation, and double-booking conflict rejection (HTTP 409)', async () => {
    const home = await reqJson('/api/public/home');
    expect(home.status).toBe(200);
    expect(home.data.courses.length).toBeGreaterThanOrEqual(4);
    expect(
      home.data.courses.every(
        (c: any) => c.subject === 'Mathematics' || c.subject === 'Coding & Computer Science'
      )
    ).toBe(true);
    courseId = home.data.courses[0].id;
    expect(home.data.courses[0].price_usd).toBe(6);
    expect(home.data.courses[0].original_price_usd).toBe(10);

    const monday = getNextMondayDate();
    const avail = await reqJson(`/api/public/availability?date=${monday}&duration=60`);
    expect(avail.status).toBe(200);
    expect(avail.data.slots.length).toBeGreaterThan(2);
    slotStartUtc = avail.data.slots[0].start_utc;
    const secondSlotUtc =
      avail.data.slots.find(
        (s: any) => Math.abs(new Date(s.start_utc).getTime() - new Date(slotStartUtc).getTime()) >= 90 * 60000
      )?.start_utc || avail.data.slots[avail.data.slots.length - 1].start_utc;

    // Trial or individual USD booking must quote $6 (discounted from $10)
    const usdTrialBook = await reqJson('/api/public/bookings', {
      method: 'POST',
      body: {
        courseId,
        lessonType: 'trial',
        scheduledStartUtc: secondSlotUtc,
        durationMinutes: 60,
        learnerName: 'USD Discount Learner',
        parentName: 'USD Parent',
        parentEmail: 'usd.parent@example.com',
        userTimezone: 'America/New_York',
        currency: 'USD',
      },
    });
    expect(usdTrialBook.status).toBe(201);
    expect(usdTrialBook.data.booking.quoted_amount).toBe(6);
    expect(usdTrialBook.data.booking.currency).toBe('USD');

    // Parent submits booking for Child 1 (auto-confirmed directly into a scheduled class)
    const bookRes = await reqJson('/api/public/bookings', {
      method: 'POST',
      token: parentToken,
      body: {
        courseId,
        lessonType: 'individual',
        scheduledStartUtc: slotStartUtc,
        durationMinutes: 60,
        learnerName: 'Zuri Kamau',
        learnerAgeGrade: 'Grade 6',
        parentName: 'Beatrice Kamau',
        parentEmail: 'beatrice.parent@example.com',
        userTimezone: 'Europe/London',
        currency: 'KES',
        studentId: child1Id,
      },
    });
    expect(bookRes.status).toBe(201);
    bookingId = bookRes.data.booking.id;
    expect(bookRes.data.booking.status).toBe('confirmed');
    expect(bookRes.data.createdClassId).toBeTruthy();

    // Attempting simultaneous/overlapping booking for the same slot MUST return 409 Conflict
    const doubleBook = await reqJson('/api/public/bookings', {
      method: 'POST',
      body: {
        courseId,
        lessonType: 'individual',
        scheduledStartUtc: slotStartUtc,
        durationMinutes: 60,
        learnerName: 'Another Learner',
        parentName: 'Other Parent',
        parentEmail: 'other@example.com',
        userTimezone: 'UTC',
      },
    });
    expect(doubleBook.status).toBe(409);
  });

  it('4. Admin confirms booking idempotently -> Draft & Private Teacher Notes remain strictly hidden from student/parent', async () => {
    const confirmRes = await reqJson(`/api/admin/bookings/${bookingId}/status`, {
      method: 'POST',
      token: adminToken,
      body: { status: 'confirmed' },
    });
    expect(confirmRes.status).toBe(200);
    createdClassId = confirmRes.data.createdClassId;
    expect(createdClassId).toBeTruthy();

    // Save private notes on class & save lesson notes as DRAFT with private_observations
    await reqJson(`/api/admin/classes/${createdClassId}`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        status: 'completed',
        attendanceStatus: 'present',
        privateTeacherNotes: 'SECRET_TEACHER_CLASS_NOTE',
      },
    });

    const draftNote = await reqJson(`/api/admin/classes/${createdClassId}/notes`, {
      method: 'PUT',
      token: adminToken,
      body: {
        title: 'Fractions Mastery Session 1',
        contentMarkdown: '## Key Concepts\n- Equivalent fractions',
        homeworkInstructions: 'Complete 5 exercises.',
        privateObservations: 'SECRET_PRIVATE_OBSERVATION_ONLY_FOR_TEACHER',
        status: 'draft',
      },
    });
    expect(draftNote.status).toBe(200);

    // Student lesson review MUST NOT return draft notes or private observations
    const stuReviewDraft = await reqJson(`/api/lessons/${createdClassId}/review`, {
      token: studentToken,
    });
    expect(stuReviewDraft.status).toBe(200);
    expect(stuReviewDraft.data.note).toBeNull();
    expect(JSON.stringify(stuReviewDraft.data)).not.toContain('SECRET_TEACHER_CLASS_NOTE');
    expect(JSON.stringify(stuReviewDraft.data)).not.toContain('SECRET_PRIVATE_OBSERVATION');

    // Teacher publishes notes -> Student sees published note, STILL NEVER sees privateObservations
    const pubNote = await reqJson(`/api/admin/classes/${createdClassId}/notes`, {
      method: 'PUT',
      token: adminToken,
      body: {
        title: 'Fractions Mastery Session 1',
        contentMarkdown: '## Key Concepts\n- Equivalent fractions',
        homeworkInstructions: 'Complete 5 exercises.',
        privateObservations: 'SECRET_PRIVATE_OBSERVATION_ONLY_FOR_TEACHER',
        status: 'published',
      },
    });
    expect(pubNote.status).toBe(200);

    const stuReviewPub = await reqJson(`/api/lessons/${createdClassId}/review`, {
      token: studentToken,
    });
    expect(stuReviewPub.status).toBe(200);
    expect(stuReviewPub.data.note?.title).toBe('Fractions Mastery Session 1');
    expect(JSON.stringify(stuReviewPub.data)).not.toContain('SECRET_PRIVATE_OBSERVATION');

    // Unrelated parent cannot view another child's lesson review
    const otherParent = await reqJson('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Other Parent',
        email: 'unrelated.parent@example.com',
        password: 'OtherPassword1!',
      },
    });
    const forbiddenLesson = await reqJson(`/api/lessons/${createdClassId}/review`, {
      token: otherParent.data.token,
    });
    expect(forbiddenLesson.status).toBe(403);
  });

  it('5. Parental recording consent blocks publishing until parent grants consent', async () => {
    const recAdd = await reqJson('/api/admin/recordings', {
      method: 'POST',
      token: adminToken,
      body: {
        classId: createdClassId,
        provider: 'manual',
        playbackUrl: 'https://recordings.example.org/session-1.mp4',
        durationSeconds: 3600,
      },
    });
    expect(recAdd.status).toBe(201);
    recordingId = recAdd.data.recording.id;

    // Publishing without consent must fail with 403
    const blockedPub = await reqJson(`/api/admin/recordings/${recordingId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'published' },
    });
    expect(blockedPub.status).toBe(403);

    // Parent grants consent for Child 1
    const consentRes = await reqJson(`/api/parent/children/${child1Id}`, {
      method: 'PATCH',
      token: parentToken,
      body: { recordingConsent: true },
    });
    expect(consentRes.status).toBe(200);

    // Now admin can publish recording
    const allowedPub = await reqJson(`/api/admin/recordings/${recordingId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'published' },
    });
    expect(allowedPub.status).toBe(200);
    expect(allowedPub.data.recording.status).toBe('published');
  });

  it('6. Assignments: teacher creates -> student submits -> teacher grades & returns feedback', async () => {
    const createA = await reqJson('/api/admin/assignments', {
      method: 'POST',
      token: adminToken,
      body: {
        courseId,
        classId: createdClassId,
        studentId: child1Id,
        title: 'Fractions Practice Sheet',
        instructions: 'Simplify 12/18 and 15/25.',
        maxMarks: 20,
      },
    });
    expect(createA.status).toBe(201);
    assignmentId = createA.data.assignment.id;

    const stuSub = await reqJson(`/api/student/assignments/${assignmentId}/submit`, {
      method: 'POST',
      token: studentToken,
      body: { writtenAnswer: '12/18 = 2/3, 15/25 = 3/5.' },
    });
    expect(stuSub.status).toBe(201);
    submissionId = stuSub.data.submission.id;

    const grade = await reqJson(`/api/admin/submissions/${submissionId}/review`, {
      method: 'POST',
      token: adminToken,
      body: {
        marksAwarded: 20,
        teacherFeedback: 'Excellent clear simplification steps!',
        status: 'reviewed',
      },
    });
    expect(grade.status).toBe(200);

    const stuDash = await reqJson('/api/student/dashboard', { token: studentToken });
    expect(stuDash.status).toBe(200);
    const graded = stuDash.data.assignments.find((a: any) => a.id === assignmentId);
    expect(graded.marks_awarded).toBe(20);
    expect(graded.teacher_feedback).toBe('Excellent clear simplification steps!');
  });

  it('7. Manual Payment Verification: Parent submits reference -> Admin verifies -> Receipt & Paid Invoice', async () => {
    const pDash = await reqJson('/api/parent/dashboard', { token: parentToken });
    expect(pDash.status).toBe(200);
    expect(pDash.data.invoices.length).toBeGreaterThan(0);
    invoiceId = pDash.data.invoices[0].id;
    const totalAmount = pDash.data.invoices[0].total_amount;

    // Parent submits M-Pesa transaction code -> status must stay 'submitted', NOT 'verified'
    const submitPay = await reqJson('/api/parent/payments', {
      method: 'POST',
      token: parentToken,
      body: {
        invoiceId,
        amount: totalAmount,
        paymentMethod: 'mpesa',
        transactionReference: 'SJK92AB71Q',
      },
    });
    expect(submitPay.status).toBe(201);
    expect(submitPay.data.payment.status).toBe('submitted');
    paymentId = submitPay.data.payment.id;

    // Parent cannot verify their own payment
    const parentVerifyAttempt = await reqJson(`/api/admin/payments/${paymentId}/verify`, {
      method: 'POST',
      token: parentToken,
      body: { decision: 'verified' },
    });
    expect(parentVerifyAttempt.status).toBe(403);

    // Admin verifies payment -> receipt JLH-RCP-... generated and invoice becomes 'paid'
    const verifyRes = await reqJson(`/api/admin/payments/${paymentId}/verify`, {
      method: 'POST',
      token: adminToken,
      body: { decision: 'verified', adminNotes: 'Confirmed on M-Pesa statement' },
    });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.data.payment.status).toBe('verified');
    expect(verifyRes.data.payment.receipt_number).toMatch(/^JLH-RCP-/);

    const invDetail = await reqJson(`/api/invoices/${invoiceId}/detail`, { token: parentToken });
    expect(invDetail.status).toBe(200);
    expect(invDetail.data.invoice.status).toBe('paid');
  });

  it('8. Join links, meeting validation, and calendar sync behavior across portals', async () => {
    // Sync without Google token or Zoom credentials must fail cleanly (never fabricate fake URLs)
    const syncNoCreds = await reqJson('/api/admin/classes/sync-meetings', {
      method: 'POST',
      token: adminToken,
      body: {},
    });
    expect(syncNoCreds.status).toBe(400);

    // Teacher creates a new upcoming session
    const futureStart = new Date(Date.now() + 3 * 86400000).toISOString();
    const createCls = await reqJson('/api/admin/classes', {
      method: 'POST',
      token: adminToken,
      body: {
        courseId,
        studentId: child1Id,
        title: 'Live Google Meet Session',
        startTimeUtc: futureStart,
        durationMinutes: 60,
      },
    });
    expect(createCls.status).toBe(201);
    const liveClassId = createCls.data.createdIds[0];

    // Invalid non-HTTPS join URL must be rejected
    const badUrl = await reqJson(`/api/admin/classes/${liveClassId}/meeting`, {
      method: 'POST',
      token: adminToken,
      body: { customJoinUrl: 'http://insecure.example.com/meet' },
    });
    expect(badUrl.status).toBe(400);

    // Valid HTTPS Google Meet URL is saved and immediately visible on Student & Parent portals
    const saveMeet = await reqJson(`/api/admin/classes/${liveClassId}/meeting`, {
      method: 'POST',
      token: adminToken,
      body: { customJoinUrl: 'https://meet.google.com/abc-defg-hij' },
    });
    expect(saveMeet.status).toBe(201);
    expect(saveMeet.data.meeting.provider).toBe('google_meet');
    expect(saveMeet.data.meeting.join_url).toBe('https://meet.google.com/abc-defg-hij');

    const stuDash = await reqJson('/api/student/dashboard', { token: studentToken });
    const stuCls = stuDash.data.classes.find((c: any) => c.id === liveClassId);
    expect(stuCls.join_url).toBe('https://meet.google.com/abc-defg-hij');

    const parDash = await reqJson('/api/parent/dashboard', { token: parentToken });
    const parCls = parDash.data.classes.find((c: any) => c.id === liveClassId);
    expect(parCls.join_url).toBe('https://meet.google.com/abc-defg-hij');
  });
});
