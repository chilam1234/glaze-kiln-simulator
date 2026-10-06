"""Layers slider must move freely 1–5 after hitting max, painting, and switching glazes.
iPhone 13 (touch tap + drag) and desktop Chromium.
Writes shots/layers-*.png
"""
import json, os, shutil, sys, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

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


def check(ok, msg):
    global fail
    print(('OK  ' if ok else 'FAIL') + ' ' + msg)
    if not ok:
        fail = True


def save(page, name):
    dest = os.path.join(OUT, name)
    page.screenshot(path=dest, full_page=False)
    try:
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)
    return dest


def read_layers(page):
    return page.evaluate('''() => {
      const el = document.getElementById('thick');
      return {
        slider: +el.value,
        label: document.getElementById('thickOut').textContent,
        layers: __sim.layers,
        thickness: __sim.brushThickness,
        min: +el.min, max: +el.max, step: +el.step,
        disabled: !!el.disabled,
      };
    }''')


def dispatch_layers(page, n):
    page.evaluate('''(v) => {
      const el = document.getElementById('thick');
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }''', n)


def tap_layers(page, n, touch=False):
    box = page.locator('#thick').bounding_box()
    t = (n - 1) / 4
    x = box['x'] + box['width'] * (0.06 + 0.88 * t)
    y = box['y'] + box['height'] * 0.5
    if touch:
        page.touchscreen.tap(x, y)
    else:
        page.mouse.click(x, y)
    page.wait_for_timeout(80)


def drag_layers(page, a, b, touch=False):
    box = page.locator('#thick').bounding_box()
    def x_at(n):
        t = (n - 1) / 4
        return box['x'] + box['width'] * (0.06 + 0.88 * t)
    y = box['y'] + box['height'] * 0.5
    x0, x1 = x_at(a), x_at(b)
    if touch:
        page.touchscreen.tap(x0, y)
        page.mouse.move(x0, y)
        page.mouse.down()
        page.mouse.move(x1, y, steps=12)
        page.mouse.up()
    else:
        page.mouse.move(x0, y)
        page.mouse.down()
        page.mouse.move(x1, y, steps=12)
        page.mouse.up()
    page.wait_for_timeout(80)


def expect_layers(page, n, label):
    info = read_layers(page)
    print(label, json.dumps(info))
    check(not info['disabled'], f'{label}: slider is enabled')
    check(info['min'] == 1 and info['max'] == 5, f'{label}: min/max are 1–5 ({info["min"]}-{info["max"]})')
    check(info['slider'] == n, f'{label}: slider value is {n} (got {info["slider"]})')
    check(info['layers'] == n, f'{label}: __sim.layers is {n} (got {info["layers"]})')
    check(abs(info['thickness'] - n * 0.3) < 1e-6, f'{label}: brush thickness is {n}*0.3 (got {info["thickness"]})')
    word = '1 layer' if n == 1 else f'{n} layers'
    check(info['label'] == word, f'{label}: label is {word!r} (got {info["label"]!r})')
    return info


def setup(page, phone=False):
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.evaluate('''() => {
      __sim.setQuality("high");
      __sim.clear();
      __sim.setShape("vase");
      __sim.setTool("brush");
      __sim.setTouchMode("paint");
      __sim.setGlaze("oatmeal");
      __sim.setSheet("glaze", false);
    }''')
    if phone:
        page.evaluate('__sim.setSheet("glaze", false)')
    page.wait_for_timeout(200)


def run_on(page, label, touch=False):
    setup(page, phone='iphone' in label)
    # 5 via input event (the stuck-at-max path), then 1, then 3
    dispatch_layers(page, 5)
    expect_layers(page, 5, f'{label} dispatch 5')
    dispatch_layers(page, 1)
    expect_layers(page, 1, f'{label} dispatch 1 after 5')
    dispatch_layers(page, 3)
    expect_layers(page, 3, f'{label} dispatch 3')

    tap_layers(page, 5, touch=touch)
    expect_layers(page, 5, f'{label} tap 5')
    tap_layers(page, 1, touch=touch)
    expect_layers(page, 1, f'{label} tap 1 after 5')
    drag_layers(page, 1, 5, touch=touch)
    expect_layers(page, 5, f'{label} drag to 5')
    drag_layers(page, 5, 3, touch=touch)
    expect_layers(page, 3, f'{label} drag 5→3')

    # Paint at 5, then lower. Next stroke must use the new amount.
    dispatch_layers(page, 5)
    page.evaluate('__sim.setBrushSize(0.08); __sim.dabOnce("oatmeal", 0.5, 0.55, 0.08)')
    page.wait_for_timeout(80)
    dispatch_layers(page, 1)
    expect_layers(page, 1, f'{label} after painting at 5, set 1')
    amt = page.evaluate('() => __sim.brushThickness')
    check(abs(amt - 0.3) < 1e-6, f'{label}: subsequent stroke amount is 0.3 (got {amt})')

    # Switching glazes must not freeze the slider; each glaze keeps its own coats.
    page.evaluate('__sim.setGlaze("tenmoku")')
    dispatch_layers(page, 5)
    expect_layers(page, 5, f'{label} tenmoku at 5')
    dispatch_layers(page, 2)
    expect_layers(page, 2, f'{label} tenmoku 5→2')
    page.evaluate('__sim.setGlaze("oatmeal")')
    expect_layers(page, 1, f'{label} back to oatmeal keeps 1')
    dispatch_layers(page, 4)
    expect_layers(page, 4, f'{label} oatmeal 1→4 after glaze switch')

    save(page, f'layers-{label}.png')


with sync_playwright() as pw:
    try:
        wk = pw.webkit.launch(headless=True)
        ctx = wk.new_context(**pw.devices['iPhone 13'])
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(f'webkit: {e}'))
        page.goto(url, timeout=120000)
        run_on(page, 'webkit-iphone', touch=True)
        wk.close()
    except Exception as e:
        check(False, f'webkit run failed: {e}')

    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    ctx = browser.new_context(**pw.devices['iPhone 13'])
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'chromium-iphone: {e}'))
    page.goto(url, timeout=120000)
    run_on(page, 'chromium-iphone', touch=True)

    desk = browser.new_page(viewport={'width': 1280, 'height': 800})
    desk.on('pageerror', lambda e: errors.append(f'desktop: {e}'))
    desk.goto(url, timeout=120000)
    run_on(desk, 'chromium-desktop', touch=False)
    browser.close()

httpd.shutdown()
print('CONSOLE ERRORS:', errors or 'none')
if errors:
    check(False, f'page errors: {errors[:4]}')
if fail:
    print('FAILURES')
    raise SystemExit(1)
print('ALL CHECKS PASSED')
