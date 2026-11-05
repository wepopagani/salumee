"""Prove interattive V3/V3.1 (Chrome headless via Playwright). Stampa un report JSON."""
import asyncio, json, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/index.html'
GEO = '''() => { const h=document.querySelector('.hero'), st=document.querySelector('.stage'), hh=document.querySelector('.site-header').offsetHeight;
  const ht=h.getBoundingClientRect().top+scrollY; const ps=ht-hh, pe=ht+h.offsetHeight-st.offsetHeight-hh;
  const bt=document.querySelector('#banco').getBoundingClientRect().top+scrollY-hh; return {ps,pe,bt,hh,vh:innerHeight}; }'''
VIS = '''() => { const vis=(el)=>{ if(!el) return false; const cs=getComputedStyle(el); if(cs.visibility==='hidden'||parseFloat(cs.opacity)<0.02) return false;
    let p=el.parentElement; while(p){ const c=getComputedStyle(p); if(parseFloat(c.opacity)<0.02) return false; p=p.parentElement; }
    const r=el.getBoundingClientRect(); return r.bottom>0 && r.top<innerHeight && r.width>0; };
  const fig=document.querySelector('#product'); const tr=document.querySelector('.traveler'); const slot=document.querySelector('.plate-img.is-active');
  const heroLayers=[...fig.querySelectorAll('.rgroup.is-on .poster,.rgroup.is-on .layer-wrap')].some(vis);
  return {hero: heroLayers, trav: vis(tr), slot: vis(slot), y: scrollY}; }'''
async def settle(pg, ms=420): await pg.wait_for_timeout(ms)
async def mclick(pg, sel):
    box = await (await pg.query_selector(sel)).bounding_box()
    await pg.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
async def to(pg, y): await pg.evaluate(f'window.scrollTo({{top:{y},behavior:"instant"}})')

async def main():
    R = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for (W, H, mob) in [(1440, 900, False), (390, 844, True)]:
            key = f'{W}x{H}'
            ctx = await b.new_context(viewport={'width': W, 'height': H}, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append('pageerror ' + str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            await pg.goto(URL, wait_until='load'); await settle(pg, 900)
            g = await pg.evaluate(GEO); r = {'geo': g}
            # 1. una sola focaccia visibile lungo tutto il percorso (passi da 30px, avanti)
            bad = []; y = 0
            while y <= g['bt'] + g['vh']:
                await to(pg, y); await settle(pg, 240)
                v = await pg.evaluate(VIS); n = v['hero'] + v['trav'] + v['slot']
                above = await pg.evaluate("() => document.querySelector('.plate').getBoundingClientRect().bottom <= document.querySelector('.site-header').offsetHeight")
                if n != 1 and not (n == 0 and above): bad.append((y, v))
                y += 30
            r['single_focaccia_violations'] = bad[:6]; r['single_focaccia_checked'] = y // 30
            # 2. coincidenza esatta ai due passaggi
            await to(pg, g['pe'] - 1); await settle(pg, 500)
            a = await pg.evaluate("() => { const r=document.querySelector('.canvas').getBoundingClientRect(); return [r.left,r.top,r.width,r.height]; }")
            await to(pg, g['pe'] + 2); await settle(pg, 500)
            t = await pg.evaluate("() => { const r=document.querySelector('.traveler').getBoundingClientRect(); return [r.left,r.top,r.width,r.height]; }")
            r['handoff_hero_to_traveler_px'] = [round(t[i] - a[i] - (0 if i != 1 else -2), 2) for i in range(4)]
            await to(pg, g['bt'] - 2); await settle(pg, 500)
            t2 = await pg.evaluate("() => { const r=document.querySelector('.traveler').getBoundingClientRect(); return [r.left,r.top,r.width,r.height]; }")
            await to(pg, g['bt'] + 1); await settle(pg, 500)
            s2 = await pg.evaluate("() => { const r=document.querySelector('.plate').getBoundingClientRect(); return [r.left,r.top,r.width,r.height]; }")
            r['handoff_traveler_to_plate_px'] = [round(t2[i] - s2[i] - (0 if i != 1 else 3), 2) for i in range(4)]
            # 3. reversibilità: stesso stato arrivando da direzioni diverse e dopo uno scroll rapido
            st = "() => JSON.stringify([...document.querySelectorAll('.pgroup,.rgroup.is-on .lw-lid,.rgroup.is-on .lw-meat,.rgroup.is-on .lw-fondo,.beat-intro,.beat-story')].map(e=>e.style.transform+'|'+e.style.opacity))"
            mid = g['ps'] + .5 * (g['pe'] - g['ps'])
            await to(pg, mid); await settle(pg, 700); s_a = await pg.evaluate(st)
            for yy in [g['bt'] + 400, 0, g['pe'], 50, g['bt']]:
                await to(pg, yy); await pg.wait_for_timeout(30)
            await to(pg, mid); await settle(pg, 900); s_b = await pg.evaluate(st)
            r['reversible_after_fast_jumps'] = s_a == s_b
            # 4. continuità a piccoli passi (rotella da 4px): nessun salto di scala/posizione del gruppo
            await to(pg, g['ps'] + .18 * (g['pe'] - g['ps'])); await settle(pg, 600)
            await pg.mouse.move(W * .7, H * .5)
            prev = None; maxjump = 0; ratios = []
            for i in range(80):
                await pg.mouse.wheel(0, 4); await pg.wait_for_timeout(35)
                m = await pg.evaluate("() => [scrollY, (/,\\s*(-?[\\d.]+)px/.exec(document.querySelector('.rgroup.is-on .lw-lid').style.transform)||[0,0])[1]*1]")
                if prev is not None:
                    maxjump = max(maxjump, abs(m[1] - prev[1]))
                prev = m
            r['small_steps_max_lid_move_px_per_4px_step'] = round(maxjump, 2)
            # 5. ciclo fermo a riposo
            await settle(pg, 900)
            r['raf_calls_idle_1s'] = await pg.evaluate("() => new Promise(res => { let n=0; const o=window.requestAnimationFrame; window.requestAnimationFrame=f=>{n++; return o(f)}; setTimeout(()=>{window.requestAnimationFrame=o; res(n)},1000); })")
            # 6. «Guarda dentro» porta all'esplorazione e dà il focus al primo ingrediente
            await to(pg, 0); await settle(pg, 600)
            await to(pg, 0); await settle(pg, 600)
            await mclick(pg, '.look-inside'); await pg.wait_for_timeout(2600)
            r['look_inside'] = await pg.evaluate("() => ({focus: document.activeElement.className + ':' + document.activeElement.textContent.trim(), y: Math.round(scrollY)})")
            # 7. ingredienti: tastiera e click
            await pg.keyboard.press('Tab'); await pg.keyboard.press('Enter'); await settle(pg, 300)
            r['pin_keyboard'] = await pg.evaluate("() => ({pressed:[...document.querySelectorAll('.pin')].map(p=>p.getAttribute('aria-pressed')).join(','), current: document.querySelector('.ing-list .is-current .ing-name').textContent})")
            await mclick(pg, '.pin[data-pin="2"]'); await settle(pg, 300)
            r['pin_click'] = await pg.evaluate("() => document.querySelector('.ing-list .is-current .ing-name').textContent")
            # pin ancorato: distanza fra punto del pin e punto dell'ingrediente proiettato (stessa geometria) già garantita; verifica che il pin resti nel canvas
            r['pins_inside_viewport'] = await pg.evaluate("() => [...document.querySelectorAll('.pin')].every(p=>{const r=p.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth+1 && r.top>=0 && r.bottom<=innerHeight;})")
            # 8. focus non nascosto: CTA a fuoco e scroll → l'intro resta visibile
            await to(pg, 0); await settle(pg, 500)
            await pg.focus('.hero-ctas .btn'); await to(pg, mid); await settle(pg, 700)
            r['focus_guard'] = await pg.evaluate("() => ({intro: getComputedStyle(document.querySelector('.beat-intro')).opacity, story: getComputedStyle(document.querySelector('.beat-story')).opacity, active: document.activeElement.textContent.trim()})")
            await pg.evaluate("document.activeElement.blur()")
            # 9. accesso diretto al menu dalla prima schermata
            await to(pg, 0); await settle(pg, 400)
            if mob:
                await pg.click('.nav-menu-quick')
            else:
                await pg.click('.nav-list a[href="#menu"]')
            traj = []
            for _ in range(10):
                await pg.wait_for_timeout(400)
                traj.append(await pg.evaluate("() => Math.round(document.querySelector('#menu').getBoundingClientRect().top)"))
            r['menu_direct_top'] = traj[-1]; r['menu_direct_traj'] = traj
            if mob:
                await to(pg, 0); await settle(pg, 300)
                await pg.click('.nav-toggle'); await settle(pg, 200)
                r['mobile_nav_open'] = await pg.evaluate("() => [document.querySelector('.nav-toggle').getAttribute('aria-expanded'), getComputedStyle(document.querySelector('.nav-list')).display]")
                await pg.keyboard.press('Escape'); await settle(pg, 150)
                r['mobile_nav_escape'] = await pg.evaluate("() => [document.querySelector('.nav-toggle').getAttribute('aria-expanded'), document.activeElement.className]")
                await pg.click('.nav-toggle'); await settle(pg, 150); await pg.click('.nav-list a[href="#sedi"]'); await pg.wait_for_timeout(2400)
                r['mobile_nav_to_sedi'] = await pg.evaluate("() => [document.querySelector('.nav-toggle').getAttribute('aria-expanded'), Math.round(document.querySelector('#sedi').getBoundingClientRect().top)]")
            # 10. banco: tab, frecce, swipe, posizione stabile dei controlli
            await pg.evaluate("() => { const e=document.querySelector('.banco-controls'); window.scrollTo({top:e.getBoundingClientRect().top+scrollY-innerHeight/2,behavior:'instant'}); }"); await settle(pg, 500)
            pos0 = await pg.evaluate("() => { const r=document.querySelector('[data-step=\"1\"]').getBoundingClientRect(); return [r.left,r.top]; }")
            await mclick(pg, '[data-step="1"]'); await pg.wait_for_timeout(600)
            pos1 = await pg.evaluate("() => { const r=document.querySelector('[data-step=\"1\"]').getBoundingClientRect(); return [r.left,r.top]; }")
            r['banco_next'] = await pg.evaluate("() => [document.querySelector('[role=tab][aria-selected=true]').textContent, document.querySelector('.plate-img.is-active').dataset.i, document.querySelector('.banco-count').textContent]")
            r['banco_button_moved_px'] = [round(pos1[0]-pos0[0],2), round(pos1[1]-pos0[1],2)]
            await pg.focus('[role=tab][aria-selected=true]'); await pg.keyboard.press('ArrowDown'); await settle(pg, 500)
            r['banco_arrow'] = await pg.evaluate("() => [document.activeElement.textContent, document.querySelector('.panel.is-active .panel-name').textContent, document.querySelector('.panel.is-active .panel-price').textContent]")
            await pg.keyboard.press('Home'); await settle(pg, 500)
            await pg.evaluate("() => { const e=document.querySelector('.plate'); window.scrollTo({top:e.getBoundingClientRect().top+scrollY-120,behavior:'instant'}); }"); await settle(pg, 400)
            box = await (await pg.query_selector('.plate')).bounding_box()
            await pg.mouse.move(box['x'] + box['width'] * .75, box['y'] + box['height'] * .5); await pg.mouse.down()
            await pg.mouse.move(box['x'] + box['width'] * .25, box['y'] + box['height'] * .52, steps=6); await pg.mouse.up(); await settle(pg, 600)
            r['banco_swipe_left'] = await pg.evaluate("() => document.querySelector('[role=tab][aria-selected=true] .tab-name').textContent")
            # 11. dialog: apertura, Escape, focus restituito
            await pg.click('.open-dialog'); await settle(pg, 400)
            r['dialog_open'] = await pg.evaluate("() => [document.querySelector('.dish-dialog').open, document.querySelector('#dialog-title').textContent, document.querySelector('.dialog-price').textContent, document.activeElement.className]")
            await pg.keyboard.press('Escape'); await settle(pg, 400)
            r['dialog_closed_focus'] = await pg.evaluate("() => [document.querySelector('.dish-dialog').open, document.activeElement.className]")
            # 12. ricerca nel menu
            await pg.evaluate("document.querySelector('#menu').scrollIntoView({behavior:'instant'})"); await settle(pg, 300)
            vis_count = "() => [...document.querySelectorAll('.dish')].filter(d=>!d.hidden && getComputedStyle(d).display!=='none').length"
            r['menu_initial_visible'] = await pg.evaluate(vis_count)
            await pg.fill('#menu-q', 'stracciatella'); await settle(pg, 300)
            r['search_stracciatella'] = [await pg.evaluate(vis_count), await pg.evaluate("() => document.querySelector('#menu-status').textContent"), await pg.evaluate("() => [...document.querySelectorAll('.dish:not([hidden]) .dish-name')].map(n=>n.textContent).join(', ')")]
            await pg.fill('#menu-q', 'pesto'); await settle(pg, 200)
            r['search_pesto'] = await pg.evaluate("() => [...document.querySelectorAll('.dish:not([hidden]) .dish-name')].map(n=>n.textContent).join(', ')")
            await pg.fill('#menu-q', 'jamon'); await settle(pg, 200)
            r['search_jamon_accent'] = await pg.evaluate("() => [...document.querySelectorAll('.dish:not([hidden]) .dish-name')].map(n=>n.textContent).join(', ')")
            await pg.fill('#menu-q', 'ananas'); await settle(pg, 200)
            r['search_none'] = await pg.evaluate("() => [document.querySelector('.menu-empty').hidden, document.querySelector('#menu-status').textContent]")
            await pg.click('.search-reset-2'); await settle(pg, 200)
            r['search_reset'] = await pg.evaluate("() => [document.querySelector('#menu-q').value, document.querySelector('.menu-empty').hidden, document.activeElement.id]")
            await pg.click('.chip[data-q="bufala"]'); await settle(pg, 200)
            r['chip_bufala'] = await pg.evaluate("() => [...document.querySelectorAll('.dish:not([hidden]) .dish-name')].map(n=>n.textContent).join(', ')")
            await pg.click('.chip[data-q="bufala"]'); await settle(pg, 200)
            r['chip_toggle_off'] = await pg.evaluate("() => document.querySelector('#menu-q').value === ''")
            if mob:
                r['menu_collapsed_visible'] = await pg.evaluate(vis_count)
                await pg.click('.menu-more'); await settle(pg, 300)
                r['menu_expanded_visible'] = await pg.evaluate(vis_count)
            # 13. sedi
            await pg.evaluate("document.querySelector('#sedi').scrollIntoView({behavior:'instant'})"); await settle(pg, 300)
            r['sede_bellinzona'] = await pg.evaluate("() => document.querySelector('.sede-panel.is-active').innerText.replace(/\\s+/g,' ')")
            await pg.click('[data-sede="claro"]'); await settle(pg, 400)
            r['sede_claro'] = await pg.evaluate("() => document.querySelector('.sede-panel.is-active').innerText.replace(/\\s+/g,' ')")
            r['claro_has_hours'] = await pg.evaluate("() => !!document.querySelector('#sede-claro .hours')")
            r['page_mentions_chiuso'] = await pg.evaluate("() => /chius[oa]/i.test(document.body.innerText)")
            r['page_mentions_domenica'] = await pg.evaluate("() => /domenica/i.test(document.body.innerText)")
            r['page_mentions_aperto_adesso'] = await pg.evaluate("() => /aperto (adesso|ora)/i.test(document.body.innerText)")
            # 14. overflow, immagini, errori
            r['overflow_x'] = await pg.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            await pg.evaluate("window.scrollTo({top:document.body.scrollHeight,behavior:'instant'})"); await settle(pg, 900)
            r['images_broken'] = await pg.evaluate("() => [...document.images].filter(i=>i.getAttribute('src') && i.complete && i.naturalWidth===0).map(i=>i.getAttribute('src').slice(0,60))")
            r['errors'] = errs
            R[key] = r
            await ctx.close()
        await b.close()
    print(json.dumps(R, indent=1, ensure_ascii=False))
asyncio.run(main())
