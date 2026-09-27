"""AMACO-palette UI check on the single file (file://): paint a real stroke, screenshot the full UI unfired, fire,
screenshot again; also draws shots/amaco-palette.png and prints WCAG contrast for the main text/background pairs."""
import os, time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')); OUT = os.path.join(ROOT, 'shots')
URL = 'file://' + os.path.join(ROOT, 'dist/glaze-kiln.html')
PALETTE = [  # (hex, name, source on amaco.com)
    ('#074684', 'Primary navy', '--primary, .btn-primary bg'),
    ('#053360', 'Navy hover', '.btn-primary:hover bg'),
    ('#ffbd2e', 'Secondary yellow', '--secondary, .btn-secondary bg'),
    ('#ffb108', 'Yellow hover', '.btn-secondary:hover bg'),
    ('#001224', 'Ink (text)', '--dark, body color'),
    ('#00070e', 'Deep ink', '.btn-secondary text'),
    ('#525d7d', 'Slate', 'links / section bg'),
    ('#7ea3cc', 'Sky', 'h2 color, top bar bg'),
    ('#1b82f7', 'Azure link', 'a, .btn-link color'),
    ('#e8eef2', 'Mist', 'borders, thumbnails'),
    ('#f5f5f5', 'Smoke', 'section backgrounds'),
    ('#fdfdfd', 'Light', '--light'),
]
def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]; c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def contrast(a, b): la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)
for fg, bg, what in [('#001224', '#f5f5f5', 'body text on panel'), ('#525d7d', '#f5f5f5', 'hint/status on panel'), ('#074684', '#f5f5f5', 'headings/values on panel'),
                     ('#ffffff', '#074684', 'active button text'), ('#00070e', '#ffbd2e', 'Fire button text'), ('#001224', '#fdfdfd', 'button text')]:
    print(f'contrast {what}: {contrast(fg, bg):.1f}:1')
errors, reqs = [], []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1400, 'height': 900})
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('request', lambda r: reqs.append(r.url))
    page.goto(URL); page.wait_for_function('window.__sim && __sim.state === "raw"', timeout=120000)
    page.click('button[data-shape="vase"]'); page.wait_for_timeout(400)
    page.click('button[data-glaze="tenmoku"]'); page.click('button[data-tool="pour"]')
    page.fill('#pourH', '0.62'); page.dispatch_event('#pourH', 'input'); page.click('button[data-mode="below"]'); page.click('#pourBtn')
    page.click('button[data-glaze="copper"]'); page.click('button[data-tool="brush"]')
    page.fill('#size', '0.16'); page.dispatch_event('#size', 'input')
    page.evaluate('__sim.setView(20, 12)'); page.wait_for_timeout(300)
    before = dict(page.evaluate('__sim.stats()'))['copper']
    pts = [page.evaluate(f'__sim.screenAt(0.64, {a})') for a in (-60, -30, 0, 30, 60)]
    page.mouse.move(pts[0]['x'], pts[0]['y']); page.mouse.down()
    for p in pts[1:]: page.mouse.move(p['x'], p['y'], steps=8)
    page.mouse.up(); page.mouse.move(700, 870)
    after = dict(page.evaluate('__sim.stats()'))['copper']
    print('copper mean before/after real stroke:', before, '->', after, 'PAINTED' if after > before else 'NOT PAINTED')
    page.wait_for_timeout(400); page.screenshot(path=os.path.join(OUT, 'amaco-ui-before.png'))
    page.evaluate('__sim.setSeed(20260926)'); t = time.time(); page.click('#fireBtn')
    page.wait_for_function('__sim.state === "fired"', timeout=240000); page.wait_for_timeout(600)
    print(f'fired in {time.time() - t:.1f}s wall;', page.evaluate('__sim.dripStats'))
    page.mouse.move(700, 870); page.screenshot(path=os.path.join(OUT, 'amaco-ui-after.png'))
    ff = page.evaluate('getComputedStyle(document.querySelector("button")).fontFamily')
    b.close()
print('button font resolves from:', ff)
print('non-file requests:', [u for u in reqs if not u.startswith(('file:', 'data:', 'blob:'))] or 'none')
# palette strip
try: fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 17); fr = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
except Exception: fb = fr = ImageFont.load_default()
sw, sh, cols = 200, 250, 6; rows_n = (len(PALETTE) + cols - 1) // cols
img = Image.new('RGB', (sw * cols, sh * rows_n), 'white'); d = ImageDraw.Draw(img)
for i, (hx, name, src) in enumerate(PALETTE):
    x, y = (i % cols) * sw, (i // cols) * sh; d.rectangle([x + 4, y + 4, x + sw - 5, y + 140], fill=hx, outline='#c9d4de')
    d.text((x + 10, y + 148), hx, fill='#001224', font=fb); d.text((x + 10, y + 172), name, fill='#001224', font=fr)
    for n, part in enumerate(src.split(', ')): d.text((x + 10, y + 192 + 16 * n), part, fill='#525d7d', font=fr)
img.save(os.path.join(OUT, 'amaco-palette.png'))
for f in ('amaco-ui-before.png', 'amaco-ui-after.png', 'amaco-palette.png'): print('saved', os.path.join(OUT, f))
print('CONSOLE ERRORS:', errors or 'none')
