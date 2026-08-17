'use strict';

// The form edits one racket at a time; added rackets move into `rackets` and are
// submitted together as one batch.
const state = { providingString: '', stringChoice: '', tension: '', grip: 'none', cushion: 'none', cushionLayers: '' };
const rackets = [];

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canAnimate = () => window.gsap && !reduceMotion;

// Chip groups
document.querySelectorAll('.chips[data-group]').forEach((group) => {
  const key = group.dataset.group;
  group.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state[key] = chip.dataset.value;
    group.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
    if (canAnimate()) gsap.fromTo(chip, { scale: 0.95 }, { scale: 1, duration: 0.25, ease: 'back.out(3)' });
    if (key === 'tension') {
      $('tensionOther').classList.toggle('hidden', state.tension !== 'other');
    }
    if (key === 'providingString') {
      state.stringChoice = '';
      $('ownString').value = '';
      renderStockChips();
      updateStockNote();
    }
    if (key === 'cushion') {
      // Default to the most common choice so picking a wrap is still one tap.
      state.cushionLayers = state.cushion === 'none' ? '' : (state.cushionLayers || '2');
      syncChips();
    }
    updateSummary();
  });
});

function prices() {
  const stringPrice = state.providingString === 'yes' ? 15 : state.providingString === 'no' ? 25 : 0;
  const gripPrice = state.grip === 'we' ? 2 : 0;
  const cushionPrice = state.cushion === 'we' ? 3 : 0;
  return { stringPrice, gripPrice, cushionPrice, total: stringPrice + gripPrice + cushionPrice };
}

// ----- the racket currently in the form fields -----

/** True once the customer has started filling in the racket block. */
function racketBlockTouched() {
  return !!($('racketModel').value.trim() || state.providingString || state.tension);
}

/** Validate the racket block. Returns { racket } or { error }. */
function readRacket() {
  const racketModel = $('racketModel').value.trim();
  const ownString = $('ownString').value.trim();
  const tensionOther = $('tensionOther').value.trim();

  if (!racketModel) return { error: 'Please enter your racket model.' };
  if (!state.providingString) return { error: 'Please tell us if you’re providing string.' };
  if (state.providingString === 'yes' && !ownString) return { error: 'Please tell us which string you have.' };
  if (state.providingString === 'no' && !state.stringChoice) return { error: 'Please pick which string you would like.' };
  if (!state.tension) return { error: 'Please pick a tension.' };
  if (state.tension === 'other' && !tensionOther) return { error: 'Please specify your custom tension.' };

  return {
    racket: {
      racketModel,
      providingString: state.providingString,
      stringChoice: state.providingString === 'yes' ? ownString : state.stringChoice,
      tension: state.tension === 'other' ? tensionOther : state.tension + ' lb',
      tensionRaw: state.tension, // kept so "edit" can re-select the right chip
      grip: state.grip,
      cushion: state.cushion,
      cushionLayers: state.cushion === 'none' ? 0 : Number(state.cushionLayers || 2),
      total: prices().total
    }
  };
}

/** Re-sync every chip group with `state`. */
function syncChips() {
  document.querySelectorAll('.chips[data-group]').forEach((group) => {
    const key = group.dataset.group;
    group.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.value === state[key]));
  });
  $('tensionOther').classList.toggle('hidden', state.tension !== 'other');
  $('layersNote').classList.toggle('hidden', state.cushion === 'none');
  renderStockChips();
  updateStockNote();
}

function resetRacketFields() {
  state.providingString = '';
  state.stringChoice = '';
  state.tension = '';
  state.grip = 'none';
  state.cushion = 'none';
  state.cushionLayers = '';
  $('racketModel').value = '';
  $('ownString').value = '';
  $('tensionOther').value = '';
  syncChips();
}

function fillRacketFields(r) {
  state.providingString = r.providingString;
  state.stringChoice = r.providingString === 'no' ? r.stringChoice : '';
  state.tension = r.tensionRaw;
  state.grip = r.grip;
  state.cushion = r.cushion;
  state.cushionLayers = r.cushionLayers ? String(r.cushionLayers) : '';
  $('racketModel').value = r.racketModel;
  $('ownString').value = r.providingString === 'yes' ? r.stringChoice : '';
  $('tensionOther').value = r.tensionRaw === 'other' ? r.tension : '';
  syncChips();
}

// ----- added-racket list -----

function racketDesc(r) {
  const bits = [r.providingString === 'yes' ? `own: ${r.stringChoice}` : r.stringChoice, r.tension];
  if (r.grip !== 'none') bits.push(r.grip === 'we' ? 'grip' : 'own grip');
  if (r.cushion !== 'none') bits.push(`${r.cushion === 'we' ? 'wrap' : 'own wrap'} ×${r.cushionLayers}`);
  return bits.join(' · ');
}

function renderRacketList() {
  const wrap = $('racketList');
  wrap.classList.toggle('hidden', rackets.length === 0);
  const heading = document.createElement('div');
  heading.className = 'section-head';
  heading.style.margin = '0 0 4px';
  heading.textContent = 'Rackets added';
  wrap.replaceChildren(heading, ...rackets.map((r, i) => {
    const row = document.createElement('div');
    row.className = 'racket-row';

    const n = document.createElement('div');
    n.className = 'n';
    n.textContent = String(i + 1);

    const desc = document.createElement('div');
    desc.className = 'desc';
    const name = document.createElement('b');
    name.textContent = r.racketModel;
    desc.append(name, racketDesc(r));

    const cost = document.createElement('div');
    cost.className = 'cost';
    cost.textContent = '$' + r.total;

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => {
      // Anything half-typed in the block would be lost, so put it at the end of the list first.
      if (racketBlockTouched()) {
        const { racket } = readRacket();
        if (racket) rackets.push(racket);
      }
      const [picked] = rackets.splice(i, 1);
      fillRacketFields(picked);
      updateSummary(); // re-renders the list too
      $('racketModel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'rm';
    rm.textContent = 'Remove';
    rm.setAttribute('aria-label', `Remove ${r.racketModel}`);
    rm.addEventListener('click', () => {
      rackets.splice(i, 1);
      updateSummary(); // re-renders the list too
    });

    // Price and actions travel together so they can drop to a second line on phones.
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(cost, edit, rm);

    row.append(n, desc, actions);
    return row;
  }));

  $('racketHeading').textContent = rackets.length ? `Racket ${rackets.length + 1}` : 'Your racket';
  const n = rackets.length + (racketBlockTouched() ? 1 : 0);
  $('submitBtn').textContent = n > 1 ? `Submit ${n} rackets` : 'Submit racket';
}

function summaryRow(label, value) {
  const row = document.createElement('div');
  row.className = 'row';
  const l = document.createElement('span');
  l.textContent = label;
  const v = document.createElement('span');
  v.textContent = value;
  row.append(l, v);
  return row;
}

function updateSummary() {
  const p = prices();
  const rows = rackets.map((r, i) => summaryRow(`${i + 1}. ${r.racketModel}`, '$' + r.total));

  if (rackets.length === 0 || racketBlockTouched()) {
    // The racket still being filled in - show its running price.
    rows.push(summaryRow(
      rackets.length ? `${rackets.length + 1}. This racket` : 'Stringing',
      state.providingString ? '$' + p.total : '-'
    ));
  }

  $('summaryRows').replaceChildren(...rows);
  const added = rackets.reduce((sum, r) => sum + r.total, 0);
  $('sTotal').textContent = '$' + (added + (racketBlockTouched() && state.providingString ? p.total : 0));
  renderRacketList();
}

function showError(msg) {
  const box = $('errorBox');
  box.textContent = msg;
  box.classList.remove('hidden');
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('racketModel').addEventListener('input', updateSummary);

$('addRacketBtn').addEventListener('click', () => {
  $('errorBox').classList.add('hidden');
  const { racket, error } = readRacket();
  if (error) return showError(error);
  rackets.push(racket);
  resetRacketFields();
  updateSummary();
  if (canAnimate()) gsap.from($('racketList').lastElementChild, { opacity: 0, y: -8, duration: 0.25, ease: 'power2.out' });
  $('racketModel').focus();
});

$('orderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('errorBox').classList.add('hidden');

  const name = $('name').value.trim();
  const contact = $('contact').value.trim();

  if (!name) return showError('Please enter your name.');
  if (!contact) return showError('Please enter a way to reach you.');

  // Submit the added rackets plus whatever is still in the form block.
  const batch = rackets.slice();
  if (racketBlockTouched() || batch.length === 0) {
    const { racket, error } = readRacket();
    if (error) return showError(batch.length ? `Racket ${batch.length + 1}: ${error}` : error);
    batch.push(racket);
  }

  const btn = $('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  if (canAnimate()) gsap.to(btn, { scale: 0.97, duration: 0.12, ease: 'power2.out' });
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, contact,
        rackets: batch.map(({ racketModel, providingString, stringChoice, tension, grip, cushion, cushionLayers }) =>
          ({ racketModel, providingString, stringChoice, tension, grip, cushion, cushionLayers })),
        dropoff: $('dropoff').value.trim(),
        dateNeeded: $('dateNeeded').value,
        specialRequests: $('specialRequests').value.trim(),
        website: $('website').value // honeypot
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showError(data.error || 'Something went wrong - please try again.');

    if (canAnimate()) {
      btn.textContent = '✓ Submitted';
      await new Promise((resolve) => {
        gsap.timeline({ onComplete: resolve })
          .to(btn, { scale: 1.06, duration: 0.15, ease: 'power2.out' })
          .to(btn, { scale: 1, duration: 0.12 });
      });
    }

    // success view
    $('successHeading').textContent = 'Got it, ' + (name.split(' ')[0] || 'there') + '!';
    $('successBlurb').textContent = batch.length > 1
      ? `We've received details for your ${batch.length} rackets. One last step - please DM us on Instagram to confirm your drop-off.`
      : "We've received your racket details. One last step - please DM us on Instagram to confirm your drop-off.";
    $('receiptRows').replaceChildren(...batch.map((r) => {
      const row = document.createElement('div');
      row.className = 'row';
      const l = document.createElement('span');
      l.textContent = `${r.racketModel} · ${r.tension}`;
      const v = document.createElement('span');
      v.textContent = '$' + r.total;
      row.append(l, v);
      return row;
    }));
    $('rTotal').textContent = '$' + batch.reduce((sum, r) => sum + r.total, 0);
    $('formView').classList.add('hidden');
    $('successView').classList.remove('hidden');
    window.scrollTo(0, 0);
  } catch {
    showError('Network error - please check your connection and try again.');
  } finally {
    btn.disabled = false;
    renderRacketList(); // restores the "Submit N rackets" label
    if (canAnimate()) gsap.set(btn, { scale: 1 });
  }
});

$('resetBtn').addEventListener('click', () => {
  $('orderForm').reset();
  rackets.length = 0;
  resetRacketFields();
  updateSummary();
  $('successView').classList.add('hidden');
  $('formView').classList.remove('hidden');
  window.scrollTo(0, 0);
});

updateSummary();

// ----- string stock note -----
let stockStrings = [];
let openTooltip = null;

function closeTooltip() {
  if (!openTooltip) return;
  const { icon, tip } = openTooltip;
  icon.classList.remove('open');
  if (window.gsap) {
    gsap.to(tip, { opacity: 0, y: 4, duration: 0.12, onComplete: () => tip.remove() });
  } else {
    tip.remove();
  }
  openTooltip = null;
}

function openTooltipFor(icon, text) {
  if (openTooltip?.icon === icon) { closeTooltip(); return; }
  closeTooltip();
  const tip = document.createElement('div');
  tip.className = 'string-tooltip';
  tip.textContent = text;
  icon.appendChild(tip);
  icon.classList.add('open');
  openTooltip = { icon, tip };
  if (window.gsap) gsap.from(tip, { opacity: 0, y: 4, duration: 0.16, ease: 'power2.out' });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.string-info')) closeTooltip();
});

function renderStockChips() {
  openTooltip = null;
  const wrap = $('stockChips');
  wrap.replaceChildren(...stockStrings.map((s) => {
    const chip = document.createElement('span');
    chip.className = 'string-chip' + (state.stringChoice === s.name ? ' selected' : '');
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.append(s.name);
    chip.addEventListener('click', () => {
      state.stringChoice = state.stringChoice === s.name ? '' : s.name;
      renderStockChips();
    });
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chip.click(); }
    });
    if (s.description) {
      const icon = document.createElement('span');
      icon.className = 'string-info';
      icon.textContent = 'i';
      icon.setAttribute('role', 'button');
      icon.setAttribute('tabindex', '0');
      icon.setAttribute('aria-label', `About ${s.name}`);
      icon.addEventListener('click', (e) => { e.stopPropagation(); openTooltipFor(icon, s.description); });
      icon.addEventListener('mouseenter', () => openTooltipFor(icon, s.description));
      icon.addEventListener('mouseleave', () => closeTooltip());
      icon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openTooltipFor(icon, s.description); }
      });
      chip.append(icon);
    }
    return chip;
  }));
}

function updateStockNote() {
  $('ownStringNote').classList.toggle('hidden', state.providingString !== 'yes');
  const show = state.providingString === 'no' && stockStrings.length > 0;
  $('stockNote').classList.toggle('hidden', !show);
}

fetch('/api/string-stock').then((r) => r.json()).then(({ strings }) => {
  stockStrings = strings || [];
  renderStockChips();
  updateStockNote();
}).catch(() => {});
