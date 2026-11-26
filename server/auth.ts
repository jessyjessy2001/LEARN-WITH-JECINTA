import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Request, Response, NextFunction } from 'express';
import { newId } from './db.ts';

export type UserRole = 'admin' | 'teacher' | 'parent' | 'student';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string;
  country: string;
  timezone: string;
  teacher_id?: string;
  parent_id?: string;
  student_id?: string;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  sessionToken?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(keyBuf, derived);
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function createSession(db: DatabaseSync, userId: string): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`).run(
    newId(),
    userId,
    tokenHash,
    expiresAt
  );
  return rawToken;
}

export function hydrateAuthUser(db: DatabaseSync, profileId: string): AuthUser | null {
  const row = db
    .prepare(
      `SELECT id, email, full_name, role, phone, country, timezone, is_active FROM profiles WHERE id = ?`
    )
    .get(profileId) as
    | {
        id: string;
        email: string;
        full_name: string;
        role: UserRole;
        phone: string;
        country: string;
        timezone: string;
        is_active: number;
      }
    | undefined;

  if (!row || !row.is_active) return null;

  const user: AuthUser = {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    phone: row.phone || '',
    country: row.country || 'Kenya',
    timezone: row.timezone || 'Africa/Nairobi',
  };

  if (row.role === 'admin' || row.role === 'teacher') {
    const t = db.prepare(`SELECT id FROM teachers WHERE profile_id = ?`).get(row.id) as { id: string } | undefined;
    if (t) user.teacher_id = t.id;
  }
  if (row.role === 'parent') {
    const p = db.prepare(`SELECT id FROM parents WHERE profile_id = ?`).get(row.id) as { id: string } | undefined;
    if (p) user.parent_id = p.id;
  }
  if (row.role === 'student') {
    const s = db.prepare(`SELECT id FROM students WHERE profile_id = ?`).get(row.id) as { id: string } | undefined;
    if (s) user.student_id = s.id;
    const linkedParent = db
      .prepare(`SELECT id FROM parents WHERE profile_id = ?`)
      .get(row.id) as { id: string } | undefined;
    if (linkedParent) user.parent_id = linkedParent.id;
  }

  return user;
}

export function resolveSessionUser(db: DatabaseSync, authHeader?: string): AuthUser | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const sess = db
    .prepare(`SELECT user_id, expires_at FROM sessions WHERE token_hash = ?`)
    .get(tokenHash) as { user_id: string; expires_at: string } | undefined;

  if (!sess) return null;
  if (new Date(sess.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
    return null;
  }
  return hydrateAuthUser(db, sess.user_id);
}

export function requireAuth(db: DatabaseSync) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const user = resolveSessionUser(db, req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }
    req.user = user;
    req.sessionToken = req.headers.authorization?.slice(7).trim();
    return next();
  };
}

export function requireRoles(roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

export function logAudit(
  db: DatabaseSync,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {}
) {
  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(newId(), actorId, action, entityType, entityId, JSON.stringify(details));
}

export function isAdminBootstrapNeeded(db: DatabaseSync): boolean {
  if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0) {
    return false;
  }
  const admin = db
    .prepare(`SELECT password_hash FROM profiles WHERE role = 'admin' LIMIT 1`)
    .get() as { password_hash: string | null } | undefined;
  return !admin || !admin.password_hash;
}
