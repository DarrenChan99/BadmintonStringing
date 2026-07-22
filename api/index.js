// Vercel serverless entry — the whole Express app runs as one function.
// Static files in /public are served by Vercel's CDN directly (see vercel.json);
// this function handles /api/*, /admin, and /login redirects.
import { app } from '../server/app.js';

export default app;
