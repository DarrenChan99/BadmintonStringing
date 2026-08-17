import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
  message: { error: 'Too many submissions - please try again later or DM us on Instagram.' }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts - try again in 15 minutes.' }
});

// ---------- validation helpers ----------
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const oneOf = (v, opts, fallback = null) => (opts.includes(v) ? v : fallback);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function computeTotal(providingString, grip, cushion) {
  const stringPrice = providingString === 'yes' ? 15 : 25;
  return stringPrice + (grip === 'we' ? 2 : 0) + (cushion === 'we' ? 3 : 0);
}

/** The racket lifecycle, in order. Mirrored by the CHECK constraint in db.js. */
export const STATUSES = ['pending_pickup', 'received', 'stringing', 'ready', 'returned'];

const MAX_RACKETS = 8;

/**
 * Validate one racket of a submission.
 * `stock` is a Set of in-stock string names (only consulted when we supply the string).
 * Returns { racket } or { error }.
 */
export function validateRacket(r, stock) {
  const racketModel = str(r?.racketModel, 200);
  const providingString = oneOf(r?.providingString, ['yes', 'no']);
  const stringChoice = str(r?.stringChoice, 100);
  const tension = str(r?.tension, 60);
  const grip = oneOf(r?.grip, ['none', 'we', 'own'], 'none');
  const cushion = oneOf(r?.cushion, ['none', 'we', 'own'], 'none');

  if (!racketModel) return { error: 'Please enter your racket model.' };
  if (!providingString) return { error: 'Please tell us if you’re providing string.' };
  if (!tension) return { error: 'Please pick a tension.' };
  if (providingString === 'yes') {
    if (!stringChoice) return { error: 'Please tell us which string you have.' };
  } else {
    if (!stringChoice) return { error: 'Please pick which string you would like.' };
    if (!stock.has(stringChoice)) return { error: 'That string is not currently in stock. Please pick another.' };
  }

  return {
    racket: {
      racketModel, providingString, stringChoice, tension, grip, cushion,
      total: computeTotal(providingString, grip, cushion)
    }
  };
}

// ---------- public API ----------
app.post('/api/orders', orderLimiter, wrap(async (req, res) => {
  const b = req.body || {};

  // Honeypot: real form never fills "website"
  if (b.website) return res.json({ ok: true });

  const name = str(b.name, 120);
  const contact = str(b.contact, 200);
  const dropoff = str(b.dropoff, 300);
  const dateNeeded = str(b.dateNeeded, 20);
  const specialRequests = str(b.specialRequests, 1000);

  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!contact) return res.status(400).json({ error: 'Please enter a way to reach you.' });

  // A submission carries one or more rackets. Older clients post a single racket at the top level.
  const submitted = Array.isArray(b.rackets) ? b.rackets : [b];
  if (!submitted.length) return res.status(400).json({ error: 'Please add at least one racket.' });
  if (submitted.length > MAX_RACKETS) {
    return res.status(400).json({ error: `Please submit at most ${MAX_RACKETS} rackets at a time.` });
  }

  const { rows: stockRows } = await q('SELECT name FROM string_stock WHERE in_stock = TRUE');
  const stock = new Set(stockRows.map((s) => s.name));

  const rackets = [];
  for (const [i, r] of submitted.entries()) {
    const { racket, error } = validateRacket(r, stock);
    if (error) {
      return res.status(400).json({ error: submitted.length > 1 ? `Racket ${i + 1}: ${error}` : error });
    }
    rackets.push(racket);
  }

  // One multi-row INSERT so a batch can never land half-written.
  const batchId = randomUUID();
  const cols = 13;
  const values = rackets.flatMap((r) => [
    name, contact, r.racketModel, r.providingString, r.stringChoice, r.tension, r.grip, r.cushion,
    dropoff, dateNeeded, specialRequests, r.total, batchId
  ]);
  const placeholders = rackets
    .map((_, i) => '(' + Array.from({ length: cols }, (_, c) => `$${i * cols + c + 1}`).join(',') + ')')
    .join(',');

  const { rows } = await q(`
    INSERT INTO orders (name, contact, racket_model, providing_string, string_choice, tension, grip, cushion,
                        dropoff, date_needed, special_requests, total, batch_id)
    VALUES ${placeholders} RETURNING id
  `, values);

  const total = rackets.reduce((sum, r) => sum + r.total, 0);
  res.status(201).json({ ok: true, ids: rows.map((r) => r.id), id: rows[0].id, total });
}));

app.get('/api/string-stock', wrap(async (_req, res) => {
  const { rows } = await q('SELECT name, description FROM string_stock WHERE in_stock = TRUE ORDER BY name');
  res.json({ strings: rows });
}));

app.get('/api/banner', wrap(async (req, res) => {
  const page = oneOf(req.query.page, ['home', 'booking'], 'home');
  const col = page === 'booking' ? 'show_booking' : 'show_home';
  const { rows } = await q(`SELECT message FROM banners WHERE active = TRUE AND ${col} = TRUE LIMIT 1`);
  res.json({ message: rows[0]?.message || null });
}));

// ---------- auth API ----------
app.post('/api/auth/login', loginLimiter, wrap(async (req, res) => {
  const username = str(req.body?.username, 200).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const { rows } = username
    ? await q('SELECT * FROM users WHERE LOWER(username) = $1', [username])
    : { rows: [] };
  const user = rows[0];

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const session = await createSession(user.id);
  res.setHeader('Set-Cookie', sessionCookieHeader(session.id, 60 * 60 * 24 * 7, IS_PROD));
  res.json({ ok: true, user: { username: user.username, name: user.name, role: user.role } });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  if (req.sessionId) await destroySession(req.sessionId);
  res.setHeader('Set-Cookie', sessionCookieHeader('', 0, IS_PROD));
  res.json({ ok: true });
}));

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: { id: req.user.id, username: req.user.username, name: req.user.name, role: req.user.role } });
});

// ---------- admin API (orders) ----------
app.get('/api/admin/orders', requireAuth, wrap(async (_req, res) => {
  const { rows } = await q('SELECT * FROM orders ORDER BY created_at DESC, id DESC');
  res.json({ orders: rows });
}));

app.patch('/api/admin/orders/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const status = oneOf(req.body?.status, STATUSES);
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
  const { rows } = await q('SELECT * FROM orders ORDER BY created_at DESC, batch_id, id');
  const header = ['Batch','Name','Contact','Racket','Tension','String','String choice','Grip','Cushion','Total','Status','Dropoff','Needed by','Notes','Submitted'];
  const esc = (c) => '"' + String(c ?? '').replace(/"/g, '""') + '"';
  const pad = (n) => String(n).padStart(2, '0');
  // dd/mm/yy - always include the year in exports so old spreadsheets stay unambiguous
  const fmtStamp = (unixSeconds) => {
    const d = new Date(Number(unixSeconds) * 1000);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  // "2026-07-25" -> "25/07/26"; free text passes through untouched
  const fmtNeeded = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    return m ? `${m[3]}/${m[2]}/${m[1].slice(-2)}` : v;
  };
  const lines = [header.map(esc).join(',')];
  for (const o of rows) {
    lines.push([
      (o.batch_id || '').slice(0, 8), // short enough to eyeball, still groups a batch together
      o.name, o.contact, o.racket_model, o.tension,
      o.providing_string === 'yes' ? 'customer' : 'ours',
      o.string_choice,
      o.grip, o.cushion, o.total, o.status, o.dropoff, fmtNeeded(o.date_needed),
      o.special_requests, fmtStamp(o.created_at)
    ].map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(lines.join('\n'));
}));

// ---------- admin API (string stock) ----------
app.get('/api/admin/string-stock', requireAuth, wrap(async (_req, res) => {
  const { rows } = await q('SELECT * FROM string_stock ORDER BY name');
  res.json({ strings: rows });
}));

app.post('/api/admin/string-stock', requireAuth, wrap(async (req, res) => {
  const name = str(req.body?.name, 100);
  const description = str(req.body?.description, 300);
  if (!name) return res.status(400).json({ error: 'Enter a string name.' });
  try {
    const { rows } = await q(
      'INSERT INTO string_stock (name, description) VALUES ($1,$2) RETURNING *',
      [name, description]
    );
    res.status(201).json({ ok: true, string: rows[0] });
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'That string is already on the list.' });
    throw e;
  }
}));

app.patch('/api/admin/string-stock/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid request' });

  const sets = [];
  const params = [];
  if (typeof req.body?.inStock === 'boolean') {
    params.push(req.body.inStock);
    sets.push(`in_stock = $${params.length}`);
  }
  if (typeof req.body?.name === 'string') {
    const name = str(req.body.name, 100);
    if (!name) return res.status(400).json({ error: 'Enter a string name.' });
    params.push(name);
    sets.push(`name = $${params.length}`);
  }
  if (typeof req.body?.description === 'string') {
    params.push(str(req.body.description, 300));
    sets.push(`description = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Invalid request' });

  params.push(id);
  let r;
  try {
    r = await q(`UPDATE string_stock SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'That string is already on the list.' });
    throw e;
  }
  if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

app.delete('/api/admin/string-stock/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid request' });
  const r = await q('DELETE FROM string_stock WHERE id = $1', [id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

// ---------- admin API (banners) ----------
app.get('/api/admin/banners', requireAuth, wrap(async (_req, res) => {
  const { rows } = await q('SELECT * FROM banners ORDER BY created_at DESC');
  res.json({ banners: rows });
}));

app.post('/api/admin/banners', requireAuth, wrap(async (req, res) => {
  const message = str(req.body?.message, 300);
  const active = req.body?.active === true;
  const showHome = req.body?.showHome !== false;
  const showBooking = req.body?.showBooking !== false;
  if (!message) return res.status(400).json({ error: 'Enter a banner message.' });
  if (active) await q('UPDATE banners SET active = FALSE WHERE active = TRUE');
  const { rows } = await q(
    'INSERT INTO banners (message, active, show_home, show_booking) VALUES ($1,$2,$3,$4) RETURNING *',
    [message, active, showHome, showBooking]
  );
  res.status(201).json({ ok: true, banner: rows[0] });
}));

app.patch('/api/admin/banners/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid request' });

  const sets = [];
  const params = [];
  if (typeof req.body?.message === 'string') {
    const message = str(req.body.message, 300);
    if (!message) return res.status(400).json({ error: 'Enter a banner message.' });
    params.push(message);
    sets.push(`message = $${params.length}`);
  }
  if (typeof req.body?.active === 'boolean') {
    if (req.body.active) await q('UPDATE banners SET active = FALSE WHERE active = TRUE AND id != $1', [id]);
    params.push(req.body.active);
    sets.push(`active = $${params.length}`);
  }
  if (typeof req.body?.showHome === 'boolean') {
    params.push(req.body.showHome);
    sets.push(`show_home = $${params.length}`);
  }
  if (typeof req.body?.showBooking === 'boolean') {
    params.push(req.body.showBooking);
    sets.push(`show_booking = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Invalid request' });

  params.push(id);
  const r = await q(`UPDATE banners SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

app.delete('/api/admin/banners/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid request' });
  const r = await q('DELETE FROM banners WHERE id = $1', [id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

// ---------- admin API (user management, owner only) ----------
app.get('/api/admin/users', requireOwner, wrap(async (_req, res) => {
  const { rows } = await q('SELECT id, username, name, role, created_at FROM users ORDER BY created_at');
  res.json({ users: rows });
}));

app.post('/api/admin/users', requireOwner, wrap(async (req, res) => {
  const username = str(req.body?.username, 200).toLowerCase();
  const name = str(req.body?.name, 120);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!/^[a-z0-9._@-]{3,}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be at least 3 characters: letters, numbers, . _ - @ only.' });
  }
  if (!name) return res.status(400).json({ error: 'Enter a name.' });
  if (password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters.' });
  try {
    const { rows } = await q(
      'INSERT INTO users (username, name, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id',
      [username, name, hashPassword(password), 'admin']
    );
    res.status(201).json({ ok: true, id: rows[0].id });
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'That username is already taken.' });
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
  res.status(500).json({ error: 'Something went wrong on our end - please try again.' });
});
