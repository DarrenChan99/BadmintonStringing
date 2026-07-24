'use strict';
// Signed-in admins get a Dashboard tab in the nav.
fetch('/api/auth/me').then((r) => {
  if (r.ok) document.getElementById('dashLink')?.classList.remove('hidden');
});

// Reveal .reveal elements as they scroll into view. The `js` class gates the
// hidden-by-default CSS so content stays visible if this never runs.
const revealTargets = document.querySelectorAll('.reveal');
if (revealTargets.length && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('js');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -10% 0px' });
  revealTargets.forEach((el) => io.observe(el));
}
