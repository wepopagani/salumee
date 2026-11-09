/* SALUMÉE V4 — Paninoteca. Una timeline (S = scroll smorzato nel tempo) governa apertura, testi,
   pin e passaggio al banco. L'apertura della Mortadella è la sequenza di fotogrammi del video:
   l'indice segue il movimento visibile (curva in data/ricette-hero.json), non il numero del frame.
   Fotogrammi caricati in modo progressivo, cache di immagini decodificate limitata, nessun ciclo
   di rendering quando la scena è ferma o fuori schermo. Ricette senza sequenza: immagine chiusa. */
(() => {
  'use strict';
  const doc = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const t = (source, values) => window.SalumeeI18n.t(source, values);
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
  const css = (el, prop, v) => { const c = el._c || (el._c = {}); if (c[prop] !== v) { el.style[prop] = v; c[prop] = v; } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- Elementi ---------------- */
  const header = $('.site-header');
  const hero = $('.hero');
  const stage = $('.stage');
  const fig = $('#product');
  const canvas = $('.canvas', fig);
  const group = $('.pgroup', fig);
  const posterImg = $('.poster', group);
  const cv = $('canvas.seq', group);
  const ctx = cv.getContext('2d', { alpha: false });
  const beats = { intro: $('.beat-intro'), story: $('.beat-story'), finale: $('.beat-finale') };
  const caption = $('.product-caption', fig), stamp = $('.stamp', fig), cue = $('.scene-cue'), look = $('.look-inside');
  const pinsWrap = $('.pins', fig), pins = $$('.pin', fig);
  const ingList = $('#ing-detail'), storyRecipe = $('.story-recipe');
  const switcher = $('.recipe-switch'), recipeBtns = $$('.recipe-btn', switcher);
  const traveler = $('.traveler'), travelerImg = $('img', traveler);
  const banco = $('#banco'), plate = $('.plate'), plateImgs = $$('.plate-img', plate);
  const RD = JSON.parse($('#ricette-data').textContent);
  const FW = RD.frame.width, FH = RD.frame.height, FBG = RD.frame.background, PBG = RD.frame.pagina || FBG;

  const PRESET = { desk: { approach: .035 }, phone: { approach: .02 } };
  const SWITCH_MS = 440;
  const net = navigator.connection || {};
  // dati limitati o rete lenta: solo i due poster (chiusa/aperta), niente sequenza
  const lite = !!net.saveData || /(^|-)2g$/.test(net.effectiveType || '');

  /* ---------------- Sequenza di fotogrammi con cache limitata ---------------- */
  function Sequence(def, closedImg) {
    const n = def.to - def.from + 1;
    const step = mqDesk.matches ? 1 : 2;                 // telefono: un fotogramma su due (circa metà dei byte)
    const W = mqDesk.matches ? 12 : 8;                   // finestra di immagini decodificate attorno alla posizione
    const MAXC = 4;
    const imgs = new Array(n), bmps = new Array(n), st = new Uint8Array(n); // 0 nulla, 1 in corso, 2 pronto, 3 errore, 4 saltato
    let cur = 0, active = 0, started = false, bmpW = 0, bmpH = 0, noResize = false, version = 0, bytes = 0;
    const needed = i => i === n - 1 || i % step === 0;
    for (let i = 0; i < n; i++) if (!needed(i)) st[i] = 4;
    const order = [];
    const pushOnce = i => { if (i >= 0 && i < n && st[i] !== 4 && !order.includes(i)) order.push(i); };
    pushOnce(0); pushOnce(n - 1);
    for (let s = 32; s >= 1; s >>= 1) for (let i = 0; i < n; i += s) pushOnce(i);   // dal grossolano al fine
    const openImg = new Image();
    openImg.decoding = 'async';
    if (def.open) openImg.src = def.open;
    const src = i => `${def.dir}/frame-${String(def.from + i).padStart(def.pad, '0')}.webp`;
    const S = {
      n, get version() { return version; }, get loaded() { return st.reduce((a, v) => a + (v === 2), 0); },
      get decoded() { return bmps.reduce((a, b) => a + !!b, 0); }, get bytes() { return bytes; }, needed: () => st.reduce((a, v) => a + (v !== 4), 0),
      start() { if (!started && !lite) { started = true; pump(); } },
      setSize(w, h) {
        const nw = Math.min(FW, Math.round(w)), nh = Math.round(nw * FH / FW);
        if (Math.abs(nw - bmpW) / (bmpW || 1) < .12) return;
        bmpW = nw; bmpH = nh;
        bmps.forEach((b, i) => { if (b) { b.close && b.close(); bmps[i] = null; } });
        window_();
      },
      setCur(i) { if (i !== cur) { cur = i; window_(); pump(); } },
      // la migliore immagine disponibile per il fotogramma i: decodificata, poi caricata, poi i poster
      pick(i) {
        for (let d = 0; d < n; d++) {
          if (bmps[i - d]) return { src: bmps[i - d], k: 'b' + (i - d) };
          if (bmps[i + d]) return { src: bmps[i + d], k: 'b' + (i + d) };
          if (d > W + 2) break;
        }
        for (let d = 0; d < n; d++) {
          if (st[i - d] === 2) return { src: imgs[i - d], k: 'i' + (i - d) };
          if (st[i + d] === 2) return { src: imgs[i + d], k: 'i' + (i + d) };
        }
        if (i > n / 2 && openImg.complete && openImg.naturalWidth) return { src: openImg, k: 'open' };
        return { src: closedImg, k: 'closed' };
      },
      ready(i) {                                          // risolve quando il fotogramma (o un vicino) è pronto
        return new Promise(res => {
          const t0 = performance.now();
          const check = () => (st[i] === 2 || st[Math.max(0, i - 1)] === 2 || st[Math.min(n - 1, i + 1)] === 2 || performance.now() - t0 > 2500 ? res() : setTimeout(check, 40));
          S.start(); S.setCur(i); check();
        });
      }
    };
    function nextIndex() {
      for (let d = 0; d <= W; d++) {                      // prima i fotogrammi vicini alla posizione attuale
        for (const i of [cur + d, cur - d]) if (i >= 0 && i < n && st[i] === 0) return i;
      }
      for (const i of order) if (st[i] === 0) return i;
      return -1;
    }
    function pump() {
      if (!started) return;
      while (active < MAXC) {
        const i = nextIndex();
        if (i < 0) return;
        st[i] = 1; active++;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          st[i] = 2; imgs[i] = img; active--;
          try { const e = performance.getEntriesByName(img.src)[0]; if (e) bytes += e.transferSize || e.encodedBodySize || 0; } catch (_) { /* facoltativo */ }
          makeBmp(i); version++; changed(); pump();
        };
        img.onerror = () => { st[i] = 3; active--; pump(); };
        img.src = src(i);
      }
    }
    function inWin(i, extra = 0) { return Math.abs(i - cur) <= W + extra; }
    function makeBmp(i) {
      if (!window.createImageBitmap || !bmpW || bmps[i] || imgs[i]._mk || !inWin(i)) return;
      imgs[i]._mk = true;
      const opt = noResize ? undefined : { resizeWidth: bmpW, resizeHeight: bmpH, resizeQuality: 'high' };
      createImageBitmap(imgs[i], opt).then(b => {
        imgs[i]._mk = false;
        if (inWin(i, 4) && !bmps[i]) { bmps[i] = b; version++; changed(); } else if (b.close) b.close();
      }, () => { imgs[i]._mk = false; if (!noResize) { noResize = true; makeBmp(i); } });
    }
    function window_() {
      for (let i = 0; i < n; i++) {
        if (bmps[i] && !inWin(i, 6)) { if (bmps[i].close) bmps[i].close(); bmps[i] = null; }
        else if (st[i] === 2 && !bmps[i] && inWin(i)) makeBmp(i);
      }
    }
    return S;
  }
  let changed = () => {};

  /* ---------------- Ricette: stato condiviso con il banco ---------------- */
  const REC = RD.recipes.map((d, n) => {
    const img = new Image();
    img.decoding = 'async';
    const r = { d, id: d.id, n, closedImg: img, pp: null, decoded: false, seq: null };
    if (d.sequence) r.seq = Sequence(d.sequence, img);
    return r;
  });
  const byId = id => REC.find(r => r.id === id);
  let shown = byId(RD.defaultRecipe) || REC[0];
  let selected = shown, pending = null, info = shown;
  let X = null, token = 0;

  let scene = false;
  const M = { hh: 0, vw: 0, vh: 0, pinStart: 0, pinEnd: 1, cw: 1, ch: 1, travel: false, travelStart: 0, travelEnd: 1, start: null, end: null, pinW: [] };
  let S = scrollY, last = 0, raf = 0;
  const TAU = .085;
  let sel = 0;
  const ptr = { tx: 0, ty: 0, x: 0, y: 0 };
  let pendingFocus = 0, bancoIndex = 0, lastZone = '', slotHidden = -1, lastKey = '', drawn = false;

  /* ---------------- Misure ---------------- */
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
    // canvas: risoluzione pari a quella mostrata (densità massima 2), mai oltre i 1200 px della sorgente
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const bw = Math.min(FW, Math.round(M.cw * dpr)), bh = Math.round(bw * FH / FW);
    if (bw > 0 && (cv.width !== bw || cv.height !== bh)) { cv.width = bw; cv.height = bh; lastKey = ''; }
    REC.forEach(r => r.seq && r.seq.setSize(bw, bh));
    measurePins();
    M.btn = recipeBtns.map(b => ({ x: b.offsetLeft, w: b.offsetWidth }));
    placePill(false);
    reserveIngHeight();
    lastZone = '';
  }
  function measurePins() {
    const probe = pins[0].cloneNode(true);
    probe.removeAttribute('data-pin'); probe.setAttribute('aria-hidden', 'true'); probe.tabIndex = -1;
    probe.style.cssText = 'visibility:hidden;transform:none';
    pinsWrap.append(probe);
    const label = $('.pin-label', probe);
    REC.forEach(r => { r.pinW = r.d.ingredients.map(g => { label.textContent = t(g.name); return probe.offsetWidth; }); });
    probe.remove();
    M.pinW = info.pinW;
  }
  function reserveIngHeight() {
    const w = ingList.getBoundingClientRect().width;
    const key = w + '|' + window.SalumeeI18n.language + '|' + (document.fonts ? document.fonts.status : '');
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

  const fmt = n => n.toFixed(2);
  function project(px, py, G) {
    const gox = M.cw * .5, goy = M.ch * .58;
    return [gox + G.tx + (px - gox) * G.s, goy + G.ty + (py - goy) * G.s];
  }
  function showBeat(el, v, dy, focusOwner) {
    const hasFocus = el.contains(document.activeElement);
    if (focusOwner && focusOwner !== el && !hasFocus) v = 0;
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

  /* ---------------- Fotogramma per apertura: curva del movimento visibile ---------------- */
  function frameFor(r, o) {
    if (!r.seq) return -1;
    const c = r.d.sequence.curve;
    let lo = 0, hi = c.length - 1;
    if (o <= 0) return 0;
    if (o >= 1) return hi;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= o) lo = m; else hi = m; }
    const f = lo + (o - c[lo]) / Math.max(1e-6, c[hi] - c[lo]);
    return Math.round(f);
  }
  function sourceFor(r, i) {
    if (!r.seq) return { src: r.closedImg, k: 'c' };
    return r.seq.pick(i);
  }
  function usable(s) { return s.src && (s.src.width || s.src.naturalWidth); }
  let dbgO = 0, dbgI = 0;
  function drawCanvas(o) {
    const A = X ? X.from : shown, B = X ? X.to : null;
    const k = X ? smooth(seg(X.k, .06, .94)) : 1;
    const ia = frameFor(A, o), ib = B ? frameFor(B, o) : -1;
    dbgO = o; dbgI = ia;
    if (A.seq) A.seq.setCur(Math.max(0, ia));
    if (B && B.seq) B.seq.setCur(Math.max(0, ib));
    const sa = sourceFor(A, ia), sb = B ? sourceFor(B, ib) : null;
    const key = `${A.id}:${sa.k}|${B ? B.id + ':' + sb.k + ':' + k.toFixed(3) : ''}|${cv.width}`;
    if (key === lastKey) return;
    if (!usable(sa) && !(sb && usable(sb))) return;
    lastKey = key;
    const w = cv.width, h = cv.height;
    ctx.globalAlpha = 1;
    if (usable(sa) && (!B || k < 1)) ctx.drawImage(sa.src, 0, 0, w, h); else { ctx.fillStyle = FBG; ctx.fillRect(0, 0, w, h); }
    if (sb && usable(sb) && k > 0) { ctx.globalAlpha = k; ctx.drawImage(sb.src, 0, 0, w, h); ctx.globalAlpha = 1; }
    // fondo dei fotogrammi (~#151512) portato al colore della pagina: niente riquadro più scuro
    if (PBG !== FBG) { ctx.globalCompositeOperation = 'lighten'; ctx.fillStyle = PBG; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }
    if (!drawn) { drawn = true; fig.classList.add('is-drawn'); }
  }

  /* ---------------- Render della scena ---------------- */
  function renderScene() {
    const P = M.preset;
    const p = clamp((S - M.pinStart) / (M.pinEnd - M.pinStart));
    const o = p < .64 ? sine(seg(p, .13, .41)) : 1 - sine(seg(p, .64, .89));
    const a = ease(seg(p, .04, .30)) * (1 - ease(seg(p, .64, .90)));
    // i pin compaiono solo sul fermo: nei fotogrammi in movimento non hanno un punto fisso
    const explore = seg(o, .965, 1);
    const active = document.activeElement;
    const owner = [beats.intro, beats.story, beats.finale].find(b => b.contains(active)) || null;
    showBeat(beats.intro, 1 - ease(seg(p, .10, .21)), -26, owner);
    showBeat(beats.story, ease(seg(p, .16, .29)) * (1 - ease(seg(p, .66, .75))), p < .5 ? 22 : -22, owner);
    showBeat(beats.finale, ease(seg(p, .74, .85)), 22, owner);
    const introV = owner && owner !== beats.intro ? 0 : 1 - ease(seg(p, .10, .21));
    css(cue, 'opacity', (1 - seg(p, .01, .06)).toFixed(3));
    showCtl(look, look.contains(active) ? 1 : introV);
    showCtl(switcher, switcher.contains(active) ? 1 : 1 - seg(p, .84, .93));
    const par = mqFine.matches && mqDesk.matches ? 1 - seg(p, .8, .9) : 0;
    const G = { s: 1 + P.approach * a, tx: ptr.x * par, ty: ptr.y * par };
    css(group, 'transform', `translate3d(${fmt(G.tx)}px,${fmt(G.ty)}px,0) scale(${G.s.toFixed(4)})`);
    const tv = X ? (X.k < .5 ? 1 - smooth(seg(X.k, .14, .44)) : smooth(seg(X.k, .56, .86))) : 1;
    const capV = (1 - seg(o, .02, .2)) * (1 - seg(p, .86, .96));
    if (caption) css(caption, 'opacity', (capV * tv).toFixed(3));
    if (stamp) css(stamp, 'opacity', capV.toFixed(3));
    css(ingList, 'opacity', tv.toFixed(3));
    if (storyRecipe) css(storyRecipe, 'opacity', tv.toFixed(3));

    drawCanvas(o);

    const pinsFocus = pinsWrap.contains(active);
    const kPin = X ? (X.k < .5 ? 1 - seg(X.k, 0, .3) : seg(X.k, .62, 1)) : 1;
    const pv = pinsFocus ? 1 : ease(explore) * kPin;
    const show = pv > .02;
    if (pinsWrap._vis !== show) { pinsWrap.style.visibility = show ? 'visible' : 'hidden'; pinsWrap._vis = show; }
    const act = (pv > .6 && kPin > .9) || pinsFocus;
    if (pinsWrap._act !== act) { pinsWrap.inert = !act; pinsWrap._act = act; }
    if (show) {
      css(pinsWrap, 'opacity', pv.toFixed(3));
      info.d.anchors.forEach((A, i) => {
        let [x, y] = project(A.x / FW * M.cw, A.y / FH * M.ch, G);
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
    if (!M.travel) { css(traveler, 'visibility', 'hidden'); css(fig, 'opacity', ''); setSlot(-1); return; }
    const t = clamp((S - M.travelStart) / (M.travelEnd - M.travelStart));
    const zone = t <= 0 ? 'before' : t >= 1 ? 'after' : 'travel';
    const match = bancoIndex === shown.d.bancoIndex;
    css(fig, 'opacity', zone === 'before' ? '' : '0');
    setSlot(match && zone !== 'after' ? bancoIndex : -1);
    if (zone !== 'travel') { css(traveler, 'visibility', 'hidden'); return; }
    const e = smooth(t), A = M.start, B = M.end;
    const sx = lerp(A.w, B.w, e) / A.w, sy = lerp(A.h, B.h, e) / A.h;
    css(traveler, 'transform', `translate3d(${fmt(lerp(A.x, B.x, e))}px,${fmt(lerp(A.y, B.y, e))}px,0) scale(${sx.toFixed(5)},${sy.toFixed(5)})`);
    css(traveler, 'opacity', match ? '1' : (1 - seg(t, .5, .92)).toFixed(3));
    css(traveler, 'visibility', 'visible');
  }
  function syncTraveler() {
    const src = shown.d.closed;
    if (travelerImg.getAttribute('src') !== src) { travelerImg.src = src; if (travelerImg.decode) travelerImg.decode().catch(() => {}); }
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
    const kP = 1 - Math.exp(-dt / .14);
    ptr.x += (ptr.tx - ptr.x) * kP; ptr.y += (ptr.ty - ptr.y) * kP;
    if (Math.abs(ptr.tx - ptr.x) > .05 || Math.abs(ptr.ty - ptr.y) > .05) moving = true; else { ptr.x = ptr.tx; ptr.y = ptr.ty; }
    if (X) {
      X.k = clamp((now - X.t0) / SWITCH_MS);
      moving = true;
      if (!X.swapped && X.k >= .5) { X.swapped = true; setInfo(X.to); }
    }
    if (!(lastZone === 'after' && S >= M.travelEnd && far)) {
      if (S < M.travelEnd + M.vh) renderScene();
      renderTravel();
    }
    lastZone = S < M.travelStart ? 'scene' : S < M.travelEnd ? 'travel' : 'after';
    if (X && X.k >= 1) finishSwitch();
    if (pendingFocus && now - pendingFocus > 4000) pendingFocus = 0;
    if (moving || pendingFocus) raf = requestAnimationFrame(tick); else last = 0;
  }
  const wake = () => { if (scene && !raf) raf = requestAnimationFrame(tick); };
  changed = () => { lastKey = lastKey + '*'; wake(); };   // è arrivato un fotogramma migliore: un solo ridisegno

  function clearScene() {
    const els = [group, caption, stamp, cue, look, switcher, pinsWrap, fig, traveler, ingList, storyRecipe, posterImg];
    els.filter(Boolean).forEach(el => { el.style.cssText = ''; el.inert = false; el._vis = el._act = el._c = undefined; });
    Object.values(beats).forEach(el => { el.style.cssText = ''; el.inert = false; el._vis = el._act = el._c = undefined; });
    pins.forEach(p => { p.style.transform = ''; p._c = undefined; });
    setSlot(-1);
    placePill(false);
  }
  // modalità statica (movimento ridotto, schermi bassi): l'immagine aperta mostra gli strati, se esiste
  function staticPoster() {
    const want = !scene && shown.d.sequence && shown.d.sequence.open ? shown.d.sequence.open : shown.d.closed;
    if (posterImg.getAttribute('src') !== want) posterImg.src = want;
  }
  function setMode() {
    const want = !reduced() && !mqLow.matches;
    doc.classList.toggle('rm', reduced());
    doc.classList.toggle('scene-on', want);
    if (want !== scene) {
      scene = want;
      if (!scene) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (X) { X.k = 1; setInfo(X.to); finishSwitch(); }
        clearScene();
      } else { lastKey = ''; }
    }
    staticPoster();
    requestAnimationFrame(() => { measure(); S = scrollY; wake(); });
    if (document.readyState === 'complete') bootLoad(); else addEventListener('load', bootLoad, { once: true });
  }

  /* ---------------- Caricamento ---------------- */
  function decodeImg(img) {
    const fail = () => { throw new Error('immagine non disponibile: ' + img.getAttribute('src')); };
    const byEvents = () => new Promise((res, rej) => {
      if (img.complete) { (img.naturalWidth ? res : rej)(); return; }
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', rej, { once: true });
    });
    return (img.decode ? img.decode().catch(byEvents) : byEvents()).then(() => { if (!img.naturalWidth) fail(); }, fail);
  }
  function loadClosed(r) {
    if (!r.pp) {
      if (!r.closedImg.getAttribute('src')) r.closedImg.src = r.d.closed;
      r.pp = decodeImg(r.closedImg);
      r.pp.catch(() => { r.pp = null; });
    }
    return r.pp;
  }
  function currentOpenness() {
    const p = clamp((S - M.pinStart) / (M.pinEnd - M.pinStart));
    return p < .64 ? sine(seg(p, .13, .41)) : 1 - sine(seg(p, .64, .89));
  }
  // prima del cambio: immagine chiusa pronta e, se c'è una sequenza, il fotogramma dell'apertura attuale
  function ensure(r) {
    const parts = [loadClosed(r)];
    if (scene && r.seq) parts.push(r.seq.ready(Math.max(0, frameFor(r, currentOpenness()))));
    return Promise.all(parts).then(() => { r.decoded = true; });
  }
  let booted = false;
  function bootLoad() {
    loadClosed(shown).then(() => { lastKey = ''; wake(); }, () => {});
    if (scene && shown.seq) shown.seq.start();
    if (booted) return;
    booted = true;
    const idle = window.requestIdleCallback ? cb => requestIdleCallback(cb, { timeout: 2500 }) : cb => setTimeout(cb, 700);
    idle(() => REC.forEach(r => { if (r !== shown) loadClosed(r).catch(() => {}); }));
  }
  const markMissing = () => { fig.classList.add('is-missing'); requestAnimationFrame(() => { measure(); wake(); }); };
  if (posterImg.complete && posterImg.naturalWidth === 0) markMissing();
  posterImg.addEventListener('error', markMissing);

  /* ---------------- Cambio di ricetta (vince l'ultimo tap) ---------------- */
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
      if (t !== token) return;
      reflect(true);
      if (!X) startSwitch(r);
    }, err => {
      if (t !== token) return;
      console.warn('Salumée: ricetta non disponibile', r.id, err && err.message);
      pending = null;
      selected = X ? X.to : shown;
      reflect(false);
    });
  }
  function placePill(animate) {
    if (!pill || !M.btn) return;
    const m = M.btn[recipeBtns.findIndex(b => b.dataset.recipe === selected.id)];
    if (!m || !m.w) return;
    let from = null;
    if (animate && pill._m && pill.animate && !reduced()) {
      const r = pill.getBoundingClientRect(), sr = switcher.getBoundingClientRect(), k = sr.width / switcher.offsetWidth || 1;
      from = { x: (r.left - sr.left) / k, w: r.width / k };
    }
    if (pill.getAnimations) pill.getAnimations().forEach(a => a.cancel());
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
      setInfo(r);
      staticPoster();
      if (!scene && posterImg.animate) posterImg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'linear' });
      lastKey = ''; wake();
      afterSwitch();
      return;
    }
    X = { from, to: r, t0: performance.now(), k: 0, swapped: false };
    wake();
  }
  function finishSwitch() {
    const to = X.to;
    X = null;
    if (info !== to) setInfo(to);
    lastKey = '';
    afterSwitch();
  }
  function afterSwitch() { if (pending && pending !== shown && pending.decoded) startSwitch(pending); }

  const ingHtml = (r, cur) => r.d.ingredients.map((g, i) =>
    `<li data-ing="${i}"${i === cur ? ' class="is-current"' : ''}><h3 class="ing-name">${esc(t(g.name))}</h3><p>${esc(t(g.text))}</p></li>`).join('');
  const altFor = r => t('Focaccia con {ingredients}. Immagine illustrativa.', { ingredients: r.d.caption.map(line => t(line)).join(' ') });
  function setInfo(r) {
    const prev = info;
    info = r;
    const ing = r.d.ingredients;
    const name = prev.d.ingredients[sel] && prev.d.ingredients[sel].name;
    const k = ing.findIndex(g => g.name === name);
    sel = k >= 0 ? k : 0;
    if (ingList.dataset.recipe !== r.id) { ingList.innerHTML = ingHtml(r, sel); ingList.dataset.recipe = r.id; }
    const hadFocus = pins.indexOf(document.activeElement);
    pins.forEach((p, i) => { p.hidden = !ing[i]; if (ing[i]) $('.pin-label', p).textContent = t(ing[i].name); });
    if (hadFocus >= 0 && pins[hadFocus].hidden) pins[0].focus({ preventScroll: true });
    selectIngredient(sel);
    if (storyRecipe) storyRecipe.textContent = t(r.d.name);
    if (caption) caption.innerHTML = r.d.caption.map(line => esc(t(line))).join('<br> ');
    posterImg.alt = altFor(r);
    canvas.dataset.label = r.d.caption.map(line => t(line)).join(' ');
    if (r.pinW) M.pinW = r.pinW;
    // il ritiro segue la ricetta visibile
    if (window.SalumeePickup) window.SalumeePickup.set('paninoteca', r.d.name);
  }
  function selectIngredient(i) {
    sel = i;
    pins.forEach((p, k) => p.setAttribute('aria-pressed', String(k === i)));
    $$('li', ingList).forEach((li, k) => li.classList.toggle('is-current', k === i));
    wake();
  }
  pins.forEach((p, i) => p.addEventListener('click', () => selectIngredient(i)));
  recipeBtns.forEach(b => b.addEventListener('click', () => chooseRecipe(b.dataset.recipe)));
  if (switcher) switcher.hidden = false;
  const pill = switcher ? document.createElement('span') : null;
  if (pill) { pill.className = 'recipe-pill'; pill.setAttribute('aria-hidden', 'true'); switcher.prepend(pill); switcher.classList.add('has-pill'); }
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
    ptr.tx = ((e.clientX - r.left) / r.width - .5) * 10;
    ptr.ty = ((e.clientY - r.top) / r.height - .5) * 6;
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
  // stato leggibile per le prove automatiche (sola lettura)
  window.__salumeeScene = () => ({ shown: shown.id, selected: selected.id, pending: pending && pending.id, drawnKey: lastKey, openness: dbgO, target: dbgI,
    seq: shown.seq ? { n: shown.seq.n, loaded: shown.seq.loaded, decoded: shown.seq.decoded, needed: shown.seq.needed() } : null });

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
    // da vicino: per la Mortadella l'ultimo fotogramma, aperto, mostra gli strati
    const rr = REC.find(x => x.d.bancoIndex === bancoIndex);
    img.src = rr && rr.d.sequence && rr.d.sequence.open ? rr.d.sequence.open : (plateImgs[bancoIndex].currentSrc || plateImgs[bancoIndex].getAttribute('src'));
    img.alt = t('{product}, immagine illustrativa', { product: $('.panel-name', panel).textContent });
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
  dishes.forEach(d => {
    d._searchSource = d.dataset.search;
    $$('.dish-name, .dish-desc', d).forEach(node => { node._source = window.SalumeeI18n.originalText(node); });
  });
  function refreshSearchText() {
    dishes.forEach(d => {
      const nodes = $$('.dish-name, .dish-desc', d);
      nodes.forEach(node => { node._raw = t(node._source); });
      d.dataset.search = fold([d._searchSource, ...nodes.map(node => node._raw)].join(' '));
    });
  }
  refreshSearchText();
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
    status.textContent = !term ? '' : t(n ? n === 1 ? '{count} focaccia per «{query}».' : '{count} focacce per «{query}».' : 'Nessuna focaccia per «{query}».', { count: n, query: raw });
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

  document.addEventListener('salumee:languagechange', () => {
    ingList.dataset.recipe = '';
    setInfo(info);
    remeasure();
    refreshSearchText();
    applySearch();
    if (dialog.open) {
      const panel = panels[bancoIndex];
      $('#dialog-title').textContent = $('.panel-name', panel).textContent;
      $('.dialog-recipe').textContent = $('.panel-recipe', panel).textContent;
      $('.dialog-image img').alt = t('{product}, immagine illustrativa', { product: $('.panel-name', panel).textContent });
    }
    lastKey = '';
    wake();
  });

  setMode();
})();
