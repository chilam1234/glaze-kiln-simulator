"""Playwright: custom pot shape can be set, dragged, given a handle and spout, painted, and fired at cone 6 and 10.
Writes shots/custom-*.png. Usage: python3 tests/verify_custom.py
"""
import json, os, sys, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(line_buffering=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'shots')
ART = '/opt/cursor/artifacts'
os.makedirs(OUT, exist_ok=True)
os.makedirs(ART, exist_ok=True)
CHROME = '/usr/bin/google-chrome'
ARGS = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist', '--enable-webgl']
SEED = 20260929


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def log_message(self, fmt, *args):
        pass


def start_server():
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{httpd.server_address[1]}/'


def save(page, name, full=True):
    dest = os.path.join(OUT, name)
    if full:
        page.screenshot(path=dest, full_page=True)
    else:
        page.locator('#view').screenshot(path=dest)
    try:
        import shutil
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)
    return dest


def fail(msg):
    print('FAIL:', msg)
    raise SystemExit(1)


def wait_ready(page):
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(400)


def wide_bowl():
    return {
        'nodes': [{'r': 0.62, 'y': 0.13}, {'r': 1.15, 'y': 0.48}, {'r': 1.22, 'y': 0.92}],
        'bulges': [{'r': 0.88, 'y': 0.28}, {'r': 1.28, 'y': 0.70}],
        'wall': 0.055,
        'handle': 'c',
        'handlePos': 0.12,
        'handleHeight': 0.42,
        'handleWidth': 0.42,
        'handleThick': 0.05,
        'spout': 'lip',
        'spoutSize': 1,
    }


def cdp(page):
    sess = getattr(page, '_cdp', None)
    if sess is None:
        sess = page.context.new_cdp_session(page)
        page._cdp = sess
    return sess


def cdp_drag(page, pts, pid=0):
    s = cdp(page)
    s.send('Input.dispatchTouchEvent', {
        'type': 'touchStart',
        'touchPoints': [{'x': pts[0]['x'], 'y': pts[0]['y'], 'id': pid, 'radiusX': 16, 'radiusY': 16, 'force': 0.5}],
    })
    for p in pts[1:]:
        s.send('Input.dispatchTouchEvent', {
            'type': 'touchMove',
            'touchPoints': [{'x': p['x'], 'y': p['y'], 'id': pid, 'radiusX': 16, 'radiusY': 16, 'force': 0.5}],
        })
    s.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})


def run():
    failed, errors = [], []
    httpd, url = start_server()
    print('serving', url)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        page.goto(url)
        wait_ready(page)

        page.click('button[data-shape="bowl"]')
        page.wait_for_timeout(400)
        page.click('button[data-shape="custom"]')
        page.wait_for_timeout(600)
        spec = page.evaluate('() => __sim.getCustom()')
        if not spec or len(spec['nodes']) < 2:
            fail(f'custom spec missing after click: {spec}')
        dims0 = page.evaluate('() => __sim.getDims()')
        print('extracted from bowl', json.dumps({k: round(dims0[k], 2) if isinstance(dims0[k], float) else dims0[k] for k in dims0}))
        if dims0['ml'] <= 0:
            fail('capacity should be positive')

        giz = page.evaluate('() => !!__sim.gizmoScreen("node", -1)')
        if not giz:
            fail('rim gizmo has no screen position')

        # mouse-drag the rim node outward
        rim0 = spec['nodes'][-1]['r']
        pt = page.evaluate('() => __sim.gizmoScreen("node", -1)')
        page.mouse.move(pt['x'], pt['y'])
        page.mouse.down()
        page.mouse.move(pt['x'] + 55, pt['y'] - 8, steps=8)
        page.mouse.up()
        page.wait_for_timeout(400)
        rim1 = page.evaluate('() => __sim.getCustom().nodes.at(-1).r')
        print(f'rim drag {rim0:.3f} -> {rim1:.3f}')
        if abs(rim1 - rim0) < 0.01:
            failed.append('dragging rim node did not change radius')

        page.evaluate('(s) => __sim.setCustom(s)', wide_bowl())
        page.wait_for_timeout(500)
        page.evaluate('__sim.setView(25, 18)')
        page.wait_for_timeout(300)
        save(page, 'custom-desktop-edit.png')

        hs = page.evaluate('() => __sim.handleStats()')
        if hs is None:
            fail('C-loop handle missing row stats')

        # paint + pour on the custom wall
        page.evaluate('__sim.setTool("brush")')
        page.evaluate('__sim.pour("shino", 0.85, "below", 0.75)')
        page.evaluate('__sim.brushBand("tenmoku", 0.78, 0.7, 0.14)')
        before = dict(page.evaluate('__sim.stats()'))
        if before.get('shino', 0) <= 0:
            fail('pour did not land on custom shape')

        page.evaluate(f'__sim.setCone(6); __sim.setSeed({SEED})')
        t0 = time.time()
        page.click('#fireBtn')
        page.wait_for_function('__sim.state === "fired"', timeout=180000)
        print(f'cone 6 fired in {time.time()-t0:.1f}s', page.evaluate('__sim.dripStats'))
        locked = page.evaluate('''() => {
          const r0 = __sim.getCustom().nodes[0].r;
          __sim.setCustom({ wall: 0.08 });
          return Math.abs(__sim.getCustom().nodes[0].r - r0) < 1e-9 && __sim.state === "fired";
        }''')
        # setCustom should refuse while fired
        if page.evaluate('__sim.state') != 'fired':
            failed.append('setCustom while fired should not unfire')
        page.evaluate('__sim.setView(25, 18)')
        page.wait_for_timeout(400)
        save(page, 'custom-fired-cone6.png', full=False)

        page.click('#unfireBtn')
        page.wait_for_function('__sim.state === "raw"', timeout=10000)
        # teapot spout + keep glaze by height
        page.evaluate('() => __sim.setCustom({ spout: "teapot" })')
        page.wait_for_timeout(400)
        page.evaluate(f'__sim.setCone(10); __sim.setSeed({SEED})')
        t0 = time.time()
        page.click('#fireBtn')
        page.wait_for_function('__sim.state === "fired"', timeout=180000)
        print(f'cone 10 fired in {time.time()-t0:.1f}s', page.evaluate('__sim.dripStats'))
        page.evaluate('__sim.setView(40, 16)')
        page.wait_for_timeout(400)
        save(page, 'custom-fired-cone10.png', full=False)

        if errors:
            failed.append(f'desktop console: {errors}')

        # iPhone-sized Shape mode drag
        page.close()
        iphone = dict(pw.devices['iPhone 13'])
        ctx = browser.new_context(**iphone)
        m = ctx.new_page()
        merr = []
        m.on('console', lambda msg: msg.type == 'error' and merr.append(msg.text))
        m.on('pageerror', lambda e: merr.append(f'pageerror: {e}'))
        m.goto(url)
        wait_ready(m)
        m.evaluate('__sim.setSheet("pot", false)')
        m.wait_for_timeout(200)
        m.click('button[data-shape="custom"]')
        m.wait_for_timeout(500)
        mode = m.evaluate('() => __sim.touchMode')
        if mode != 'shape':
            failed.append(f'mobile custom should enter Shape mode, got {mode}')
        m.evaluate('__sim.setSheet("pot", true)')
        m.wait_for_timeout(200)
        tabs = m.evaluate('''() => {
          const bar = document.getElementById('mobileBar').getBoundingClientRect();
          const view = document.getElementById('view').getBoundingClientRect();
          const tabs = [...document.querySelectorAll('#mobileBar button')].map(b => {
            const r = b.getBoundingClientRect();
            return { t: b.textContent.trim(), h: r.height, y: r.y };
          });
          return { barY: bar.y, innerH: innerHeight, viewH: view.height,
                   overlayHidden: document.getElementById('sectionOverlay').hidden, tabs };
        }''')
        print('mobile tabs', json.dumps(tabs))
        small = [t for t in tabs['tabs'] if t['h'] < 40]
        if small:
            failed.append(f'mobile small targets {small}')
        if tabs['viewH'] < tabs['innerH'] * 0.38:
            failed.append(f'mobile canvas too short {tabs["viewH"]} vs {tabs["innerH"]}')
        if tabs['barY'] + 8 < tabs['viewH']:
            failed.append('mobile tab bar overlaps the canvas')
        m.evaluate('(s) => __sim.setCustom(s)', wide_bowl())
        m.evaluate('__sim.setTouchMode("shape")')
        m.evaluate('__sim.setView(20, 16)')
        m.wait_for_timeout(400)
        r_before = m.evaluate('() => __sim.getCustom().nodes.at(-1).r')
        pt = m.evaluate('() => __sim.gizmoScreen("node", -1)')
        if not pt:
            fail('mobile rim gizmo missing')
        cdp_drag(m, [pt, {'x': pt['x'] + 28, 'y': pt['y'] - 6}, {'x': pt['x'] + 48, 'y': pt['y'] - 10}])
        m.wait_for_timeout(500)
        r_after = m.evaluate('() => __sim.getCustom().nodes.at(-1).r')
        print(f'mobile shape drag rim {r_before:.3f} -> {r_after:.3f}')
        if abs(r_after - r_before) < 0.008:
            failed.append('mobile Shape mode did not drag a node')
        save(m, 'custom-mobile-edit.png')
        if merr:
            failed.append(f'mobile console: {merr}')
        m.close(); ctx.close()
        browser.close()

    httpd.shutdown()
    if failed:
        print('FAILURES:')
        for f in failed:
            print(' -', f)
        return 1
    print('ALL CHECKS PASSED')
    print('CONSOLE ERRORS: none' if not errors else errors)
    return 0


if __name__ == '__main__':
    sys.exit(run())
