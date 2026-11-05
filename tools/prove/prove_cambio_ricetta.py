"""Prove V3.1 — cambio di ricetta a focaccia aperta (Chrome headless via Playwright).

Uso:  python3 -m http.server 8766   (dalla cartella del progetto)
      python3 tools/prove/prove_cambio_ricetta.py [URL] [cartella-output]

Due serie:
  A. ASSET REALI: Mortadella apribile; Porchetta e Tartare hanno solo il poster chiuso.
  B. FIXTURE DI PROVA (solo per verificare la meccanica del cambio aperto): la pagina riceve, tramite
     intercettazione di rete, livelli finti e volutamente colorati per Porchetta e Tartare. Non sono
     asset del sito e non rappresentano le ricette: servono a provare apertura, pane, tempi e «ultimo tap»
     nel giorno in cui i livelli veri arriveranno.
"""
import asyncio, io, json, re, sys, time
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/index.html'
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else 'prove-v31-output'); OUT.mkdir(parents=True, exist_ok=True)
ROOT = Path(__file__).resolve().parents[2]
IDS = ['mortadella', 'porchetta', 'tartare']
OPEN_P = {0: .06, 50: .27, 100: .53}          # progresso della scena per apertura 0%, 50%, 100%
EXPECT = {'mortadella': ['Mortadella', 'Stracciatella', 'Pesto di pistacchio'],
          'porchetta': ['Porchetta', 'Pesto di pistacchio', 'Pomodorini secchi'],
          'tartare': ['Tartare di manzo', 'Stracciatella']}

GEO = '''() => { const h=document.querySelector('.hero'), st=document.querySelector('.stage'), hh=document.querySelector('.site-header').offsetHeight;
  const ht=h.getBoundingClientRect().top+scrollY; return {ps:ht-hh, pe:ht+h.offsetHeight-st.offsetHeight-hh, vh:innerHeight}; }'''
STATE = '''() => { const on=[...document.querySelectorAll('.rgroup.is-on')].map(g=>g.dataset.recipe);
  const g=document.querySelector('.rgroup.is-on'); const lid=g && g.querySelector('.lw-lid');
  return { y: scrollY, docH: document.documentElement.scrollHeight, on,
    pressed: [...document.querySelectorAll('.recipe-btn[aria-pressed=true]')].map(b=>b.dataset.recipe),
    loading: [...document.querySelectorAll('.recipe-btn.is-loading')].map(b=>b.dataset.recipe),
    ing: [...document.querySelectorAll('#ing-detail li')].map(l=>l.querySelector('h3').textContent),
    pins: [...document.querySelectorAll('.pin')].filter(p=>!p.hidden).map(p=>p.querySelector('.pin-label').textContent),
    kicker: document.querySelector('.story-recipe').textContent,
    caption: document.querySelector('.product-caption').textContent.replace(/\\s+/g,' ').trim(),
    alt: [...document.querySelectorAll('.poster')].filter(i=>i.alt).map(i=>i.closest('.rgroup').dataset.recipe+':'+i.alt),
    banco: document.querySelector('[data-tab][aria-selected=true]').dataset.tab,
    plate: document.querySelector('.plate-img.is-active').dataset.recipe,
    group: document.querySelector('.pgroup').style.transform,
    lid: lid ? lid.style.transform : null,
    posterOp: g ? parseFloat(getComputedStyle(g.querySelector('.poster')).opacity) : null,
    visibili: [...document.querySelectorAll('.rgroup img')].filter(i => { let e = i; while (e && e !== document.body) { const c = getComputedStyle(e); if (c.visibility === 'hidden' || parseFloat(c.opacity) < .02) return false; e = e.parentElement; } return true; })
      .map(i => (i.getAttribute('src') || '').split('/').pop()),
    switcher: (r => [Math.round(r.left), Math.round(r.top)])(document.querySelector('.recipe-switch').getBoundingClientRect()) }; }'''


# area visiva del prodotto: canvas più pane e fondo trasformati, dentro la finestra e sotto l'header
CLIP = '''() => { const rs=[document.querySelector('#product .canvas'), ...document.querySelectorAll('.rgroup.is-on .layer-wrap img')].map(e=>e.getBoundingClientRect());
  const hh=document.querySelector('.site-header').offsetHeight;
  const x0=Math.max(0,Math.min(...rs.map(r=>r.left))), y0=Math.max(hh,Math.min(...rs.map(r=>r.top)));
  const x1=Math.min(innerWidth,Math.max(...rs.map(r=>r.right))), y1=Math.min(innerHeight,Math.max(...rs.map(r=>r.bottom)));
  return {x:x0,y:y0,width:x1-x0,height:y1-y0}; }'''


def lab(rgb):
    c = rgb / 255.0; c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return 116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])


def detect(png):
    a = np.asarray(Image.open(io.BytesIO(png)).convert('RGB')).astype(np.float32)
    L, A, B = lab(a)
    food = (np.abs(a - np.array([25, 25, 23])).sum(2) > 30)
    n = max(1, food.sum())
    return {'formaggio': round(float((food & (L > 92) & (np.abs(A) < 5) & (B < 8)).sum() / n * 100), 2),
            'pesto': round(float((food & (A < 2) & (B > 28) & (L > 25) & (L < 78)).sum() / n * 100), 2)}


def fixtures():
    """Livelli finti, tinti in modo evidente: servono solo alla meccanica del cambio aperto."""
    img = ROOT / 'assets/img'
    def tint(name, mul, add=(0, 0, 0)):
        a = np.asarray(Image.open(img / name).convert('RGBA')).astype(np.float32)
        a[..., :3] = (a[..., :3] * np.array(mul) + np.array(add)).clip(0, 255)
        b = io.BytesIO(); Image.fromarray(a.astype('uint8'), 'RGBA').save(b, 'PNG'); return b.getvalue()
    return {
        'porchetta-strato.png': tint('focaccia-mortadella.webp', (.80, .58, .42)),
        'porchetta-fondo.png': tint('focaccia-fondo.webp', (.92, 1.0, .80)),
        'tartare-strato.png': tint('focaccia-mortadella.webp', (1.0, .38, .38)),
        'tartare-fondo.png': tint('focaccia-fondo.webp', (1.0, .95, .95)),
        'tartare-pane.png': tint('focaccia-pane.webp', (.86, .86, .86)),
    }


def patch_json(html, lid_tartare_own=True):
    m = re.search(r'(<script type="application/json" id="ricette-data">)(.*?)(</script>)', html, re.S)
    d = json.loads(m.group(2).replace('<\\/', '</'))
    mort = next(r for r in d['recipes'] if r['id'] == 'mortadella')['open']
    for r in d['recipes']:
        if r['id'] == 'mortadella': continue
        o = {'lid': '/__fixture/tartare-pane.png' if (r['id'] == 'tartare' and lid_tartare_own) else mort['lid'],
             'filling': f'/__fixture/{r["id"]}-strato.png', 'bottom': f'/__fixture/{r["id"]}-fondo.png',
             'shadowFilling': mort['shadowFilling'], 'shadowLidContact': mort['shadowLidContact'], 'shadowLidSoft': mort['shadowLidSoft'],
             'anchors': {k: [mort['anchors'][k][i] if i < len(mort['anchors'][k]) else mort['anchors'][k][0] for i in range(len(r['ingredients']))] for k in ('desk', 'phone')}}
        r['open'] = o
    js = json.dumps(d, ensure_ascii=False).replace('</', '<\\/')
    return html[:m.start(2)] + js + html[m.end(2):]


async def main():
    R = {'A_asset_reali': {}, 'B_fixture': {}}
    FX = fixtures()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])

        async def newpage(W, H, mob, fixture=False, delays=None, abort=None, reduced=False):
            ctx = await b.new_context(viewport={'width': W, 'height': H}, is_mobile=mob, has_touch=mob,
                                      reduced_motion='reduce' if reduced else 'no-preference')
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append('pageerror ' + str(e)))
            pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
            delays = delays or {}
            async def route(rt):
                url = rt.request.url
                for k, ms in delays.items():
                    if k in url: await asyncio.sleep(ms / 1000)
                if abort and any(k in url for k in abort): await rt.abort(); return
                if '/__fixture/' in url:
                    await rt.fulfill(status=200, content_type='image/png', body=FX[url.rsplit('/', 1)[1]]); return
                if fixture and url.endswith('index.html'):
                    resp = await rt.fetch(); html = await resp.text()
                    await rt.fulfill(response=resp, body=patch_json(html)); return
                await rt.continue_()
            await pg.route('**/*', route)
            await pg.goto(URL, wait_until='load')
            await pg.wait_for_timeout(900)
            if not mob: await pg.mouse.move(5, 5)      # fuori dalla scena: niente parallasse
            return ctx, pg, errs

        async def scroll_p(pg, pv):
            g = await pg.evaluate(GEO); y = round(g['ps'] + pv * (g['pe'] - g['ps']))
            await pg.evaluate(f'scrollTo({{top:{y},behavior:"instant"}})'); await pg.wait_for_timeout(700)

        async def choose(pg, rid, how='js'):
            sel = f'.recipe-btn[data-recipe="{rid}"]'
            if how == 'js': await pg.evaluate(f"document.querySelector('{sel}').click()")
            elif how == 'tap': await pg.locator(sel).tap()
            elif how == 'key':
                await pg.focus(sel); await pg.keyboard.press('Enter')
            elif how == 'space':
                await pg.focus(sel); await pg.keyboard.press('Space')
            elif how == 'mouse': await pg.locator(sel).click()

        def consistent(st, rid):
            return (st['on'] == [rid] and st['pressed'] == [rid] and st['ing'] == EXPECT[rid] and st['pins'] == EXPECT[rid]
                    and st['banco'] == rid and st['plate'] == rid and st['alt'] and st['alt'][0].startswith(rid + ':'))

        # ---------------- A. asset reali ----------------
        for (W, H, mob) in [(1440, 900, False), (1024, 768, False), (390, 844, True), (360, 780, True)]:
            key = f'{W}x{H}'; r = {}
            ctx, pg, errs = await newpage(W, H, mob)
            how = 'tap' if mob else 'js'
            pairs = []
            for op, pv in OPEN_P.items():
                await scroll_p(pg, pv)
                for a in IDS:
                    for c in IDS:
                        if a == c: continue
                        await choose(pg, a, how); await pg.wait_for_timeout(750)
                        s0 = await pg.evaluate(STATE)
                        await choose(pg, c, how); await pg.wait_for_timeout(750)
                        s1 = await pg.evaluate(STATE)
                        pairs.append({'apertura': op, 'da': a, 'a': c,
                                      'scroll_invariato': s0['y'] == s1['y'] and s0['docH'] == s1['docH'],
                                      'geometria_invariata': s0['group'] == s1['group'],
                                      'selettore_fermo': s0['switcher'] == s1['switcher'],
                                      'coerente': bool(consistent(s1, c))})
            r['coppie_provate'] = len(pairs)
            r['coppie_ko'] = [x for x in pairs if not all(x[k] for k in ('scroll_invariato', 'geometria_invariata', 'selettore_fermo', 'coerente'))]
            # ingredienti visibili a focaccia aperta: rilevatore di colore sullo screenshot del prodotto
            await scroll_p(pg, OPEN_P[100]); det = {}; vis = {}
            for rid in IDS:
                await choose(pg, rid, how); await pg.wait_for_timeout(800)
                box = await pg.locator('#product .canvas').bounding_box()
                png = await pg.screenshot(clip=box)
                det[rid] = detect(png)
                (OUT / f'A-{key}-aperta-{rid}.png').write_bytes(await pg.screenshot())
                vis[rid] = (await pg.evaluate(STATE))['visibili']
            r['colori_prodotto_aperto'] = det
            r['immagini_visibili'] = vis
            # Porchetta: nessun livello con stracciatella visibile, poco «bianco formaggio» (sale e grasso restano sotto 0,3%)
            r['niente_formaggio_in_porchetta'] = vis['porchetta'] == ['focaccia-porchetta.webp'] and det['porchetta']['formaggio'] < 0.3
            # Tartare: nessun livello con pesto visibile, pesto quasi nullo rispetto alla Mortadella aperta
            r['niente_pesto_in_tartare'] = vis['tartare'] == ['focaccia-tartare.webp'] and det['tartare']['pesto'] < 0.1 < det['mortadella']['pesto']
            # stato della mortadella aperta: livelli veri (poster trasparente)
            await choose(pg, 'mortadella', how); await pg.wait_for_timeout(800)
            st = await pg.evaluate(STATE); r['mortadella_aperta_a_strati'] = st['posterOp'] == 0 and st['lid'] is not None
            # banco → hero
            await pg.evaluate("document.querySelector('#banco').scrollIntoView({behavior:'instant'})"); await pg.wait_for_timeout(500)
            if mob: await pg.locator('[data-tab="tartare"]').tap()
            else: await pg.locator('[data-tab="tartare"]').click()
            await pg.wait_for_timeout(600)
            await pg.evaluate("document.querySelector('.open-dialog').click()"); await pg.wait_for_timeout(400)
            dlg = await pg.evaluate("() => [document.querySelector('#dialog-title').textContent, document.querySelector('.dialog-recipe').textContent, document.querySelector('.dialog-image img').getAttribute('src').slice(-24)]")
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            await scroll_p(pg, OPEN_P[100])
            st = await pg.evaluate(STATE)
            r['banco_tartare_poi_hero'] = {'hero': st['on'], 'pulsante': st['pressed'], 'ingredienti': st['ing'], 'dialog': dlg, 'ok': consistent(st, 'tartare') and dlg[0] == 'Tartare'}
            # tastiera: Tab fino al selettore, Invio e Spazio
            await pg.evaluate("document.querySelector('.recipe-btn[data-recipe=porchetta]').focus()")
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(700)
            k1 = await pg.evaluate(STATE)
            await pg.evaluate("document.querySelector('.recipe-btn[data-recipe=mortadella]').focus()")
            await pg.keyboard.press('Space'); await pg.wait_for_timeout(700)
            k2 = await pg.evaluate(STATE)
            r['tastiera'] = {'invio_porchetta': consistent(k1, 'porchetta'), 'spazio_mortadella': consistent(k2, 'mortadella'),
                             'focus': await pg.evaluate("document.activeElement.dataset.recipe")}
            if not mob:   # clic reale col mouse: anche con la parallasse lo scroll non cambia
                y0 = await pg.evaluate('scrollY'); await choose(pg, 'tartare', 'mouse'); await pg.wait_for_timeout(700)
                r['clic_mouse_scroll_invariato'] = y0 == await pg.evaluate('scrollY')
            # chiusura: continuando lo scroll si richiude la ricetta scelta e il banco la riceve
            await choose(pg, 'porchetta', how); await pg.wait_for_timeout(700)
            await scroll_p(pg, .95); st = await pg.evaluate(STATE)
            tsrc = await pg.evaluate("document.querySelector('.traveler img').getAttribute('src')")
            r['chiusura_e_banco'] = {'mostrata': st['on'], 'banco': st['banco'], 'traveler': tsrc[-28:]}
            r['errori_console'] = errs
            R['A_asset_reali'][key] = r
            await ctx.close()

        # ultimo tap con caricamenti lenti (pagina nuova: nulla è ancora in cache)
        r = {}
        ctx, pg, errs = await newpage(1440, 900, False, delays={'focaccia-tartare.webp': 4500, 'focaccia-porchetta.webp': 350})
        await scroll_p(pg, OPEN_P[100])
        await choose(pg, 'tartare'); await pg.wait_for_timeout(120)
        mid = await pg.evaluate(STATE)
        await choose(pg, 'porchetta'); await pg.wait_for_timeout(5200)   # anche dopo l'arrivo della tartare
        fin = await pg.evaluate(STATE)
        r['tartare_lenta_poi_porchetta'] = {'durante_attesa_visibile': mid['on'], 'pulsante_in_attesa': mid['loading'],
                                            'finale': fin['on'], 'ok': fin['on'] == ['porchetta'] and consistent(fin, 'porchetta') and mid['on'] == ['mortadella']}
        await ctx.close()
        ctx, pg, errs = await newpage(1440, 900, False, delays={'focaccia-porchetta.webp': 4200, 'focaccia-tartare.webp': 3000})
        await scroll_p(pg, OPEN_P[50])
        seq = ['porchetta', 'tartare', 'mortadella']
        for rid in seq: await choose(pg, rid); await pg.wait_for_timeout(60)
        await pg.wait_for_timeout(4800); fin = await pg.evaluate(STATE)
        r['raffica_torna_a_mortadella'] = {'finale': fin['on'], 'ok': consistent(fin, 'mortadella')}
        await choose(pg, 'tartare'); await pg.wait_for_timeout(90); await choose(pg, 'porchetta'); await pg.wait_for_timeout(90); await choose(pg, 'tartare')
        await pg.wait_for_timeout(2200); fin = await pg.evaluate(STATE)
        r['raffica_finisce_su_tartare'] = {'finale': fin['on'], 'ok': consistent(fin, 'tartare')}
        r['errori_console'] = errs
        await ctx.close()
        # asset mancante: resta l'ultima composizione valida
        ctx, pg, errs = await newpage(1440, 900, False, abort=['focaccia-tartare.webp'])
        await scroll_p(pg, OPEN_P[100]); await choose(pg, 'tartare'); await pg.wait_for_timeout(900)
        st = await pg.evaluate(STATE)
        r['tartare_mancante'] = {'mostrata': st['on'], 'pulsante': st['pressed'], 'banco': st['banco'], 'avvisi': [e for e in errs if 'tartare' in e][:2],
                                 'ok': consistent(st, 'mortadella')}
        await ctx.close()
        R['A_asset_reali']['caricamenti'] = r

        # movimento ridotto: cambio immediato, niente si sposta
        rm = {}
        for (W, H, mob) in [(390, 844, True), (1440, 900, False)]:
            ctx, pg, errs = await newpage(W, H, mob, reduced=True)
            await pg.evaluate("document.querySelector('.recipe-switch').scrollIntoView({block:'center',behavior:'instant'})"); await pg.wait_for_timeout(300)
            s0 = await pg.evaluate(STATE)
            await choose(pg, 'tartare', 'tap' if mob else 'js'); await pg.wait_for_timeout(250)
            s1 = await pg.evaluate(STATE)
            await choose(pg, 'porchetta', 'tap' if mob else 'js'); await pg.wait_for_timeout(250)
            s2 = await pg.evaluate(STATE)
            (OUT / f'RM-{W}x{H}-porchetta.png').write_bytes(await pg.screenshot())
            rm[f'{W}x{H}'] = {'classe_rm': await pg.evaluate("document.documentElement.classList.contains('rm')"),
                              'tartare': consistent(s1, 'tartare'), 'porchetta': consistent(s2, 'porchetta'),
                              'selettore_fermo': s0['switcher'] == s1['switcher'] == s2['switcher'],
                              'scroll_invariato': s0['y'] == s1['y'] == s2['y'], 'ingredienti_lista': s2['ing'], 'errori': errs}
            await ctx.close()
        R['A_asset_reali']['movimento_ridotto'] = rm

        # ---------------- B. fixture: meccanica del cambio a focaccia aperta ----------------
        SAMPLER = '''async ([from, to]) => {
          const g = id => document.querySelector(`.rgroup[data-recipe="${id}"]`);
          const op = (el) => el ? parseFloat(el.style.opacity || getComputedStyle(el).opacity) : 0;
          const samples = []; const t0 = performance.now();
          document.querySelector(`.recipe-btn[data-recipe="${to}"]`).click();
          await new Promise(res => { const f = () => { const A = g(from), B = g(to);
              samples.push({ t: performance.now() - t0, fillA: op(A.querySelector('.lw-meat')), fillB: op(B.querySelector('.lw-meat')),
                lidA: op(A.querySelector('.lw-lid')), lidB: op(B.querySelector('.lw-lid')),
                posA: op(A.querySelector('.poster')), posB: op(B.querySelector('.poster')),
                ingName: document.querySelector('#ing-detail li h3').textContent, group: document.querySelector('.pgroup').style.transform, y: scrollY });
              if (performance.now() - t0 < 900) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
          return samples; }'''
        for (W, H, mob) in [(1440, 900, False), (390, 844, True)]:
            key = f'{W}x{H}'; r = {}
            ctx, pg, errs = await newpage(W, H, mob, fixture=True)
            await pg.wait_for_timeout(2500)   # tutte le fixture decodificate
            ready = await pg.evaluate("[...document.querySelectorAll('.rgroup')].map(g=>g.dataset.recipe+':'+g.classList.contains('is-ready'))")
            r['livelli_pronti'] = ready
            res = []
            for op, pv in OPEN_P.items():
                await scroll_p(pg, pv)
                for a in IDS:
                    for c in IDS:
                        if a == c: continue
                        await pg.evaluate(f"document.querySelector('.recipe-btn[data-recipe={a}]').click()"); await pg.wait_for_timeout(750)
                        s0 = await pg.evaluate(STATE)
                        smp = await pg.evaluate(SAMPLER, [a, c]); await pg.wait_for_timeout(150)
                        s1 = await pg.evaluate(STATE)
                        both = [s for s in smp if s['fillA'] > .02 and s['fillB'] > .02] if op > 0 else []
                        dur = next((s['t'] for s in smp if s['fillB'] >= .999 and s['posB'] >= 0 and s['fillA'] < .001), None)
                        res.append({'apertura': op, 'da': a, 'a': c,
                                    'scroll_invariato': all(s['y'] == s0['y'] for s in smp) and s1['y'] == s0['y'],
                                    'apertura_invariata': all(s['group'] == s0['group'] for s in smp) and s1['lid'] == s0['lid'],
                                    'due_farciture_insieme': len(both), 'fine_ms': round(dur) if dur else None,
                                    'coerente': bool(consistent(s1, c))})
            r['coppie_provate'] = len(res)
            r['coppie_ko'] = [x for x in res if not (x['scroll_invariato'] and x['apertura_invariata'] and x['coerente'] and x['due_farciture_insieme'] == 0)]
            r['durata_cambio_ms'] = sorted({x['fine_ms'] for x in res if x['fine_ms']})
            # pane fermo: con lo stesso pane (Mortadella ↔ Porchetta) i pixel del pane non cambiano durante il cambio
            await scroll_p(pg, OPEN_P[100])
            await pg.evaluate("document.querySelector('.recipe-btn[data-recipe=mortadella]').click()"); await pg.wait_for_timeout(800)
            box = await pg.evaluate(CLIP)
            base = np.asarray(Image.open(io.BytesIO(await pg.screenshot(clip=box))).convert('RGB')).astype(np.int16)
            await pg.evaluate("document.querySelector('.rgroup.is-on .lw-lid').style.visibility='hidden'"); await pg.wait_for_timeout(60)
            nolid = np.asarray(Image.open(io.BytesIO(await pg.screenshot(clip=box))).convert('RGB')).astype(np.int16)
            await pg.evaluate("document.querySelector('.rgroup.is-on .lw-lid').style.visibility=''"); await pg.wait_for_timeout(60)
            lidmask = np.abs(base - nolid).sum(2) > 40
            from PIL import ImageFilter
            lidmask = np.asarray(Image.fromarray((lidmask * 255).astype('uint8')).filter(ImageFilter.MinFilter(7))) > 0
            frames = []
            await pg.evaluate("document.querySelector('.recipe-btn[data-recipe=porchetta]').click()")
            t0 = time.time()
            while time.time() - t0 < .75:
                fr = np.asarray(Image.open(io.BytesIO(await pg.screenshot(clip=box))).convert('RGB')).astype(np.int16)
                frames.append(fr)
            d = [float(np.abs(f - base).sum(2)[lidmask].mean()) for f in frames]
            p99 = [float(np.percentile(np.abs(f - base).sum(2)[lidmask], 99)) for f in frames]
            r['pane_fermo'] = {'pixel_pane': int(lidmask.sum()), 'fotogrammi': len(frames), 'diff_media_max': round(max(d), 2), 'diff_p99_max': round(max(p99), 1),
                               'ok': max(d) < 2.0}
            # niente vuoti: copertura del prodotto durante il cambio verso un pane diverso (Porchetta → Tartare)
            def cover(f): return float((np.abs(f - np.array([25, 25, 23])).sum(2) > 30).mean())
            c0 = cover(np.asarray(Image.open(io.BytesIO(await pg.screenshot(clip=box))).convert('RGB')).astype(np.int16))
            await pg.evaluate("document.querySelector('.recipe-btn[data-recipe=tartare]').click()")
            covs = []; t0 = time.time(); k = 0
            while time.time() - t0 < .75:
                png = await pg.screenshot(clip=box); covs.append(cover(np.asarray(Image.open(io.BytesIO(png)).convert('RGB')).astype(np.int16)))
                if k in (1, 3, 5): (OUT / f'B-{key}-porchetta-tartare-f{k}.png').write_bytes(png)
                k += 1
            r['copertura_min_rispetto_a_prima'] = round(min(covs) / c0, 3)
            # ultimo tap con fixture lente a focaccia aperta
            await pg.close(); await ctx.close()
            ctx, pg, errs2 = await newpage(W, H, mob, fixture=True, delays={'tartare-strato.png': 4500, 'porchetta-fondo.png': 400})
            await scroll_p(pg, OPEN_P[100])
            await choose(pg, 'tartare', 'tap' if mob else 'js'); await pg.wait_for_timeout(100)
            mid = await pg.evaluate(STATE)
            await choose(pg, 'porchetta', 'tap' if mob else 'js'); await pg.wait_for_timeout(5000)
            fin = await pg.evaluate(STATE)
            r['ultimo_tap_lento'] = {'durante': mid['on'], 'in_attesa': mid['loading'], 'finale': fin['on'], 'aperta_a_strati': fin['posterOp'] == 0,
                                     'ok': mid['on'] == ['mortadella'] and consistent(fin, 'porchetta') and fin['posterOp'] == 0}
            (OUT / f'B-{key}-fixture-porchetta-aperta.png').write_bytes(await pg.screenshot())
            r['errori_console'] = errs + errs2
            R['B_fixture'][key] = r
            await ctx.close()
        await b.close()
    print(json.dumps(R, ensure_ascii=False, indent=1))


asyncio.run(main())
