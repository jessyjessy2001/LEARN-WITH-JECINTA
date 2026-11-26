import { GoogleGenAI, Type } from '@google/genai';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { newId } from './db.ts';

// ======================== GEMINI AI LESSON SUMMARIES ========================

export interface GeneratedLessonSummary {
  lessonTitle: string;
  date: string;
  subject: string;
  gradeLevel: string;
  topicCovered: string;
  learningObjectives: string[];
  conceptsIntroduced: string[];
  keyExplanations: string[];
  examplesWorkedThrough: string[];
  activitiesCompleted: string[];
  studentParticipation: string;
  areasUnderstoodWell: string[];
  areasRequiringPractice: string[];
  misconceptionsAddressed: string[];
  homeworkRecommendations: string[];
  suggestedNextLesson: string;
  markdownDraft: string;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
}

export async function generateGeminiLessonSummary(params: {
  title: string;
  date: string;
  subject: string;
  gradeLevel: string;
  topic: string;
  studentName: string;
  transcript: string;
  teacherContext?: string;
}): Promise<GeneratedLessonSummary> {
  if (!isGeminiConfigured()) {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const prompt = `You are drafting an accurate, parent-friendly and student-friendly post-lesson summary for Jey Learning Hub (Learn with Jecinta).
CRITICAL GROUNDING RULE: Only summarize what is explicitly supported by the provided transcript and teacher context. Do NOT invent activities, examples, scores, or facts that are absent from the source text. If an item is not mentioned in the transcript/context, state "Not noted in transcript" briefly rather than fabricating details.

Class Metadata:
- Lesson Title: ${params.title}
- Date: ${params.date}
- Subject: ${params.subject}
- Grade/Level: ${params.gradeLevel}
- Topic: ${params.topic}
- Student: ${params.studentName}
${params.teacherContext ? `- Teacher Context: ${params.teacherContext}` : ''}

Lesson Transcript / Teacher Notes Input:
"""
${params.transcript}
"""`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Produce clear, warm, accurate, age-appropriate educational summaries strictly grounded in the supplied transcript and teacher notes. Output valid JSON matching the requested schema.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          lessonTitle: { type: Type.STRING },
          date: { type: Type.STRING },
          subject: { type: Type.STRING },
          gradeLevel: { type: Type.STRING },
          topicCovered: { type: Type.STRING },
          learningObjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
          conceptsIntroduced: { type: Type.ARRAY, items: { type: Type.STRING } },
          keyExplanations: { type: Type.ARRAY, items: { type: Type.STRING } },
          examplesWorkedThrough: { type: Type.ARRAY, items: { type: Type.STRING } },
          activitiesCompleted: { type: Type.ARRAY, items: { type: Type.STRING } },
          studentParticipation: { type: Type.STRING },
          areasUnderstoodWell: { type: Type.ARRAY, items: { type: Type.STRING } },
          areasRequiringPractice: { type: Type.ARRAY, items: { type: Type.STRING } },
          misconceptionsAddressed: { type: Type.ARRAY, items: { type: Type.STRING } },
          homeworkRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedNextLesson: { type: Type.STRING },
        },
        required: [
          'lessonTitle',
          'date',
          'subject',
          'gradeLevel',
          'topicCovered',
          'learningObjectives',
          'conceptsIntroduced',
          'keyExplanations',
          'examplesWorkedThrough',
          'activitiesCompleted',
          'studentParticipation',
          'areasUnderstoodWell',
          'areasRequiringPractice',
          'misconceptionsAddressed',
          'homeworkRecommendations',
          'suggestedNextLesson',
        ],
      },
    },
  });

  const rawText = (response.text || '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty response.');
  }

  const parsed = JSON.parse(rawText) as Omit<GeneratedLessonSummary, 'markdownDraft'>;
  const listFmt = (items: string[]) =>
    items && items.length > 0 ? items.map((i) => `- ${i}`).join('\n') : '- None noted';

  const markdownDraft = `# ${parsed.lessonTitle}

**Subject:** ${parsed.subject} | **Level:** ${parsed.gradeLevel} | **Date:** ${parsed.date}  
**Topic Covered:** ${parsed.topicCovered}

## Learning Objectives
${listFmt(parsed.learningObjectives)}

## Concepts Introduced
${listFmt(parsed.conceptsIntroduced)}

## Key Explanations
${listFmt(parsed.keyExplanations)}

## Examples Worked Through
${listFmt(parsed.examplesWorkedThrough)}

## Activities Completed
${listFmt(parsed.activitiesCompleted)}

## Student Participation
${parsed.studentParticipation}

## Areas Understood Well
${listFmt(parsed.areasUnderstoodWell)}

## Areas Requiring More Practice
${listFmt(parsed.areasRequiringPractice)}

## Mistakes or Misconceptions Addressed
${listFmt(parsed.misconceptionsAddressed)}

## Homework & Practice Recommendations
${listFmt(parsed.homeworkRecommendations)}

## Suggested Next Lesson
${parsed.suggestedNextLesson}
`;

  return { ...parsed, markdownDraft };
}

// ======================== ZOOM SERVER-TO-SERVER OAUTH ========================

export function isZoomConfigured(): boolean {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID &&
      process.env.ZOOM_CLIENT_ID &&
      process.env.ZOOM_CLIENT_SECRET
  );
}

export async function getZoomAccessToken(): Promise<string> {
  if (!isZoomConfigured()) {
    throw new Error(
      'Zoom Server-to-Server OAuth credentials (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET) are not configured.'
    );
  }
  const creds = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(
      process.env.ZOOM_ACCOUNT_ID!
    )}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
      },
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Zoom OAuth token error (${res.status}): ${errText}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function createZoomMeeting(params: {
  topic: string;
  startTimeUtc: string;
  durationMinutes: number;
  agenda?: string;
  autoRecord?: boolean;
}) {
  const token = await getZoomAccessToken();
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic: params.topic,
      type: 2, // Scheduled meeting
      start_time: params.startTimeUtc,
      duration: params.durationMinutes,
      timezone: 'UTC',
      agenda: params.agenda || 'Jey Learning Hub Online Lesson',
      settings: {
        waiting_room: true,
        join_before_host: false,
        auto_recording: params.autoRecord ? 'cloud' : 'none',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Zoom Create Meeting failed (${res.status}): ${errText}`);
  }
  const data = (await res.json()) as {
    id: number;
    join_url: string;
    start_url: string;
    password?: string;
  };
  return {
    external_meeting_id: String(data.id),
    join_url: data.join_url,
    host_url: data.start_url,
    passcode: data.password || '',
    raw: data,
  };
}

export async function updateZoomMeeting(
  meetingId: string,
  params: { topic?: string; startTimeUtc?: string; durationMinutes?: number }
) {
  const token = await getZoomAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic: params.topic,
      start_time: params.startTimeUtc,
      duration: params.durationMinutes,
      timezone: 'UTC',
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Zoom Update Meeting failed (${res.status}): ${errText}`);
  }
}

export async function cancelZoomMeeting(meetingId: string) {
  const token = await getZoomAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    const errText = await res.text();
    throw new Error(`Zoom Cancel Meeting failed (${res.status}): ${errText}`);
  }
}

export async function fetchZoomMeetingRecordings(meetingId: string) {
  const token = await getZoomAccessToken();
  const res = await fetch(
    `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}/recordings`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Zoom Recordings API (${res.status}): ${errText}`);
  }
  return res.json();
}

export function verifyZoomWebhookSignature(
  timestamp: string | undefined,
  signature: string | undefined,
  rawBody: string
): boolean {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret || !timestamp || !signature) return false;
  const message = `v0:${timestamp}:${rawBody}`;
  const hash = crypto.createHmac('sha256', secret).update(message).digest('hex');
  const expected = `v0=${hash}`;
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ======================== GOOGLE CALENDAR & GOOGLE MEET ========================

export async function createGoogleMeetSpace(googleAccessToken: string): Promise<{
  meetingUri: string;
  meetingCode: string;
}> {
  const res = await fetch('https://meet.googleapis.com/v2/spaces', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const errText = await res.text();
    const prefix = res.status === 401 ? '[GOOGLE_AUTH_EXPIRED] ' : '';
    throw new Error(`${prefix}Google Meet Spaces API error (${res.status}): ${errText}`);
  }
  const data = (await res.json()) as { meetingUri?: string; meetingCode?: string };
  if (!data.meetingUri) {
    throw new Error('Google Meet API did not return a meetingUri.');
  }
  return {
    meetingUri: data.meetingUri,
    meetingCode: data.meetingCode || '',
  };
}

export async function createGoogleMeetCalendarEvent(
  googleAccessToken: string,
  params: {
    summary: string;
    description: string;
    startTimeUtc: string;
    endTimeUtc: string;
    attendeeEmails?: string[];
  }
) {
  if (!googleAccessToken) {
    throw new Error('Google Workspace sign-in token is required to create a Google Calendar / Meet event.');
  }

  const validAttendees = (params.attendeeEmails || [])
    .map((e) => String(e || '').trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    .map((email) => ({ email }));

  const requestId = newId().replace(/-/g, '');
  const sendQuery = validAttendees.length > 0 ? '&sendUpdates=all' : '';
  const remindersPayload = {
    useDefault: false,
    overrides: [
      { method: 'email', minutes: 1440 },
      { method: 'popup', minutes: 60 },
      { method: 'popup', minutes: 15 },
    ],
  };

  let res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1${sendQuery}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: params.summary,
        description: params.description,
        start: { dateTime: params.startTimeUtc, timeZone: 'UTC' },
        end: { dateTime: params.endTimeUtc, timeZone: 'UTC' },
        reminders: remindersPayload,
        ...(validAttendees.length > 0 ? { attendees: validAttendees } : {}),
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    }
  );

  // If conferenceDataVersion=1 failed with 400 on account policy, fallback cleanly:
  // 1) Create dedicated Google Meet Space via Meet API v2, 2) Insert Calendar event with that Meet link
  if (res.status === 400) {
    const space = await createGoogleMeetSpace(googleAccessToken);
    const fallbackUrl =
      validAttendees.length > 0
        ? 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all'
        : 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const fallbackRes = await fetch(fallbackUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: params.summary,
        location: space.meetingUri,
        description: `${params.description}\n\nJoin Google Meet: ${space.meetingUri}`,
        start: { dateTime: params.startTimeUtc, timeZone: 'UTC' },
        end: { dateTime: params.endTimeUtc, timeZone: 'UTC' },
        reminders: remindersPayload,
        ...(validAttendees.length > 0 ? { attendees: validAttendees } : {}),
      }),
    });
    if (!fallbackRes.ok) {
      const errText = await fallbackRes.text();
      const prefix = fallbackRes.status === 401 ? '[GOOGLE_AUTH_EXPIRED] ' : '';
      throw new Error(`${prefix}Google Calendar API error (${fallbackRes.status}): ${errText}`);
    }
    const ev = (await fallbackRes.json()) as { id: string; htmlLink?: string };
    return {
      calendar_event_id: ev.id,
      external_meeting_id: space.meetingCode || ev.id,
      join_url: space.meetingUri,
      host_url: ev.htmlLink || '',
      raw: ev,
    };
  }

  if (!res.ok) {
    const errText = await res.text();
    const prefix = res.status === 401 ? '[GOOGLE_AUTH_EXPIRED] ' : '';
    throw new Error(`${prefix}Google Calendar API error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    id: string;
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { conferenceId?: string; entryPoints?: Array<{ uri?: string; entryPointType?: string }> };
  };

  let meetUrl =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
    '';

  let externalId = data.conferenceData?.conferenceId || data.id;

  // If Google Calendar created the event without synchronous hangoutLink, attach a Meet Space v2 URL
  if (!meetUrl) {
    const space = await createGoogleMeetSpace(googleAccessToken);
    meetUrl = space.meetingUri;
    externalId = space.meetingCode || data.id;
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(data.id)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: meetUrl,
          description: `${params.description}\n\nJoin Google Meet: ${meetUrl}`,
        }),
      }
    ).catch(() => {});
  }

  return {
    calendar_event_id: data.id,
    external_meeting_id: externalId,
    join_url: meetUrl,
    host_url: data.htmlLink || '',
    raw: data,
  };
}

export async function updateGoogleCalendarEvent(
  googleAccessToken: string,
  eventId: string,
  params: { summary?: string; startTimeUtc: string; endTimeUtc: string }
) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: params.summary,
        start: { dateTime: params.startTimeUtc, timeZone: 'UTC' },
        end: { dateTime: params.endTimeUtc, timeZone: 'UTC' },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Calendar update error (${res.status}): ${errText}`);
  }
}

export async function deleteGoogleCalendarEvent(googleAccessToken: string, eventId: string) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
      },
    }
  );
  if (!res.ok && res.status !== 404) {
    const errText = await res.text();
    throw new Error(`Google Calendar delete error (${res.status}): ${errText}`);
  }
}

export async function fetchGoogleMeetConferenceRecords(googleAccessToken: string) {
  const res = await fetch('https://meet.googleapis.com/v2/conferenceRecords?pageSize=10', {
    headers: { Authorization: `Bearer ${googleAccessToken}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Meet API error (${res.status}): ${errText}`);
  }
  return res.json();
}

/**
 * Automatically creates a Google Calendar + Google Meet event OR Zoom meeting ("whichever works")
 * and saves it into video_meetings for the given class.
 */
export async function provisionClassVideoMeeting(
  db: DatabaseSync,
  params: {
    classId: string;
    topic: string;
    description?: string;
    startTimeUtc: string;
    endTimeUtc: string;
    durationMinutes: number;
    preferredProvider?: string;
    googleAccessToken?: string;
    attendeeEmails?: string[];
  }
): Promise<{
  meeting: Record<string, any> | null;
  providerUsed: 'google_meet' | 'zoom' | null;
  note: string;
}> {
  const existing = db
    .prepare(`SELECT * FROM video_meetings WHERE class_id = ? AND status != 'cancelled' LIMIT 1`)
    .get(params.classId) as Record<string, any> | undefined;
  if (existing && existing.join_url) {
    return {
      meeting: existing,
      providerUsed: existing.provider as 'google_meet' | 'zoom',
      note: `Existing ${existing.provider === 'google_meet' ? 'Google Meet' : 'Zoom'} link active.`,
    };
  }

  const order: Array<'google_meet' | 'zoom'> =
    params.preferredProvider === 'zoom' ? ['zoom', 'google_meet'] : ['google_meet', 'zoom'];

  const errors: string[] = [];

  for (const provider of order) {
    if (provider === 'google_meet' && params.googleAccessToken) {
      try {
        const gm = await createGoogleMeetCalendarEvent(params.googleAccessToken, {
          summary: params.topic,
          description: params.description || 'Online tutoring lesson — Jey Learning Hub',
          startTimeUtc: params.startTimeUtc,
          endTimeUtc: params.endTimeUtc,
          attendeeEmails: params.attendeeEmails,
        });
        const id = newId();
        db.prepare(
          `INSERT OR REPLACE INTO video_meetings
           (id, class_id, provider, external_meeting_id, join_url, host_url, calendar_event_id, status, raw_metadata_json)
           VALUES (?, ?, 'google_meet', ?, ?, ?, ?, 'created', ?)`
        ).run(
          id,
          params.classId,
          gm.external_meeting_id,
          gm.join_url,
          gm.host_url,
          gm.calendar_event_id,
          JSON.stringify(gm.raw)
        );
        return {
          meeting: db.prepare(`SELECT * FROM video_meetings WHERE class_id = ?`).get(params.classId) as Record<string, any>,
          providerUsed: 'google_meet',
          note: 'Booked directly onto Google Calendar with a Google Meet link.',
        };
      } catch (err: unknown) {
        errors.push(`Google Meet: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }

    if (provider === 'zoom' && isZoomConfigured()) {
      try {
        const zoom = await createZoomMeeting({
          topic: params.topic,
          startTimeUtc: params.startTimeUtc,
          durationMinutes: params.durationMinutes,
          agenda: params.description || 'Jey Learning Hub Online Lesson',
          autoRecord: true,
        });
        const id = newId();
        db.prepare(
          `INSERT OR REPLACE INTO video_meetings
           (id, class_id, provider, external_meeting_id, join_url, host_url, passcode, status, raw_metadata_json)
           VALUES (?, ?, 'zoom', ?, ?, ?, ?, 'created', ?)`
        ).run(
          id,
          params.classId,
          zoom.external_meeting_id,
          zoom.join_url,
          zoom.host_url,
          zoom.passcode,
          JSON.stringify(zoom.raw)
        );
        return {
          meeting: db.prepare(`SELECT * FROM video_meetings WHERE class_id = ?`).get(params.classId) as Record<string, any>,
          providerUsed: 'zoom',
          note: 'Zoom meeting created automatically.',
        };
      } catch (err: unknown) {
        errors.push(`Zoom: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }
  }

  const fallbackNote =
    errors.length > 0
      ? errors.join(' | ')
      : 'Session scheduled. Connect Google Calendar & Meet (or configure Zoom) in Teacher Dashboard to generate the live video link.';

  return { meeting: null, providerUsed: null, note: fallbackNote };
}

// ======================== EMAIL & IN-APP NOTIFICATIONS ========================

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function dispatchNotification(
  db: DatabaseSync,
  params: {
    userId: string;
    eventType: string;
    title: string;
    body: string;
    linkPath?: string;
    sendEmail?: boolean;
  }
) {
  const notifId = newId();
  let emailStatus: 'not_applicable' | 'sent' | 'not_configured' | 'failed' = 'not_applicable';
  let emailError = '';

  if (params.sendEmail) {
    const recipient = db
      .prepare(`SELECT email, full_name FROM profiles WHERE id = ?`)
      .get(params.userId) as { email: string; full_name: string } | undefined;

    if (!isSmtpConfigured()) {
      emailStatus = 'not_configured';
      emailError = 'SMTP_HOST / SMTP_USER / SMTP_PASS environment variables are not configured.';
    } else if (recipient?.email) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: Number(process.env.SMTP_PORT || 587) === 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: recipient.email,
          subject: `[Jey Learning Hub] ${params.title}`,
          text: `Hello ${recipient.full_name},\n\n${params.body}\n\nJey Learning Hub — Learn. Create. Grow.`,
        });
        emailStatus = 'sent';
      } catch (err: unknown) {
        emailStatus = 'failed';
        emailError = err instanceof Error ? err.message : 'SMTP delivery failed';
      }
    }
  }

  db.prepare(
    `INSERT INTO notifications (id, user_id, event_type, title, body, channel, email_status, email_error, link_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    notifId,
    params.userId,
    params.eventType,
    params.title,
    params.body,
    params.sendEmail ? 'both' : 'in_app',
    emailStatus,
    emailError,
    params.linkPath || ''
  );

  return { notifId, emailStatus, emailError };
}
