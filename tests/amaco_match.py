"""Comparison sheets: AMACO reference crops (reference only, read from ref/, never shipped) next to our fired glaze.
  python tests/amaco_match.py [ids...]  -> shots/amaco-match-1.png, -2.png, ...
Our side: the glaze dipped on a ribbed cylinder (upper half double-dipped), fired with a fixed seed.
GLAZE_URL overrides the build under test (default: the single file dist/glaze-kiln.html)."""
import os, sys, json, time, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools')); from amaco_refs import MATCH, APP
URL = os.environ.get('GLAZE_URL', 'file://' + os.path.join(ROOT, 'dist/glaze-kiln.html')) + '?seed=11'
IDS = sys.argv[1:] or list(MATCH.keys())
T = 230
def font(sz, bold=False):
    return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if bold else ''), sz)
def fit(im, size=T, bg=(255, 255, 255)):
    im = im.convert('RGB'); k = size / max(im.size); im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    c = Image.new('RGB', (size, size), bg); c.paste(im, ((size - im.width) // 2, (size - im.height) // 2)); return c
def crop_pot(path, size):
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(int)
    bg = a[5, 5]; m = np.abs(a - bg).sum(2) > 18; ys, xs = np.where(m)
    cy, cx = (ys.min() + ys.max()) // 2, (xs.min() + xs.max()) // 2; half = int(max(ys.max() - ys.min(), xs.max() - xs.min()) * 0.56)
    pad = Image.new('RGB', (im.width + 4 * half, im.height + 4 * half), tuple(int(v) for v in bg)); pad.paste(im, (2 * half, 2 * half))
    return pad.crop((cx + half, cy + half, cx + 3 * half, cy + 3 * half)).resize((size, size), Image.LANCZOS)
def refs(m):
    """[(image, caption)] reference crops, source noted."""
    out = []
    if m.get('c6'):
        out.append((fit(Image.open(os.path.join(ROOT, 'ref/sheffield/pc-cone6.jpg')).crop(m['c6'])), 'Sheffield chart, cone 6'))
    if m.get('app'):
        out.append((fit(Image.open(os.path.join(ROOT, m['app'])).crop([30, 100, 1000, 720])), 'amaco.com application tiles'))
    elif m.get('photo'):
        im = Image.open(os.path.join(ROOT, m['photo'])); im = im.crop(m['show']) if m.get('show') else im
        out.append((fit(im), 'amaco.com ' + ('application tiles (1-6 coats)' if m.get('show') else 'product photo')))
    if len(out) < 2 and m.get('photo2'):
        im = Image.open(os.path.join(ROOT, m['photo2'])); im = im.crop([50, 70, 530, 210]) if m.get('rects2') else im
        out.append((fit(im), 'amaco.com ' + ('application tiles (1-3 coats)' if m.get('rects2') else 'product photo')))
    if len(out) < 2 and m.get('c6_rel'):
        out.append((fit(Image.open(os.path.join(ROOT, 'ref/sheffield/pc-cone6.jpg')).crop(m['c6_rel'][1])), 'Sheffield c6: PC-50 Shino (related)'))
    return out[:2]
gl = json.loads(subprocess.check_output(['node', '-e', "import('%s/js/glazes.js').then(m=>console.log(JSON.stringify(Object.fromEntries(m.GLAZES.map(g=>[g.id,g.name])))))" % ROOT]))
shots = {}; ours = {}
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1200, 'height': 900}); errs = []
    page.on('console', lambda m: m.type == 'error' and errs.append(m.text)); page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(URL); page.wait_for_function('window.__sim && __sim.state=="raw"'); page.evaluate('__sim.setShape("cylinder")'); page.wait_for_timeout(300)
    for gid in IDS:
        page.evaluate('__sim.clear(); __sim.frame()')
        page.evaluate(f'__sim.pour("{gid}", 1.0, "below", 0.55)'); page.evaluate(f'__sim.pour("{gid}", 0.5, "above", 0.5)')
        page.evaluate('__sim.fire()'); page.wait_for_function('__sim.state=="fired"', timeout=300000)
        page.evaluate('__sim.setView(20, 14, 1.0)'); page.wait_for_timeout(250)
        p = f'/tmp/am_{gid}.png'; page.locator('#view').screenshot(path=p); shots[gid] = crop_pot(p, T); print('fired', gid, flush=True)
        a = np.asarray(shots[gid]).astype(float)[int(T * .3):int(T * .8), int(T * .3):int(T * .62)].reshape(-1, 3)
        L = a @ [0.2126, 0.7152, 0.0722]; a = a[np.argsort(L)][int(len(a) * .02):int(len(a) * .94)]
        ours[gid] = '#%02x%02x%02x' % tuple(int(v) for v in np.median(a, 0))
    b.close()
print('console errors:', errs or 'none')
prev = json.load(open('/tmp/ours.json')) if os.path.exists('/tmp/ours.json') else {}; prev.update(ours); json.dump(prev, open('/tmp/ours.json', 'w'), indent=1)
PER = 7; W = 16 + 3 * (T + 10) + 330
for si in range(0, len(IDS), PER):
    ids = IDS[si:si + PER]; H = 60 + len(ids) * (T + 34) + 30
    img = Image.new('RGB', (W, H), (232, 238, 242)); d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 48), fill=(7, 70, 132))
    d.text((14, 8), 'AMACO reference (left, reference only)  vs  our fired glaze (right)', font=font(17, True), fill='white')
    d.text((14, 29), 'Sheffield Pottery PC chart (cone 6) and amaco.com product photos. Not affiliated with AMACO.', font=font(12), fill=(200, 215, 235))
    for r, gid in enumerate(ids):
        m = MATCH[gid]; y = 60 + r * (T + 34); x = 16
        rf = refs(m) if m else []
        for c in range(2):
            if c < len(rf): img.paste(rf[c][0], (x, y)); d.text((x + 2, y + T + 3), rf[c][1], font=font(11), fill=(82, 93, 125))
            else: d.rectangle((x, y, x + T, y + T), outline=(180, 190, 200)); d.text((x + 50, y + T // 2 - 8), 'no AMACO match', font=font(13), fill=(120, 130, 150))
            x += T + 10
        img.paste(shots[gid], (x, y)); d.text((x + 2, y + T + 3), 'Glaze Kiln (fired, cylinder)', font=font(11), fill=(82, 93, 125)); x += T + 14
        d.text((x, y + 10), gl[gid], font=font(16, True), fill=(0, 18, 36))
        if m:
            d.text((x, y + 36), f"AMACO {m['code']} {m['name']}", font=font(13), fill=(7, 70, 132))
            d.text((x, y + 56), m['url'].replace('https://', ''), font=font(10), fill=(82, 93, 125))
        else:
            d.text((x, y + 36), 'No reasonable AMACO match:', font=font(13), fill=(150, 60, 40)); d.text((x, y + 56), 'generic glaze kept', font=font(12), fill=(82, 93, 125))
    out = os.path.join(ROOT, f'shots/amaco-match-{si // PER + 1}.png'); img.save(out); print('saved', out)
