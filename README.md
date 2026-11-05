# Salumée — homepage V3.1 (demo)

Prototipo della homepage di Salumée, macelleria · paninoteca a Bellinzona e Claro.
**Demo non pubblicata ufficialmente**: la pagina è esclusa dai motori di ricerca
(`noindex`, `robots.txt`). Immagini delle focacce illustrative; prezzi e orari
da riconfermare (vedi `DA-CONFERMARE.txt`).

## Aprire
- In locale: `index.html` (con le cartelle `css`, `js`, `assets`) oppure il file
  unico `dist/salumee-v3.1-autonomo.html`.
- Su Netlify: il sito si pubblica da questo repository con `netlify.toml`
  (nessun build da configurare: copia solo i file della pagina in `_site`).

## Modificare
- Menu, prezzi, sedi e orari: `data/menu-e-orari.json`
- Ricette della scena iniziale: `data/ricette-hero.json`
- Poi: `python3 tools/build.py --standalone`

Dettagli in `LEGGIMI.txt`, prove in `VERIFICHE.txt`, materiali mancanti in
`MATERIALI-E-PROMPT.txt`.
