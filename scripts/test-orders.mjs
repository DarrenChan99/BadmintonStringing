// Self-check for order pricing, racket validation and the status list.
// Run: node scripts/test-orders.mjs
// A dummy DATABASE_URL keeps db.js from throwing at import; the pool is lazy so nothing connects.
// (dynamic import - static imports are hoisted above the assignment)
process.env.DATABASE_URL ||= 'postgres://user:pass@localhost:5432/unused';

import assert from 'node:assert/strict';
const { computeTotal, validateRacket, STATUSES } = await import('../server/app.js');

const stock = new Set(['BG65', 'Aerobite']);
const ok = (over = {}) => ({ racketModel: 'Astrox 88D', providingString: 'no', stringChoice: 'BG65', tension: '24 lb', ...over });

// --- pricing ---
assert.equal(computeTotal('yes', 'none', 'none'), 15, 'own string');
assert.equal(computeTotal('no', 'none', 'none'), 25, 'our string');
assert.equal(computeTotal('no', 'we', 'none'), 27, '+ grip');
assert.equal(computeTotal('no', 'none', 'we'), 28, '+ cushion');
assert.equal(computeTotal('yes', 'we', 'we'), 20, 'own string + both');
assert.equal(computeTotal('no', 'own', 'own'), 25, 'customer-supplied grip/wrap are free');

// --- validation ---
assert.equal(validateRacket(ok({ racketModel: '' }), stock).error, 'Please enter your racket model.');
assert.equal(validateRacket(ok({ tension: '' }), stock).error, 'Please pick a tension.');
assert.equal(validateRacket(ok({ providingString: '' }), stock).error, 'Please tell us if you’re providing string.');
assert.equal(validateRacket(ok({ providingString: 'yes', stringChoice: '' }), stock).error, 'Please tell us which string you have.');
assert.equal(validateRacket(ok({ stringChoice: '' }), stock).error, 'Please pick which string you would like.');
assert.match(validateRacket(ok({ stringChoice: 'Discontinued' }), stock).error, /not currently in stock/);
// Own string is free text - it is not checked against our stock list.
assert.ok(validateRacket(ok({ providingString: 'yes', stringChoice: 'Whatever I have' }), stock).racket);

const valid = validateRacket(ok({ grip: 'we' }), stock).racket;
assert.equal(valid.total, 27);
assert.equal(valid.racketModel, 'Astrox 88D');
assert.equal(valid.cushion, 'none', 'cushion defaults to none');

// --- batch total = sum of per-racket totals ---
const batch = [
  ok(),                                                              // 25
  ok({ providingString: 'yes', stringChoice: 'Aerobite', grip: 'we' }), // 15 + 2
  ok({ stringChoice: 'Aerobite', cushion: 'we' })                    // 25 + 3
].map((r) => validateRacket(r, stock).racket);
assert.equal(batch.reduce((s, r) => s + r.total, 0), 70);

// --- statuses ---
assert.deepEqual(STATUSES, ['pending_pickup', 'received', 'stringing', 'ready', 'returned']);

console.log('ok - all order checks passed');
