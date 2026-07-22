'use strict';
// Signed-in admins get a Dashboard tab in the nav.
fetch('/api/auth/me').then((r) => {
  if (r.ok) document.getElementById('dashLink')?.classList.remove('hidden');
});
