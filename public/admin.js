'use strict';

let me = null;
let orders = [];
let filter = 'all';
let search = '';

const $ = (id) => document.getElementById(id);

// The racket lifecycle, in order. `short` is what fits on a chip.
const STATUS_META = {
  pending_pickup: { label: 'Pending pickup',       short: 'Pickup',    color: '#8a5a1a',            bg: 'rgba(200,140,20,0.14)', chip: '#8a5a1a' },
  received:       { label: 'Racket received',      short: 'Received',  color: '#4a6b2a',            bg: 'rgba(120,160,60,0.16)', chip: '#4a6b2a' },
  stringing:      { label: 'Stringing in progress', short: 'Stringing', color: '#0F6B3A',           bg: 'rgba(15,107,58,0.12)',  chip: '#0F6B3A' },
  ready:          { label: 'Ready to return',      short: 'Ready',     color: '#0A4B29',            bg: 'rgba(191,227,206,0.6)', chip: '#0A4B29' },
  returned:       { label: 'Returned',             short: 'Returned',  color: 'rgba(26,31,27,0.5)', bg: 'rgba(26,31,27,0.06)',   chip: '#555' }
};
const STATUSES = Object.keys(STATUS_META);

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) { location.href = '/login'; throw new Error('unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// dd/mm, with /yy appended when it's not the current year
function fmtDayMonth(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear() !== new Date().getFullYear() ? '/' + String(d.getFullYear()).slice(-2) : '';
  return `${dd}/${mm}${yy}`;
}

function fmtDate(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return fmtDayMonth(d) + ' ' +
         d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// "2026-07-25" (from <input type=date>) -> "25/07" (or "25/07/27" if another year)
function fmtDateNeeded(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso; // free-text or empty - leave as-is
  const yy = Number(m[1]) !== new Date().getFullYear() ? '/' + m[1].slice(-2) : '';
  return `${m[3]}/${m[2]}${yy}`;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

function renderStats() {
  const countBy = (...st) => orders.filter((o) => st.includes(o.status)).length;
  const stats = [
    ['Total rackets', orders.length, '#fff', '1px solid rgba(15,107,58,0.16)'],
    ['Pending pickup', countBy('pending_pickup'), 'rgba(200,140,20,0.08)', '1px solid rgba(200,140,20,0.25)'],
    ['In shop', countBy('received', 'stringing'), 'rgba(15,107,58,0.08)', '1px solid rgba(15,107,58,0.25)'],
    ['Ready to return', countBy('ready'), 'rgba(15,107,58,0.06)', '1px solid rgba(15,107,58,0.18)'],
    ['Returned', countBy('returned'), 'rgba(26,31,27,0.03)', '1px solid rgba(26,31,27,0.12)']
  ];
  const wrap = $('stats');
  wrap.replaceChildren(...stats.map(([label, value, bg, border]) =>
    el('div', { class: 'stat', style: `background:${bg};border:${border};` },
      el('div', { class: 'label' }, label),
      el('div', { class: 'value' }, String(value)))));
}

async function setStatus(o, key) {
  if (o.status === key) return;
  await api(`/api/admin/orders/${o.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: key })
  });
  o.status = key;
}

/** One status chip. `targets` is every racket it applies to (one racket, or a whole batch). */
function statusChip(targets, key, { active }) {
  const meta = STATUS_META[key];
  const chip = el('div', {
    class: 'schip' + (active ? ' active' : ''),
    style: active ? `background:${meta.chip};border-color:${meta.chip};` : ''
  }, meta.short);
  chip.addEventListener('click', async () => {
    for (const o of targets) await setStatus(o, key);
    render();
  });
  return chip;
}

function statusChips(targets, activeKey) {
  return STATUSES.map((key) => statusChip(targets, key, { active: activeKey === key }));
}

/** Rackets submitted together share a batch_id; legacy rows ('') stand alone. */
function groupBatches(rows) {
  const groups = new Map();
  for (const o of rows) {
    const key = o.batch_id || 'solo-' + o.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  // Batches are listed newest-first, but rackets inside one read in the order submitted.
  return [...groups.values()].map((batch) => batch.sort((a, b) => a.id - b.id));
}

function matches(o, q) {
  if (filter !== 'all' && o.status !== filter) return false;
  if (!q) return true;
  return (o.name || '').toLowerCase().includes(q) ||
         (o.racket_model || '').toLowerCase().includes(q) ||
         (o.contact || '').toLowerCase().includes(q);
}

/** One racket inside a batch card. `dim` marks rackets that don't match the active filter. */
function racketRow(o, dim) {
  const meta = STATUS_META[o.status] || STATUS_META.pending_pickup;
  const supplier = { we: 'ours', own: "customer's" };
  const cushionLabel = o.cushion === 'none'
    ? 'none'
    : `${supplier[o.cushion]} · ${o.cushion_layers || 2} layers`;

  const delBtn = el('button', { class: 'del-btn' }, 'Delete');
  delBtn.addEventListener('click', async () => {
    if (!confirm(`Delete ${o.racket_model} (${o.name})?`)) return;
    await api(`/api/admin/orders/${o.id}`, { method: 'DELETE' });
    orders = orders.filter((x) => x.id !== o.id);
    render();
  });

  return el('div', { class: 'racket' + (dim ? ' dim' : '') },
    el('div', { class: 'r-head' },
      el('span', { class: 'r-id' }, '#' + o.id),
      el('span', { class: 'r-model' }, o.racket_model),
      el('span', { class: 'status-pill', style: `color:${meta.color};background:${meta.bg};` }, meta.label),
      el('span', { class: 'r-cost' }, '$' + o.total)),
    el('div', { class: 'r-grid' },
      el('div', {}, el('div', { class: 'k' }, 'Tension'), el('div', { class: 'v' }, o.tension)),
      el('div', {},
        el('div', { class: 'k' }, 'String'),
        el('div', { class: 'v' }, o.string_choice || 'not specified'),
        el('div', { class: 'sub' }, o.providing_string === 'yes' ? "customer's string" : 'from our stock')),
      el('div', {}, el('div', { class: 'k' }, 'Grip'),
        el('div', { class: 'v' }, o.grip === 'none' ? 'none' : supplier[o.grip])),
      el('div', {}, el('div', { class: 'k' }, 'Cushion wrap'), el('div', { class: 'v' }, cushionLabel))),
    el('div', { class: 'o-actions' }, ...statusChips([o], o.status), delBtn));
}

function batchCard(batch) {
  const q = search.trim().toLowerCase();
  const [first] = batch;
  const total = batch.reduce((sum, o) => sum + o.total, 0);
  // Colour the card by its least-advanced racket - that's the work still to do.
  const cardStatus = STATUSES.find((s) => batch.some((o) => o.status === s)) || 'pending_pickup';
  const allSame = batch.every((o) => o.status === first.status) ? first.status : null;

  return el('div', { class: 'order ' + cardStatus },
    el('div', { class: 'o-head' },
      el('div', {},
        el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap;' },
          el('span', { class: 'o-name' }, first.name),
          batch.length > 1 ? el('span', { class: 'batch-count' }, batch.length + ' rackets') : null),
        el('div', { style: 'font-size:13px;color:rgba(26,31,27,0.55);' },
          `${first.contact} · submitted ${fmtDate(first.created_at)}`)),
      el('div', { class: 'o-total' }, '$' + total)),
    // Batch-level details, always in the same three places so nothing is missed at a glance.
    el('div', { class: 'o-grid' },
      el('div', {}, el('div', { class: 'k' }, 'Needed by'),
        el('div', { class: 'v' }, first.date_needed ? fmtDateNeeded(first.date_needed) : 'not specified')),
      el('div', {}, el('div', { class: 'k' }, 'Drop-off'),
        el('div', { class: 'v' }, first.dropoff || 'not specified')),
      el('div', {}, el('div', { class: 'k' }, 'Notes'),
        el('div', { class: 'v' }, first.special_requests || 'none'))),
    batch.length > 1
      ? el('div', { class: 'set-all' }, el('span', { class: 'k' }, 'Set all'), ...statusChips(batch, allSame))
      : null,
    ...batch.map((o) => racketRow(o, !matches(o, q))));
}

function renderOrders() {
  const q = search.trim().toLowerCase();
  // A batch is shown when any of its rackets matches; the rest stay visible but dimmed,
  // so a card never hides part of a customer's job.
  const visible = groupBatches(orders).filter((batch) => batch.some((o) => matches(o, q)));

  $('empty').classList.toggle('hidden', visible.length > 0);
  $('orders').replaceChildren(...visible.map(batchCard));
}

function render() { renderStats(); renderOrders(); }

// ----- user management (owner only) -----
async function loadUsers() {
  const { users } = await api('/api/admin/users');
  const list = $('userList');
  list.replaceChildren(...users.map((u) => {
    const row = el('div', { class: 'user-row' },
      el('div', {},
        el('span', { style: 'font-weight:600;font-size:14px;' }, u.name + ' '),
        el('span', { style: 'font-size:13px;color:rgba(26,31,27,0.55);' }, u.username),
        u.role === 'owner' ? el('span', { class: 'badge', style: 'margin-left:10px;font-size:10px;padding:3px 10px;' }, 'Owner') : null));
    if (u.role !== 'owner' && u.id !== me.id) {
      const btn = el('button', { class: 'del-btn', style: 'margin-left:0;' }, 'Remove');
      btn.addEventListener('click', async () => {
        if (!confirm(`Remove admin access for ${u.username}?`)) return;
        try { await api(`/api/admin/users/${u.id}`, { method: 'DELETE' }); loadUsers(); }
        catch (e) { showUserError(e.message); }
      });
      row.append(btn);
    }
    return row;
  }));
}

function showUserError(msg) {
  const box = $('userError');
  box.textContent = msg;
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 5000);
}

$('addUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('nuName').value.trim(),
        username: $('nuUsername').value.trim(),
        password: $('nuPassword').value
      })
    });
    $('addUserForm').reset();
    loadUsers();
  } catch (err) {
    showUserError(err.message);
  }
});

// ----- banner -----
let banners = [];

function showBannerError(msg) {
  const box = $('bannerError');
  box.textContent = msg;
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 5000);
}

function fillBannerForm(b) {
  $('bannerMessage').value = b ? b.message : '';
  $('bannerActive').value = b ? String(b.active) : 'true';
  $('bannerShowHome').checked = b ? b.show_home : true;
  $('bannerShowBooking').checked = b ? b.show_booking : true;
  $('bannerSaveBtn').textContent = b ? 'Save changes' : 'Add banner';
  $('bannerDeleteBtn').classList.toggle('hidden', !b);
  if (window.gsap) gsap.from('#bannerForm', { opacity: 0.4, duration: 0.2, ease: 'power1.out' });
}

async function loadBanners() {
  const { banners: rows } = await api('/api/admin/banners');
  banners = rows;
  const select = $('bannerSelect');
  const prev = select.value;
  select.replaceChildren(
    el('option', { value: 'new' }, '+ New banner'),
    ...banners.map((b) => el('option', { value: String(b.id) },
      (b.message.length > 50 ? b.message.slice(0, 50) + '…' : b.message) + (b.active ? ' (active)' : '')))
  );
  select.value = banners.some((b) => String(b.id) === prev) ? prev : 'new';
  fillBannerForm(banners.find((b) => String(b.id) === select.value));
}

$('bannerSelect').addEventListener('change', () => {
  fillBannerForm(banners.find((b) => String(b.id) === $('bannerSelect').value));
});

$('bannerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('bannerSelect').value;
  const body = {
    message: $('bannerMessage').value.trim(),
    active: $('bannerActive').value === 'true',
    showHome: $('bannerShowHome').checked,
    showBooking: $('bannerShowBooking').checked
  };
  if (!body.message) return showBannerError('Enter a banner message.');
  try {
    if (id === 'new') {
      const { banner } = await api('/api/admin/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      await loadBanners();
      $('bannerSelect').value = String(banner.id);
      fillBannerForm(banners.find((b) => b.id === banner.id));
    } else {
      await api(`/api/admin/banners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      await loadBanners();
      $('bannerSelect').value = id;
      fillBannerForm(banners.find((b) => String(b.id) === id));
    }
  } catch (err) {
    showBannerError(err.message);
  }
});

$('bannerDeleteBtn').addEventListener('click', async () => {
  const id = $('bannerSelect').value;
  const b = banners.find((b) => String(b.id) === id);
  if (!b || !confirm('Delete this banner?')) return;
  try {
    await api(`/api/admin/banners/${id}`, { method: 'DELETE' });
    await loadBanners();
  } catch (err) {
    showBannerError(err.message);
  }
});

// ----- string stock -----
let stockStrings = [];

function showStockError(msg) {
  const box = $('stockError');
  box.textContent = msg;
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 5000);
}

function fillStockForm(s) {
  $('stockName').value = s ? s.name : '';
  $('stockDescription').value = s ? s.description : '';
  $('stockInStock').value = s ? String(s.in_stock) : 'true';
  $('stockSaveBtn').textContent = s ? 'Save changes' : 'Add string';
  $('stockDeleteBtn').classList.toggle('hidden', !s);
  if (window.gsap) gsap.from('#stockForm', { opacity: 0.4, duration: 0.2, ease: 'power1.out' });
}

async function loadStock() {
  const { strings } = await api('/api/admin/string-stock');
  stockStrings = strings;
  const select = $('stockSelect');
  const prev = select.value;
  select.replaceChildren(
    el('option', { value: 'new' }, '+ New string'),
    ...strings.map((s) => el('option', { value: String(s.id) }, s.name + (s.in_stock ? '' : ' (out of stock)')))
  );
  select.value = strings.some((s) => String(s.id) === prev) ? prev : 'new';
  fillStockForm(strings.find((s) => String(s.id) === select.value));
}

$('stockSelect').addEventListener('change', () => {
  const s = stockStrings.find((s) => String(s.id) === $('stockSelect').value);
  fillStockForm(s);
});

$('stockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('stockSelect').value;
  const body = {
    name: $('stockName').value.trim(),
    description: $('stockDescription').value.trim(),
    inStock: $('stockInStock').value === 'true'
  };
  if (!body.name) return showStockError('Enter a string name.');
  try {
    if (id === 'new') {
      const { string } = await api('/api/admin/string-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      await loadStock();
      $('stockSelect').value = String(string.id);
      fillStockForm(stockStrings.find((s) => s.id === string.id));
    } else {
      await api(`/api/admin/string-stock/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      await loadStock();
      $('stockSelect').value = id;
      fillStockForm(stockStrings.find((s) => String(s.id) === id));
    }
  } catch (err) {
    showStockError(err.message);
  }
});

$('stockDeleteBtn').addEventListener('click', async () => {
  const id = $('stockSelect').value;
  const s = stockStrings.find((s) => String(s.id) === id);
  if (!s || !confirm(`Remove ${s.name} from the list?`)) return;
  try {
    await api(`/api/admin/string-stock/${id}`, { method: 'DELETE' });
    await loadStock();
  } catch (err) {
    showStockError(err.message);
  }
});

// ----- filters / search / logout -----
$('filters').replaceChildren(...[['all', 'All'], ...STATUSES.map((s) => [s, STATUS_META[s].short])]
  .map(([key, label]) => {
    const chip = el('div', { class: 'fchip' + (key === filter ? ' active' : '') }, label);
    chip.addEventListener('click', () => {
      filter = key;
      document.querySelectorAll('.fchip').forEach((c) => c.classList.toggle('active', c === chip));
      renderOrders();
    });
    return chip;
  }));

$('search').addEventListener('input', (e) => { search = e.target.value; renderOrders(); });

$('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login';
});

// ----- boot -----
(async () => {
  try {
    const data = await api('/api/auth/me');
    me = data.user;
    $('whoami').textContent = me.name + (me.role === 'owner' ? ' (owner)' : '');
    if (me.role === 'owner') {
      $('usersCard').classList.remove('hidden');
      loadUsers();
    }
    const res = await api('/api/admin/orders');
    orders = res.orders;
    render();
    loadStock();
    loadBanners();
    // light polling so multiple admins stay in sync
    setInterval(async () => {
      try {
        const r = await api('/api/admin/orders');
        if (JSON.stringify(r.orders) !== JSON.stringify(orders)) { orders = r.orders; render(); }
      } catch {}
    }, 10000);
  } catch {}
})();
