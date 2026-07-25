'use strict';
// Signed-in admins get a Dashboard tab in the nav.
fetch('/api/auth/me').then((r) => {
  if (r.ok) document.getElementById('dashLink')?.classList.remove('hidden');
});

// Reveal .reveal elements as they scroll into view with GSAP ScrollTrigger.
// Falls back to plain visible content if GSAP failed to load.
const revealTargets = document.querySelectorAll('.reveal');
if (revealTargets.length && window.gsap && window.ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  revealTargets.forEach((el) => {
    gsap.from(el, {
      opacity: 0,
      y: reduceMotion ? 0 : 24,
      duration: reduceMotion ? 0.01 : 0.6,
      ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true }
    });
  });
}
