import asyncio, json
from playwright.async_api import async_playwright
import sys
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8766/index.html'
GEO='''() => { const h=document.querySelector('.hero'), st=document.querySelector('.stage'), hh=document.querySelector('.site-header').offsetHeight;
  const ht=h.getBoundingClientRect().top+scrollY; return {ps:ht-hh, pe:ht+h.offsetHeight-st.offsetHeight-hh, bt:document.querySelector('#banco').getBoundingClientRect().top+scrollY-hh}; }'''
async def main():
    out={}
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        async def page(vp, **kw):
            ctx=await b.new_context(viewport=vp, **kw); pg=await ctx.new_page(); errs=[]
            pg.on('pageerror', lambda e: errs.append('pageerror '+str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
            return ctx,pg,errs
        # viewport richieste: overflow, errori, una sola focaccia (campioni)
        for (w,h,mob) in [(1024,768,False),(768,1024,True),(360,780,True),(1440,900,False),(390,844,True)]:
            ctx,pg,errs=await page({'width':w,'height':h}, is_mobile=mob, has_touch=mob)
            await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(900)
            g=await pg.evaluate(GEO); multi=[]
            for f in [0,.2,.5,.8,.99]:
                await pg.evaluate(f"window.scrollTo({{top:{g['ps']+f*(g['pe']-g['ps'])},behavior:'instant'}})"); await pg.wait_for_timeout(350)
                clip=await pg.evaluate("""() => { const st=document.querySelector('.stage').getBoundingClientRect(); const out=[];
                  for (const el of document.querySelectorAll('.rgroup.is-on .lw-lid img,.rgroup.is-on .lw-meat img:last-child,.rgroup.is-on .lw-fondo img:first-child')) { const r=el.getBoundingClientRect(); }
                  const pr=document.querySelector('.rgroup.is-on .lw-lid').getBoundingClientRect(); return {lidTop: Math.round(pr.top + pr.height*0.105*1), stageTop: Math.round(st.top)}; }""")
                multi.append(clip)
            sw=await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
            out[f'{w}x{h}']={'overflow_x':sw,'errors':errs,'lid_top_vs_stage':multi}
            await ctx.close()
        # resize a metà scena e cambio orientamento
        ctx,pg,errs=await page({'width':1440,'height':900})
        await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(800)
        g=await pg.evaluate(GEO); await pg.evaluate(f"window.scrollTo({{top:{g['ps']+.5*(g['pe']-g['ps'])},behavior:'instant'}})"); await pg.wait_for_timeout(500)
        for vp in [(390,844),(844,390),(768,1024),(1280,800)]:
            await pg.set_viewport_size({'width':vp[0],'height':vp[1]}); await pg.wait_for_timeout(500)
        await pg.screenshot(path='/home/claude/v3work/shots/after_resize.png')
        g2=await pg.evaluate(GEO)
        out['resize']={'errors':errs,'overflow':await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth"),'geo_after':g2,
                       'traveler_vis':await pg.evaluate("getComputedStyle(document.querySelector('.traveler')).visibility")}
        await ctx.close()
        # livello mancante
        ctx,pg,errs=await page({'width':1440,'height':900})
        await pg.route('**/focaccia-mortadella.webp', lambda r: r.abort())
        await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(1200)
        g=await pg.evaluate(GEO); await pg.evaluate(f"window.scrollTo({{top:{g['ps']+.5*(g['pe']-g['ps'])},behavior:'instant'}})"); await pg.wait_for_timeout(600)
        await pg.screenshot(path='/home/claude/v3work/shots/miss_layer.png')
        out['missing_layer']={'cls':await pg.evaluate("[document.documentElement.className, document.querySelector('#product').className]"),
            'full_opacity':await pg.evaluate("getComputedStyle(document.querySelector('.rgroup.is-on .poster')).opacity"),
            'pins_vis':await pg.evaluate("getComputedStyle(document.querySelector('.pins')).visibility"),
            'look_vis':await pg.evaluate("getComputedStyle(document.querySelector('.look-inside')).visibility"),
            'ing_items_visible':await pg.evaluate("[...document.querySelectorAll('.ing-list li')].filter(l=>getComputedStyle(l).visibility==='visible').length"),
            'errors':[e for e in errs if 'mortadella' not in e and 'ERR_FAILED' not in e]}
        await pg.evaluate(f"window.scrollTo({{top:{g['pe']+.5*(g['bt']-g['pe'])},behavior:'instant'}})"); await pg.wait_for_timeout(600)
        out['missing_layer']['travel_still_works']=await pg.evaluate("getComputedStyle(document.querySelector('.traveler')).visibility")
        await ctx.close()
        # immagine intera mancante
        ctx,pg,errs=await page({'width':1440,'height':900})
        await pg.route('**/focaccia-intera.webp', lambda r: r.abort())
        await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(1200)
        await pg.screenshot(path='/home/claude/v3work/shots/miss_full.png')
        g=await pg.evaluate(GEO); await pg.evaluate(f"window.scrollTo({{top:{g['pe']+.5*(g['bt']-g['pe'])},behavior:'instant'}})"); await pg.wait_for_timeout(600)
        out['missing_full']={'cls':await pg.evaluate("document.querySelector('#product').className"),
            'traveler_vis':await pg.evaluate("getComputedStyle(document.querySelector('.traveler')).visibility"),
            'errors':[e for e in errs if 'ERR_FAILED' not in e]}
        await ctx.close()
        # movimento ridotto, telefono
        ctx,pg,errs=await page({'width':390,'height':844}, reduced_motion='reduce', is_mobile=True, has_touch=True)
        await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(800)
        out['reduced_motion_mobile']={'overflow':await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth"),
            'hero_h':await pg.evaluate("document.querySelector('.hero').offsetHeight"),'stage_pos':await pg.evaluate("getComputedStyle(document.querySelector('.stage')).position"),
            'ing_visible':await pg.evaluate("[...document.querySelectorAll('.ing-list li')].filter(l=>getComputedStyle(l).visibility==='visible').length"),
            'traveler':await pg.evaluate("getComputedStyle(document.querySelector('.traveler')).visibility"),'errors':errs}
        await pg.click('[data-step="1"]'); await pg.wait_for_timeout(300)
        out['reduced_motion_mobile']['banco_switch']=await pg.evaluate("document.querySelector('.plate-img.is-active').dataset.i")
        await ctx.close()
        # senza JavaScript
        ctx,pg,errs=await page({'width':390,'height':844}, java_script_enabled=False, is_mobile=True)
        await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(800)
        out['no_js_mobile']={'overflow':await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth") if False else 'n/d (JS off)'}
        await pg.screenshot(path='/home/claude/v3work/shots/nojs_m_top.png')
        await ctx.close()
        await b.close()
    print(json.dumps(out, indent=1, ensure_ascii=False))
asyncio.run(main())
