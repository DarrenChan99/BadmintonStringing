// Postgres (Neon) — works on Vercel serverless and locally.
// Set DATABASE_URL (Neon connection string, or any Postgres).
import pg from 'pg';

let pool;
if (process.env.PGMEM === '1') {
  // Dev/test only: in-memory Postgres emulator, data lost on exit.
  // Run with:  PGMEM=1 npm run dev   (requires `npm i --no-save pg-mem`)
  const { newDb } = await import('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  pool = new Pool();
} else {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Create a Neon Postgres database (Vercel → Storage → Neon) ' +
      'and set DATABASE_URL in your environment / .env. (Or PGMEM=1 for a throwaway in-memory DB.)'
    );
  }
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon requires TLS; local Postgres usually doesn't.
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
    max: 3 // serverless-friendly: keep the pool tiny per function instance
  });
}
export { pool };

export const q = (text, params) => pool.query(text, params);

let migrated = null;
export function migrate() {
  if (!migrated) {
    migrated = pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner','admin')),
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        expires_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        contact TEXT NOT NULL,
        racket_model TEXT NOT NULL,
        providing_string TEXT NOT NULL CHECK (providing_string IN ('yes','no')),
        tension TEXT NOT NULL,
        grip TEXT NOT NULL DEFAULT 'none' CHECK (grip IN ('none','we','own')),
        cushion TEXT NOT NULL DEFAULT 'none' CHECK (cushion IN ('none','we','own')),
        dropoff TEXT NOT NULL DEFAULT '',
        date_needed TEXT NOT NULL DEFAULT '',
        special_requests TEXT NOT NULL DEFAULT '',
        total INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','ready','completed')),
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    `);
  }
  return migrated;
}

/** Express middleware: ensure the schema exists before handling any request. */
export function ensureMigrated(_req, _res, next) {
  migrate().then(() => next(), next);
}
