# Palo Alto Badminton Stringing

Full-stack site for a badminton restringing service: public marketing page, customer order form, and a secured admin panel for managing orders and admin users. **Ready to deploy on Vercel.**

## Stack

- **Backend**: Node.js + Express, Postgres (Neon on Vercel; any Postgres works)
- **Frontend**: plain HTML/CSS/JS, served static
- **Auth**: email + password (bcrypt), httpOnly `SameSite=Strict` session cookies
- **Security**: helmet CSP headers, rate limiting on order submission and login, honeypot spam field, server-side validation, parameterized SQL, role-based access (owner vs admin), no public signup

## Deploy to Vercel

1. **Push this repo to GitHub**, then import it at [vercel.com/new](https://vercel.com/new). Framework preset: **Other**. No build command needed.
2. **Create the database**: in your Vercel project → **Storage** tab → **Create Database** → **Neon** (free tier). This automatically adds `DATABASE_URL` to your project's environment variables.
3. **Deploy** (or redeploy if you created the DB after the first deploy so the env var is picked up).
4. **Create your owner account** from your machine:
   ```bash
   # copy DATABASE_URL from Vercel → Project → Settings → Environment Variables into .env
   cp .env.example .env   # then paste your real DATABASE_URL
   npm install
   npm run create-admin   # prompts for email / name / password
   ```
5. Visit `https://your-project.vercel.app/admin`, sign in — done. Add more admins from the panel itself.

Tables are created automatically on first request — no migration step to run.

## Local development

```bash
npm install
cp .env.example .env        # paste your Neon DATABASE_URL (Neon works fine for local dev)
npm run create-admin        # first (owner) account
npm run dev                 # http://localhost:3000
```

No database yet? `PGMEM=1 npm run dev` runs against a throwaway in-memory Postgres (`npm i --no-save pg-mem` first; data lost on restart).

## Pages

| URL | What |
|---|---|
| `/` | Public homepage (pricing, guide, reviews) |
| `/order` | Customer booking form → saves to database |
| `/login` | Admin sign-in (noindex, also linked as "Staff" in the footer) |
| `/admin` | Order dashboard — stats, status workflow, search/filter, CSV export (requires sign-in) |

## Admin users

- The **owner** (first account, created via `npm run create-admin`) manages other admins from the bottom of `/admin`: add with name/email/password, remove with one click.
- Regular **admins** can view, filter, update status, delete orders, and export CSV — but not manage users.
- There is no public signup route.

## API overview

| Method | Route | Auth |
|---|---|---|
| POST | `/api/orders` | public (rate-limited: 10/hr/IP, honeypot) |
| POST | `/api/auth/login` | public (rate-limited: 10 / 15 min) |
| POST | `/api/auth/logout` | — |
| GET | `/api/auth/me` | session |
| GET | `/api/admin/orders` | admin |
| PATCH | `/api/admin/orders/:id` | admin (status change) |
| DELETE | `/api/admin/orders/:id` | admin |
| GET | `/api/admin/orders.csv` | admin |
| GET / POST / DELETE | `/api/admin/users` | owner only |

## Project layout

```
api/index.js        Vercel serverless entry (exports the Express app)
server/app.js       Express app: API routes, auth redirects, static serving
server/index.js     Local long-running entry (npm run dev / start)
server/db.js        Postgres pool + auto-migration
server/auth.js      Sessions, password hashing, auth middleware
scripts/create-admin.js   CLI to create the first (owner) account
public/             Static frontend (home, order form, login, admin panel)
vercel.json         Rewrites /api/*, /admin, /login to the function
```
