/* SALUMÉE V4 — parti comuni a tutte le pagine: navigazione con tendine, menu mobile,
   sedi e ritiro via WhatsApp. Nessuna dipendenza. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const mqDesk = matchMedia('(min-width: 900px)');
  const onChange = (m, fn) => (m.addEventListener ? m.addEventListener('change', fn) : m.addListener(fn));

  /* ---------------- Navigazione: menu mobile ---------------- */
  const nav = $('.site-nav');
  const toggle = $('.nav-toggle');
  const items = $$('.nav-item.has-sub');
  const setMenu = open => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Chiudi la navigazione' : 'Apri la navigazione');
    if (!open) closeSubs();
  };
  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));

  /* ---------------- Tendine (disclosure): click, tastiera, Escape, touch ---------------- */
  function setSub(item, open) {
    item.classList.toggle('is-open', open);
    $('.nav-btn', item).setAttribute('aria-expanded', String(open));
  }
  function closeSubs(except) { items.forEach(it => { if (it !== except) setSub(it, false); }); }
  items.forEach(item => {
    const btn = $('.nav-btn', item);
    btn.addEventListener('click', () => {
      const open = !item.classList.contains('is-open');
      closeSubs(item);
      setSub(item, open);
    });
    item.addEventListener('keydown', e => {
      const links = $$('.nav-sub a', item);
      const i = links.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!item.classList.contains('is-open')) setSub(item, true); (links[i + 1] || links[0]).focus(); }
      else if (e.key === 'ArrowUp' && i >= 0) { e.preventDefault(); (links[i - 1] || btn).focus(); }
    });
    // uscendo dalla tendina con Tab su desktop si chiude
    item.addEventListener('focusout', e => { if (mqDesk.matches && !item.contains(e.relatedTarget)) setSub(item, false); });
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = items.find(it => it.classList.contains('is-open'));
    if (open) { setSub(open, false); $('.nav-btn', open).focus(); return; }
    if (nav.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
  });
  document.addEventListener('click', e => {
    if (!nav.contains(e.target)) { closeSubs(); if (nav.classList.contains('is-open')) setMenu(false); }
  });
  // un link scelto chiude tutto (anche le ancore nella stessa pagina)
  $('.nav-panel').addEventListener('click', e => { if (e.target.closest('a')) { closeSubs(); setMenu(false); } });
  onChange(mqDesk, () => { setMenu(false); closeSubs(); });

  /* ---------------- Sedi ---------------- */
  const sedeList = $('[data-sede-tabs]');
  if (sedeList) {
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
    const selectSede = (i, focus) => {
      const n = (i + sedeTabs.length) % sedeTabs.length;
      sedeTabs.forEach((t, k) => { const on = k === n; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
      sedePanels.forEach((p, k) => {
        const on = k === n; p.classList.toggle('is-active', on); p.tabIndex = on ? 0 : -1;
        if (on) p.removeAttribute('aria-hidden'); else p.setAttribute('aria-hidden', 'true');
        p.inert = !on;
      });
      if (focus) sedeTabs[n].focus();
    };
    sedeTabs.forEach((t, i) => t.addEventListener('click', () => selectSede(i)));
    sedeList.addEventListener('keydown', e => {
      const cur = sedeTabs.indexOf(document.activeElement);
      if (cur < 0) return;
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (k) { e.preventDefault(); selectSede(cur + k, true); }
      else if (e.key === 'Home') { e.preventDefault(); selectSede(0, true); }
      else if (e.key === 'End') { e.preventDefault(); selectSede(sedeTabs.length - 1, true); }
    });
    selectSede(0);
  }

  /* ---------------- Ordina per il ritiro: bozza WhatsApp, mai un invio automatico ----------------
     Il negozio conferma disponibilità, sede e orario. Il testo segue il prodotto visibile. */
  const PHONE = '41764990322';
  const state = { paninoteca: '', macelleria: '' };     // prodotto selezionato nel percorso
  function message({ context = 'general', product = '' } = {}) {
    const lines = ['Ciao Salumée! Vorrei ordinare per il ritiro.'];
    if (context === 'paninoteca' && product) lines.push(`Prodotto: focaccia ${product}.`);
    else if (context === 'macelleria') { lines.push('Reparto: macelleria.'); lines.push(product ? `Prodotti richiesti: ${product}.` : 'Prodotti richiesti: ...'); }
    else lines.push('Prodotti richiesti: ...');
    lines.push('Quantità: ...', 'Sede di ritiro (Bellinzona o Claro): ...', 'Orario desiderato: ...', 'Mi confermate disponibilità e orario? Grazie!');
    return lines.join('\n');
  }
  const url = opt => `https://wa.me/${PHONE}?text=${encodeURIComponent(message(opt))}`;
  function productFor(link) {
    const ctx = link.dataset.pickup || 'general';
    if (link.dataset.product) return link.dataset.product;       // prodotto legato al pulsante (categoria, prosciutto)
    return state[ctx] || '';
  }
  function refresh() {
    $$('[data-pickup]').forEach(link => { link.href = url({ context: link.dataset.pickup, product: productFor(link) }); });
    $$('[data-pickup-recipe]').forEach(el => { if (state.paninoteca) el.textContent = state.paninoteca; });
    $$('[data-pickup-label]').forEach(el => {
      const ctx = $('[data-pickup]', el.closest('section'))?.dataset.pickup;
      el.textContent = ctx === 'paninoteca' && state.paninoteca ? ` con la focaccia ${state.paninoteca}` : '';
    });
  }
  // l'href resta corretto per click, tastiera, menu contestuale e copia del link
  document.addEventListener('pointerdown', e => { const l = e.target.closest('[data-pickup]'); if (l) l.href = url({ context: l.dataset.pickup, product: productFor(l) }); }, true);
  document.addEventListener('focusin', e => { const l = e.target.closest('[data-pickup]'); if (l) l.href = url({ context: l.dataset.pickup, product: productFor(l) }); });
  window.SalumeePickup = Object.freeze({
    phone: PHONE, message, url, refresh,
    set(context, product) { state[context] = product || ''; refresh(); }
  });
  refresh();
})();
