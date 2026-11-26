import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import { initDatabase, newId } from './server/db.ts';
import { createPublicAndAuthRouter } from './server/routes/publicAndAuth.ts';
import { createPortalRouter } from './server/routes/portalRoutes.ts';
import { createAdminRouter } from './server/routes/adminRoutes.ts';
import { verifyZoomWebhookSignature } from './server/integrations.ts';
import { processUpcomingClassReminders } from './server/reminders.ts';

const PORT = 3000;

export function createApp(dbPath?: string) {
  const db = initDatabase(dbPath);
  const app = express();

  // Zoom webhook must verify raw body before JSON parsing
  app.post(
    '/api/webhooks/zoom',
    express.raw({ type: 'application/json' }),
    (req, res) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
      let parsed: { event?: string; payload?: { plainToken?: string; object?: { id?: string | number; share_url?: string; recording_files?: Array<{ id?: string; file_type?: string; play_url?: string }> } } };
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
      }

      // Zoom endpoint URL validation challenge
      if (parsed.event === 'endpoint.url_validation' && parsed.payload?.plainToken) {
        const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '';
        const encryptedToken = crypto
          .createHmac('sha256', secret)
          .update(parsed.payload.plainToken)
          .digest('hex');
        return res.json({
          plainToken: parsed.payload.plainToken,
          encryptedToken,
        });
      }

      const timestamp = req.headers['x-zm-request-timestamp'] as string | undefined;
      const signature = req.headers['x-zm-signature'] as string | undefined;
      if (!verifyZoomWebhookSignature(timestamp, signature, rawBody)) {
        return res.status(401).json({ error: 'Invalid Zoom webhook signature.' });
      }

      if (parsed.event === 'recording.completed' && parsed.payload?.object?.id) {
        const zoomMeetingId = String(parsed.payload.object.id);
        const vm = db
          .prepare(`SELECT class_id FROM video_meetings WHERE external_meeting_id = ?`)
          .get(zoomMeetingId) as { class_id: string } | undefined;

        if (vm) {
          const participant = db
            .prepare(`SELECT student_id FROM class_participants WHERE class_id = ? LIMIT 1`)
            .get(vm.class_id) as { student_id: string } | undefined;

          const mp4 = parsed.payload.object.recording_files?.find((f) => f.file_type === 'MP4');
          db.prepare(
            `INSERT INTO recordings (id, class_id, student_id, provider, external_recording_id, playback_url, status)
             VALUES (?, ?, ?, 'zoom', ?, ?, 'awaiting_review')`
          ).run(
            newId(),
            vm.class_id,
            participant?.student_id || null,
            mp4?.id || zoomMeetingId,
            parsed.payload.object.share_url || mp4?.play_url || ''
          );
        }
      }

      return res.json({ received: true });
    }
  );

  app.use(express.json({ limit: '20mb' }));

  app.use('/api', createPublicAndAuthRouter(db));
  app.use('/api', createPortalRouter(db));
  app.use('/api/admin', createAdminRouter(db));

  return { app, db };
}

async function startServer() {
  const { app, db } = createApp();
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const idx = path.join(distDir, 'index.html');
      if (fs.existsSync(idx)) return res.sendFile(idx);
      return res.status(404).send('Build not found');
    });
  }

  // Run automatic 24h / 1h / 15m class reminder scheduler on boot and every 60 seconds
  processUpcomingClassReminders(db).catch(() => {});
  setInterval(() => {
    processUpcomingClassReminders(db).catch(() => {});
  }, 60_000);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Jey Learning Hub server listening on http://localhost:${PORT}`);
  });
}

// Only auto-start HTTP server when run directly (not imported by Vitest)
const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
if (!isTestEnv) {
  startServer().catch((err) => {
    console.error('Failed to start Jey Learning Hub server:', err);
    process.exit(1);
  });
}
