"""Headless Chromium (SwiftShader WebGL) verification of the glaze simulator.
Usage: /workspace/.venv-glaze/bin/python tests/verify.py [--extra]
Produces shots/before.png, after.png, bowl-after.png, before_after.png."""
import sys, json, time, os
from playwright.sync_api import sync_playwright
from PIL import Image

URL = 'http://localhost:8765/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'shots')
os.makedirs(OUT, exist_ok=True)
EXTRA = '--extra' in sys.argv
errors, logs = [], []

def shot(page, name):
    p = os.path.join(OUT, name)
    page.wait_for_timeout(400)
    page.locator('#view').screenshot(path=p)
    print('saved', os.path.abspath(p))
    return p

def wait_fired(page, timeout=240000):
    page.wait_for_function('window.__sim.state === "fired"', timeout=timeout)
    page.wait_for_timeout(600)

def drag(page, pts, steps=6):
    page.mouse.move(*pts[0]); page.mouse.down()
    for p in pts[1:]:
        page.mouse.move(*p, steps=steps)
    page.mouse.up()

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True,
        args=['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'])
    page = browser.new_page(viewport={'width': 1400, 'height': 900})
    page.on('console', lambda m: (errors if m.type == 'error' else logs).append(f'{m.type}: {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    t0 = time.time()
    page.goto(URL)
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(1500)
    print('loaded in %.1fs' % (time.time() - t0))

    # --- vase: tenmoku poured over the lower 2/3 (real UI clicks) ---
    page.click('button[data-shape="vase"]'); page.wait_for_timeout(800)
    page.click('button[data-glaze="tenmoku"]')
    page.click('button[data-tool="pour"]')
    page.fill('#pourH', '0.66'); page.dispatch_event('#pourH', 'input')
    page.click('button[data-mode="below"]')
    page.click('#pourBtn'); page.wait_for_timeout(500)

    # --- copper red band overlapping the top of the tenmoku: REAL mouse drags on the canvas ---
    page.click('button[data-glaze="copper"]')
    page.click('button[data-tool="brush"]')
    page.fill('#size', '0.13'); page.dispatch_event('#size', 'input')
    before_cu = dict(page.evaluate('__sim.stats()'))['copper']
    for az in (0, 90, 180, 270):
        page.evaluate(f'__sim.setView({az}, 12)'); page.wait_for_timeout(300)
        for h in (0.6, 0.67):
            pts = [page.evaluate(f'__sim.screenAt({h}, {a})') for a in (-55, -25, 0, 25, 55)]
            drag(page, [(p['x'], p['y']) for p in pts])
    after_cu = dict(page.evaluate('__sim.stats()'))['copper']
    print('mouse-brush copper coverage (mean thickness) before=%s after=%s -> %s' % (before_cu, after_cu, 'PAINTS OK' if after_cu > before_cu + 1e-3 else 'FAILED'))
    # shino on the lip/rim via the hook (brush dabs in UV space)
    page.evaluate('__sim.brushBand("shino", 0.93, 0.7, 0.16)')
    page.evaluate('__sim.brushBand("shino", 0.985, 0.7, 0.12)')

    page.mouse.move(100, 850)   # move the pointer off the canvas so the brush cursor ring is hidden
    page.evaluate('__sim.setView(20, 14)')
    shot(page, 'before.png')
    page.screenshot(path=os.path.join(OUT, 'ui-before.png'))

    t1 = time.time()
    page.click('#fireBtn')
    page.wait_for_function('window.__sim.glow > 0.6', timeout=30000)
    shot(page, 'firing.png')
    wait_fired(page)
    print('fired in %.1fs' % (time.time() - t1))
    shot(page, 'after.png')
    page.screenshot(path=os.path.join(OUT, 'ui-after.png'))
    if EXTRA:
        page.evaluate('__sim.setView(200, 10)'); shot(page, 'after-back.png')
        page.evaluate('__sim.setView(20, 40, 0.55)'); shot(page, 'after-close.png'); page.evaluate('__sim.setView(20, 14, 1/0.55)')

    # --- bowl: celadon dip + crackle on the outside lower half ---
    page.click('button[data-shape="bowl"]'); page.wait_for_timeout(800)
    page.evaluate('__sim.pour("celadon", 1.0, "below", 0.75)')
    page.evaluate('__sim.brushBand("crackle", 0.45, 0.7, 0.28)')
    page.click('#fireBtn'); wait_fired(page)
    page.evaluate('__sim.setView(25, 38)')
    shot(page, 'bowl-after.png')
    if EXTRA:
        page.evaluate('__sim.setView(25, 60, 0.6)'); shot(page, 'bowl-close.png'); page.evaluate('__sim.setView(25, 38, 1/0.6)')
        page.evaluate('__sim.setView(25, 8, 0.7)'); shot(page, 'bowl-side.png')

    browser.close()

a, b = Image.open(os.path.join(OUT, 'before.png')).convert('RGB'), Image.open(os.path.join(OUT, 'after.png')).convert('RGB')
sb = Image.new('RGB', (a.width + b.width + 10, max(a.height, b.height)), (255, 255, 255))
sb.paste(a, (0, 0)); sb.paste(b, (a.width + 10, 0)); sb.save(os.path.join(OUT, 'before_after.png'))
print('saved', os.path.abspath(os.path.join(OUT, 'before_after.png')))
print('CONSOLE ERRORS:', json.dumps(errors, indent=1) if errors else 'none')
print('other console (first 10):', logs[:10])
