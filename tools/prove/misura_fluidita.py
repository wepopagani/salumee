"""Misura di fluidità (Chrome headless + tracing). Uso:
   python3 tools/prove/misura_fluidita.py [URL] [file-risultati.json]
Per ogni scenario registra gli intervalli fra i frame (rAF) e, dal tracing di Chrome,
quante volte e per quanto tempo il browser ha dovuto ridipingere (Paint/Raster),
ricalcolare stili e layout. Headless usa una GPU software: i valori assoluti non sono
quelli di un telefono, ma il confronto prima/dopo sullo stesso ambiente è attendibile.
"""
import asyncio, json, sys
from collections import defaultdict
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/index.html'
OUT = sys.argv[2] if len(sys.argv) > 2 else None
CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink', 'cc']
NAMES = {'Paint': 'paint', 'RasterTask': 'raster', 'Layout': 'layout', 'UpdateLayoutTree': 'stile', 'PrePaint': 'prepaint',
         'Layerize': 'layerize', 'FireAnimationFrame': 'script_raf', 'ImageDecodeTask': 'decode', 'Decode Image': 'decode'}
REC = '''() => { window.__fr = []; let last = performance.now(); const f = t => { window.__fr.push(t - last); last = t; if (window.__frOn) requestAnimationFrame(f); };
  window.__frOn = true; requestAnimationFrame(f); }'''
STOP = '''() => { window.__frOn = false; const a = window.__fr.slice(2).sort((x, y) => x - y); const q = p => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  return { frames: a.length, p50: +q(.5).toFixed(1), p95: +q(.95).toFixed(1), max: +a[a.length - 1].toFixed(1),
           sopra_20ms: a.filter(x => x > 20).length, sopra_34ms: a.filter(x => x > 34).length }; }'''
GEO = '''() => { const h=document.querySelector('.hero'), st=document.querySelector('.stage'), hh=document.querySelector('.site-header').offsetHeight;
  const ht=h.getBoundingClientRect().top+scrollY; return {ps:ht-hh, pe:ht+h.offsetHeight-st.offsetHeight-hh, bt:document.querySelector('#banco').getBoundingClientRect().top+scrollY-hh}; }'''


def summarize(trace):
    ev = json.loads(trace)['traceEvents']
    tot, cnt = defaultdict(float), defaultdict(int)
    for e in ev:
        n = NAMES.get(e.get('name'))
        if n and e.get('ph') == 'X':
            tot[n] += e.get('dur', 0) / 1000; cnt[n] += 1
    return {k: {'n': cnt[k], 'ms': round(tot[k], 1)} for k in sorted(tot)}


async def main():
    R = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for W, H, mob in [(1440, 900, False), (390, 844, True)]:
            ctx = await b.new_context(viewport={'width': W, 'height': H}, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page()
            await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(2500)
            if not mob: await pg.mouse.move(W * .7, H * .5)
            g = await pg.evaluate(GEO); r = {}

            async def scenario(name, fn):
                await b.start_tracing(page=pg, categories=CATS)
                await pg.evaluate(REC)
                await fn()
                st = await pg.evaluate(STOP)
                tr = await b.stop_tracing()
                st['tracing'] = summarize(tr)
                r[name] = st

            async def wheel_through():
                step = 40 if not mob else 30
                y = 0
                while y < g['bt'] + 200:
                    await pg.mouse.wheel(0, step); y += step
                    await asyncio.sleep(1 / 60)
                await pg.wait_for_timeout(500)

            async def wheel_back():
                y = await pg.evaluate('scrollY')
                while y > 0:
                    await pg.mouse.wheel(0, -60); y -= 60
                    await asyncio.sleep(1 / 60)
                await pg.wait_for_timeout(500)

            async def switches():
                await pg.evaluate(f"scrollTo({{top:{round(g['ps'] + .53 * (g['pe'] - g['ps']))},behavior:'instant'}})")
                await pg.wait_for_timeout(600)
                for rid in ['porchetta', 'tartare', 'mortadella', 'tartare', 'porchetta', 'mortadella']:
                    await pg.evaluate(f"document.querySelector('.recipe-btn[data-recipe={rid}]').click()")
                    await pg.wait_for_timeout(650)

            async def banco():
                await pg.evaluate("document.querySelector('#banco').scrollIntoView({behavior:'instant'})"); await pg.wait_for_timeout(500)
                for _ in range(4):
                    await pg.evaluate("document.querySelector('[data-step=\"1\"]').click()"); await pg.wait_for_timeout(600)

            await scenario('scroll_scena_e_passaggio', wheel_through)
            await scenario('scroll_indietro', wheel_back)
            await scenario('cambi_ricetta_aperta', switches)
            await scenario('banco', banco)
            R[f'{W}x{H}'] = r
            await ctx.close()
        await b.close()
    s = json.dumps(R, ensure_ascii=False, indent=1)
    print(s)
    if OUT: open(OUT, 'w').write(s)

asyncio.run(main())
