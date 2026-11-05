/* SALUMÉE V4 — home: ingresso con il castello. Le animazioni sono CSS (compositore);
   qui solo «salta» e il ricordo della visita, così l'ingresso non si ripete ogni volta. */
(() => {
  'use strict';
  const gate = document.querySelector('.gate');
  if (!gate) return;
  const doc = document.documentElement;
  const skipBtn = gate.querySelector('.gate-skip');
  let done = doc.classList.contains('gate-seen') || doc.classList.contains('rm');
  const toChoice = () => gate.querySelector('.choice')?.focus({ preventScroll: true });
  const finish = e => {
    // «Salta»: il tocco/tasto sul pulsante porta anche il focus sulla prima scelta
    const onSkip = e && skipBtn && e.target instanceof Node && skipBtn.contains(e.target);
    if (onSkip && e.type !== 'wheel') requestAnimationFrame(toChoice);
    if (done) return;
    done = true;
    gate.classList.add('is-skip');
    off();
  };
  const evs = ['pointerdown', 'wheel', 'touchstart', 'keydown'];
  const off = () => evs.forEach(t => removeEventListener(t, finish, true));
  if (!done) {
    evs.forEach(t => addEventListener(t, finish, { capture: true, passive: true }));
    setTimeout(() => { done = true; off(); }, 1600);   // l'ingresso dura al massimo 1,5 s
  }
  if (skipBtn) skipBtn.addEventListener('click', () => { finish(); toChoice(); });
  try { localStorage.setItem('salumee-ingresso', String(Date.now())); } catch (e) { /* storage non disponibile: nessun problema */ }
})();
/* video del castello (facoltativo): parte solo se c'è, con movimento pieno e senza risparmio dati, e si ferma fuori schermo */
(() => {
  const v = document.querySelector('.gate-video');
  if (!v) return;
  const c = navigator.connection;
  if (document.documentElement.classList.contains('rm') || (c && (c.saveData || /2g/.test(c.effectiveType || '')))) return;
  v.src = v.dataset.src;
  v.addEventListener('playing', () => v.classList.add('is-on'), { once: true });
  new IntersectionObserver(([e]) => { e.isIntersecting ? v.play().catch(() => {}) : v.pause(); }).observe(v);
})();
