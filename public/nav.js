'use strict';
// Signed-in admins get a Dashboard tab in the nav.
fetch('/api/auth/me').then((r) => {
  if (r.ok) document.querySelectorAll('.dashLink').forEach(el => el.classList.remove('hidden'));
});

// Site-wide notice banner, configured from the admin dashboard.
const siteBanner = document.getElementById('siteBanner');
if (siteBanner) {
  const page = location.pathname.replace(/\.html$/, '') === '/order' ? 'booking' : 'home';
  fetch(`/api/banner?page=${page}`).then((r) => r.json()).then(({ message }) => {
    if (!message) return;
    siteBanner.textContent = message;
    siteBanner.classList.remove('hidden');
  }).catch(() => {});
}

// Reveal .reveal elements (as a block) and .reveal-list elements (children,
// staggered) as they scroll into view with GSAP ScrollTrigger. Falls back to
// plain visible content if GSAP failed to load.
const revealTargets = document.querySelectorAll('.reveal');
const revealLists = document.querySelectorAll('.reveal-list');
const revealChildren = Array.from(revealLists).flatMap((g) => Array.from(g.children));
if ((revealTargets.length || revealLists.length) && window.gsap && window.ScrollTrigger) {
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
    revealLists.forEach((group) => {
      gsap.from(group.children, {
        opacity: 0,
        y: reduceMotion ? 0 : ctx.conditions.isMobile ? 14 : 24,
        duration: reduceMotion ? 0.01 : ctx.conditions.isMobile ? 0.4 : 0.55,
        stagger: reduceMotion ? 0 : 0.1,
        ease: 'power2.out',
        scrollTrigger: { trigger: group, start: 'top 90%', once: true }
      });
    });
  });

  // Layout can shift after fonts/images finish loading, which throws off
  // ScrollTrigger's cached trigger positions.
  window.addEventListener('load', () => ScrollTrigger.refresh());

  // Safety net: if ScrollTrigger never fires for an element (layout race,
  // trigger positioned above the fold before refresh), don't leave it hidden.
  setTimeout(() => {
    [...revealTargets, ...revealChildren].forEach((el) => {
      if (getComputedStyle(el).opacity === '0') gsap.set(el, { opacity: 1, y: 0 });
    });
  }, 2500);
}

// Focal moment: the hero's court lines draw themselves in, then the headline
// and CTAs settle into place. Runs once on load, above the fold, not tied to
// scroll. Content stays visible by default if GSAP never loads.
const hero = document.querySelector('.hero');
if (hero && window.gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const courtLines = hero.querySelectorAll('.court line, .court rect');
  courtLines.forEach((el) => {
    const length = el.getTotalLength();
    gsap.set(el, { strokeDasharray: length, strokeDashoffset: length });
  });
  gsap.timeline()
    .to(courtLines, { strokeDashoffset: 0, duration: 0.9, stagger: 0.07, ease: 'power3.out' })
    .from('.hero .badge', { opacity: 0, y: 12, duration: 0.5, ease: 'power2.out' }, 0.25)
    .from('.hero h1', { opacity: 0, y: 16, duration: 0.55, ease: 'power2.out' }, 0.38)
    .from('.hero p', { opacity: 0, y: 14, duration: 0.5, ease: 'power2.out' }, 0.5)
    .from('.hero .btn', { opacity: 0, y: 12, duration: 0.5, stagger: 0.08, ease: 'power2.out' }, 0.6);
}
