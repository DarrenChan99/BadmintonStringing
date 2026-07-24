'use strict';

// Already signed in? Go straight to the panel.
fetch('/api/auth/me').then((r) => { if (r.ok) location.href = '/admin'; });

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const box = document.getElementById('errorBox');
  const btn = document.getElementById('loginBtn');
  box.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      box.textContent = data.error || 'Sign in failed.';
      box.classList.remove('hidden');
      return;
    }
    location.href = '/admin';
  } catch {
    box.textContent = 'Network error — please try again.';
    box.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});
