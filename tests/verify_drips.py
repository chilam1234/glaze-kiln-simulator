"""Drip verification: vase + tenmoku (lower 2/3, real UI) + copper band by REAL mouse drags, fire (stable seed),
side-by-side unfired/fired with the same camera, a close-up, a second seed to prove layouts differ, and ash on a cylinder."""
import os, json, time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageStat
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shots'); OUT = os.path.abspath(OUT)
errors = []; logs = []
def shot(page, name):
    page.wait_for_timeout(400); p = os.path.join(OUT, name); page.locator('#view').screenshot(path=p); return p
def drag(page, pts, steps=6):
    page.mouse.move(*pts[0]); page.mouse.down()
    for p in pts[1:]: page.mouse.move(*p, steps=steps)
    page.mouse.up()
def fire(page):
    page.click('#fireBtn'); page.wait_for_function('__sim.state === "fired"', timeout=240000); page.wait_for_timeout(500)
    return page.evaluate('__sim.dripStats')
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1400, 'height': 900})
    page.on('console', lambda m: (errors if m.type == 'error' else logs).append(m.text))
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto('http://localhost:8765/'); page.wait_for_function('window.__sim && __sim.state === "raw"', timeout=120000)
    page.click('button[data-shape="vase"]'); page.wait_for_timeout(500)
    page.click('button[data-glaze="tenmoku"]'); page.click('button[data-tool="pour"]')
    page.fill('#pourH', '0.66'); page.dispatch_event('#pourH', 'input'); page.click('button[data-mode="below"]'); page.click('#pourBtn')
    page.click('button[data-glaze="copper"]'); page.click('button[data-tool="brush"]')
    page.fill('#size', '0.13'); page.dispatch_event('#size', 'input')
    for az in (0, 90, 180, 270):
        page.evaluate(f'__sim.setView({az}, 12)'); page.wait_for_timeout(300)
        for h in (0.6, 0.67):
            pts = [page.evaluate(f'__sim.screenAt({h}, {a})') for a in (-55, -25, 0, 25, 55)]
            drag(page, [(p['x'], p['y']) for p in pts])
    cu = dict(page.evaluate('__sim.stats()'))['copper']; print('copper mean thickness after mouse drags:', cu, 'OK' if cu > 0.01 else 'FAIL')
    page.mouse.move(100, 850)
    page.evaluate('__sim.setSeed(20260926)'); page.evaluate('__sim.setView(20, 12)')
    before = shot(page, '_drips-before.png')
    t = time.time(); st1 = fire(page); print('fire 1 (seed 20260926):', st1, 'wall %.1fs' % (time.time() - t))
    after = shot(page, '_drips-after.png')
    page.evaluate('__sim.setView(20, 4, 0.5)'); shot(page, 'drips-close.png'); page.evaluate('__sim.setView(20, 12, 2)')
    # second firing, different seed, same glazing and camera
    page.click('#unfireBtn'); page.evaluate('__sim.setSeed(7)')
    st2 = fire(page); print('fire 2 (seed 7):', st2); seed2 = shot(page, 'drips-seed2.png')
    # ash on cylinder
    page.evaluate('__sim.setSeed(null)')
    page.click('button[data-shape="cylinder"]'); page.wait_for_timeout(500)
    page.evaluate('__sim.pour("ash", 0.55, "above", 1.1)')
    st3 = fire(page); print('ash fire (random seed):', st3)
    page.evaluate('__sim.setView(20, 10)'); shot(page, 'drips-ash.png')
    b.close()
A, B = Image.open(before).convert('RGB'), Image.open(after).convert('RGB')
sb = Image.new('RGB', (A.width * 2 + 10, A.height), (255, 255, 255)); sb.paste(A, (0, 0)); sb.paste(B, (A.width + 10, 0))
sb.save(os.path.join(OUT, 'drips-before_after.png'))
d = ImageStat.Stat(ImageChops.difference(B, Image.open(seed2).convert('RGB'))).mean
print('mean abs pixel diff seed 20260926 vs seed 7 (same glazing/camera):', [round(x, 2) for x in d])
for f in ('_drips-before.png', '_drips-after.png'): os.remove(os.path.join(OUT, f))
for f in ('drips-before_after.png', 'drips-close.png', 'drips-ash.png', 'drips-seed2.png'): print('saved', os.path.join(OUT, f))
print('CONSOLE ERRORS:', errors or 'none'); print('logs:', [l for l in logs if 'drips' in l or 'fire sim' in l])
