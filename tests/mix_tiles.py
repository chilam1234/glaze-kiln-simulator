"""Look-dev test tiles.
  python tests/mix_tiles.py mix     -> shots/mix-grid.png    (layer-order comparison: each pair as A over B and B over A)
  python tests/mix_tiles.py colors  -> shots/colors-grid.png (every glaze fired alone on a small pot)
Tile recipe (mix): cylinder, glaze B dipped on the lower 72%, then glaze A dipped on the upper 70% -> top band A alone,
middle band A over B (overlap, runs further because it is fluxed), bottom band B alone.
Set GLAZE_URL to test another build (e.g. file:///.../dist/glaze-kiln.html)."""
import os, sys, time
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'mix'
URL = os.environ.get('GLAZE_URL', 'http://localhost:8765/') + ('&' if '?' in os.environ.get('GLAZE_URL', '') else '?') + 'seed=7'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAIRS = [('rutile', 'tenmoku'), ('celadon', 'cobalt'), ('shino', 'copper'), ('turquoise', 'blackmatte'), ('amber', 'matte'), ('yellow', 'plum')]
NEW = ['rutile', 'turquoise', 'seaweed', 'chartreuse', 'yellow', 'orange', 'amber', 'ironred', 'rose', 'plum', 'oatmeal', 'blackmatte', 'bronze']
ONLY = os.environ.get('ONLY')

def font(sz, bold=False):
    for p in (['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if bold else []) + ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

def crop_pot(path, size):
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(int)
    bg = a[5, 5]; m = np.abs(a - bg).sum(2) > 18
    ys, xs = np.where(m); cy, cx = (ys.min() + ys.max()) // 2, (xs.min() + xs.max()) // 2
    half = int(max(ys.max() - ys.min(), xs.max() - xs.min()) * 0.56)
    pad = Image.new('RGB', (im.width + 4 * half, im.height + 4 * half), tuple(int(v) for v in bg)); pad.paste(im, (2 * half, 2 * half))
    return pad.crop((cx + half, cy + half, cx + 3 * half, cy + 3 * half)).resize((size, size), Image.LANCZOS)

def run(jobs, shape, view, tile):
    out = []
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = b.new_page(viewport={'width': 1200, 'height': 900})
        errs = []
        page.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(URL); page.wait_for_function('window.__sim && __sim.state=="raw"')
        page.evaluate(f'__sim.setShape("{shape}")'); page.wait_for_timeout(300)
        for name, cmds in jobs:
            page.evaluate('__sim.clear(); __sim.frame()')
            for c in cmds: page.evaluate(c)
            t = time.time(); page.evaluate('__sim.fire()'); page.wait_for_function('__sim.state=="fired"', timeout=300000)
            ft = time.time() - t
            page.evaluate(f'__sim.setView({view})'); page.wait_for_timeout(250)
            p = f'/tmp/tile_{MODE}_{len(out)}.png'; page.locator('#view').screenshot(path=p)
            out.append((name, crop_pot(p, tile))); print(name, f'fired in {ft:.1f}s, sim', page.evaluate('Math.round(__sim.fireMs)'), 'ms', flush=True)
            page.evaluate('__sim.frame()')
        b.close()
    print('console errors:', errs)
    return out

def label(d, xy, text, f, fill=(0, 18, 36)):
    d.text(xy, text, font=f, fill=fill, anchor='mt')

if MODE == 'mix':
    pairs = [p for p in PAIRS if not ONLY or p[0] in ONLY.split(',')]
    jobs = []
    for a, b_ in pairs:
        for top, bot in ((a, b_), (b_, a)):
            jobs.append((f'{top} over {bot}', [f'__sim.pour("{bot}", 0.72, "below", 0.75)', f'__sim.pour("{top}", 0.30, "above", 0.75)']))
    tiles = run(jobs, 'cylinder', '20, 8, 1.0', 300)
    names = {g: g for g in NEW}
    import json, subprocess
    gl = json.loads(subprocess.check_output(['node', '-e', "import('%s/js/glazes.js').then(m=>console.log(JSON.stringify(Object.fromEntries(m.GLAZES.map(g=>[g.id,g.name])))))" % ROOT]))
    cols, T = 4, 300; rows = (len(tiles) + cols - 1) // cols
    W, Hh = cols * T + (cols + 1) * 14, rows * (T + 64) + 70
    img = Image.new('RGB', (W, Hh), (232, 238, 242)); d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 50), fill=(7, 70, 132)); d.text((16, 13), 'Layer order test tiles: "A over B" (A dipped last, on top). Top band = A alone, middle = A over B, bottom = B alone', font=font(17, True), fill='white')
    for n, (name, im) in enumerate(tiles):
        r, c = divmod(n, cols); x = 14 + c * (T + 14); y = 64 + r * (T + 64)
        img.paste(im, (x, y)); top, bot = name.split(' over ')
        label(d, (x + T // 2, y + T + 6), f'{gl[top]} over {gl[bot]}', font(15, True))
        label(d, (x + T // 2, y + T + 27), 'A over B' if n % 2 == 0 else 'B over A (reversed)', font(12), (82, 93, 125))
    img.save(f'{ROOT}/shots/mix-grid.png'); print('saved mix-grid', img.size)
else:
    ids = [g for g in NEW if not ONLY or g in ONLY.split(',')]
    jobs = [(g, [f'__sim.pour("{g}", 1.0, "below", 0.6)', f'__sim.pour("{g}", 0.55, "above", 0.55)']) for g in ids]
    tiles = run(jobs, 'jar', '25, 14, 0.8', 250)
    import json, subprocess
    gl = json.loads(subprocess.check_output(['node', '-e', "import('%s/js/glazes.js').then(m=>console.log(JSON.stringify(Object.fromEntries(m.GLAZES.map(g=>[g.id,[g.name,g.like||'']])))))" % ROOT]))
    cols, T = 5, 250; rows = (len(tiles) + cols - 1) // cols
    W, Hh = cols * T + (cols + 1) * 12, rows * (T + 60) + 66
    img = Image.new('RGB', (W, Hh), (232, 238, 242)); d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 48), fill=(7, 70, 132)); d.text((16, 12), 'New glazes, each fired alone (dipped once, upper half double-dipped for thickness)', font=font(17, True), fill='white')
    for n, (g, im) in enumerate(tiles):
        r, c = divmod(n, cols); x = 12 + c * (T + 12); y = 60 + r * (T + 60)
        img.paste(im, (x, y)); label(d, (x + T // 2, y + T + 5), gl[g][0], font(15, True))
        label(d, (x + T // 2, y + T + 25), gl[g][1][:40], font(11), (82, 93, 125))
    img.save(f'{ROOT}/shots/colors-grid.png'); print('saved colors-grid', img.size)
