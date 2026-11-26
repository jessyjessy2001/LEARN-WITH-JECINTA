# Jey Learning Hub — Learn with Jecinta

**Learn. Create. Grow.**

A production-ready online tutoring platform for **Jey Learning Hub** (founded by **Jecinta Maina**), serving Kenyan and international students across **Mathematics** (Grades 1–8), **Coding & Computer Science** (Ages 6–16), and **Science** (Grades 1–8).

---

## Core Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Vite
- **Backend**: Node.js + Express (`server.ts`) on port `3000`
- **Local Persistence**: Built-in `node:sqlite` (`data/jey_learning_hub.db`) with strict foreign-key enforcement and atomic transactions
- **Supabase PostgreSQL Ready**: Full schema + Row Level Security (RLS) migrations in `supabase/migrations/`
- **Video Conferencing**:
  - **Zoom** (Default) via Zoom Server-to-Server OAuth + Webhook ingestion (`/api/webhooks/zoom`)
  - **Google Meet + Google Calendar** via client-side Google Workspace OAuth (`X-Google-Access-Token`)
- **AI Lesson Notes Assistant**: Server-side `@google/genai` (`gemini-4-hydrogen`) converting transcripts or teacher bullets into structured Markdown **drafts** (never auto-published)
- **Email & In-App Notifications**: Database notification log + `nodemailer` SMTP support + background class reminders (`24h`, `1h`, `15m`)

---

## Local Setup & Running

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` (or configure Secrets in AI Studio / your hosting provider):
- `GEMINI_API_KEY`: Server-side Gemini API key for AI Lesson Notes drafts.
- `ADMIN_PASSCODE` *(optional)*: If set, allows `mainajecinta81@gmail.com` to sign in directly without first-run password claiming. If omitted, the first visit to **Portal Login** offers a one-time **Set Up Admin Account** form that permanently locks once claimed.
- `SESSION_SECRET`: Secret salt used in token signing.
- `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_WEBHOOK_SECRET_TOKEN`: Required for automatic Zoom meeting creation & cloud recording sync.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: Required for external transactional emails.

### 3. Start Development Server
```bash
npm run dev
```
The app runs at `http://localhost:3000`.

### 4. Optional Development Seed Data
To populate sample test accounts (1 parent, 2 children, 1 student login, 1 upcoming class) for manual local exploration:
```bash
npm run seed:demo
```
*(Note: Production startup never inserts fake students, bookings, payments, or testimonials.)*

---

## Automated End-to-End Tests

Run the full Vitest suite (testing admin claim lock, role isolation, double-booking HTTP 409 conflicts, draft/private note isolation, parental recording consent checks, homework grading, and M-Pesa payment verification + receipt generation):

```bash
npm test
```

---

## Supabase PostgreSQL Migration

If deploying with Supabase PostgreSQL:
1. Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL Editor.
2. Run `supabase/migrations/002_rls_policies.sql` to enable strict Row Level Security across all tables (students, parents, teachers, lesson notes, private observations, recordings, payments, and invoices).

---

## Production Build & Deployment

```bash
npm run build
NODE_ENV=production npm start
```
Ensure `data/` is backed by persistent storage (or point to PostgreSQL) when running in production containers.
