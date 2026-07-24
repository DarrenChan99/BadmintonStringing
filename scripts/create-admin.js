// Create the first owner account (or additional accounts) from the CLI.
// Interactive:      npm run create-admin
// Non-interactive:  npm run create-admin -- <username> <name> <password>
// Requires DATABASE_URL (reads .env automatically if present).
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import '../server/env.js';
import { q, migrate, pool } from '../server/db.js';
import { hashPassword } from '../server/auth.js';

let [username, name, password] = process.argv.slice(2);

if (!username || !name || !password) {
  if (stdin.isTTY) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    username = (await rl.question('Username: ')).trim();
    name = (await rl.question('Name: ')).trim();
    password = await rl.question('Password (min 10 chars): ');
    rl.close();
  } else {
    // Piped input: one value per line (username, name, password)
    let buf = '';
    for await (const chunk of stdin) buf += chunk;
    [username = '', name = '', password = ''] = buf.split('\n');
  }
}

username = username.trim().toLowerCase();
name = name.trim();

if (!/^[a-z0-9._@-]{3,}$/.test(username)) {
  console.error('Username must be at least 3 characters: letters, numbers, . _ - @ only.');
  process.exit(1);
}
if (!name) { console.error('Name required.'); process.exit(1); }
if (password.length < 10) { console.error('Password too short (min 10 characters).'); process.exit(1); }

await migrate();
const ownerExists = (await q("SELECT 1 FROM users WHERE role = 'owner'")).rows[0];
const role = ownerExists ? 'admin' : 'owner';

try {
  await q('INSERT INTO users (username, name, password_hash, role) VALUES ($1,$2,$3,$4)',
    [username, name, hashPassword(password), role]);
  console.log(`Created ${role} account for ${username}.`);
  if (role === 'owner') console.log('This is the owner account — it can add/remove other admins from the admin panel.');
} catch (e) {
  if (e?.code === '23505') console.error('That username is already taken.');
  else console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
