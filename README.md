# Salumée — sito V4 (prototipo)

Sito di Salumée, macelleria e paninoteca a Bellinzona e Claro.
Ingresso diretto in Macelleria e switch fra i due reparti sempre visibile in alto.

- `index.html`: ingresso diretto in Macelleria con Il Gigante, Il Deciso, Il Rustico e Il Goloso. Lo switch in alto a sinistra collega Macelleria e Paninoteca.
- `macelleria.html`: stesso contenuto della landing, mantenuto per i collegamenti esistenti.
- `paninoteca.html`: apertura della Mortadella allo scroll e menu.
- Menu Macelleria: entrecôte, filetto, costine e salsicce; prosciutto crudo, mortadella, salame e speck. Disponibilità, quantità e prezzi si confermano su WhatsApp.
- Ritiro su WhatsApp al +41 76 499 03 22: apre una bozza da completare e inviare.

## Recensioni Google

La sezione "Cosa dicono di noi" compare nei due reparti. I tre brevi estratti,
i rispettivi autori e le cinque stelle individuali sono stati verificati
sulla scheda Google di Salumée Bellinzona il 5 novembre 2026.
La valutazione osservata è 4,9/5 su 75 recensioni. È una selezione manuale,
non un collegamento che si aggiorna automaticamente; la data è mostrata nel sito.
Gli estratti sono centralizzati in `js/reviews.js` e inseriti come testo.
Fonte: https://www.google.com/maps?cid=1165088852886544625
Link per lasciare una recensione: https://search.google.com/local/writereview?placeid=ChIJAa8g5UZLhEcR8eARiCM6KxA

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
