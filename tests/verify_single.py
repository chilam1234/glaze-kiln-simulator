"""Open dist/glaze-kiln.html via file:// (no server), paint one real mouse-drag stroke on the vase, fire, screenshot.
Also runs the identical flow on the served index.html for a look comparison (skip with --no-served)."""
import os, sys, time
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'shots')
def run(pw, url, shotname):
    errors, reqs = [], []
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1400, 'height': 900})
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('request', lambda r: reqs.append(r.url))
    page.goto(url); page.wait_for_function('window.__sim && __sim.state === "raw"', timeout=120000)
    page.click('button[data-shape="vase"]'); page.wait_for_timeout(400)
    page.click('button[data-glaze="copper"]'); page.click('button[data-tool="brush"]')
    page.fill('#size', '0.2'); page.dispatch_event('#size', 'input')
    page.evaluate('__sim.setView(20, 12)'); page.wait_for_timeout(300)
    before = dict(page.evaluate('__sim.stats()')).get('copper', 0)
    pts = [page.evaluate(f'__sim.screenAt(0.55, {a})') for a in (-60, -30, 0, 30, 60)]
    page.mouse.move(pts[0]['x'], pts[0]['y']); page.mouse.down()
    for p in pts[1:]: page.mouse.move(p['x'], p['y'], steps=8)
    page.mouse.up()
    after = dict(page.evaluate('__sim.stats()')).get('copper', 0)
    page.mouse.move(100, 850); page.evaluate('__sim.setSeed(20260926)')
    t = time.time(); page.click('#fireBtn'); page.wait_for_function('__sim.state === "fired"', timeout=240000); page.wait_for_timeout(600)
    ft = time.time() - t
    page.evaluate('__sim.setView(20, 12)'); page.wait_for_timeout(400)
    page.locator('#view').screenshot(path=os.path.join(OUT, shotname)); simms = page.evaluate('Math.round(__sim.fireMs)'); b.close()
    ext = [u for u in reqs if not u.startswith(('file:', 'data:', 'blob:'))]
    local = [u for u in reqs if u.startswith('file:') and u != url]
    print(f'{url}\n  copper mean before/after stroke: {before} -> {after}', 'PAINTED' if after > before else 'NOT PAINTED')
    print(f"  fire wall {ft:.1f}s, sim {simms} ms; console errors: {errors or 'none'}")
    if url.startswith('file:'): print(f'  non-file requests: {ext or "none"}; extra local file loads: {local or "none"}')
    return errors
with sync_playwright() as pw:
    e = run(pw, 'file://' + os.path.join(ROOT, 'dist/glaze-kiln.html'), 'single-file-after.png')
    if '--no-served' not in sys.argv: run(pw, 'http://localhost:8765/', '_served-after.png')
print('saved', os.path.join(OUT, 'single-file-after.png'))
