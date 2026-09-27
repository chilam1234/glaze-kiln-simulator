"""Drips v3 verification (round bead tips, no dark drip rims). Same flow/camera/seed as verify_drips.py:
vase + tenmoku (lower 2/3, real UI) + copper band by REAL mouse drags, seed 20260926, before/after, close-up,
old-vs-new close-up comparison, a second seed (layouts differ), and the other overlap pairs on cylinders."""
import os, time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageStat, ImageDraw, ImageFont
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shots'))
errors = []; logs = []
def shot(page, name):
    page.wait_for_timeout(400); p = os.path.join(OUT, name); page.locator('#view').screenshot(path=p); return p
def drag(page, pts, steps=6):
    page.mouse.move(*pts[0]); page.mouse.down()
    for p in pts[1:]: page.mouse.move(*p, steps=steps)
    page.mouse.up()
def fire(page):
    t = time.time(); page.click('#fireBtn'); page.wait_for_function('__sim.state === "fired"', timeout=240000); page.wait_for_timeout(500)
    return page.evaluate('__sim.dripStats'), round(time.time() - t, 1)
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
    before = shot(page, '_d2-before.png')
    st1 = fire(page); print('fire 1 (seed 20260926):', st1)
    after = shot(page, '_d2-after.png')
    page.evaluate('__sim.setView(20, 4, 0.5)'); close = shot(page, 'drips2-close.png'); page.evaluate('__sim.setView(20, 12, 2)')
    page.click('#unfireBtn'); page.evaluate('__sim.setSeed(7)')
    st2 = fire(page); print('fire 2 (seed 7):', st2); seed2 = shot(page, '_d2-seed7.png')
    # other overlap pairs, fixed seed
    page.click('button[data-shape="cylinder"]'); page.wait_for_timeout(500)
    page.evaluate('__sim.pour("shino", 0.6, "below", 0.7)'); page.evaluate('__sim.pour("tenmoku", 0.4, "above", 0.6)')
    page.evaluate('__sim.setSeed(20260926)'); st3 = fire(page); print('tenmoku over shino:', st3)
    page.evaluate('__sim.setView(20, 8)'); shot(page, 'drips2-tenmoku-over-shino.png')
    page.evaluate('__sim.clear()'); page.wait_for_timeout(300)
    page.evaluate('__sim.pour("matte", 0.45, "below", 0.6)'); page.evaluate('__sim.pour("cobalt", 0.4, "above", 0.6)')
    page.evaluate('__sim.brushBand("ash", 0.93, 0.8, 0.15)'); page.evaluate('__sim.brushBand("ash", 0.85, 0.8, 0.15)')
    page.evaluate('__sim.setSeed(20260926)'); st4 = fire(page); print('ash over cobalt/matte:', st4)
    page.evaluate('__sim.setView(20, 8)'); shot(page, 'drips2-ash-over-cobalt.png')
    b.close()
A, B = Image.open(before).convert('RGB'), Image.open(after).convert('RGB')
sb = Image.new('RGB', (A.width * 2 + 10, A.height), (255, 255, 255)); sb.paste(A, (0, 0)); sb.paste(B, (A.width + 10, 0))
sb.save(os.path.join(OUT, 'drips2-before_after.png'))
old, new = Image.open(os.path.join(OUT, 'drips-close.png')).convert('RGB'), Image.open(close).convert('RGB')
bar = 44; cp = Image.new('RGB', (old.width + new.width + 10, max(old.height, new.height) + bar), (255, 255, 255))
cp.paste(old, (0, bar)); cp.paste(new, (old.width + 10, bar)); dr = ImageDraw.Draw(cp)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception: font = ImageFont.load_default()
dr.text((12, 10), 'BEFORE: drips-close.png (pointed tips, dark rims)', fill=(30, 30, 30), font=font)
dr.text((old.width + 22, 10), 'AFTER: drips2-close.png (bead tips, soft edges)', fill=(30, 30, 30), font=font)
cp.save(os.path.join(OUT, 'drips2-compare.png'))
d = ImageStat.Stat(ImageChops.difference(B, Image.open(seed2).convert('RGB'))).mean
print('mean abs pixel diff seed 20260926 vs seed 7 (same glazing/camera):', [round(x, 2) for x in d])
for f in ('_d2-before.png', '_d2-after.png', '_d2-seed7.png'): os.remove(os.path.join(OUT, f))
for f in ('drips2-close.png', 'drips2-before_after.png', 'drips2-compare.png', 'drips2-tenmoku-over-shino.png', 'drips2-ash-over-cobalt.png'): print('saved', os.path.join(OUT, f))
print('CONSOLE ERRORS:', errors or 'none'); print('logs:', [l for l in logs if 'drips' in l or 'fire sim' in l])
