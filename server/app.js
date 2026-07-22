import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, ensureMigrated } from './db.js';
import {
  attachUser, requireAuth, requireOwner,
  hashPassword, verifyPassword,
  createSession, destroySession,
  sessionCookieHeader
} from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

export const app = express();
app.disable('x-powered-by');
if (IS_PROD) app.set('trust proxy', 1); // behind Vercel / a reverse proxy

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '32kb' }));
app.use(ensureMigrated);
app.use(attachUser);

// ---------- rate limits ----------
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions — please try again later or DM us on Instagram.' }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts — try again in 15 minutes.' }
});

// ---------- validation helpers ----------
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const oneOf = (v, opts, fallback = null) => (opts.includes(v) ? v : fallback);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function computeTotal(providingString, grip, cushion) {
  const stringPrice = providingString === 'yes' ? 15 : 25;
  return stringPrice + (grip === 'we' ? 2 : 0) + (cushion === 'we' ? 3 : 0);
}

// ---------- public API ----------
app.post('/api/orders', orderLimiter, wrap(async (req, res) => {
  const b = req.body || {};

  // Honeypot: real form never fills "website"
  if (b.website) return res.json({ ok: true });

  const name = str(b.name, 120);
  const contact = str(b.contact, 200);
  const racketModel = str(b.racketModel, 200);
  const providingString = oneOf(b.providingString, ['yes', 'no']);
  const tension = str(b.tension, 60);
  const grip = oneOf(b.grip, ['none', 'we', 'own'], 'none');
  const cushion = oneOf(b.cushion, ['none', 'we', 'own'], 'none');
  const dropoff = str(b.dropoff, 300);
  const dateNeeded = str(b.dateNeeded, 20);
  const specialRequests = str(b.specialRequests, 1000);

  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!contact) return res.status(400).json({ error: 'Please enter a way to reach you.' });
  if (!racketModel) return res.status(400).json({ error: 'Please enter your racket model.' });
  if (!providingString) return res.status(400).json({ error: 'Please tell us if you’re providing string.' });
  if (!tension) return res.status(400).json({ error: 'Please pick a tension.' });

  const total = computeTotal(providingString, grip, cushion);
  const { rows } = await q(`
    INSERT INTO orders (name, contact, racket_model, providing_string, tension, grip, cushion,
                        dropoff, date_needed, special_requests, total)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id
  `, [name, contact, racketModel, providingString, tension, grip, cushion,
      dropoff, dateNeeded, specialRequests, total]);

  res.status(201).json({ ok: true, id: rows[0].id, total });
}));

// ---------- auth API ----------
app.post('/api/auth/login', loginLimiter, wrap(async (req, res) => {
  const email = str(req.body?.email, 200).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const { rows } = email
    ? await q('SELECT * FROM users WHERE LOWER(email) = $1', [email])
    : { rows: [] };
  const user = rows[0];

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const session = await createSession(user.id);
  res.setHeader('Set-Cookie', sessionCookieHeader(session.id, 60 * 60 * 24 * 7, IS_PROD));
  res.json({ ok: true, user: { email: user.email, name: user.name, role: user.role } });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  if (req.sessionId) await destroySession(req.sessionId);
  res.setHeader('Set-Cookie', sessionCookieHeader('', 0, IS_PROD));
  res.json({ ok: true });
}));

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role } });
});

// ---------- admin API (orders) ----------
app.get('/api/admin/orders', requireAuth, wrap(async (_req, res) => {
  const { rows } = await q('SELECT * FROM orders ORDER BY created_at DESC, id DESC');
  res.json({ orders: rows });
}));

app.patch('/api/admin/orders/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const status = oneOf(req.body?.status, ['pending', 'in_progress', 'ready', 'completed']);
  if (!Number.isInteger(id) || !status) return res.status(400).json({ error: 'Invalid request' });
  const r = await q('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Order not found' });
  res.json({ ok: true });
}));

app.delete('/api/admin/orders/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid request' });
  const r = await q('DELETE FROM orders WHERE id = $1', [id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Order not found' });
  res.json({ ok: true });
}));

app.get('/api/admin/orders.csv', requireAuth, wrap(async (_req, res) => {
  const { rows } = await q('SELECT * FROM orders ORDER BY created_at DESC');
  const header = ['Name','Contact','Racket','Tension','String','Grip','Cushion','Total','Status','Dropoff','Needed by','Notes','Submitted'];
  const esc = (c) => '"' + String(c ?? '').replace(/"/g, '""') + '"';
  const lines = [header.map(esc).join(',')];
  for (const o of rows) {
    lines.push([
      o.name, o.contact, o.racket_model, o.tension,
      o.providing_string === 'yes' ? 'customer' : 'ours',
      o.grip, o.cushion, o.total, o.status, o.dropoff, o.date_needed,
      o.special_requests, new Date(Number(o.created_at) * 1000).toISOString()
    ].map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(lines.join('\n'));
}));

// ---------- admin API (user management, owner only) ----------
app.get('/api/admin/users', requireOwner, wrap(async (_req, res) => {
  const { rows } = await q('SELECT id, email, name, role, created_at FROM users ORDER BY created_at');
  res.json({ users: rows });
}));

app.post('/api/admin/users', requireOwner, wrap(async (req, res) => {
  const email = str(req.body?.email, 200).toLowerCase();
  const name = str(req.body?.name, 120);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (!name) return res.status(400).json({ error: 'Enter a name.' });
  if (password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters.' });
  try {
    const { rows } = await q(
      'INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id',
      [email, name, hashPassword(password), 'admin']
    );
    res.status(201).json({ ok: true, id: rows[0].id });
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'That email already has an account.' });
    throw e;
  }
}));

app.delete('/api/admin/users/:id', requireOwner, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid request' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  const { rows } = await q('SELECT role FROM users WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  if (rows[0].role === 'owner') return res.status(400).json({ error: 'The owner account cannot be deleted.' });
  await q('DELETE FROM users WHERE id = $1', [id]); // sessions cascade
  res.json({ ok: true });
}));

// ---------- page-level auth redirects ----------
app.get(['/admin', '/admin.html'], (req, res, next) => {
  if (!req.user) return res.redirect('/login');
  next();
});
app.get(['/login', '/login.html'], (req, res, next) => {
  if (req.user) return res.redirect('/admin');
  next();
});

// ---------- static frontend ----------
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// 404 for unknown API routes as JSON
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// error handler: never leak internals
app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong on our end — please try again.' });
});
