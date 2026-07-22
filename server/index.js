// Local / long-running server entry (npm run dev, npm start).
// On Vercel, api/index.js is the entry instead.
import './env.js';
import { app } from './app.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Palo Alto Badminton Stringing running on http://localhost:${PORT}`);
});
