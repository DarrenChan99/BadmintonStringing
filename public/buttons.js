'use strict';
// Snappier, interruption-safe hover/press lift on .btn via gsap.quickTo.
// Falls back to the plain CSS transform (see .btn:not(.js-anim) in styles.css)
// when GSAP isn't loaded or the user prefers reduced motion.
if (window.gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.classList.add('js-anim');
    const lift = gsap.quickTo(btn, 'y', { duration: 0.2, ease: 'power2.out' });
    btn.addEventListener('mouseenter', () => lift(-2));
    btn.addEventListener('mouseleave', () => lift(0));
    btn.addEventListener('mousedown', () => lift(0));
    btn.addEventListener('mouseup', () => lift(-2));
  });
}
