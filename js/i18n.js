/* Shared local translations. All text stays in the page and its existing controls. */
(() => {
  'use strict';
  const languages = ['it', 'es', 'fr', 'de', 'en'];
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  const catalog = new Map(window.SalumeeTranslations.map(row => [normalize(row[0]), row]));
  const storageKey = 'salumee-language';
  const queryLanguage = new URL(location.href).searchParams.get('lang');
  let savedLanguage;
  try { savedLanguage = localStorage.getItem(storageKey); } catch (_) { /* Private storage. */ }
  let language = languages.includes(queryLanguage) ? queryLanguage : languages.includes(savedLanguage) ? savedLanguage : 'it';

  function translate(source, values = {}, locale = language) {
    const row = catalog.get(normalize(source));
    const text = row ? row[languages.indexOf(locale)] : source;
    return text.replace(/\{(\w+)\}/g, (match, name) => values[name] === undefined ? match : String(values[name]));
  }
  function addDerived(source, getText) {
    catalog.set(source, languages.map(locale => getText((text, values) => translate(text, values, locale))));
  }
  const meatNames = ['Entrecôte', 'Filetto', 'Costine', 'Salsicce', 'Costata di manzo', 'Spiedini misti', 'Pancetta da grigliare', 'Petto di pollo', 'Prosciutto crudo', 'Mortadella', 'Salame', 'Speck'];
  meatNames.forEach(product => addDerived(`Chiedi ${product} per il ritiro su WhatsApp`, t => t('Chiedi {product} per il ritiro su WhatsApp', { product: t(product) })));
  const hamNames = ['Il Gigante', 'Il Deciso', 'Il Rustico', 'Il Goloso'];
  const hamForms = ['Forma ampia e arrotondata', 'Forma lunga e affusolata', 'Forma compatta', 'Pezzo già aperto'];
  hamNames.forEach((name, i) => addDerived(`${name}: ${hamForms[i].toLowerCase()}`, t => `${t(name)}: ${t(hamForms[i])}`));
  ['Macelleria', 'Paninoteca'].forEach(department => {
    addDerived(`Salumée · ${department} · Bellinzona & Claro`, t => `Salumée · ${t(department)} · Bellinzona & Claro`);
    addDerived(`Salumée · ${department} ·`, t => `Salumée · ${t(department)} ·`);
    addDerived(`${department} — Salumée · Bellinzona & Claro`, t => `${t(department)} — Salumée · Bellinzona & Claro`);
  });
  addDerived('Salumée — Macelleria · Paninoteca · Bellinzona & Claro', t => `Salumée — ${t('Macelleria')} · ${t('Paninoteca')} · Bellinzona & Claro`);
  addDerived('Macelleria · Paninoteca · Bellinzona & Claro', t => `${t('Macelleria · Paninoteca')} · Bellinzona & Claro`);
  addDerived('Focaccia con mortadella, stracciatella e pesto di pistacchio. Immagine illustrativa.', t => t('Focaccia con {ingredients}. Immagine illustrativa.', { ingredients: t('Mortadella, stracciatella e pesto di pistacchio') }));

  const textBindings = [];
  const attributeBindings = [];
  const sourceText = new WeakMap();
  document.querySelectorAll('.dish-name, .dish-desc').forEach(element => sourceText.set(element, element.textContent));
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('script, style, svg, .language-picker')) continue;
    const source = normalize(node.nodeValue);
    if (catalog.has(source)) textBindings.push({ node, source, original: node.nodeValue });
  }
  document.querySelectorAll('[aria-label], [alt], [title], [placeholder], [data-label], [data-q], meta[name="description"]').forEach(element => {
    ['aria-label', 'alt', 'title', 'placeholder', 'data-label', 'data-q', 'content'].forEach(attribute => {
      const source = element.getAttribute(attribute);
      if (source && catalog.has(normalize(source))) attributeBindings.push({ element, attribute, source });
    });
  });
  const links = [...document.querySelectorAll('a[href]')].map(element => ({ element, original: element.getAttribute('href') }));

  function translateMessage(message) {
    return message.split('\n').map(line => {
      const product = line.match(/^(Prodotto|Prodotti richiesti): (.+)\.$/);
      if (product && product[2] !== '..') return translate(`${product[1]}: {product}.`, { product: translate(product[2]) });
      return translate(line);
    }).join('\n');
  }

  function apply() {
    document.documentElement.lang = language;
    try { localStorage.setItem(storageKey, language); } catch (_) { /* Private storage. */ }
    textBindings.forEach(({ node, source, original }) => {
      if (node.isConnected) node.nodeValue = original.replace(/\S(?:[\s\S]*\S)?/, translate(source));
    });
    attributeBindings.forEach(({ element, attribute, source }) => element.setAttribute(attribute, translate(source)));
    links.forEach(({ element, original }) => {
      const url = new URL(original, location.href);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const sitePage = path === '/' || /(?:^|\/)(?:index|macelleria|paninoteca)(?:\.html)?$/.test(path);
      if (url.origin === location.origin && sitePage) {
        url.searchParams.set('lang', language);
        element.setAttribute('href', `${url.pathname}${url.search}${url.hash}`);
      } else if (url.hostname === 'wa.me' && !element.hasAttribute('data-pickup')) {
        const message = url.searchParams.get('text');
        if (message) { url.searchParams.set('text', translateMessage(message)); element.href = url.href; }
      } else if (url.hostname.endsWith('google.com') && url.searchParams.has('hl')) {
        url.searchParams.set('hl', language);
        element.href = url.href;
      }
    });
    document.querySelector('[data-current-language]').textContent = language.toUpperCase();
    document.querySelectorAll('[data-language]').forEach(button => {
      const active = button.dataset.language === language;
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelector('.language-picker summary').setAttribute('aria-label', translate('Scegli la lingua'));
  }

  const picker = document.querySelector('.language-picker');
  function choose(locale, updateUrl = true) {
    if (!languages.includes(locale)) return;
    language = locale;
    apply();
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set('lang', language);
      try { history.replaceState(null, '', url); } catch (_) { /* Local file preview. */ }
    }
    document.dispatchEvent(new CustomEvent('salumee:languagechange', { detail: { language } }));
  }
  picker.addEventListener('click', event => {
    const button = event.target.closest('[data-language]');
    if (!button) return;
    choose(button.dataset.language);
    picker.open = false;
    picker.querySelector('summary').focus({ preventScroll: true });
  });
  document.addEventListener('click', event => { if (!picker.contains(event.target)) picker.open = false; });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && picker.open) {
      picker.open = false;
      picker.querySelector('summary').focus({ preventScroll: true });
      event.stopImmediatePropagation();
    }
  }, true);
  addEventListener('popstate', () => choose(new URL(location.href).searchParams.get('lang') || 'it', false));
  window.SalumeeI18n = Object.freeze({ t: translate, originalText: element => sourceText.get(element) || element.textContent, get language() { return language; } });
  apply();
})();
