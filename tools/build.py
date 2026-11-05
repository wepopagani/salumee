#!/usr/bin/env python3
"""Salumée V3.1 — genera index.html da src/template.html, data/menu-e-orari.json e data/ricette-hero.json.

Uso:  python3 tools/build.py            -> index.html
      python3 tools/build.py --standalone -> anche dist/salumee-v3.1-autonomo.html
I dati di menu, prezzi, sedi e orari vivono SOLO in data/menu-e-orari.json;
le tre ricette della hero (ingredienti, pin, livelli) in data/ricette-hero.json.
"""
import base64, html, json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / 'data/menu-e-orari.json').read_text(encoding='utf-8'))
TPL = (ROOT / 'src/template.html').read_text(encoding='utf-8')
esc = lambda s: html.escape(str(s), quote=True)

# Le tre specialità del banco: id del menu + immagine illustrativa disponibile.
BANCO = [
    ('mortadella', 'assets/img/focaccia-intera.webp'),
    ('porchetta', 'assets/img/focaccia-porchetta.webp'),
    ('tartare', 'assets/img/focaccia-tartare.webp'),
]
RECIPES = json.loads((ROOT / 'data/ricette-hero.json').read_text(encoding='utf-8'))
DAYS = {1: 'Lunedì', 2: 'Martedì', 3: 'Mercoledì', 4: 'Giovedì', 5: 'Venerdì', 6: 'Sabato', 7: 'Domenica'}

items = DATA['menu']['items']
by_id = {it['id']: it for it in items}


def fold(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').replace('’', "'")


def price_visible(it):
    return it['priceAsShown']


def price_spoken(it):
    if it.get('priceOptionsCHF'):
        return 'CHF ' + ' o '.join(f'{p:g}' for p in it['priceOptionsCHF'])
    return f"CHF {it['priceCHF']:.2f}".replace('.00', '')


def search_text(it):
    t = f"{it['name']} {it['descriptionAsShown']}"
    t = re.sub(r'\bP\. ', 'pesto ', t)          # "P. Genovese" -> pesto genovese
    t = t.replace('S. Piccante', 'salame piccante')
    return fold(t)


def money(x):
    return f'{x:.2f}'.replace('.00', '.-') if x != int(x) else f'{int(x)}.-'


# ---- menu completo ---------------------------------------------------------
rows = []
for i, it in enumerate(items):
    rows.append(
        f'<li class="dish" data-search="{esc(search_text(it))}">'
        f'<div class="dish-head"><h3 class="dish-name">{esc(it["name"])}</h3>'
        f'<span class="dish-leader" aria-hidden="true"></span>'
        f'<p class="dish-price"><span aria-hidden="true">{esc(price_visible(it))}</span><span class="sr-only">{esc(price_spoken(it))}</span></p></div>'
        f'<p class="dish-desc">{esc(it["descriptionAsShown"])}</p></li>')

breads = DATA['menu']['breadOptions']
bread_txt = ' · '.join(esc(b['name']) + (f' <b>+{b["surchargeCHF"]:g}.-</b>' if b.get('surchargeCHF') else '') for b in breads)
extras = DATA['menu']['extras']
extra_rows = ''.join(f'<li>{esc(e["name"])} <b>da {money(e["priceMinCHF"])} a {money(e["priceMaxCHF"])}</b></li>' for e in extras)
if DATA['menu'].get('freeCompositionMentioned'):
    extra_rows += '<li>Composizione libera</li>'
aside = (f'<div class="aside-block"><h3 class="aside-title">Tipologie di pane</h3><p>{bread_txt}</p></div>'
         f'<div class="aside-block"><h3 class="aside-title">Aggiunta ingredienti</h3><ul>{extra_rows}</ul></div>')
dialog_aside = f'<p class="dialog-bread"><span class="kicker">Pane</span> {bread_txt}</p>'

# ---- banco -----------------------------------------------------------------
plate, tabs, panels = [], [], []
for n, (bid, img) in enumerate(BANCO):
    it = by_id[bid]
    plate.append(f'<img class="plate-img{" is-active" if n == 0 else ""}" id="plate-img-{bid}" data-i="{n}" data-recipe="{bid}" src="{img}" width="1536" height="1024" '
                 f'{"" if n == 0 else "loading=\"lazy\" "}decoding="async" alt="">')
    tabs.append(f'<button type="button" data-tab="{bid}"><span class="tab-no">0{n+1}</span><span class="tab-name">{esc(it["name"])}</span>'
                f'<span class="tab-price" aria-hidden="true">{esc(price_visible(it))}</span></button>')
    note = ('<p class="panel-note">Prezzo 10 o 11.- secondo la variante: il menu non indica quale.</p>' if it.get('priceOptionsCHF') else '')
    panels.append(
        f'<article class="panel{" is-active" if n == 0 else ""}" id="panel-{bid}" data-panel="{bid}">'
        f'<div class="panel-head"><h3 class="panel-name">{esc(it["name"])}</h3>'
        f'<p class="panel-price"><span aria-hidden="true">CHF {esc(price_visible(it))}</span><span class="sr-only">{esc(price_spoken(it))}</span></p></div>'
        f'<p class="panel-recipe">{esc(it["descriptionAsShown"])}</p>{note}'
        f'<p class="panel-ill">Immagine illustrativa.</p></article>')

# ---- sedi ------------------------------------------------------------------
def hours_rows(weekly):
    groups = []
    for d in weekly:
        if not d.get('opens'):
            continue                      # giorno non specificato: non lo mostriamo né lo chiamiamo «chiuso»
        if groups and groups[-1]['o'] == d['opens'] and groups[-1]['c'] == d['closes'] and groups[-1]['to'] == d['isoWeekday'] - 1:
            groups[-1]['to'] = d['isoWeekday']
        else:
            groups.append({'from': d['isoWeekday'], 'to': d['isoWeekday'], 'o': d['opens'], 'c': d['closes']})
    out = []
    for g in groups:
        label = DAYS[g['from']] if g['from'] == g['to'] else f"{DAYS[g['from']]} – {DAYS[g['to']]}"
        out.append(f'<div class="hours-row"><dt>{label}</dt><dd><time>{g["o"]}</time>–<time>{g["c"]}</time></dd></div>')
    return ''.join(out)

sedi = []
for loc in DATA['locations']:
    lid = loc['id']
    if lid == 'bellinzona':
        kind = 'Macelleria · Paninoteca'
        addr = 'Viale Stazione, 6500 Bellinzona'
        addr_note = ''   # civico 14a/16 da riconfermare: non lo scegliamo
        hours = f'<dl class="hours">{hours_rows(loc["hours"]["weekly"])}</dl>'
    else:
        kind = 'Macelleria · Salumeria'
        addr = loc.get('addressAsShown') or ''
        addr_note = ''
        hours = ('<p class="hours-missing">Gli orari di Claro non sono indicati qui: '
                 '<a href="https://www.instagram.com/salumee.bellinzona/" target="_blank" rel="noopener">chiedi su Instagram<span class="sr-only"> (si apre in una nuova scheda)</span></a>.</p>')
    sedi.append(
        f'<article class="sede-panel{" is-active" if lid == "bellinzona" else ""}" id="sede-{lid}" data-sede-panel="{lid}">'
        f'<h3 class="sede-name">{esc(loc["name"])}</h3><p class="sede-kind">{kind}</p>'
        f'<div class="sede-cols"><div><p class="sede-label">Indirizzo</p><p class="sede-addr">{esc(addr)}</p>{addr_note}</div>'
        f'<div><p class="sede-label">Orari</p>{hours}</div></div>'
        f'<a class="btn btn-outline" href="{esc(loc["mapsSearch"])}" target="_blank" rel="noopener">Cerca su Maps<span class="sr-only"> la sede di {esc(loc["name"])} (si apre in una nuova scheda)</span> '
        f'<svg class="ico" aria-hidden="true" focusable="false"><use href="#i-ne"/></svg></a></article>')

# ---- ricette della hero (stato condiviso con il banco) ----------------------
banco_ids = [b for b, _ in BANCO]
rec_out = []
for r in RECIPES['recipes']:
    it = by_id[r['menuId']]
    assert r['id'] in banco_ids, r['id']
    o = r.get('open')
    if o:
        need = ['lid', 'filling', 'bottom']
        if not all(o.get(k) and (ROOT / o[k]).exists() for k in need):
            print('ATTENZIONE: livelli incompleti per', r['id'], '-> mostrata chiusa'); o = None
    rec_out.append({'id': r['id'], 'name': it['name'], 'price': price_visible(it), 'recipe': it['descriptionAsShown'],
                    'bancoIndex': banco_ids.index(r['id']), 'posterFrom': r['posterFrom'], 'caption': r['caption'],
                    'ingredients': r['ingredients'], 'closedAnchors': r['closedAnchors'], 'open': o})
recipes_json = json.dumps({'defaultRecipe': RECIPES['defaultRecipe'], 'recipes': rec_out}, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
hero_buttons = ''.join(f'<button type="button" class="recipe-btn" data-recipe="{esc(r["id"])}" aria-pressed="{"true" if r["id"] == RECIPES["defaultRecipe"] else "false"}">{esc(r["name"])}</button>' for r in rec_out)

out = (TPL.replace('<!--@menu-items-->', '\n        '.join(rows))
          .replace('<!--@menu-count-->', str(len(items)))
          .replace('<!--@menu-aside-->', aside)
          .replace('<!--@dialog-aside-->', dialog_aside)
          .replace('<!--@plate-images-->', '\n        '.join(plate))
          .replace('<!--@banco-tabs-->', '\n          '.join(tabs))
          .replace('<!--@banco-panels-->', '\n        '.join(panels))
          .replace('<!--@sedi-panels-->', '\n          '.join(sedi))
          .replace('<!--@recipes-json-->', recipes_json)
          .replace('<!--@hero-recipe-buttons-->', hero_buttons))
assert '<!--@' not in out, 'segnaposto non sostituito'
(ROOT / 'index.html').write_text(out, encoding='utf-8')
print('index.html scritto:', len(items), 'voci di menu')

if '--standalone' in sys.argv:
    css = (ROOT / 'css/salumee.css').read_text(encoding='utf-8')
    js = (ROOT / 'js/salumee.js').read_text(encoding='utf-8')
    mime = {'webp': 'image/webp', 'woff2': 'font/woff2'}
    def data_uri(rel):
        p = ROOT / rel
        return f'data:{mime[p.suffix[1:]]};base64,' + base64.b64encode(p.read_bytes()).decode()
    css = re.sub(r'url\("\.\./(assets/[^"]+)"\)', lambda m: f'url("{data_uri(m.group(1))}")', css)
    page = out.replace('<link rel="stylesheet" href="css/salumee.css">', f'<style>\n{css}\n</style>')
    page = re.sub(r'<link rel="preload"[^>]*>\n', '', page)
    page = page.replace('<script src="js/salumee.js"></script>', f'<script>\n{js}\n</script>')
    refs = sorted(set(re.findall(r'assets/img/[\w\-]+\.webp', page)))
    for r in refs:
        page = page.replace(r, data_uri(r))
    (ROOT / 'dist').mkdir(exist_ok=True)
    (ROOT / 'dist/salumee-v3.1-autonomo.html').write_text(page, encoding='utf-8')
    print('dist/salumee-v3.1-autonomo.html scritto')
