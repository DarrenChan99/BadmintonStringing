'use strict';

let me = null;
let orders = [];
let filter = 'all';
let search = '';

const $ = (id) => document.getElementById(id);

const STATUS_META = {
  pending:     { label: 'Pending',     color: '#8a5a1a',            bg: 'rgba(200,140,20,0.14)', chip: '#8a5a1a' },
  in_progress: { label: 'In progress', color: '#0F6B3A',            bg: 'rgba(15,107,58,0.12)',  chip: '#0F6B3A' },
  ready:       { label: 'Ready',       color: '#0A4B29',            bg: 'rgba(191,227,206,0.6)', chip: '#0A4B29' },
  completed:   { label: 'Completed',   color: 'rgba(26,31,27,0.5)', bg: 'rgba(26,31,27,0.06)',   chip: '#555' }
};

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
  if (!m) return iso; // free-text or empty — leave as-is
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
  const countBy = (st) => orders.filter((o) => o.status === st).length;
  const stats = [
    ['Total orders', orders.length, '#fff', '1px solid rgba(15,107,58,0.16)'],
    ['Pending', countBy('pending'), 'rgba(200,140,20,0.08)', '1px solid rgba(200,140,20,0.25)'],
    ['In progress', countBy('in_progress'), 'rgba(15,107,58,0.08)', '1px solid rgba(15,107,58,0.25)'],
    ['Ready / Done', countBy('ready') + countBy('completed'), 'rgba(15,107,58,0.06)', '1px solid rgba(15,107,58,0.18)']
  ];
  const wrap = $('stats');
  wrap.replaceChildren(...stats.map(([label, value, bg, border]) =>
    el('div', { class: 'stat', style: `background:${bg};border:${border};` },
      el('div', { class: 'label' }, label),
      el('div', { class: 'value' }, String(value)))));
}

function statusChip(o, key) {
  const meta = STATUS_META[key];
  const active = o.status === key;
  const chip = el('div', {
    class: 'schip' + (active ? ' active' : ''),
    style: active ? `background:${meta.chip};border-color:${meta.chip};` : ''
  }, meta.label);
  chip.addEventListener('click', async () => {
    if (o.status === key) return;
    await api(`/api/admin/orders/${o.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: key })
    });
    o.status = key;
    render();
  });
  return chip;
}

function renderOrders() {
  const q = search.trim().toLowerCase();
  let visible = orders.filter((o) => filter === 'all' || o.status === filter);
  if (q) {
    visible = visible.filter((o) =>
      (o.name || '').toLowerCase().includes(q) ||
      (o.racket_model || '').toLowerCase().includes(q) ||
      (o.contact || '').toLowerCase().includes(q));
  }

  $('empty').classList.toggle('hidden', visible.length > 0);
  const wrap = $('orders');
  wrap.replaceChildren(...visible.map((o) => {
    const meta = STATUS_META[o.status] || STATUS_META.pending;
    const gripLabel = o.grip === 'we' ? 'grip (ours)' : o.grip === 'own' ? 'grip (own)' : null;
    const cushionLabel = o.cushion === 'we' ? 'wrap (ours)' : o.cushion === 'own' ? 'wrap (own)' : null;
    const gc = [gripLabel, cushionLabel].filter(Boolean).join(', ') || 'none';

    const delBtn = el('button', { class: 'del-btn' }, 'Delete');
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this order?')) return;
      await api(`/api/admin/orders/${o.id}`, { method: 'DELETE' });
      orders = orders.filter((x) => x.id !== o.id);
      render();
    });

    return el('div', { class: 'order ' + o.status },
      el('div', { class: 'o-head' },
        el('div', {},
          el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:4px;' },
            el('span', { class: 'o-name' }, o.name),
            el('span', { class: 'status-pill', style: `color:${meta.color};background:${meta.bg};` }, meta.label)),
          el('div', { style: 'font-size:13px;color:rgba(26,31,27,0.55);' },
            `${o.contact} · submitted ${fmtDate(o.created_at)}`)),
        el('div', { class: 'o-total' }, '$' + o.total)),
      el('div', { class: 'o-grid' },
        el('div', {}, el('div', { class: 'k' }, 'Racket'), el('div', { class: 'v' }, o.racket_model)),
        el('div', {}, el('div', { class: 'k' }, 'Tension'), el('div', { class: 'v' }, o.tension)),
        el('div', {}, el('div', { class: 'k' }, 'Grip / Wrap'), el('div', { class: 'v' }, gc)),
        el('div', {}, el('div', { class: 'k' }, 'Needed by'), el('div', { class: 'v' }, o.date_needed ? fmtDateNeeded(o.date_needed) : 'not specified'))),
      o.dropoff ? el('div', { class: 'o-note' }, el('strong', {}, 'Drop-off: '), o.dropoff) : null,
      o.special_requests ? el('div', { class: 'o-note' }, el('strong', {}, 'Notes: '), o.special_requests) : null,
      el('div', { class: 'o-actions' },
        statusChip(o, 'pending'), statusChip(o, 'in_progress'),
        statusChip(o, 'ready'), statusChip(o, 'completed'),
        delBtn));
  }));
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

// ----- filters / search / logout -----
document.querySelectorAll('.fchip').forEach((chip) => {
  chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    document.querySelectorAll('.fchip').forEach((c) => c.classList.toggle('active', c === chip));
    renderOrders();
  });
});

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
    // light polling so multiple admins stay in sync
    setInterval(async () => {
      try {
        const r = await api('/api/admin/orders');
        if (JSON.stringify(r.orders) !== JSON.stringify(orders)) { orders = r.orders; render(); }
      } catch {}
    }, 10000);
  } catch {}
})();
