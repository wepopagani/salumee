#!/usr/bin/env python3
"""Salumée V3.1 — aggiunge i livelli «aperti» di una ricetta e li controlla prima di usarli.

Uso (dalla cartella del progetto):
  python3 tools/aggiungi_livelli.py porchetta --strato strato.png --fondo fondo.png
  python3 tools/aggiungi_livelli.py tartare   --strato strato.png --fondo fondo.png --pane pane.png
Opzioni:
  --pane FILE        pane superiore dedicato (obbligatorio se quello condiviso non coincide col poster)
  --prova            esegue soltanto i controlli e la tavola di verifica, senza scrivere nulla
  --forza            scrive anche se un controllo non passa (sconsigliato; il report lo segnala)
  --autonomo         rigenera anche dist/salumee-v3.1-autonomo.html
  --ancore-desk "x,y;x,y;x,y"  --ancore-phone "..."   punti dei pin a focaccia aperta (canvas 1536x1024)

Cosa controlla:
  1. canvas 1536x1024 e vera trasparenza (niente scacchiera o fondo pieno);
  2. registrazione: fondo + strato + pane, a riposo, devono ricomporre il poster della ricetta;
  3. pane: quello condiviso viene accettato solo se coincide con il pane del poster;
  4. ingredienti vietati (data/ricette-hero.json → «controlli»): niente formaggio nella Porchetta,
     niente pesto nella Tartare. I rilevatori di colore sono indicativi: la tavola di verifica
     va sempre guardata.
Se tutto passa: scrive i WebP in assets/img, genera le ombre, aggiorna data/ricette-hero.json
e rigenera index.html. Il sito userà i nuovi livelli senza altre modifiche al codice.
Richiede Python 3 con Pillow e numpy.
"""
import argparse, json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/ricette-hero.json'
IMG = ROOT / 'assets/img'
W, H = 1536, 1024
BG = np.array([0x19, 0x19, 0x17], np.float32) / 255
SOGLIE = {
    'registrazione_ok': 25.0, 'registrazione_max': 35.0,   # differenza media 0-255 (Mortadella: ~15)
    'sagoma_min': 0.95,                                    # IoU della sagoma rispetto al poster
    'pane_max': 22.0,                                      # pane condiviso vs poster (Porchetta ~15, Tartare ~28)
    'formaggio': 1.0, 'pesto': 0.8,                        # % di pixel opachi oltre cui l'ingrediente è «presente»
    'atteso_min': 0.3,
}
PRESET_DESK = {'lid': (1.6, -21, -2.2), 'meat': (-1.4, -7.6, .9), 'fondo': (.5, 5.4, -.5)}


def carica(path):
    im = Image.open(path)
    if im.size != (W, H):
        sys.exit(f'ERRORE {path}: il canvas è {im.size[0]}x{im.size[1]}, serve {W}x{H} con la stessa camera del poster.')
    return np.asarray(im.convert('RGBA')).astype(np.float32) / 255


def lab(rgb):
    c = np.where(rgb > 0.04045, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return 116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])


def rilevatori(img):
    m = img[..., 3] > .9
    L, a, b = lab(img[..., :3])
    masks = {
        'formaggio': m & (L > 92) & (np.abs(a) < 5) & (b < 8),          # bianco della stracciatella
        'pesto': m & (a < 2) & (b > 28) & (L > 25) & (L < 78),          # verde oliva di pesto e pistacchi
    }
    n = max(1, int(m.sum()))
    return {k: float(v.sum()) / n * 100 for k, v in masks.items()}, masks


def trasparenza(img, nome, errori):
    a = img[..., 3]
    if a.min() > .98:
        errori.append(f'{nome}: nessuna trasparenza reale (fondo pieno).')
        return
    corners = [a[:24, :24], a[:24, -24:], a[-24:, :24], a[-24:, -24:]]
    if any(c.mean() > .1 for c in corners):
        errori.append(f'{nome}: angoli non trasparenti: possibile fondo o scacchiera disegnata.')
    if (a < .02).mean() < .25:
        errori.append(f'{nome}: meno del 25% del canvas è trasparente: controllare il ritaglio.')


def sovrapponi(layers):
    rgb = np.zeros((H, W, 3), np.float32); al = np.zeros((H, W), np.float32)
    for l in layers:
        la = l[..., 3]
        rgb = l[..., :3] * la[..., None] + rgb * (1 - la[..., None]); al = la + al * (1 - la)
    return rgb, al


def piatto(rgb_pm, al):
    return rgb_pm + BG * (1 - al[..., None])


def ombra(src_alpha, clip_alpha, dy, blur, op):
    a = Image.fromarray((src_alpha * 255).astype('uint8')); a2 = Image.new('L', a.size, 0); a2.paste(a, (0, dy))
    a2 = a2.filter(ImageFilter.GaussianBlur(blur)); s = np.asarray(a2).astype(np.float32) / 255 * op * clip_alpha
    out = np.zeros((H, W, 4), np.uint8); out[..., 0], out[..., 1], out[..., 2] = 22, 12, 6
    out[..., 3] = (s * 255).clip(0, 255).astype('uint8')
    return Image.fromarray(out, 'RGBA').resize((W // 2, H // 2), Image.LANCZOS)


def sposta(img, key, preset=PRESET_DESK):
    x, y, r = preset[key]
    im = Image.fromarray((img * 255).astype('uint8'), 'RGBA')
    im = im.rotate(-r, resample=Image.BICUBIC, center=(W / 2, H / 2))
    out = Image.new('RGBA', (W, H)); out.paste(im, (int(W * x / 100), int(H * y / 100)), im)
    return np.asarray(out).astype(np.float32) / 255


def ancore(arg, default, layers_by_role, ingredients, avvisi):
    if arg:
        pts = [tuple(int(v) for v in p.split(',')) for p in arg.split(';')]
        if len(pts) != len(ingredients):
            sys.exit(f'ERRORE: servono {len(ingredients)} ancore, ricevute {len(pts)}.')
        return [{'x': x, 'y': y} for x, y in pts]
    out = []
    for ing, p in zip(ingredients, default):
        lay = layers_by_role[ing['layer']]; x, y = p['x'], p['y']
        if lay[y, x, 3] < .5:   # cerca il punto opaco più vicino sullo stesso livello
            ys, xs = np.where(lay[..., 3] > .5)
            k = int(np.argmin((xs - x) ** 2 + (ys - y) ** 2)); d = ((xs[k] - x) ** 2 + (ys[k] - y) ** 2) ** .5
            if d > 120: avvisi.append(f'ancora di «{ing["name"]}» lontana dal livello ({d:.0f}px): indicarla con --ancore-*.')
            x, y = int(xs[k]), int(ys[k])
        out.append({'x': x, 'y': y})
    return out


def tavola(path, poster, comp_flat, diff, aperta, layers, masks, titolo):
    def tile(arr):
        return Image.fromarray((arr.clip(0, 1) * 255).astype('uint8')).resize((W // 3, H // 3), Image.LANCZOS)
    pf = piatto(poster[..., :3] * poster[..., 3:4], poster[..., 3])
    dm = np.repeat((diff / max(diff.max(), 1e-3))[..., None], 3, 2)
    over = []
    for img, mk in zip(layers, masks):        # rilevatori sul livello da solo
        ov = piatto(img[..., :3] * img[..., 3:4], img[..., 3])
        ov[mk['formaggio']] = (0, .6, 1); ov[mk['pesto']] = (1, 0, 1)
        over.append(ov)
    tiles = [('poster della ricetta', pf), ('livelli a riposo (deve coincidere)', comp_flat), ('differenza', dm),
             ('aperta (anteprima)', aperta), ('strato: formaggio=azzurro pesto=magenta', over[0]), ('fondo: formaggio=azzurro pesto=magenta', over[1])]
    sheet = Image.new('RGB', (W // 3 * 3, H // 3 * 2 + 40), (25, 25, 23)); d = ImageDraw.Draw(sheet)
    d.text((10, 10), titolo, fill=(243, 233, 213))
    for i, (t, arr) in enumerate(tiles):
        x, y = (i % 3) * W // 3, 40 + (i // 3) * H // 3
        sheet.paste(tile(arr), (x, y)); d.text((x + 8, y + 8), t, fill=(243, 233, 213))
    path.parent.mkdir(parents=True, exist_ok=True); sheet.save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('ricetta'); ap.add_argument('--strato', required=True); ap.add_argument('--fondo', required=True)
    ap.add_argument('--pane'); ap.add_argument('--prova', action='store_true'); ap.add_argument('--forza', action='store_true')
    ap.add_argument('--autonomo', action='store_true'); ap.add_argument('--ancore-desk'); ap.add_argument('--ancore-phone')
    args = ap.parse_args()

    data = json.loads(DATA.read_text(encoding='utf-8'))
    rec = next((r for r in data['recipes'] if r['id'] == args.ricetta), None)
    if not rec:
        sys.exit(f'ERRORE: ricetta «{args.ricetta}» non trovata in {DATA.name}.')
    errori, avvisi, misure = [], [], {}
    poster = carica(ROOT / rec['poster'])
    strato, fondo = carica(args.strato), carica(args.fondo)
    pane_path = Path(args.pane) if args.pane else ROOT / 'assets/img/focaccia-pane.webp'
    pane = carica(pane_path)
    for nome, img in [('strato', strato), ('fondo', fondo), ('pane', pane)]:
        trasparenza(img, nome, errori)

    # registrazione
    comp, ca = sovrapponi([fondo, strato, pane])
    pf, cf = piatto(poster[..., :3] * poster[..., 3:4], poster[..., 3]), piatto(comp, ca)
    m = np.maximum(ca, poster[..., 3]) > .5
    diff = np.abs(pf - cf).mean(2) * 255; diff[~m] = 0
    reg = float(diff[m].mean()); iou = float(((ca > .5) & (poster[..., 3] > .5)).sum() / max(1, m.sum()))
    lm = (pane[..., 3] > .9) & (poster[..., 3] > .9)
    lid = float(np.abs(pane[..., :3] - poster[..., :3])[lm].mean() * 255)
    misure.update(registrazione=round(reg, 1), sagoma=round(iou, 3), pane=round(lid, 1))
    if reg > SOGLIE['registrazione_max']: errori.append(f'registrazione {reg:.1f} > {SOGLIE["registrazione_max"]}: i livelli non ricompongono il poster.')
    elif reg > SOGLIE['registrazione_ok']: avvisi.append(f'registrazione {reg:.1f}: accettabile, controllare la tavola.')
    if iou < SOGLIE['sagoma_min']: errori.append(f'sagoma {iou:.3f} < {SOGLIE["sagoma_min"]}: contorno diverso dal poster.')
    if lid > SOGLIE['pane_max']:
        errori.append(f'pane {lid:.1f} > {SOGLIE["pane_max"]}: il pane {"fornito" if args.pane else "condiviso"} non coincide con il poster'
                      + ('' if args.pane else ' (serve --pane con un pane dedicato o un poster riallineato)') + '.')

    # ingredienti
    masks = []
    for ruolo, img in [('filling', strato), ('bottom', fondo)]:
        perc, mk = rilevatori(img); masks.append(mk)
        misure[ruolo] = {k: round(v, 2) for k, v in perc.items()}
        regole = rec.get('controlli', {}).get(ruolo, {})
        for v in regole.get('vietati', []):
            if perc[v] > SOGLIE[v]: errori.append(f'{ruolo}: rilevato «{v}» ({perc[v]:.2f}% > {SOGLIE[v]}%), vietato in questa ricetta.')
        for v in regole.get('attesi', []):
            if perc[v] < SOGLIE['atteso_min']: avvisi.append(f'{ruolo}: «{v}» quasi assente ({perc[v]:.2f}%): è previsto dalla ricetta.')

    # anteprima aperta e tavola di verifica
    o_rgb, o_a = sovrapponi([sposta(fondo, 'fondo'), sposta(strato, 'meat'), sposta(pane, 'lid')])
    qa = ROOT / f'tools/prove/verifica-livelli-{rec["id"]}.png'
    tavola(qa, poster, cf, diff, piatto(o_rgb, o_a), [strato, fondo], masks,
           f'{rec["id"]}: registrazione {reg:.1f} · sagoma {iou:.3f} · pane {lid:.1f} · ' + ('OK' if not errori else 'NON PASSA'))

    print(f'Ricetta: {rec["id"]}'); print('Misure:', json.dumps(misure, ensure_ascii=False))
    for a in avvisi: print('AVVISO', a)
    for e in errori: print('ERRORE', e)
    print('Tavola di verifica:', qa.relative_to(ROOT))
    if errori and not args.forza:
        print('Livelli NON aggiunti. Correggere i file (o, sotto la propria responsabilità, usare --forza).'); sys.exit(2)
    if args.prova:
        print('Prova completata: nessun file scritto.'); return

    # scrittura
    rid = rec['id']
    def salva(arr, nome, **kw):
        Image.fromarray((arr * 255).round().astype('uint8'), 'RGBA').save(IMG / nome, 'WEBP', method=6, **kw); return f'assets/img/{nome}'
    o = {'lid': f'assets/img/{pane_path.name}' if not args.pane else salva(pane, f'{rid}-pane.webp', quality=86, alpha_quality=95),
         'filling': salva(strato, f'{rid}-strato.webp', quality=86, alpha_quality=95),
         'bottom': salva(fondo, f'{rid}-fondo.webp', quality=86, alpha_quality=95)}
    base_a = sovrapponi([fondo, strato])[1]
    for nome, img in [(f'ombra-{rid}-strato.webp', ombra(strato[..., 3], fondo[..., 3], 26, 30, .58)),
                      (f'ombra-{rid}-pane-contatto.webp', ombra(pane[..., 3], base_a, 12, 20, .85)),
                      (f'ombra-{rid}-pane-morbida.webp', ombra(pane[..., 3], base_a, 34, 46, .62))]:
        img.save(IMG / nome, 'WEBP', method=6, quality=70, alpha_quality=70)
    o.update(shadowFilling=f'assets/img/ombra-{rid}-strato.webp', shadowLidContact=f'assets/img/ombra-{rid}-pane-contatto.webp',
             shadowLidSoft=f'assets/img/ombra-{rid}-pane-morbida.webp')
    roles = {'filling': strato, 'bottom': fondo}
    o['anchors'] = {'desk': ancore(args.ancore_desk, rec['closedAnchors'], roles, rec['ingredients'], avvisi),
                    'phone': ancore(args.ancore_phone, rec['closedAnchors'], roles, rec['ingredients'], avvisi)}
    o['registrationMeanDiff'] = round(reg, 1)
    o['verifica'] = {**misure, 'forzato': bool(errori)}
    rec['open'] = o
    rec.pop('assetsToCreate', None); rec.pop('lidNote', None)
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Scritti:', ', '.join(v for k, v in o.items() if isinstance(v, str)))
    subprocess.run([sys.executable, str(ROOT / 'tools/build.py')] + (['--standalone'] if args.autonomo else []), check=True)
    print('Fatto: la ricetta si apre a strati. Controllare la scena nel browser (vedi VERIFICHE.txt).')


if __name__ == '__main__':
    main()
