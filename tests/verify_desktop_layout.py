"""Desktop 2/3-column layout: kiln stays on-screen, phone layout unchanged.
Writes shots/layout-*.png and copies them to /opt/cursor/artifacts.
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


def layout(page):
    return page.evaluate('''() => {
      const q = (id) => document.getElementById(id);
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right,
                 display: cs.display, vis: cs.visibility !== 'hidden' && cs.display !== 'none' };
      };
      const fire = q('fireBtn');
      const view = q('view');
      const canvases = view ? [...view.querySelectorAll('canvas')] : [];
      const canvas = canvases.find(c => c.clientWidth > 8) || canvases[canvases.length - 1];
      return {
        layout: __sim.layout,
        mobile: __sim.mobile,
        dpr: __sim.pixelRatio,
        devicePR: window.devicePixelRatio,
        inner: { w: innerWidth, h: innerHeight },
        make: box(q('makeCol')),
        kilnCol: box(q('kilnCol')),
        view: box(view),
        fire: box(fire),
        status: box(q('status')),
        quality: box(q('quality')),
        glaze: box(document.querySelector('section[data-sheet="glaze"]')),
        layers: box(document.getElementById('thick')),
        fams: [...document.querySelectorAll('#glazeFams button')].map(b => ({
          t: b.textContent.trim(), h: b.getBoundingClientRect().height,
          vis: getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 8
        })),
        pot: box(document.querySelector('section[data-sheet="pot"]')),
        tool: box(document.querySelector('section[data-sheet="tool"]')),
        bar: box(q('mobileBar')),
        folds: [...document.querySelectorAll('.desk-fold > summary')].map(s => ({
          t: s.textContent.trim(), h: s.getBoundingClientRect().height,
          vis: getComputedStyle(s).display !== 'none'
        })),
        canvas: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight } : null,
        stamp: (q('buildStamp') || {}).textContent || '',
      };
    }''')


def in_viewport(b, H, W):
    if not b or not b.get('vis'):
        return False
    return b['y'] >= -1 and b['b'] <= H + 4 and b['x'] >= -1 and b['r'] <= W + 4


def run_size(page, label, expect, shot):
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.evaluate('() => { __sim.setQuality("high"); __sim.setShape("vase"); __sim.setGlaze("oatmeal"); }')
    page.wait_for_timeout(250)
    info = layout(page)
    print(label, json.dumps({k: info[k] for k in ('layout', 'mobile', 'inner', 'make', 'kilnCol', 'view', 'fire', 'dpr')}, indent=2))
    H, W = info['inner']['h'], info['inner']['w']
    check(info['layout'] == expect, f'{label}: layout is {expect} (got {info["layout"]})')
    check(bool(info['fire'] and info['fire']['vis']), f'{label}: Fire kiln is visible')
    if expect != 'phone':
        check(in_viewport(info['fire'], H, W), f'{label}: Fire kiln is on-screen without scrolling ({info["fire"]})')
        check(info['bar'] and info['bar']['display'] == 'none', f'{label}: mobile bar hidden')
        check(info['pot'] and info['pot']['h'] > 20, f'{label}: Shape/Pot section visible')
        check(info['tool'] and info['tool']['h'] > 20, f'{label}: Tool section visible')
        check(info['glaze'] and info['glaze']['h'] > 48, f'{label}: Glaze section visible ({info["glaze"]})')
        check(in_viewport(info['layers'], H, W), f'{label}: Layers slider is on-screen ({info["layers"]})')
        if info['glaze'] and info['layers']:
            check(info['layers']['y'] >= info['glaze']['y'] - 2 and info['layers']['b'] <= info['glaze']['b'] + 6,
                  f'{label}: Layers sits inside the glaze pane (layers={info["layers"]} glaze={info["glaze"]})')
        vis_fams = [f for f in info['fams'] if f['vis']]
        check(len(vis_fams) >= 6 and all(f['t'] for f in vis_fams),
              f'{label}: glaze family buttons show labels ({vis_fams})')
        if expect == '2':
            check(all(f['h'] >= 28 for f in vis_fams),
                  f'{label}: 2-col family buttons are not clipped ({vis_fams})')
        vis_folds = [f for f in info['folds'] if f['vis'] and f['h'] > 8]
        check(any(f['t'] == 'Glazes' for f in vis_folds), f'{label}: glaze chip list is collapsible ({[f["t"] for f in vis_folds]})')
        page.evaluate('__sim.setShape("custom")')
        page.wait_for_timeout(120)
        custom_folds = page.evaluate('''() => [...document.querySelectorAll(".desk-fold > summary")].filter(s => getComputedStyle(s).display !== "none").map(s => s.textContent.trim())''')
        check(len(custom_folds) >= 4, f'{label}: custom profile groups fold ({custom_folds})')
        page.evaluate('__sim.setShape("vase")')
        page.wait_for_timeout(80)
        if info['canvas'] and info['view']:
            check(info['canvas']['cssW'] == round(info['view']['w']) or abs(info['canvas']['cssW'] - info['view']['w']) < 2,
                  f'{label}: canvas CSS width matches view ({info["canvas"]["cssW"]} vs {info["view"]["w"]})')
            cap = min(info['devicePR'], 1.25)
            ratio = info['canvas']['w'] / max(1, info['canvas']['cssW'])
            check(abs(ratio - info['dpr']) < 0.08, f'{label}: backing store uses DPR cap ({ratio:.3f} vs {info["dpr"]})')
            check(info['dpr'] <= cap + 0.01, f'{label}: DPR cap {info["dpr"]} <= {cap}')
    if expect == '3':
        check(info['make']['x'] < 24, f'{label}: making column on the left')
        check(info['view']['x'] >= info['make']['r'] - 2, f'{label}: pot is between the columns')
        check(info['kilnCol']['x'] >= info['view']['r'] - 2, f'{label}: glaze/kiln column on the right')
        check(info['quality'] and info['quality']['x'] > info['view']['x'], f'{label}: Quality sits in the right column')
        check(info['quality']['y'] > info['fire']['b'] - 4, f'{label}: Quality sits below Fire')
        check(info['view']['w'] > 500, f'{label}: canvas is the wide center ({info["view"]["w"]})')
    if expect == '2':
        check(info['make']['x'] < 24, f'{label}: controls on the left')
        check(info['view']['x'] >= info['make']['r'] - 8, f'{label}: pot on the right of controls')
        check(info['view']['y'] < 40, f'{label}: pot is not stacked under the sidebar')
        check(info['bar']['display'] == 'none', f'{label}: 2-col hides the phone tab bar')
        check(info['quality'] and info['quality']['y'] > info['fire']['b'] - 4,
              f'{label}: 2-col Quality sits with the pinned kiln, not the mast')
    if expect == 'phone':
        check(info['mobile'] is True, f'{label}: is mobile')
        check(info['bar'] and info['bar']['display'] != 'none', f'{label}: phone tab bar shown')
        check(info['view']['y'] <= 8, f'{label}: pot is above the drawer')
        tabs = page.evaluate('''() => [...document.querySelectorAll("#mobileBar [data-sheet]")].map(b => ({t:b.textContent.trim(), vis: getComputedStyle(b).display !== "none", h:b.getBoundingClientRect().height}))''')
        check(all(t['vis'] and t['h'] >= 40 for t in tabs) and {t['t'] for t in tabs} >= {'Pot', 'Glaze', 'Tool'},
              f'{label}: Pot/Glaze/Tool tabs visible ({tabs})')
        check(page.evaluate('getComputedStyle(document.querySelector(".mast")).display') == 'none',
              f'{label}: specimen-log mast stays hidden')
        check(not any(f['vis'] and f['h'] > 8 for f in info['folds']), f'{label}: desktop fold summaries hidden on phone')
    save(page, shot)
    return info


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    errors = []

    def page_at(w, h):
        p = browser.new_page(viewport={'width': w, 'height': h})
        p.on('pageerror', lambda e: errors.append(str(e)))
        p.goto(url, timeout=120000)
        return p

    p = page_at(1280, 800)
    run_size(p, '1280x800', '3', 'layout_desktop_1280x800.png')
    view_before = p.evaluate('() => { const r = document.getElementById("view").getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }')
    p.evaluate('__sim.setSeed(20261007); document.getElementById("fireBtn").click()')
    p.wait_for_function('''() => {
      const d = document.getElementById('kilnProgressDock');
      return d && !d.hidden && getComputedStyle(d).visibility !== 'hidden';
    }''', timeout=60000)
    mid = p.evaluate('() => { const r = document.getElementById("view").getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height, state: __sim.state}; }')
    check(mid['state'] == 'firing', '1280 mid-fire: state is firing')
    check(abs(mid['w'] - view_before['w']) < 2 and abs(mid['h'] - view_before['h']) < 2,
          f'1280 mid-fire: canvas size unchanged ({view_before} -> {mid})')
    check(abs(mid['x'] - view_before['x']) < 2 and abs(mid['y'] - view_before['y']) < 2,
          f'1280 mid-fire: canvas position unchanged')
    save(p, 'layout_desktop_1280x800_firing.png')
    p.wait_for_function('__sim.state === "fired"', timeout=240000)
    p.close()

    for w, h, name, expect in (
        (1440, 900, 'layout_desktop_1440x900.png', '3'),
        (1920, 1080, 'layout_desktop_1920x1080.png', '3'),
        (900, 700, 'layout_desktop_900x700.png', '2'),
    ):
        pg = page_at(w, h)
        run_size(pg, f'{w}x{h}', expect, name)
        pg.close()

    phone = browser.new_page(viewport={'width': 390, 'height': 844})
    phone.on('pageerror', lambda e: errors.append(str(e)))
    phone.goto(url, timeout=120000)
    run_size(phone, '390x844', 'phone', 'layout_phone_390x844.png')
    phone.close()
    browser.close()

httpd.shutdown()
print('CONSOLE ERRORS:', errors or 'none')
if errors:
    check(False, f'page errors: {errors[:4]}')
if fail:
    print('FAILURES')
    raise SystemExit(1)
print('ALL CHECKS PASSED')
