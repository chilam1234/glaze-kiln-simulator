"""Fire every shape with its own glaze combination (fixed seed), save shots/shape-<name>.png and shots/shapes-grid.png.
The mug gets a REAL mouse-drag brush stroke on its handle (checked via handle-only stats) plus pours that cover the handle."""
import os, time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')); OUT = os.path.join(ROOT, 'shots')
URL = os.environ.get('GLAZE_URL', 'http://localhost:8765/')
# shape: (label, [setup JS], view (az, elev))
PLAN = {
  'cylinder': ('Cylinder: shino + tenmoku', ['__sim.pour("shino", 0.6, "below", 0.7)', '__sim.pour("tenmoku", 0.4, "above", 0.6)'], (20, 12)),
  'bowl':     ('Bowl: celadon + cobalt rim', ['__sim.pour("celadon", 1.0, "below", 0.8)', '__sim.brushBand("cobalt", 0.9, 0.7, 0.14)'], (20, 32)),
  'vase':     ('Vase: tenmoku + copper', ['__sim.pour("tenmoku", 0.66, "below", 0.6)', '__sim.brushBand("copper", 0.63, 0.9, 0.13)'], (20, 12)),
  'plate':    ('Plate: celadon, ash dipped rim', ['__sim.pour("celadon", 1.0, "below", 0.9)', '__sim.pour("ash", 0.8, "above", 0.9)'], (20, 42)),
  'chawan':   ('Chawan: shino, tenmoku rim dip', ['__sim.pour("shino", 1.0, "below", 0.8)', '__sim.pour("tenmoku", 0.78, "above", 0.7)'], (20, 22)),
  'bottle':   ('Bottle: tenmoku + ash', ['__sim.pour("tenmoku", 1.0, "below", 0.6)', '__sim.pour("ash", 0.56, "above", 0.9)'], (20, 10)),
  'jar':      ('Jar: matte + celadon', ['__sim.pour("matte", 0.5, "below", 0.6)', '__sim.pour("celadon", 0.38, "above", 0.8)'], (20, 16)),
  'mug':      ('Mug: matte + cobalt, copper handle', ['__sim.pour("matte", 0.45, "below", 0.6)', '__sim.pour("cobalt", 0.4, "above", 0.6)'], (55, 14)),
}
errors, logs, results = [], [], {}
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1400, 'height': 900})
    page.on('console', lambda m: (errors if m.type == 'error' else logs).append(m.text))
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(URL); page.wait_for_function('window.__sim && __sim.state === "raw"', timeout=120000)
    for shape, (label, setup, (az, el)) in PLAN.items():
        page.click(f'button[data-shape="{shape}"]'); page.wait_for_timeout(500)
        for js in setup: page.evaluate(js)
        page.evaluate(f'__sim.setView({az}, {el})'); page.wait_for_timeout(300)
        if shape == 'mug':   # real mouse drag along the handle with copper
            page.click('button[data-glaze="copper"]'); page.click('button[data-tool="brush"]')
            page.fill('#thick', '0.9'); page.dispatch_event('#thick', 'input'); page.fill('#size', '0.08'); page.dispatch_event('#size', 'input')
            h0 = page.evaluate('__sim.handleStats()')['copper']
            pts = [page.evaluate(f'__sim.handleScreenAt({t})') for t in (0.12, 0.3, 0.5, 0.7, 0.88)]
            page.mouse.move(pts[0]['x'], pts[0]['y']); page.mouse.down()
            for p in pts[1:]: page.mouse.move(p['x'], p['y'], steps=10)
            page.mouse.up(); page.mouse.move(100, 850)
            hs = page.evaluate('__sim.handleStats()')
            results['mug_handle_raw'] = {'copper_before': h0, **hs}
            print('mug handle (raw) mean thickness per glaze:', hs, '| copper stroke', 'PAINTED' if hs['copper'] > h0 else 'NOT PAINTED')
        page.evaluate('__sim.setSeed(20260926)')
        t = time.time(); page.click('#fireBtn'); page.wait_for_function('__sim.state === "fired"', timeout=300000); page.wait_for_timeout(500)
        st = page.evaluate('__sim.dripStats'); results[shape] = (round(time.time() - t, 1), st)
        print(f'{shape}: fired in {time.time() - t:.1f}s wall, {st}')
        if shape == 'mug': print('mug handle (fired):', page.evaluate('__sim.handleStats()'))
        page.evaluate(f'__sim.setView({az}, {el})'); page.wait_for_timeout(400)
        page.locator('#view').screenshot(path=os.path.join(OUT, f'shape-{shape}.png'))
        if shape == 'mug':
            page.evaluate('__sim.setView(95, 10)'); page.wait_for_timeout(300); page.locator('#view').screenshot(path=os.path.join(OUT, 'shape-mug-side.png'))
    page.locator('#panel').screenshot(path=os.path.join(OUT, 'shapes-panel.png'))
    b.close()
tiles = []
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
except Exception: font = ImageFont.load_default()
for shape, (label, _, _) in PLAN.items():
    im = Image.open(os.path.join(OUT, f'shape-{shape}.png')).convert('RGB'); w, h = im.size
    im = im.crop((int(w * 0.14), int(h * 0.02), int(w * 0.86), int(h * 0.98))).resize((520, int(520 * h * 0.96 / (w * 0.72))))
    ImageDraw.Draw(im).text((12, 10), label, fill=(40, 34, 30), font=font); tiles.append(im)
tw, th = tiles[0].size; grid = Image.new('RGB', (tw * 4 + 30, th * 2 + 10), (255, 255, 255))
for i, im in enumerate(tiles): grid.paste(im, ((i % 4) * (tw + 10), (i // 4) * (th + 10)))
grid.save(os.path.join(OUT, 'shapes-grid.png'))
for s in list(PLAN) + ['mug-side']: print('saved', os.path.join(OUT, f'shape-{s}.png'))
print('saved', os.path.join(OUT, 'shapes-grid.png'), os.path.join(OUT, 'shapes-panel.png'))
print('CONSOLE ERRORS:', errors or 'none')
