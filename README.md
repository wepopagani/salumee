# Salumée — sito V4 (prototipo)

Sito di Salumée, macelleria e paninoteca a Bellinzona e Claro.
Questa versione corrisponde al sito completo approvato in anteprima locale.

- `index.html`: ingresso con castello e scelta fra Macelleria e Paninoteca.
- `macelleria.html`: prosciutti interattivi Il Gigante, Il Deciso, Il Rustico e Il Goloso.
- `paninoteca.html`: apertura della Mortadella allo scroll e menu.
- Ritiro su WhatsApp al +41 76 499 03 22: apre una bozza da completare e inviare.

## Anteprima locale

Dalla radice della repository:

```sh
python3 -m http.server 8000
```

Aprire http://localhost:8000. Il server serve anche i fotogrammi della focaccia.
Non sono necessari dipendenze o compilazione per usare il sito.

## File e modifiche

La V4 consegnata è un export statico completo: HTML, `css/`, `js/` e `assets/`.
Per modificare questa versione lavorare su questi file. Le directory preesistenti
`src/`, `data/` e `tools/`, il file autonomo in `dist/` e le vecchie verifiche
appartengono alla V3.1; non rigenerano la V4. Restano conservati come archivio.

La configurazione Netlify include tutte e tre le pagine e i fotogrammi.
Il progetto mantiene `noindex` e `robots.txt`. Il caricamento su GitHub non
costituisce approvazione alla pubblicazione ufficiale dell'attività.

Le immagini illustrative e i soprannomi dei prosciutti sono parte del concept.
Varietà, disponibilità, prezzi e informazioni da confermare con il negozio
restano indicati come tali nel sito. Le note e prove della V3.1 conservate
nella repository non attestano verifiche della V4.
