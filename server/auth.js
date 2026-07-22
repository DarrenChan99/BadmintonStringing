import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { q } from './db.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const SESSION_COOKIE = 'pabs_session';

export function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export async function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await q('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [id, userId, expiresAt]);
  return { id, expiresAt };
}

export async function destroySession(id) {
  await q('DELETE FROM sessions WHERE id = $1', [id]);
}

export async function getSessionUser(sessionId) {
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length !== 64) return null;
  const { rows } = await q(`
    SELECT u.id, u.email, u.name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = $1 AND s.expires_at > EXTRACT(EPOCH FROM NOW())
  `, [sessionId]);
  return rows[0] || null;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookieHeader(id, maxAgeSeconds, secure) {
  const attrs = [
    `${SESSION_COOKIE}=${id}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

/** Express middleware: attaches req.user if a valid session cookie is present. */
export async function attachUser(req, _res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    req.sessionId = cookies[SESSION_COOKIE] || null;
    req.user = await getSessionUser(req.sessionId);
    next();
  } catch (e) {
    next(e);
  }
}

/** Require a logged-in admin (any role). */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  next();
}

/** Require the owner role (user management). */
export function requireOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner access required' });
  next();
}
