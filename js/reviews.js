/* Recensioni Google di Salumée Bellinzona: selezione manuale verificata il
   5 novembre 2026 sulla scheda https://www.google.com/maps?cid=1165088852886544625
   Valutazione osservata: 4,9/5, 75 recensioni. Gli estratti non sono un feed live.
   Autori e voti individuali sono quelli mostrati da Google. */
(() => {
  'use strict';
  const container = document.querySelector('[data-google-reviews]');
  if (!container) return;
  const reviews = [
    { author: 'stefano milletich', rating: 5, quote: 'Vuoi un panino o una focaccia stra-buona? Ecco il posto che cerchi.' },
    { author: 'Aris Brenn', rating: 5, quote: 'mega gentili e simpatici' },
    { author: 'Mattia Sche', rating: 5, quote: 'molti salumi e prelibatezze italiane' }
  ];
  const t = (source, values) => window.SalumeeI18n.t(source, values);
  function render() {
    const fragment = document.createDocumentFragment();
    reviews.forEach(review => {
      const card = document.createElement('article');
      card.className = 'voices-card';
      const stars = document.createElement('p');
      stars.className = 'voices-stars';
      stars.setAttribute('aria-label', t('{rating} stelle su 5', { rating: review.rating }));
      stars.textContent = '★★★★★';
      const quote = document.createElement('blockquote');
      quote.textContent = `«${t(review.quote)}»`;
      quote.lang = window.SalumeeI18n.language;
      const author = document.createElement('footer');
      author.className = 'voices-author';
      const initials = document.createElement('span');
      initials.className = 'voices-initials';
      initials.setAttribute('aria-hidden', 'true');
      initials.textContent = review.author.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
      const identity = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = review.author;
      const source = document.createElement('span');
      source.className = 'voices-source';
      source.textContent = t('Recensione Google');
      identity.append(name, source);
      author.append(initials, identity);
      card.append(stars, quote, author);
      fragment.append(card);
    });
    container.replaceChildren(fragment);
  }
  render();
  document.addEventListener('salumee:languagechange', render);
})();
