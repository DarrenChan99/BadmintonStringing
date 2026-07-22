'use strict';

const state = { providingString: '', tension: '', grip: 'none', cushion: 'none' };

const $ = (id) => document.getElementById(id);

// Chip groups
document.querySelectorAll('.chips[data-group]').forEach((group) => {
  const key = group.dataset.group;
  group.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state[key] = chip.dataset.value;
    group.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
    if (key === 'tension') {
      $('tensionOther').classList.toggle('hidden', state.tension !== 'other');
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

function updateSummary() {
  const p = prices();
  $('sString').textContent = state.providingString ? '$' + p.stringPrice : '—';
  $('sGrip').textContent = state.grip === 'we' ? '+$2' : state.grip === 'own' ? 'own' : '—';
  $('sCushion').textContent = state.cushion === 'we' ? '+$3' : state.cushion === 'own' ? 'own' : '—';
  $('sTotal').textContent = '$' + p.total;
}

function showError(msg) {
  const box = $('errorBox');
  box.textContent = msg;
  box.classList.remove('hidden');
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('orderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('errorBox').classList.add('hidden');

  const name = $('name').value.trim();
  const contact = $('contact').value.trim();
  const racketModel = $('racketModel').value.trim();
  const tensionOther = $('tensionOther').value.trim();

  if (!name) return showError('Please enter your name.');
  if (!contact) return showError('Please enter a way to reach you.');
  if (!racketModel) return showError('Please enter your racket model.');
  if (!state.providingString) return showError('Please tell us if you’re providing string.');
  if (!state.tension) return showError('Please pick a tension.');
  if (state.tension === 'other' && !tensionOther) return showError('Please specify your custom tension.');

  const tension = state.tension === 'other' ? tensionOther : state.tension + ' lb';

  const btn = $('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, contact, racketModel,
        providingString: state.providingString,
        tension,
        grip: state.grip,
        cushion: state.cushion,
        dropoff: $('dropoff').value.trim(),
        dateNeeded: $('dateNeeded').value,
        specialRequests: $('specialRequests').value.trim(),
        website: $('website').value // honeypot
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showError(data.error || 'Something went wrong — please try again.');

    // success view
    $('successHeading').textContent = 'Got it, ' + (name.split(' ')[0] || 'there') + '!';
    $('rRacket').textContent = racketModel;
    $('rTension').textContent = tension;
    $('rTotal').textContent = '$' + prices().total;
    $('formView').classList.add('hidden');
    $('successView').classList.remove('hidden');
    window.scrollTo(0, 0);
  } catch {
    showError('Network error — please check your connection and try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit racket';
  }
});

$('resetBtn').addEventListener('click', () => {
  $('orderForm').reset();
  state.providingString = '';
  state.tension = '';
  state.grip = 'none';
  state.cushion = 'none';
  document.querySelectorAll('.chips[data-group]').forEach((group) => {
    group.querySelectorAll('.chip').forEach((c) =>
      c.classList.toggle('active', c.dataset.value === 'none' && (group.dataset.group === 'grip' || group.dataset.group === 'cushion')));
  });
  $('tensionOther').classList.add('hidden');
  updateSummary();
  $('successView').classList.add('hidden');
  $('formView').classList.remove('hidden');
  window.scrollTo(0, 0);
});

updateSummary();
