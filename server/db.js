// Postgres (Neon) - works on Vercel serverless and locally.
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
        username TEXT NOT NULL UNIQUE,
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
        string_choice TEXT NOT NULL DEFAULT '',
        tension TEXT NOT NULL,
        grip TEXT NOT NULL DEFAULT 'none' CHECK (grip IN ('none','we','own')),
        cushion TEXT NOT NULL DEFAULT 'none' CHECK (cushion IN ('none','we','own')),
        cushion_layers INTEGER NOT NULL DEFAULT 0 CHECK (cushion_layers IN (0,2,3,4)),
        dropoff TEXT NOT NULL DEFAULT '',
        date_needed TEXT NOT NULL DEFAULT '',
        special_requests TEXT NOT NULL DEFAULT '',
        total INTEGER NOT NULL,
        batch_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending_pickup'
          CHECK (status IN ('pending_pickup','received','stringing','ready','returned')),
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      );

      CREATE TABLE IF NOT EXISTS string_stock (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        in_stock BOOLEAN NOT NULL DEFAULT TRUE,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      );

      ALTER TABLE string_stock ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS string_choice TEXT NOT NULL DEFAULT '';

      -- Rackets submitted together share a batch_id; '' means a legacy standalone racket.
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS batch_id TEXT NOT NULL DEFAULT '';

      -- How many layers of cushion wrap; 0 when no wrap is being applied.
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS cushion_layers INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_cushion_layers_check;
      ALTER TABLE orders ADD CONSTRAINT orders_cushion_layers_check CHECK (cushion_layers IN (0,2,3,4));

      -- Four-stage statuses -> five-stage pipeline. Drop the default before rewriting,
      -- re-add after the new CHECK, or the old 'pending' default fails the new constraint.
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
      ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
      UPDATE orders SET status = CASE status
        WHEN 'pending'     THEN 'pending_pickup'
        WHEN 'in_progress' THEN 'stringing'
        WHEN 'completed'   THEN 'returned'
        ELSE status END;
      ALTER TABLE orders ADD CONSTRAINT orders_status_check
        CHECK (status IN ('pending_pickup','received','stringing','ready','returned'));
      ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending_pickup';

      CREATE TABLE IF NOT EXISTS banners (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT FALSE,
        show_home BOOLEAN NOT NULL DEFAULT TRUE,
        show_booking BOOLEAN NOT NULL DEFAULT TRUE,
        created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_banner ON banners(active) WHERE active;

      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_batch ON orders(batch_id);
    `).then(() =>
      // Migrate databases created before the email -> username rename.
      // 42703 = no such column, i.e. already migrated or freshly created.
      pool.query('ALTER TABLE users RENAME COLUMN email TO username')
        .catch((e) => { if (e?.code !== '42703') throw e; })
    );
  }
  return migrated;
}

/** Express middleware: ensure the schema exists before handling any request. */
export function ensureMigrated(_req, _res, next) {
  migrate().then(() => next(), next);
}
