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

  const mm = gsap.matchMedia();
  mm.add({ isMobile: '(max-width: 640px)' }, (ctx) => {
    revealTargets.forEach((el) => {
      gsap.from(el, {
        opacity: 0,
        y: reduceMotion ? 0 : ctx.conditions.isMobile ? 14 : 24,
        duration: reduceMotion ? 0.01 : ctx.conditions.isMobile ? 0.4 : 0.6,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true }
      });
    });
  });

  // Layout can shift after fonts/images finish loading, which throws off
  // ScrollTrigger's cached trigger positions.
  window.addEventListener('load', () => ScrollTrigger.refresh());

  // Safety net: if ScrollTrigger never fires for an element (layout race,
  // trigger positioned above the fold before refresh), don't leave it hidden.
  setTimeout(() => {
    revealTargets.forEach((el) => {
      if (getComputedStyle(el).opacity === '0') gsap.set(el, { opacity: 1, y: 0 });
    });
  }, 2500);
}
