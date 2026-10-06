"""Unfired brush strokes must not leave a full-width band around the pot.
Uses real pointer painting (dirty-row GPU upload) on WebKit iPhone 13 and Chromium.
Writes shots/unfired-paint-*.png
"""
import json, os, shutil, sys, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image

sys.stdout.reconfigure(line_buffering=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'shots')
ART = '/opt/cursor/artifacts'
os.makedirs(OUT, exist_ok=True)
os.makedirs(ART, exist_ok=True)
CHROME = '/usr/bin/google-chrome'
ARGS = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist', '--enable-webgl']

from playwright.sync_api import sync_playwright

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def log_message(self, fmt, *args):
        pass

httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{httpd.server_address[1]}/'
fail = False
errors = []


def save(page, name, locator=True):
    dest = os.path.join(OUT, name)
    if locator:
        page.locator('#view').screenshot(path=dest)
    else:
        page.screenshot(path=dest, full_page=False)
    try:
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)
    return dest


def check(ok, msg):
    global fail
    print(('OK  ' if ok else 'FAIL') + ' ' + msg)
    if not ok:
        fail = True


def paint_stroke(page, pts):
    page.mouse.move(pts[0][0], pts[0][1])
    page.mouse.down()
    for x, y in pts[1:]:
        page.mouse.move(x, y, steps=5)
    page.mouse.up()
    page.wait_for_timeout(120)


def setup(page):
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.evaluate('''() => {
      __sim.setQuality("high");
      __sim.clear();
      __sim.setShape("vase");
      __sim.setCone(10);
      __sim.setTool("brush");
      __sim.setTouchMode("paint");
      __sim.setGlaze("oatmeal");
      __sim.setBrushSize(0.09);
      __sim.setThickness(0.7);
      __sim.setView(20, 12);
      __sim.setSheet("glaze", true);
    }''')
    page.wait_for_timeout(250)


def screen_pt(page, h, a):
    p = page.evaluate('(ha) => __sim.screenAt(ha[0], ha[1])', [h, a])
    return p['x'], p['y']


def paint_smiley(page, size=0.09):
    page.evaluate('(s) => { __sim.setGlaze("oatmeal"); __sim.setBrushSize(s); }', size)
    strokes = []
    def add(h, a):
        uv = page.evaluate('(ha) => __sim.strokeUV(ha[0], ha[1], ha[2])', [h, a, size])
        strokes.append(uv)
        return screen_pt(page, h, a)
    e1, e2 = add(0.62, -14), add(0.62, 14)
    paint_stroke(page, [e1, (e1[0] + 1, e1[1])])
    paint_stroke(page, [e2, (e2[0] + 1, e2[1])])
    mouth_ha = [(0.50, -22), (0.48, -14), (0.45, -6), (0.43, 0), (0.45, 6), (0.48, 14), (0.50, 22)]
    mouth = []
    for h, a in mouth_ha:
        mouth.append(add(h, a))
    paint_stroke(page, mouth)
    page.mouse.move(8, 8)
    page.wait_for_timeout(200)
    return strokes


def sample_view(page, h, a):
    box = page.locator('#view').bounding_box()
    p = page.evaluate('(ha) => __sim.screenAt(ha[0], ha[1])', [h, a])
    path = save(page, '_tmp_unfired_sample.png')
    im = Image.open(path).convert('RGB')
    x = int(p['x'] - box['x'])
    y = int(p['y'] - box['y'])
    x = max(1, min(im.width - 2, x))
    y = max(1, min(im.height - 2, y))
    return im.getpixel((x, y))


def lum(rgb):
    return 0.30 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]


def run_on(page, label):
    setup(page)
    clay = sample_view(page, 0.55, 70)
    strokes = paint_smiley(page)
    # first-time glaze + switch mid-session
    page.evaluate('__sim.setGlaze("tenmoku"); __sim.setBrushSize(0.08)')
    uv_t = page.evaluate('() => __sim.strokeUV(0.55, 38, 0.08)')
    strokes.append(uv_t)
    p = screen_pt(page, 0.55, 38)
    paint_stroke(page, [p, (p[0] + 16, p[1] + 6)])
    page.mouse.move(8, 8)
    page.wait_for_timeout(250)

    mask = page.evaluate('(s) => __sim.paintMask({ strokes: s, slack: 2.4 })', strokes)
    print(label, 'mask', json.dumps(mask))
    check(mask['painted'] > 80, f'{label}: strokes actually painted ({mask["painted"]} texels)')
    check(mask['bandRows'] == 0, f'{label}: no full-width band rows (got {mask["bandRows"]}, maxFrac={mask["maxFrac"]})')
    check(mask['maxFrac'] < 0.35, f'{label}: local strokes must not wrap the pot (maxFrac={mask["maxFrac"]})')
    check(mask['outside'] < max(40, 0.08 * mask['painted']), f'{label}: paint stays near strokes (outside={mask["outside"]} of {mask["painted"]})')

    save(page, f'unfired-paint-{label}.png')
    front = sample_view(page, 0.46, 0)
    left = sample_view(page, 0.55, -80)
    right = sample_view(page, 0.55, 80)
    print(label, 'pixels', {'clay': clay, 'front': front, 'left': left, 'right': right})
    check(lum(front) > lum(clay) + 8, f'{label}: front mouth is lighter unfired oatmeal, not missing')
    # silhouette limbs at the belly must stay clay — a wrap-around band would glaze both
    check(abs(lum(left) - lum(clay)) < 28, f'{label}: left limb is still clay (band would glaze it) {left} vs {clay}')
    check(abs(lum(right) - lum(clay)) < 28, f'{label}: right limb is still clay (band would glaze it) {right} vs {clay}')
    return mask


with sync_playwright() as pw:
    # WebKit ≈ iPhone Safari
    try:
        wk = pw.webkit.launch(headless=True)
        ctx = wk.new_context(**pw.devices['iPhone 13'])
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(f'webkit: {e}'))
        page.goto(url, timeout=120000)
        run_on(page, 'webkit-iphone')
        wk.close()
    except Exception as e:
        check(False, f'webkit run failed: {e}')

    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    ctx = browser.new_context(**pw.devices['iPhone 13'])
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'chromium: {e}'))
    page.goto(url, timeout=120000)
    run_on(page, 'chromium-iphone')

    desk = browser.new_page(viewport={'width': 1280, 'height': 800})
    desk.on('pageerror', lambda e: errors.append(f'desktop: {e}'))
    desk.goto(url, timeout=120000)
    run_on(desk, 'chromium-desktop')
    browser.close()

httpd.shutdown()
print('CONSOLE ERRORS:', errors or 'none')
if errors:
    check(False, f'page errors: {errors[:4]}')
if fail:
    print('FAILURES')
    raise SystemExit(1)
print('ALL CHECKS PASSED')
