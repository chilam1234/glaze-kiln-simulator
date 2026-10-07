"""Playwright mobile/touch verification: iPhone 13 portrait + landscape, Pixel, desktop 1280x800.
Starts a local server, exercises touch paint / orbit / Fire, writes shots/*.png.
Usage: python3 tests/verify_mobile.py
"""
import json, os, sys, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'shots')
ART = '/opt/cursor/artifacts'
os.makedirs(OUT, exist_ok=True)
os.makedirs(ART, exist_ok=True)
CHROME = '/usr/bin/google-chrome'
ARGS = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist', '--enable-webgl']

def cdp(page):
    sess = getattr(page, '_cdp', None)
    if sess is None:
        sess = page.context.new_cdp_session(page)
        page._cdp = sess
    return sess


def _pts(points, ids):
    return [{'x': p['x'], 'y': p['y'], 'id': ids[i], 'radiusX': 14, 'radiusY': 14, 'force': 0.5}
            for i, p in enumerate(points)]


def cdp_drag(page, pts, pid=0):
    s = cdp(page)
    s.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': _pts([pts[0]], [pid])})
    for p in pts[1:]:
        s.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': _pts([p], [pid])})
    s.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})


def cdp_two_finger(page, a0, a1, b0, b1, steps=12):
    s = cdp(page)
    s.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': _pts([a0, b0], [0, 1])})
    for k in range(1, steps + 1):
        t = k / steps
        a = {'x': a0['x'] + (a1['x'] - a0['x']) * t, 'y': a0['y'] + (a1['y'] - a0['y']) * t}
        b = {'x': b0['x'] + (b1['x'] - b0['x']) * t, 'y': b0['y'] + (b1['y'] - b0['y']) * t}
        s.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': _pts([a, b], [0, 1])})
    s.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})


def fail(msg):
    print('FAIL:', msg)
    raise SystemExit(1)


def save_shot(page, name, full=True):
    dest = os.path.join(OUT, name)
    if full:
        page.screenshot(path=dest, full_page=True)
    else:
        page.locator('#view').screenshot(path=dest)
    art = os.path.join(ART, name)
    try:
        import shutil
        shutil.copy2(dest, art)
    except OSError:
        pass
    print('saved', dest)
    return dest


def layout_info(page):
    return page.evaluate('''() => {
      const make = document.getElementById('makeCol');
      const kiln = document.getElementById('kilnCol');
      const makeCs = make ? getComputedStyle(make).display : '';
      const panel = (makeCs && makeCs !== 'contents') ? make : document.getElementById('panel');
      const view = document.getElementById('view');
      const fire = document.getElementById('fireBtn');
      const bar = document.getElementById('mobileBar');
      const pr = window.__sim.pixelRatio;
      const cs = getComputedStyle(bar);
      const fr = fire.getBoundingClientRect();
      const vr = view.getBoundingClientRect();
      const kr = kiln && getComputedStyle(kiln).display !== 'contents' ? kiln.getBoundingClientRect() : null;
      const tabs = [...document.querySelectorAll('#mobileBar button')].map(b => {
        const r = b.getBoundingClientRect();
        return { t: b.textContent.trim(), w: r.width, h: r.height };
      });
      return {
        mobile: document.body.classList.contains('is-mobile'),
        mq: window.__sim.mobile,
        layout: window.__sim.layout,
        inner: { w: innerWidth, h: innerHeight },
        view: { w: vr.width, h: vr.height, x: vr.x, y: vr.y },
        panel: { w: panel.getBoundingClientRect().width, h: panel.getBoundingClientRect().height,
                 x: panel.getBoundingClientRect().x, y: panel.getBoundingClientRect().y },
        kiln: kr ? { w: kr.width, h: kr.height, x: kr.x, y: kr.y } : null,
        fire: { w: fr.width, h: fr.height, y: fr.y, visible: fr.height > 0 && getComputedStyle(fire).display !== 'none' },
        barDisplay: cs.display,
        dprCap: pr,
        devicePR: window.devicePixelRatio,
        tabs,
        credit: (document.querySelector('.credit') || {}).textContent || '',
        canvas: { w: view.querySelector('canvas').width, h: view.querySelector('canvas').height },
      };
    }''')


def wait_ready(page):
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(800)


def touch_paint(page, glaze='tenmoku'):
    page.evaluate('__sim.setTouchOrbit(false)')
    page.evaluate('__sim.setTool("brush")')
    page.evaluate(f'__sim.setGlaze("{glaze}")')
    page.evaluate('__sim.setBrushSize(0.18)')
    page.evaluate('__sim.setView(20, 12)')
    page.wait_for_timeout(300)
    before = dict(page.evaluate('__sim.stats()')).get(glaze, 0)
    pts = [page.evaluate(f'__sim.screenAt(0.55, {a})') for a in (-55, -25, 0, 25, 55)]
    if not all(p and p.get('x') is not None for p in pts):
        raise RuntimeError(f'bad screenAt points: {pts}')
    cdp_drag(page, pts)
    page.wait_for_timeout(200)
    after = dict(page.evaluate('__sim.stats()')).get(glaze, 0)
    return before, after


def touch_orbit(page):
    page.evaluate('__sim.setTouchOrbit(false)')
    page.evaluate('__sim.setView(20, 12)')
    page.wait_for_timeout(200)
    before = page.evaluate('__sim.getView()')
    rect = page.locator('#view canvas').bounding_box()
    cx = rect['x'] + rect['width'] * 0.78
    cy = rect['y'] + rect['height'] * 0.38
    cdp_two_finger(
        page,
        {'x': cx - 28, 'y': cy},
        {'x': cx + 90, 'y': cy + 8},
        {'x': cx - 28, 'y': cy + 46},
        {'x': cx + 90, 'y': cy + 54},
    )
    page.wait_for_timeout(500)
    two = page.evaluate('__sim.getView()')
    page.evaluate('__sim.setTouchOrbit(true)')
    page.wait_for_timeout(80)
    rect = page.locator('#view canvas').bounding_box()
    x0, y0 = rect['x'] + rect['width'] * 0.7, rect['y'] + rect['height'] * 0.32
    cdp_drag(page, [
        {'x': x0, 'y': y0},
        {'x': x0 + 70, 'y': y0 + 16},
        {'x': x0 + 140, 'y': y0 + 22},
    ])
    page.wait_for_timeout(500)
    one = page.evaluate('__sim.getView()')
    page.evaluate('__sim.setTouchOrbit(false)')
    return before, two, one


def moved(a, b, eps=0.02):
    return abs(a['az'] - b['az']) > eps or abs(a['el'] - b['el']) > eps or abs(a['d'] - b['d']) > 0.05


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def log_message(self, fmt, *args):
        pass


def start_server():
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    port = httpd.server_address[1]
    return httpd, f'http://127.0.0.1:{port}/'


def run():
    errors_all = {}
    httpd, url = start_server()
    print('serving', url)
    failed = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
        devices = pw.devices
        iphone = dict(devices['iPhone 13'])
        pixel_name = 'Pixel 5' if 'Pixel 5' in devices else 'Pixel 7'
        pixel = dict(devices[pixel_name])

        # ----- desktop 1280x800 -----
        print('\n== desktop 1280x800 ==')
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        desk_err = []
        page.on('console', lambda m: m.type == 'error' and desk_err.append(m.text))
        page.on('pageerror', lambda e: desk_err.append(f'pageerror: {e}'))
        page.goto(url)
        wait_ready(page)
        info = layout_info(page)
        print(json.dumps(info, indent=2))
        if info['mobile'] or info['mq']:
            failed.append('desktop used mobile layout')
        if info.get('layout') != '3':
            failed.append(f"desktop 1280 expected 3-col layout, got {info.get('layout')}")
        if not (240 <= info['panel']['w'] <= 320):
            failed.append(f"desktop left rail width {info['panel']['w']}")
        if info['panel']['x'] > 20:
            failed.append('desktop panel not on the left')
        if not info.get('kiln') or info['kiln']['x'] < info['view']['x']:
            failed.append('desktop 3-col kiln column missing on the right')
        if info['fire']['y'] + info['fire']['h'] > info['inner']['h'] + 4:
            failed.append('desktop Fire kiln is below the fold')
        if info['barDisplay'] != 'none':
            failed.append('desktop shows mobile bar')
        if 'AMACO' not in info['credit']:
            failed.append('desktop missing AMACO disclaimer')
        page.evaluate('__sim.setView(20, 12)')
        page.evaluate('__sim.pour("tenmoku", 0.7, "below", 0.8)')
        page.wait_for_timeout(400)
        save_shot(page, 'desktop_1280x800.png')
        page.close()
        errors_all['desktop'] = desk_err

        def mobile_context(dev, landscape=False):
            kwargs = dict(dev)
            if landscape:
            ua = kwargs.get('user_agent') or kwargs.get('userAgent') or ''
            if 'iPhone' in ua:
                kwargs['viewport'] = {'width': 844, 'height': 390}
                else:
                    vw, vh = kwargs['viewport']['width'], kwargs['viewport']['height']
                    if vw < vh:
                        kwargs['viewport'] = {'width': max(vh, 720), 'height': min(vw, 430)}
            kwargs['has_touch'] = True
            return browser.new_context(**kwargs)

        def run_phone(label, ctx, shots):
            print(f'\n== {label} ==')
            page = ctx.new_page()
            err = []
            page.on('console', lambda m: m.type == 'error' and err.append(m.text))
            page.on('pageerror', lambda e: err.append(f'pageerror: {e}'))
            page.goto(url)
            wait_ready(page)
            info = layout_info(page)
            print(json.dumps({k: info[k] for k in ('mobile', 'mq', 'inner', 'view', 'panel', 'fire', 'barDisplay', 'dprCap', 'devicePR')}, indent=2))
            if not info['mobile'] or not info['mq']:
                failed.append(f'{label}: expected mobile layout')
            if info['barDisplay'] == 'none':
                failed.append(f'{label}: mobile bar hidden')
            if not info['fire']['visible'] or info['fire']['h'] < 44:
                failed.append(f'{label}: fire button not prominent ({info["fire"]})')
            if info['view']['h'] < info['inner']['h'] * (0.5 if info['inner']['h'] < 500 else 0.38):
                failed.append(f'{label}: canvas too short {info["view"]["h"]} vs {info["inner"]["h"]}')
            if info['dprCap'] > 2.01:
                failed.append(f'{label}: dpr not capped ({info["dprCap"]})')
            small = [t for t in info['tabs'] if t['h'] < 40]
            if small:
                failed.append(f'{label}: small touch targets {small}')
            if 'AMACO' not in info['credit']:
                failed.append(f'{label}: missing disclaimer')

            page.evaluate('__sim.setSheet("glaze", false)')
            page.wait_for_timeout(200)
            page.click('button[data-glaze="tenmoku"]', timeout=5000)
            page.evaluate('__sim.setSheet("tool", false)')
            page.wait_for_timeout(150)
            page.click('button[data-tool="brush"]')
            page.evaluate('__sim.setSheet("glaze", true)')
            page.wait_for_timeout(200)

            before, after = touch_paint(page, 'tenmoku')
            print(f'  touch paint tenmoku mean {before} -> {after}')
            if after <= before + 1e-4:
                failed.append(f'{label}: touch stroke did not paint')

            bview, two, one = touch_orbit(page)
            print(f'  orbit before={bview} two={two} one={one}')
            if not (moved(bview, two) or moved(bview, one) or moved(two, one)):
                failed.append(f'{label}: orbit did not move the camera')

            if shots.get('before'):
                page.evaluate('__sim.setView(20, 12)')
                page.evaluate('__sim.setTouchOrbit(false)')
                page.wait_for_timeout(300)
                save_shot(page, shots['before'])

            try:
                cdp(page).send('Input.dispatchTouchEvent', {'type': 'touchCancel', 'touchPoints': []})
            except Exception:
                pass
            page.evaluate('__sim.setSeed(20260928)')
            t0 = time.time()
            print(f'  clicking fire…')
            page.evaluate('document.getElementById("fireBtn").click()')
            page.wait_for_function('window.__sim.state === "fired"', timeout=120000)
            print(f'  fired in {time.time() - t0:.1f}s (sim {page.evaluate("Math.round(__sim.fireMs)")} ms)')
            if page.evaluate('__sim.state') != 'fired':
                failed.append(f'{label}: fire did not complete')
            page.evaluate('__sim.setView(20, 12)')
            page.wait_for_timeout(500)
            if shots.get('fire'):
                save_shot(page, shots['fire'])
            if shots.get('land'):
                save_shot(page, shots['land'])

            page.close()
            ctx.close()
            errors_all[label] = err
            return err

        ctx = mobile_context(iphone, landscape=False)
        run_phone('iPhone 13 portrait', ctx, {
            'before': 'mobile_portrait_before.png',
            'fire': 'mobile_portrait_after.png',
        })

        ctx = mobile_context(iphone, landscape=True)
        run_phone('iPhone 13 landscape', ctx, {'land': 'mobile_landscape.png'})

        ctx = mobile_context(pixel, landscape=False)
        run_phone(f'{pixel_name} portrait', ctx, {})

        browser.close()

    httpd.shutdown()
    print('\nCONSOLE ERRORS:', json.dumps(errors_all, indent=1))
    for label, err in errors_all.items():
        if err:
            failed.append(f'{label} console: {err}')
    if failed:
        print('FAILURES:')
        for f in failed:
            print(' -', f)
        return 1
    print('ALL CHECKS PASSED')
    return 0


if __name__ == '__main__':
    sys.exit(run())
