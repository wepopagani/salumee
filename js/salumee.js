/* SALUMÉE V3.1 — un solo script, nessuna dipendenza.
   Regia: una timeline (S = scroll smorzato nel tempo) governa geometria del prodotto,
   testi, pin e passaggio al banco. La ricetta (Mortadella / Porchetta / Tartare) è uno stato
   condiviso fra hero e banco e cambia senza toccare apertura e scroll. Il ciclo rAF si ferma quando tutto è fermo. */
(() => {
  'use strict';
  const doc = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = t => t * t * (3 - 2 * t);
  const sine = t => .5 - .5 * Math.cos(Math.PI * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mq = q => matchMedia(q);
  const mqReduce = mq('(prefers-reduced-motion: reduce)');
  const mqDesk = mq('(min-width: 900px)');
  const mqLow = mq('(max-height: 559.98px)');
  const mqFine = mq('(hover: hover) and (pointer: fine)');
  const onChange = (m, fn) => (m.addEventListener ? m.addEventListener('change', fn) : m.addListener(fn));
  const reduced = () => mqReduce.matches;

  /* ---------------- Navigazione ---------------- */
  const nav = $('.site-nav');
  const toggle = $('.nav-toggle');
  const setMenu = open => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Chiudi la navigazione' : 'Apri la navigazione');
  };
  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  $('.nav-list').addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
  });
  document.addEventListener('click', e => { if (nav.classList.contains('is-open') && !nav.contains(e.target)) setMenu(false); });
  onChange(mqDesk, () => setMenu(false));

  /* ---------------- Elementi della scena ---------------- */
  const header = $('.site-header');
  const hero = $('.hero');
  const stage = $('.stage');
  const fig = $('#product');
  const canvas = $('.canvas', fig);
  const group = $('.pgroup', fig);
  const beats = { intro: $('.beat-intro'), story: $('.beat-story'), finale: $('.beat-finale') };
  const caption = $('.product-caption', fig), stamp = $('.stamp', fig), cue = $('.scene-cue'), look = $('.look-inside');
  const pinsWrap = $('.pins', fig), pins = $$('.pin', fig);
  const ingList = $('#ing-detail'), storyRecipe = $('.story-recipe');
  const switcher = $('.recipe-switch'), recipeBtns = $$('.recipe-btn', switcher);
  const traveler = $('.traveler'), travelerImg = $('img', traveler);
  const banco = $('#banco'), plate = $('.plate'), plateImgs = $$('.plate-img', plate);
  // Scrive una proprietà di stile solo se il valore è cambiato: niente lavoro inutile a ogni frame.
  const css = (el, prop, v) => { const c = el._c || (el._c = {}); if (c[prop] !== v) { el.style[prop] = v; c[prop] = v; } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Geometria dell'apertura, in % del canvas condiviso 1536×1024: [x, y, rotazione°].
  // È la stessa per tutte le ricette: pane e apertura non cambiano quando cambia la farcitura.
  const PRESET = {
    desk: { lid: [1.6, -21, -2.2], meat: [-1.4, -7.6, .9], fondo: [.5, 5.4, -.5], approach: .045, shrink: .12, gx: -1.2, gy: 1.2 },
    phone: { lid: [1.2, -19.5, -1.8], meat: [-1, -7, .7], fondo: [.4, 4.6, -.4], approach: .03, shrink: .05, gx: 0, gy: -17 }
  };
  const SWITCH_MS = 460;      // durata del cambio di farcitura
  const SLIDE = 4;            // spostamento laterale della farcitura, % della larghezza del canvas

  /* ---------------- Ricette: un solo stato condiviso fra hero e banco ----------------
     selected  = ultima scelta (pulsanti e banco la mostrano subito)
     pending   = scelta in decodifica, distinta da quella mostrata
     shown     = ricetta visibile (o in arrivo durante il cambio)
     info      = ricetta di nome, pin e ingredienti (cambia a metà transizione)
     openness e scroll non dipendono dalla ricetta: il cambio non li tocca. */
  const RD = JSON.parse($('#ricette-data').textContent);
  const firstPoster = $('.poster', group);
  const mk = (tag, cls, attrs = {}) => { const el = document.createElement(tag); if (cls) el.className = cls; for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };
  const layerImg = (src, cls = 'layer', w = 1536, h = 1024) => mk('img', cls, { 'data-src': src, width: w, height: h, alt: '', decoding: 'async', draggable: 'false' });
  const REC = RD.recipes.map((d, n) => {
    const g = mk('div', 'rgroup', { 'data-recipe': d.id });
    const r = { d, id: d.id, n, g, openable: !!d.open, layersOK: false, rw: 0, decoded: false, pp: null, lp: null, wrap: null, sh: {} };
    if (r.openable) {
      const o = d.open;
      const f = mk('div', 'layer-wrap lw-fondo'), m = mk('div', 'layer-wrap lw-meat'), l = mk('div', 'layer-wrap lw-lid');
      f.append(layerImg(o.bottom));
      if (o.shadowFilling) f.append(r.sh.fill = layerImg(o.shadowFilling, 'layer shadow sh-meat', 768, 512));
      if (o.shadowLidContact) m.append(r.sh.lidC = layerImg(o.shadowLidContact, 'layer shadow sh-lid-contact', 768, 512));
      if (o.shadowLidSoft) m.append(r.sh.lidS = layerImg(o.shadowLidSoft, 'layer shadow sh-lid-soft', 768, 512));
      m.append(layerImg(o.filling));
      l.append(layerImg(o.lid));
      g.append(f, m, l);
      r.wrap = { fondo: f, meat: m, lid: l };
    }
    r.poster = firstPoster && firstPoster.dataset.poster === d.id ? firstPoster
      : mk('img', 'layer poster', { 'data-poster': d.id, width: 1536, height: 1024, alt: '', decoding: 'async', draggable: 'false' });
    g.append(r.poster);
    group.append(g);
    return r;
  });
  const byId = id => REC.find(r => r.id === id);
  let shown = byId(RD.defaultRecipe) || REC[0];
  let selected = shown, pending = null, info = shown;
  let X = null;               // cambio in corso: { from, to, dir, t0, k, swapped }
  let token = 0;              // «vince l'ultimo tap»
  REC.forEach(r => r.g.classList.toggle('is-on', r === shown));
  if (firstPoster && firstPoster.parentNode !== shown.g) shown.poster.alt = firstPoster.alt;

  let scene = false;          // scena animata attiva (JS, movimento consentito, schermo non troppo basso)
  const M = { hh: 0, vw: 0, vh: 0, pinStart: 0, pinEnd: 1, cw: 1, ch: 1, travel: false, travelStart: 0, travelEnd: 1, start: null, end: null, pinW: [] };
  let S = scrollY;            // posizione di scroll smorzata
  let last = 0, raf = 0;
  const TAU = .085;           // costante di tempo dello smorzamento (s)
  let sel = 0;                // ingrediente selezionato (indice nella ricetta di «info»)
  const selW = [1, 0, 0];     // peso animato di ciascun ingrediente
  const ptr = { tx: 0, ty: 0, x: 0, y: 0 };
  let pendingFocus = 0;
  let bancoIndex = 0;
  let lastZone = '';
  let slotHidden = -1;

  /* ---------------- Misure (solo qui si legge il layout) ---------------- */
  function measure() {
    M.vw = innerWidth; M.vh = innerHeight; M.hh = header.offsetHeight;
    const sy = scrollY, sx = scrollX;
    const heroTop = hero.getBoundingClientRect().top + sy;
    M.pinStart = heroTop - M.hh;
    M.pinEnd = Math.max(M.pinStart + 1, heroTop + hero.offsetHeight - stage.offsetHeight - M.hh);
    const cr = canvas.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    M.cw = cr.width; M.ch = cr.height;
    M.start = { x: cr.left + sx, y: M.pinEnd + M.hh + (cr.top - sr.top), w: cr.width, h: cr.height };
    const pr = plate.getBoundingClientRect();
    M.end = { x: pr.left + sx, y: pr.top + sy, w: pr.width, h: pr.height };
    M.travelStart = M.pinEnd;
    M.travelEnd = banco.getBoundingClientRect().top + sy - M.hh;
    M.travel = scene && !fig.classList.contains('is-missing') && M.travelEnd > M.travelStart + 80;
    traveler.style.width = fmt(M.start.w) + 'px';
    traveler.style.height = fmt(M.start.h) + 'px';
    M.preset = mqDesk.matches ? PRESET.desk : PRESET.phone;
    measurePins();
    M.btn = recipeBtns.map(b => ({ x: b.offsetLeft, w: b.offsetWidth }));
    placePill(false);
    reserveIngHeight();
    lastZone = '';
  }

  // Larghezze dei pin per ogni ricetta, misurate qui: durante il cambio non si legge il layout.
  function measurePins() {
    const probe = pins[0].cloneNode(true);
    probe.removeAttribute('data-pin'); probe.setAttribute('aria-hidden', 'true'); probe.tabIndex = -1;
    probe.style.cssText = 'visibility:hidden;transform:none';
    pinsWrap.append(probe);
    const label = $('.pin-label', probe);
    REC.forEach(r => { r.pinW = r.d.ingredients.map(g => { label.textContent = g.name; return probe.offsetWidth; }); });
    probe.remove();
    M.pinW = info.pinW;
  }

  // Spazio riservato alla lista ingredienti: il cambio di ricetta non sposta nulla sotto di essa.
  function reserveIngHeight() {
    const w = ingList.getBoundingClientRect().width;
    // si rifà solo se cambiano larghezza o caratteri (prima e dopo il caricamento dei font)
    const key = w + '|' + (document.fonts ? document.fonts.status : '');
    if (!w || key === M.ingKey) return;
    M.ingKey = key;
    const probe = ingList.cloneNode(false);
    probe.removeAttribute('id'); probe.removeAttribute('aria-live'); probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = `position:absolute;left:0;top:0;width:${w}px;min-height:0;visibility:hidden;pointer-events:none`;
    ingList.parentNode.append(probe);
    let max = 0;
    REC.forEach(r => { probe.innerHTML = ingHtml(r, -1); max = Math.max(max, probe.offsetHeight); });
    probe.remove();
    ingList.style.minHeight = max ? Math.ceil(max) + 'px' : '';
  }

  /* ---------------- Trasformazioni ---------------- */
  // Applica a un punto (px del canvas) la trasformazione di livello e quella del gruppo.
  function project(px, py, L, G) {
    const ox = M.cw / 2, oy = M.ch / 2;
    const r = L.r * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    let x = px - ox, y = py - oy;
    x *= L.s; y *= L.s;
    let X2 = ox + L.tx + (x * c - y * s), Y2 = oy + L.ty + (x * s + y * c);
    const gox = M.cw * .5, goy = M.ch * .58;
    X2 = gox + G.tx + (X2 - gox) * G.s; Y2 = goy + G.ty + (Y2 - goy) * G.s;
    return [X2, Y2];
  }
  const fmt = n => n.toFixed(2);
  const L0 = { tx: 0, ty: 0, r: 0, s: 1 };

  function showBeat(el, v, dy, focusOwner) {
    const hasFocus = el.contains(document.activeElement);
    if (focusOwner && focusOwner !== el && !hasFocus) v = 0;   // il blocco con il focus ha la precedenza
    if (hasFocus) v = 1;
    css(el, 'opacity', v.toFixed(3));
    css(el, 'transform', `translate3d(0,${(dy * (1 - v)).toFixed(1)}px,0)`);
    const vis = v > .01;
    if (el._vis !== vis) { el.style.visibility = vis ? 'visible' : 'hidden'; el._vis = vis; }
    const act = v > .5 || hasFocus;
    if (el._act !== act) { el.inert = !act; el._act = act; }
  }
  function showCtl(el, v) {
    const vis = v > .01, act = v > .5;
    css(el, 'opacity', v.toFixed(3));
    if (el._vis !== vis) { el.style.visibility = vis ? 'visible' : 'hidden'; el._vis = vis; }
    if (el._act !== act) { el.inert = !act; el._act = act; }
  }

  /* ---------------- Pesi del cambio di farcitura ----------------
     k: 0 → 1 in SWITCH_MS. La farcitura uscente scivola via (0–.42), il fondo cambia
     sotto un pane fermo (.28–.62), la nuova farcitura entra dal lato opposto (.46–1).
     La ricetta entrante sta sopra l'uscente: dove il pane coincide non si vede alcuna dissolvenza. */
  const inSolid = k => smooth(seg(k, .28, .62));
  const inFill = k => smooth(seg(k, .46, 1));
  const outFill = k => 1 - smooth(seg(k, 0, .42));
  const outCovered = k => 1 - smooth(seg(k, .5, .86));   // coperta dalla nuova: sparisce dopo
  const outCross = k => 1 - smooth(seg(k, .22, .62));    // non coperta: dissolvenza incrociata

  /* ---------------- Render della scena ---------------- */
  function renderScene() {
    const P = M.preset;
    const p = clamp((S - M.pinStart) / (M.pinEnd - M.pinStart));
    // apertura: 0.13–0.41 si apre, 0.41–0.64 resta aperta, 0.64–0.89 si ricompone
    const o = p < .64 ? sine(seg(p, .13, .41)) : 1 - sine(seg(p, .64, .89));
    const a = ease(seg(p, .04, .30)) * (1 - ease(seg(p, .64, .90)));   // avvicinamento
    const explore = seg(o, .72, 1);

    // testi: stessa timeline del prodotto
    const active = document.activeElement;
    const owner = [beats.intro, beats.story, beats.finale].find(b => b.contains(active)) || null;
    showBeat(beats.intro, 1 - ease(seg(p, .10, .21)), -26, owner);
    showBeat(beats.story, ease(seg(p, .16, .29)) * (1 - ease(seg(p, .66, .75))), p < .5 ? 22 : -22, owner);
    showBeat(beats.finale, ease(seg(p, .74, .85)), 22, owner);
    const introV = owner && owner !== beats.intro ? 0 : 1 - ease(seg(p, .10, .21));
    css(cue, 'opacity', (1 - seg(p, .01, .06)).toFixed(3));

    // «Guarda dentro» segue l'apertura; il selettore resta finché la focaccia è in scena
    showCtl(look, look.contains(active) ? 1 : introV);
    showCtl(switcher, switcher.contains(active) ? 1 : 1 - seg(p, .84, .93));

    // parallasse del puntatore: pochi pixel, solo prima del rilascio
    const par = mqFine.matches && mqDesk.matches ? 1 - seg(p, .8, .9) : 0;
    const G = {
      s: 1 + P.approach * a - P.shrink * o,
      tx: M.cw * P.gx / 100 * o + ptr.x * par,
      ty: M.ch * P.gy / 100 * o + ptr.y * par
    };
    css(group, 'transform', `translate3d(${fmt(G.tx)}px,${fmt(G.ty)}px,0) scale(${G.s.toFixed(4)})`);

    // durante il cambio i testi della ricetta escono e rientrano: lo scambio avviene a testo invisibile
    const tv = X ? (X.k < .5 ? 1 - smooth(seg(X.k, .14, .44)) : smooth(seg(X.k, .56, .86))) : 1;
    const capV = (1 - seg(o, .02, .2)) * (1 - seg(p, .86, .96));
    if (caption) css(caption, 'opacity', (capV * tv).toFixed(3));
    if (stamp) css(stamp, 'opacity', capV.toFixed(3));
    css(ingList, 'opacity', tv.toFixed(3));
    if (storyRecipe) css(storyRecipe, 'opacity', tv.toFixed(3));

    // livelli: stessa geometria per tutte le ricette
    const ing = info.d.ingredients;
    const lift = layer => { let w = 0; ing.forEach((g, i) => { if (g.layer === layer) w = Math.max(w, selW[i]); }); return w; };
    const lay = (key, v, w) => {
      const [x, y, r] = P[key];
      const l = w * explore;                         // avvicinamento dell'ingrediente scelto
      return { tx: M.cw * x / 100 * v, ty: M.ch * (y * v - .9 * l) / 100, r: r * v, s: 1 + .024 * l };
    };
    const oLid = clamp(o * 1.1), oMeat = clamp((o - .08) / .92), oFondo = o;
    const L = { lid: lay('lid', oLid, 0), meat: lay('meat', oMeat, lift('filling')), fondo: lay('fondo', oFondo, lift('bottom')) };
    const tf = (t, dx = 0) => `translate3d(${fmt(t.tx + dx)}px,${fmt(t.ty)}px,0) rotate(${t.r.toFixed(3)}deg) scale(${t.s.toFixed(4)})`;
    const open6 = seg(o, 0, .06);
    const shLC = 1 - seg(oLid, 0, .4), shLS = seg(oLid, .1, .9) * .9, shF = seg(oMeat, .05, .6) * .85;
    const paint = (r, wPoster, wSolid, wFill, dx) => {
      const po = (1 - r.rw * open6) * wPoster;
      css(r.poster, 'opacity', po.toFixed(3));
      if (!r.layersOK) return;
      // a focaccia chiusa il poster copre i livelli: a opacità 0 il compositore non li disegna
      const hid = po > .999;
      const W = r.wrap, ws = hid ? '0' : wSolid.toFixed(3);
      css(W.lid, 'opacity', ws); css(W.fondo, 'opacity', ws);
      css(W.meat, 'opacity', hid ? '0' : wFill.toFixed(3));
      css(W.lid, 'transform', tf(L.lid));
      css(W.meat, 'transform', tf(L.meat, dx));
      css(W.fondo, 'transform', tf(L.fondo));
      if (r.sh.lidC) css(r.sh.lidC, 'opacity', shLC.toFixed(3));
      if (r.sh.lidS) css(r.sh.lidS, 'opacity', shLS.toFixed(3));
      if (r.sh.fill) css(r.sh.fill, 'opacity', (shF * (wSolid > .001 ? Math.min(1, wFill / wSolid) : 0)).toFixed(3));
    };
    if (!X) paint(shown, 1, 1, 1, 0);
    else {
      const k = X.k, B = X.to, A = X.from;
      const tIn = seg(k, .46, 1), tOut = seg(k, 0, .42);
      paint(B, inSolid(k), inSolid(k), inFill(k), X.dir * SLIDE / 100 * M.cw * Math.pow(1 - tIn, 3));
      const pvB = 1 - B.rw * open6;                // quanto la nuova è mostrata dal poster chiuso
      const lvB = B.layersOK ? B.rw * (1 - pvB) : 0; // quanto è mostrata a strati aperti
      paint(A, lerp(outCross(k), outCovered(k), pvB), lerp(outCross(k), outCovered(k), lvB), outFill(k),
        -X.dir * SLIDE / 100 * M.cw * tOut * tOut * tOut);
    }

    // pin: calcolati dalla stessa geometria dei livelli, per la ricetta mostrata
    const pinsFocus = pinsWrap.contains(active);
    const kPin = X ? (X.k < .5 ? 1 - seg(X.k, 0, .3) : seg(X.k, .62, 1)) : 1;
    const pv = pinsFocus ? 1 : ease(explore) * kPin;
    const show = pv > .02;
    if (pinsWrap._vis !== show) { pinsWrap.style.visibility = show ? 'visible' : 'hidden'; pinsWrap._vis = show; }
    const act = (pv > .6 && kPin > .9) || pinsFocus;
    if (pinsWrap._act !== act) { pinsWrap.inert = !act; pinsWrap._act = act; }
    if (show) {
      css(pinsWrap, 'opacity', pv.toFixed(3));
      const openA = info.d.open && info.d.open.anchors ? info.d.open.anchors[mqDesk.matches ? 'desk' : 'phone'] : null;
      const rw = info.layersOK ? info.rw : 0;
      ing.forEach((g, i) => {
        const c = info.d.closedAnchors[i];
        let [x, y] = project(c.x / 1536 * M.cw, c.y / 1024 * M.ch, L0, G);
        if (openA && rw > 0) {
          const A = openA[i];
          const [ox, oy] = project(A.x / 1536 * M.cw, A.y / 1024 * M.ch, g.layer === 'filling' ? L.meat : L.fondo, G);
          x = lerp(x, ox, rw); y = lerp(y, oy, rw);
        }
        // etichetta a sinistra se uscirebbe dallo schermo
        const flip = M.start.x + x + M.pinW[i] > M.vw - 10;
        if (flip) x -= M.pinW[i] - 38;
        pins[i].classList.toggle('is-flipped', flip);
        css(pins[i], 'transform', `translate3d(${fmt(x)}px,${fmt(y + (1 - pv) * 8)}px,0)`);
      });
      if (pendingFocus && act && pv > .9) { pins[sel].focus({ preventScroll: true }); pendingFocus = 0; }
    }
  }

  /* ---------------- Passaggio al banco ---------------- */
  function setSlot(i) {
    if (slotHidden === i) return;
    if (slotHidden >= 0) plateImgs[slotHidden].style.opacity = '';
    if (i >= 0) plateImgs[i].style.opacity = '0';
    slotHidden = i;
  }
  function renderTravel() {
    if (!M.travel) {
      css(traveler, 'visibility', 'hidden');
      css(fig, 'opacity', '');
      setSlot(-1);
      return 'none';
    }
    const t = clamp((S - M.travelStart) / (M.travelEnd - M.travelStart));
    const zone = t <= 0 ? 'before' : t >= 1 ? 'after' : 'travel';
    const match = bancoIndex === shown.d.bancoIndex;   // il banco mostra la stessa ricetta della hero
    css(fig, 'opacity', zone === 'before' ? '' : '0');
    setSlot(match && zone !== 'after' ? bancoIndex : -1);
    if (zone !== 'travel') { css(traveler, 'visibility', 'hidden'); return zone; }
    const e = smooth(t);
    const A = M.start, B = M.end;
    // dimensione fissa (quella di partenza) e scala: il compositore sposta un'immagine già pronta
    const sx = lerp(A.w, B.w, e) / A.w, sy = lerp(A.h, B.h, e) / A.h;
    css(traveler, 'transform', `translate3d(${fmt(lerp(A.x, B.x, e))}px,${fmt(lerp(A.y, B.y, e))}px,0) scale(${sx.toFixed(5)},${sy.toFixed(5)})`);
    css(traveler, 'opacity', match ? '1' : (1 - seg(t, .5, .92)).toFixed(3));
    css(traveler, 'visibility', 'visible');
    return zone;
  }
  function syncTraveler() {
    const src = shown.poster.getAttribute('src');
    if (src && travelerImg.getAttribute('src') !== src) { travelerImg.src = src; if (travelerImg.decode) travelerImg.decode().catch(() => {}); }
  }

  /* ---------------- Scheduler unico ---------------- */
  function tick(now) {
    raf = 0;
    if (!scene) return;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const T = scrollY;
    const far = T > M.travelEnd + M.vh * 1.5 && S > M.travelEnd + M.vh * 1.5;
    if (far) S = T; else { S += (T - S) * (1 - Math.exp(-dt / TAU)); if (Math.abs(T - S) < .35) S = T; }
    let moving = S !== T;
    const kSel = 1 - Math.exp(-dt / .16);
    for (let i = 0; i < 3; i++) {
      const goal = i === sel ? 1 : 0;
      selW[i] += (goal - selW[i]) * kSel;
      if (Math.abs(goal - selW[i]) < .002) selW[i] = goal; else moving = true;
    }
    const kP = 1 - Math.exp(-dt / .14);
    ptr.x += (ptr.tx - ptr.x) * kP; ptr.y += (ptr.ty - ptr.y) * kP;
    if (Math.abs(ptr.tx - ptr.x) > .05 || Math.abs(ptr.ty - ptr.y) > .05) moving = true; else { ptr.x = ptr.tx; ptr.y = ptr.ty; }
    // livelli arrivati in ritardo: compaiono con una dissolvenza, non di colpo
    const kR = 1 - Math.exp(-dt / .12);
    REC.forEach(r => {
      const goal = r.layersOK ? 1 : 0;
      if (r.rw === goal) return;
      r.rw += (goal - r.rw) * kR;
      if (Math.abs(goal - r.rw) < .003) r.rw = goal; else moving = true;
    });
    if (X) {
      X.k = clamp((now - X.t0) / SWITCH_MS);
      moving = true;
      if (!X.swapped && X.k >= .5) { X.swapped = true; setInfo(X.to); }
    }

    const zone = S < M.travelStart ? 'scene' : S < M.travelEnd ? 'travel' : 'after';
    if (!(zone === 'after' && lastZone === 'after' && far)) {
      if (S < M.travelEnd + M.vh) renderScene();
      renderTravel();
    }
    lastZone = zone;
    if (X && X.k >= 1) finishSwitch();
    if (pendingFocus && now - pendingFocus > 4000) pendingFocus = 0;
    if (moving || pendingFocus) raf = requestAnimationFrame(tick); else last = 0;
  }
  const wake = () => { if (scene && !raf) raf = requestAnimationFrame(tick); };

  function clearScene() {
    const els = [group, caption, stamp, cue, look, switcher, pinsWrap, fig, traveler];
    REC.forEach(r => { els.push(r.poster); if (r.wrap) els.push(...Object.values(r.wrap), ...Object.values(r.sh)); });
    els.push(ingList, storyRecipe);
    els.filter(Boolean).forEach(el => { el.style.cssText = ''; el.inert = false; el._vis = el._act = el._c = undefined; });
    Object.values(beats).forEach(el => { el.style.cssText = ''; el.inert = false; el._vis = el._act = el._c = undefined; });
    pins.forEach(p => { p.style.transform = ''; p._c = undefined; });
    placePill(false);
    setSlot(-1);
  }

  function setMode() {
    const want = !reduced() && !mqLow.matches;
    doc.classList.toggle('rm', reduced());
    if (want !== scene) {
      scene = want;
      if (!scene) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (X) { X.k = 1; setInfo(X.to); finishSwitch(); }
        clearScene();
      }
    }
    requestAnimationFrame(() => { measure(); S = scrollY; wake(); });
    if (document.readyState === 'complete') bootLoad(); else addEventListener('load', bootLoad, { once: true });
  }

  /* ---------------- Caricamento: decodifica prima di mostrare ---------------- */
  function decodeImg(img) {
    const check = () => { if (!img.naturalWidth) throw new Error('immagine non disponibile: ' + img.getAttribute('src')); };
    const byEvents = () => new Promise((res, rej) => {
      if (img.complete) { (img.naturalWidth ? res : rej)(); return; }
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', rej, { once: true });
    });
    return (img.decode ? img.decode().catch(byEvents) : byEvents()).then(check, () => { throw new Error('immagine non disponibile: ' + img.getAttribute('src')); });
  }
  function loadPoster(r) {
    if (!r.pp) {
      if (!r.poster.getAttribute('src')) {
        const from = $(r.d.posterFrom);
        if (from && from.getAttribute('src')) r.poster.src = from.getAttribute('src');
      }
      r.pp = decodeImg(r.poster);
      r.pp.catch(() => { r.pp = null; });     // un nuovo tap potrà riprovare
    }
    return r.pp;
  }
  function loadLayers(r) {
    if (!r.openable) return Promise.resolve(false);
    if (!r.lp) {
      const imgs = $$('[data-src]', r.g);
      imgs.forEach(img => { if (!img.getAttribute('src')) img.src = img.dataset.src; });
      r.lp = Promise.all(imgs.map(decodeImg)).then(() => {
        r.layersOK = true; r.g.classList.add('is-ready'); wake(); return true;
      }, err => {
        // livelli mancanti: la ricetta resta disponibile con il suo poster chiuso
        r.openable = false; r.g.classList.add('is-failed');
        console.warn('Salumée: livelli non disponibili per', r.id, err && err.message);
        wake(); return false;
      });
    }
    return r.lp;
  }
  function ensure(r) {
    return Promise.all([loadPoster(r), scene ? loadLayers(r) : null]).then(() => { r.decoded = true; });
  }
  let booted = false;
  function bootLoad() {
    if (scene) loadLayers(shown);
    if (booted) return;
    booted = true;
    const idle = window.requestIdleCallback ? cb => requestIdleCallback(cb, { timeout: 2500 }) : cb => setTimeout(cb, 700);
    // le altre ricette si preparano a pagina ferma, così il cambio è immediato
    idle(() => REC.forEach(r => { if (r !== shown) ensure(r).catch(() => {}); }));
  }
  const markMissing = () => { fig.classList.add('is-missing'); requestAnimationFrame(() => { measure(); wake(); }); };
  if (firstPoster) {
    if (firstPoster.complete && firstPoster.naturalWidth === 0) markMissing();
    firstPoster.addEventListener('error', markMissing);
  }

  /* ---------------- Cambio di ricetta ---------------- */
  function chooseRecipe(id, { fromBanco = false } = {}) {
    const r = byId(id);
    if (!r) return;
    selected = r;
    const target = X ? X.to : shown;
    const t = ++token;
    pending = r === target ? null : r;
    reflect(fromBanco);
    if (!pending) return;
    ensure(r).then(() => {
      if (t !== token) return;              // un tap successivo ha la precedenza
      reflect(true);
      if (!X) startSwitch(r);               // altrimenti parte alla fine del cambio in corso
    }, err => {
      if (t !== token) return;
      // asset mancante: resta l'ultima composizione valida
      console.warn('Salumée: ricetta non disponibile', r.id, err && err.message);
      pending = null;
      selected = X ? X.to : shown;
      reflect(false);
    });
  }
  // La pillola si sposta con un'animazione di sola trasformazione (FLIP): la esegue il compositore.
  function placePill(animate) {
    if (!pill || !M.btn) return;
    const m = M.btn[recipeBtns.findIndex(b => b.dataset.recipe === selected.id)];
    if (!m || !m.w) return;
    let from = null;
    if (animate && pill._m && pill.animate && !reduced()) {
      const r = pill.getBoundingClientRect(), sr = switcher.getBoundingClientRect(), k = sr.width / switcher.offsetWidth || 1;
      from = { x: (r.left - sr.left) / k, w: r.width / k };
    }
    pill.getAnimations && pill.getAnimations().forEach(a => a.cancel());
    pill.style.left = m.x + 'px';
    pill.style.width = m.w + 'px';
    if (from && (Math.abs(from.x - m.x) > .5 || Math.abs(from.w - m.w) > .5)) {
      pill.animate([{ transform: `translateX(${(from.x - m.x).toFixed(2)}px) scaleX(${(from.w / m.w).toFixed(4)})` }, { transform: 'none' }],
        { duration: 440, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
    pill._m = m;
  }
  function reflect(skipBanco) {
    recipeBtns.forEach(b => {
      const on = b.dataset.recipe === selected.id;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-loading', on && !!pending && pending === selected && !pending.decoded);
    });
    placePill(true);
    if (!skipBanco && bancoIndex !== selected.d.bancoIndex) selectDish(selected.d.bancoIndex, { fromRecipe: true });
  }
  function startSwitch(r) {
    pending = null;
    reflect(true);
    const from = shown;
    if (r === from) return;
    shown = r;
    syncTraveler();
    const animate = scene && !document.hidden && scrollY < M.travelStart;
    if (!animate) {
      from.g.classList.remove('is-on');
      r.g.classList.add('is-on');
      setInfo(r);
      if (!scene && r.poster.animate) r.poster.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'linear' });
      lastZone = ''; wake();
      afterSwitch();
      return;
    }
    X = { from, to: r, dir: r.n > from.n ? 1 : -1, t0: performance.now(), k: 0, swapped: false };
    // la nuova composizione parte invisibile, sopra quella attuale
    css(r.poster, 'opacity', '0');
    if (r.wrap) Object.values(r.wrap).forEach(w => { css(w, 'opacity', '0'); });
    r.g.style.zIndex = '2'; from.g.style.zIndex = '1';
    r.g.classList.add('is-on');
    wake();
  }
  function finishSwitch() {
    const { from, to } = X;
    X = null;
    if (from !== shown) from.g.classList.remove('is-on');
    from.g.style.zIndex = ''; to.g.style.zIndex = '';
    if (info !== to) setInfo(to);
    afterSwitch();
  }
  function afterSwitch() {
    if (pending && pending !== shown && pending.decoded) startSwitch(pending);
  }

  // Nome, ingredienti, pin, didascalia e testo alternativo cambiano insieme
  const ingHtml = (r, cur) => r.d.ingredients.map((g, i) =>
    `<li data-ing="${i}"${i === cur ? ' class="is-current"' : ''}><h3 class="ing-name">${esc(g.name)}</h3><p>${esc(g.text)}</p></li>`).join('');
  const altFor = r => `Focaccia con ${r.d.caption.join(' ').replace(/^./, c => c.toLowerCase())}. Immagine illustrativa.`;
  function setInfo(r) {
    const prev = info;
    info = r;
    const ing = r.d.ingredients;
    // l'ingrediente scelto resta se esiste anche nella nuova ricetta
    const name = prev.d.ingredients[sel] && prev.d.ingredients[sel].name;
    const k = ing.findIndex(g => g.name === name);
    const next = k >= 0 ? k : 0;
    if (prev !== r) { const w = selW[sel]; selW.fill(0); selW[next] = w; }
    sel = next;
    if (ingList.dataset.recipe !== r.id) { ingList.innerHTML = ingHtml(r, sel); ingList.dataset.recipe = r.id; }
    const hadFocus = pins.indexOf(document.activeElement);
    pins.forEach((p, i) => {
      p.hidden = !ing[i];
      if (ing[i]) $('.pin-label', p).textContent = ing[i].name;
    });
    if (hadFocus >= 0 && pins[hadFocus].hidden) pins[0].focus({ preventScroll: true });
    selectIngredient(sel);
    if (storyRecipe) storyRecipe.textContent = r.d.name;
    if (caption) caption.innerHTML = r.d.caption.map(esc).join('<br> ');
    REC.forEach(x => { x.poster.alt = x === r ? altFor(x) : ''; });
    canvas.dataset.label = r.d.caption.join(' ');
    if (r.pinW) M.pinW = r.pinW;
  }

  /* ---------------- Ingredienti ---------------- */
  function selectIngredient(i) {
    sel = i;
    pins.forEach((p, k) => p.setAttribute('aria-pressed', String(k === i)));
    $$('li', ingList).forEach((li, k) => li.classList.toggle('is-current', k === i));
    wake();
  }
  pins.forEach((p, i) => p.addEventListener('click', () => selectIngredient(i)));
  recipeBtns.forEach(b => b.addEventListener('click', () => chooseRecipe(b.dataset.recipe)));
  if (switcher) switcher.hidden = false;
  const pill = switcher ? mk('span', 'recipe-pill', { 'aria-hidden': 'true' }) : null;
  if (pill) { switcher.prepend(pill); switcher.classList.add('has-pill'); }
  setInfo(shown);
  syncTraveler();

  look.addEventListener('click', () => {
    const top = M.pinStart + .53 * (M.pinEnd - M.pinStart);
    pendingFocus = performance.now();
    scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' });
    wake();
  });

  stage.addEventListener('pointermove', e => {
    if (!scene || e.pointerType !== 'mouse' || !mqFine.matches) return;
    const r = stage.getBoundingClientRect();
    ptr.tx = ((e.clientX - r.left) / r.width - .5) * 12;
    ptr.ty = ((e.clientY - r.top) / r.height - .5) * 7;
    wake();
  });
  stage.addEventListener('pointerleave', () => { ptr.tx = ptr.ty = 0; wake(); });

  addEventListener('scroll', wake, { passive: true });
  let rz = 0;
  const remeasure = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { measure(); wake(); }); };
  addEventListener('resize', remeasure, { passive: true });
  addEventListener('orientationchange', remeasure);
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(remeasure); ro.observe(hero); ro.observe(banco); ro.observe(plate); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  onChange(mqReduce, setMode);
  onChange(mqLow, setMode);
  onChange(mqDesk, remeasure);
  addEventListener('pageshow', () => { S = scrollY; remeasure(); });

  /* ---------------- Il banco: tre specialità ---------------- */
  const tablist = $('[data-tablist]');
  const tabs = $$('[data-tab]', tablist);
  const panels = $$('.banco-info .panel');
  const count = $('.banco-count'), plateNo = $('.plate-no');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-orientation', 'vertical');
  tabs.forEach((tab, i) => {
    tab.id = `tab-${tab.dataset.tab}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[i].id);
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-labelledby', tab.id);
  });
  const anim = (el, frames, opt) => (el.animate && !reduced() ? el.animate(frames, opt) : null);
  // Il banco lontano dallo schermo si aggiorna senza animazioni: nessun lavoro mentre la hero si muove.
  let bancoNear = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { bancoNear = es[es.length - 1].isIntersecting; }, { rootMargin: '300px 0px' }).observe(banco);
  function selectDish(index, { focus = false, dir = 0, fromRecipe = false } = {}) {
    const next = (index + tabs.length) % tabs.length;
    const prev = bancoIndex;
    if (!dir) dir = next > prev ? 1 : -1;
    bancoIndex = next;
    tabs.forEach((tab, i) => {
      const on = i === next;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].classList.toggle('is-active', on);
      panels[i].tabIndex = on ? 0 : -1;
      if (on) panels[i].removeAttribute('aria-hidden'); else panels[i].setAttribute('aria-hidden', 'true');
    });
    count.textContent = `0${next + 1} / 0${tabs.length}`;
    plateNo.textContent = `0${next + 1}`;
    if (next !== prev) {
      const opt = { duration: 460, easing: 'cubic-bezier(.22,1,.36,1)' };
      const quiet = fromRecipe && !bancoNear;
      plateImgs[prev].classList.remove('is-active');
      plateImgs[next].classList.add('is-active');
      if (quiet) { banco.classList.add('is-quiet'); requestAnimationFrame(() => requestAnimationFrame(() => banco.classList.remove('is-quiet'))); }
      else {
        anim(plateImgs[prev], [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 7}%)` }], opt);
        anim(plateImgs[next], [{ opacity: 0, transform: `translateX(${dir * 7}%)` }, { opacity: 1, transform: 'none' }], opt);
        anim(panels[next], [{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }], opt);
      }
      wake();
    }
    if (focus) tabs[next].focus({ preventScroll: true });
    // il banco e la hero condividono la ricetta scelta
    if (!fromRecipe) { const r = REC.find(x => x.d.bancoIndex === next); if (r) chooseRecipe(r.id, { fromBanco: true }); }
  }
  tabs.forEach((tab, i) => tab.addEventListener('click', () => selectDish(i)));
  tablist.addEventListener('keydown', e => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (e.key in keys) { e.preventDefault(); selectDish(bancoIndex + keys[e.key], { focus: true, dir: keys[e.key] }); }
    else if (e.key === 'Home') { e.preventDefault(); selectDish(0, { focus: true }); }
    else if (e.key === 'End') { e.preventDefault(); selectDish(tabs.length - 1, { focus: true }); }
  });
  $$('[data-step]').forEach(b => b.addEventListener('click', () => {
    const d = Number(b.dataset.step); selectDish(bancoIndex + d, { dir: d });
  }));
  let down = null;
  plate.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  plate.addEventListener('pointerup', e => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y; down = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) { const d = dx < 0 ? 1 : -1; selectDish(bancoIndex + d, { dir: d }); }
  });
  plate.addEventListener('pointercancel', () => { down = null; });
  plateImgs.forEach(img => { img.draggable = false; });
  selectDish(shown.d.bancoIndex, { fromRecipe: true });

  /* Dialog di dettaglio: il focus torna al pulsante che l'ha aperto */
  const dialog = $('.dish-dialog');
  const opener = $('.open-dialog');
  opener.addEventListener('click', () => {
    const panel = panels[bancoIndex];
    $('#dialog-title').textContent = $('.panel-name', panel).textContent;
    $('.dialog-price').textContent = $('.panel-price [aria-hidden]', panel).textContent;
    $('.dialog-recipe').textContent = $('.panel-recipe', panel).textContent;
    const img = $('.dialog-image img');
    img.src = plateImgs[bancoIndex].currentSrc || plateImgs[bancoIndex].getAttribute('src');
    img.alt = `${$('.panel-name', panel).textContent}, immagine illustrativa`;
    dialog.showModal();
    document.body.classList.add('dialog-open');
    $('.dialog-close').focus();
  });
  // chiusura accompagnata: breve dissolvenza, poi close() (Esc compreso)
  let closing = false;
  function closeDialog() {
    if (!dialog.open || closing) return;
    if (reduced() || !dialog.animate) { dialog.close(); return; }
    closing = true;
    dialog.classList.add('is-closing');
    const a = dialog.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) scale(.99)' }], { duration: 190, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    a.onfinish = a.oncancel = () => { dialog.close(); a.cancel(); dialog.classList.remove('is-closing'); closing = false; };
  }
  $('.dialog-close').addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', e => { e.preventDefault(); closeDialog(); });
  dialog.addEventListener('close', () => { document.body.classList.remove('dialog-open'); opener.focus({ preventScroll: true }); });
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog();
  });

  /* ---------------- Menu completo: ricerca, ricerche rapide, apertura ---------------- */
  const q = $('#menu-q');
  const list = $('#dishes');
  const dishes = $$('.dish', list);
  const status = $('#menu-status');
  const empty = $('.menu-empty');
  const more = $('.menu-more');
  const reset1 = $('.search-reset'), reset2 = $('.search-reset-2');
  const chips = $$('.chip');
  const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/’/g, "'");
  const escHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  dishes.forEach(d => { $$('.dish-name, .dish-desc', d).forEach(n => { n._raw = n.textContent; }); });
  function mark(node, words) {
    const raw = node._raw;
    if (!words.length) { node.textContent = raw; return; }
    const f = fold(raw);
    const hits = [];
    words.forEach(w => { let i = f.indexOf(w); while (i >= 0) { hits.push([i, i + w.length]); i = f.indexOf(w, i + w.length); } });
    if (!hits.length) { node.textContent = raw; return; }
    hits.sort((a, b) => a[0] - b[0]);
    let out = '', pos = 0;
    hits.forEach(([s, e]) => { if (s < pos) return; out += escHtml(raw.slice(pos, s)) + '<mark>' + escHtml(raw.slice(s, e)) + '</mark>'; pos = e; });
    node.innerHTML = out + escHtml(raw.slice(pos));
  }
  let expanded = false;
  function applySearch() {
    const raw = q.value.trim();
    const term = fold(raw);
    const words = term.split(/\s+/).filter(w => w.length > 1);
    let n = 0;
    dishes.forEach(d => {
      const t = d.dataset.search;
      const hit = !term || t.includes(term) || (words.length > 0 && words.every(w => t.includes(w)));
      const was = !d.hidden;
      d.hidden = !hit;
      if (hit) { n++; if (term && !was) { d.style.animationDelay = ''; d.classList.remove('is-hit'); void d.offsetWidth; d.classList.add('is-hit'); } }
      $$('.dish-name, .dish-desc', d).forEach(node => mark(node, hit && term ? words : []));
    });
    empty.hidden = n > 0;
    $('.empty-q').textContent = raw;
    status.textContent = !term ? '' : n ? `${n} ${n === 1 ? 'focaccia' : 'focacce'} per «${raw}».` : `Nessuna focaccia per «${raw}».`;
    reset1.hidden = !term;
    chips.forEach(c => c.setAttribute('aria-pressed', String(fold(c.dataset.q) === term)));
    const collapse = !term && !expanded && !mqDesk.matches;
    list.classList.toggle('is-collapsed', collapse);
    more.hidden = !collapse;
  }
  q.addEventListener('input', applySearch);
  q.addEventListener('keydown', e => { if (e.key === 'Escape' && q.value) { e.preventDefault(); q.value = ''; applySearch(); } });
  chips.forEach(c => c.addEventListener('click', () => {
    q.value = c.getAttribute('aria-pressed') === 'true' ? '' : c.dataset.q;
    applySearch();
  }));
  const clearSearch = () => { q.value = ''; applySearch(); q.focus(); };
  reset1.addEventListener('click', clearSearch);
  reset2.addEventListener('click', clearSearch);
  more.addEventListener('click', () => {
    expanded = true; applySearch(); more.setAttribute('aria-expanded', 'true');
    // le voci che compaiono entrano in sequenza, senza spostare quelle già visibili
    if (!reduced()) dishes.slice(6).forEach((d, i) => { d.style.animationDelay = `${Math.min(i, 11) * 28}ms`; d.classList.remove('is-hit'); void d.offsetWidth; d.classList.add('is-hit'); });
    const firstHidden = dishes[6]; if (firstHidden) { const h = $('.dish-name', firstHidden); h.tabIndex = -1; h.focus({ preventScroll: true }); }
  });
  onChange(mqDesk, applySearch);
  applySearch();

  /* ---------------- Sedi ---------------- */
  const sedeList = $('[data-sede-tabs]');
  const sedeTabs = $$('[data-sede]', sedeList);
  const sedePanels = $$('[data-sede-panel]');
  sedeList.setAttribute('role', 'tablist');
  sedeTabs.forEach((t, i) => {
    t.id = `tab-sede-${t.dataset.sede}`;
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-controls', sedePanels[i].id);
    sedePanels[i].setAttribute('role', 'tabpanel');
    sedePanels[i].setAttribute('aria-labelledby', t.id);
  });
  function selectSede(i, focus) {
    const n = (i + sedeTabs.length) % sedeTabs.length;
    sedeTabs.forEach((t, k) => { const on = k === n; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    sedePanels.forEach((p, k) => {
      const on = k === n; p.classList.toggle('is-active', on); p.tabIndex = on ? 0 : -1;
      if (on) p.removeAttribute('aria-hidden'); else p.setAttribute('aria-hidden', 'true');
      p.inert = !on;
    });
    if (focus) sedeTabs[n].focus();
  }
  sedeTabs.forEach((t, i) => t.addEventListener('click', () => selectSede(i)));
  sedeList.addEventListener('keydown', e => {
    const cur = sedeTabs.indexOf(document.activeElement);
    if (cur < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); selectSede(cur + 1, true); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); selectSede(cur - 1, true); }
    else if (e.key === 'Home') { e.preventDefault(); selectSede(0, true); }
    else if (e.key === 'End') { e.preventDefault(); selectSede(sedeTabs.length - 1, true); }
  });
  selectSede(0);

  setMode();
})();
