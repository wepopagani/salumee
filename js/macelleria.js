/* SALUMÉE V4 — Macelleria: quattro prosciutti illustrativi, uno alla volta.
   Solo transform e opacity (compositore). Nessun nome, varietà o dato commerciale:
   le descrizioni dicono soltanto cosa si vede nell'immagine. Il ritiro resta una richiesta generica. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = $('[data-hams]');
  if (!root) return;
  const DATA = JSON.parse($('#ham-data').textContent);
  const stage = $('.hams-stage', root);
  const pieces = $$('.ham-piece', root);
  const thumbs = $$('.ham-thumb', root);
  const steps = $$('.ham-step', root);
  const all = $('.ham-all', root);
  const detail = $('#ham-detail');
  const lens = $('.ham-lens', detail);
  const which = $('.ham-which', detail), of = $('.ham-of', detail);
  const form = $('.ham-form', detail), text = $('.ham-text', detail);
  const n = pieces.length;
  const desk = matchMedia('(min-width: 760px)');
  let cur = -1;

  function layout() {
    const W = stage.clientWidth, H = stage.clientHeight;
    pieces.forEach((p, k) => {
      const st = p.style;
      if (cur < 0) { st.removeProperty('--tx'); st.removeProperty('--s'); st.removeProperty('--o'); return; }
      const pw = p.offsetWidth, ph = p.offsetHeight, cx = p.offsetLeft + pw / 2;
      if (k === cur) {
        const s = desk.matches ? Math.min(1.3, (H * .95) / ph, (W * .5) / pw) : Math.min((H * .95) / ph, (W * .66) / pw);
        const tx = (desk.matches ? W * .32 : W / 2) - cx;
        st.setProperty('--tx', `${tx.toFixed(1)}px`); st.setProperty('--s', s.toFixed(3)); st.setProperty('--o', '1');
      } else {
        // gli altri arretrano e sfumano; su telefono escono ai lati per lasciare il centro al pezzo scelto
        const away = desk.matches ? (k < cur ? -W * .04 : W * .1) : (k < cur ? -W * .42 : W * .42);
        st.setProperty('--tx', `${away.toFixed(1)}px`); st.setProperty('--s', desk.matches ? '.78' : '.62');
        st.setProperty('--o', desk.matches ? (k < cur ? '.16' : '.07') : '0');
      }
    });
  }

  function fill(i) {
    if (i < 0) {
      which.textContent = 'Quattro pezzi'; of.textContent = '';
      form.textContent = ''; text.textContent = 'Tocca un prosciutto o usa i controlli qui sotto.';
      lens.style.backgroundImage = '';
      return;
    }
    const d = DATA[i], r = lens.offsetWidth / 2 || 56;
    which.textContent = d.nome; of.textContent = '';
    form.textContent = d.forma; text.textContent = d.testo;
    // lente: lo stesso ritaglio alla risoluzione originale, centrato su un punto del pezzo
    lens.style.backgroundImage = `url("${d.file}")`;
    lens.style.backgroundSize = `${d.w}px ${d.h}px`;
    lens.style.backgroundPosition = `${(r - d.dx).toFixed(0)}px ${(r - d.dy).toFixed(0)}px`;
  }

  function select(i, { focus = false } = {}) {
    if (i === cur) i = -1;                          // secondo clic sul pezzo scelto: torna a tutti
    cur = i;
    root.classList.toggle('is-focus', i >= 0);
    pieces.forEach((p, k) => {
      p.classList.toggle('is-active', k === i);
      p.classList.toggle('is-back', i >= 0 && k !== i);
      p.setAttribute('aria-pressed', String(k === i));
    });
    thumbs.forEach((t, k) => t.setAttribute('aria-pressed', String(k === i)));
    all.disabled = i < 0;
    fill(i);
    layout();
    if (focus && i >= 0) thumbs[i].focus({ preventScroll: true });
  }
  const step = d => select(cur < 0 ? (d > 0 ? 0 : n - 1) : (cur + d + n) % n);

  pieces.forEach((p, k) => p.addEventListener('click', () => select(k)));
  thumbs.forEach((t, k) => t.addEventListener('click', () => { if (k !== cur) select(k); }));
  steps.forEach(b => b.addEventListener('click', () => step(+b.dataset.step)));
  all.addEventListener('click', () => { const was = cur; select(-1); if (was >= 0) pieces[was].focus({ preventScroll: true }); });
  root.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (!e.target.closest('.ham-piece, .ham-thumb, .ham-step')) return;
      e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1);
      (e.target.closest('.ham-thumb') ? thumbs[cur] : e.target.closest('.ham-piece') ? pieces[cur] : e.target).focus({ preventScroll: true });
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cur >= 0) { const was = cur; select(-1); if (root.contains(document.activeElement)) pieces[was].focus({ preventScroll: true }); }
  });
  let rz = 0;
  addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(layout); });
  desk.addEventListener?.('change', layout);
  fill(-1);

  // entrata sfalsata la prima volta che la sezione entra in vista
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { root.classList.add('is-in'); io.disconnect(); } }, { threshold: .25 });
    io.observe(stage);
  } else root.classList.add('is-in');
  window.__salumeeHams = () => ({ cur, focus: root.classList.contains('is-focus') });
})();
