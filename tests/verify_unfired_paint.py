"""Unfired brush strokes must not leave a full-width band around the pot.
Uses real pointer painting on WebKit iPhone 13 and Chromium.
Runs twice per browser: full-texture upload (default) and packed region upload.
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


def setup(page, region=False):
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    info = page.evaluate('''(region) => {
      __sim.setRegionUpload(!!region);
      __sim.setQuality("high");
      __sim.clear();
      __sim.setShape("vase");
      __sim.setCone(6);
      __sim.setTool("brush");
      __sim.setTouchMode("paint");
      __sim.setGlaze("oatmeal");
      __sim.setBrushSize(0.09);
      __sim.setThickness(0.7);
      __sim.setView(20, 12);
      __sim.setSheet("glaze", true);
      const el = document.getElementById("buildStamp");
      return {
        build: __sim.build,
        buildTime: __sim.buildTime,
        mode: __sim.uploadMode,
        stamp: el ? el.textContent : '',
      };
    }''', region)
    print('build', info)
    check(bool(info and info.get('build')), f'build stamp is set ({info})')
    check(info.get('mode') == ('region' if region else 'full'), f'upload mode {info.get("mode")} (region={region})')
    check(info.get('stamp') and info['build'] in info['stamp'], f'Menu shows build stamp ({info.get("stamp")})')
    page.wait_for_timeout(250)
    return info


def screen_pt(page, h, a):
    p = page.evaluate('(ha) => __sim.screenAt(ha[0], ha[1])', [h, a])
    return p['x'], p['y']


def hit_stroke(page, x, y, r):
    uv = page.evaluate('(xy) => __sim.hitUV(xy[0], xy[1])', [x, y])
    if not uv:
        return None
    uv['r'] = r
    return uv


def paint_smiley(page, size=0.09):
    page.evaluate('(s) => { __sim.setGlaze("oatmeal"); __sim.setBrushSize(s); }', size)
    strokes = []
    def add(h, a):
        x, y = screen_pt(page, h, a)
        uv = hit_stroke(page, x, y, size)
        if uv:
            strokes.append(uv)
        return x, y
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
    sx = im.width / max(1.0, box['width'])
    sy = im.height / max(1.0, box['height'])
    x = int((p['x'] - box['x']) * sx)
    y = int((p['y'] - box['y']) * sy)
    x = max(1, min(im.width - 2, x))
    y = max(1, min(im.height - 2, y))
    return im.getpixel((x, y))


def lum(rgb):
    return 0.30 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]


def chroma(rgb):
    return max(rgb) - min(rgb)


def run_on(page, label, region=False):
    setup(page, region=region)
    clay = sample_view(page, 0.55, 70)
    strokes = paint_smiley(page)
    page.evaluate('__sim.setGlaze("tenmoku"); __sim.setBrushSize(0.08)')
    p = screen_pt(page, 0.55, 38)
    p2 = (p[0] + 16, p[1] + 6)
    for xy in (p, p2):
        uv = hit_stroke(page, xy[0], xy[1], 0.08)
        if uv:
            strokes.append(uv)
    paint_stroke(page, [p, p2])
    page.mouse.move(8, 8)
    page.wait_for_timeout(250)

    mask = page.evaluate('(s) => __sim.paintMask({ strokes: s, slack: 2.4 })', strokes)
    print(label, 'mask', json.dumps(mask), 'strokes', len(strokes), 'mode', page.evaluate('() => __sim.uploadMode'))
    check(len(strokes) >= 8, f'{label}: recorded hit UVs for the smiley ({len(strokes)})')
    check(mask['painted'] > 80, f'{label}: strokes actually painted ({mask["painted"]} texels)')
    check(mask['bandRows'] == 0, f'{label}: no full-width band rows (got {mask["bandRows"]}, maxFrac={mask["maxFrac"]})')
    check(mask['maxFrac'] < 0.35, f'{label}: local strokes must not wrap the pot (maxFrac={mask["maxFrac"]})')
    check(mask['outside'] < max(40, 0.08 * mask['painted']), f'{label}: paint stays near strokes (outside={mask["outside"]} of {mask["painted"]})')

    save(page, f'unfired-paint-{label}.png')
    front = sample_view(page, 0.46, 0)
    left = sample_view(page, 0.55, -80)
    right = sample_view(page, 0.55, 80)
    ten = sample_view(page, 0.55, 38)
    print(label, 'pixels', {'clay': clay, 'front': front, 'left': left, 'right': right, 'tenmoku': ten})
    check(lum(front) > lum(clay) + 8, f'{label}: front mouth is lighter unfired oatmeal, not missing')
    check(lum(front) > 180, f'{label}: oatmeal stays pale unfired, not a dark fired blob ({front})')
    check(front[0] > front[2] + 4, f'{label}: oatmeal is warm raw beige, not grey ({front})')
    check(lum(left) < lum(front) - 6, f'{label}: left limb is not the oatmeal stroke {left} vs front {front}')
    check(lum(right) < lum(front) - 6, f'{label}: right limb is not the oatmeal stroke {right} vs front {front}')
    check(lum(ten) < lum(clay) - 6, f'{label}: tenmoku dab is darker than clay ({ten} vs {clay})')
    check(lum(ten) > 55, f'{label}: tenmoku dab is raw brown, not a fired-black specular blob ({ten})')
    check(chroma(ten) > 6, f'{label}: tenmoku dab is not a flat translucent grey ({ten})')
    return mask


def run_browser(page, label):
    run_on(page, f'{label}-full', region=False)
    page.reload(timeout=120000)
    run_on(page, f'{label}-region', region=True)


with sync_playwright() as pw:
    try:
        wk = pw.webkit.launch(headless=True)
        ctx = wk.new_context(**pw.devices['iPhone 13'])
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(f'webkit: {e}'))
        page.goto(url, timeout=120000)
        run_browser(page, 'webkit-iphone')
        wk.close()
    except Exception as e:
        check(False, f'webkit run failed: {e}')

    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    ctx = browser.new_context(**pw.devices['iPhone 13'])
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'chromium: {e}'))
    page.goto(url, timeout=120000)
    run_browser(page, 'chromium-iphone')

    desk = browser.new_page(viewport={'width': 1280, 'height': 800})
    desk.on('pageerror', lambda e: errors.append(f'desktop: {e}'))
    desk.goto(url, timeout=120000)
    run_browser(desk, 'chromium-desktop')
    browser.close()

httpd.shutdown()
print('CONSOLE ERRORS:', errors or 'none')
if errors:
    check(False, f'page errors: {errors[:4]}')
if fail:
    print('FAILURES')
    raise SystemExit(1)
print('ALL CHECKS PASSED')
