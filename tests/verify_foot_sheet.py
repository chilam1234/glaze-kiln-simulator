"""Foot slider [hidden] vs CSS display, and phone camera fit above the sheet.
Screenshots: ring (no stem/flare), flat (none of the four), pedestal (all),
iPhone 13 Pot tab with the whole pot in the 3D view. 1280×800 + iPhone 13.
"""
import json, os, shutil, sys, threading
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


def save(page, name):
    dest = os.path.join(OUT, name)
    page.screenshot(path=dest, full_page=False)
    try:
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)


def save_el(page, sel, name):
    dest = os.path.join(OUT, name)
    page.locator(sel).screenshot(path=dest)
    try:
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)


def check(ok, msg):
    global fail
    print(('OK  ' if ok else 'FAIL') + ' ' + msg)
    if not ok:
        fail = True


def collect(page):
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type == 'error' else None)


FOOT_JS = '''() => {
  const ids = ['footStemRow','footFlareRow','footThickRow','footCarveRow'];
  return Object.fromEntries(ids.map(id => {
    const el = document.getElementById(id);
    const d = getComputedStyle(el).display;
    const r = el.getBoundingClientRect();
    return [id, {
      attr: !!el.hidden,
      display: d,
      h: Math.round(r.height),
      shown: d !== 'none' && r.height > 2,
    }];
  }));
}'''


def expect_sliders(vis, style):
    stem = vis['footStemRow']['shown']
    flare = vis['footFlareRow']['shown']
    thick = vis['footThickRow']['shown']
    carve = vis['footCarveRow']['shown']
    if style == 'pedestal':
        check(stem and flare, f'{style}: Stem width and Base flare shown')
        check(thick and carve, f'{style}: Ring thickness and Carve shown')
    elif style == 'flat':
        check(not stem and not flare, f'{style}: Stem width and Base flare hidden')
        check(not thick and not carve, f'{style}: Ring thickness and Carve hidden')
    else:
        check(not stem and not flare, f'{style}: Stem width and Base flare hidden')
        check(thick and carve, f'{style}: Ring thickness and Carve shown')


spec = {
    'nodes': [{'r': 0.58, 'y': 0.13}, {'r': 0.98, 'y': 0.52}, {'r': 1.05, 'y': 0.95}],
    'bulges': [{'r': 0.80, 'y': 0.30}, {'r': 1.12, 'y': 0.74}],
    'wall': 0.055, 'handle': 'none', 'spout': 'none',
}


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    collect(page)
    page.goto(url)
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(300)
    page.evaluate('(s) => { __sim.setShape("custom"); __sim.setCustom(s); __sim.setShapeGroup("foot"); }', spec)
    page.wait_for_timeout(250)
    page.evaluate('''() => {
      const el = document.querySelector("#customOpts .shape-group[data-group=foot]");
      if (el) el.scrollIntoView({ block: "start" });
    }''')
    page.wait_for_timeout(150)

    for style, shot in (('ring', 'foot-sliders-ring.png'), ('flat', 'foot-sliders-flat.png'),
                        ('pedestal', 'foot-sliders-pedestal.png')):
        page.evaluate('(st) => __sim.setCustom({ footStyle: st })', style)
        page.wait_for_timeout(200)
        page.evaluate('''() => {
          const el = document.getElementById("footH") || document.querySelector("#customOpts .shape-group[data-group=foot]");
          if (el) el.scrollIntoView({ block: "start" });
        }''')
        page.wait_for_timeout(120)
        vis = page.evaluate(FOOT_JS)
        print(style, json.dumps(vis))
        expect_sliders(vis, style)
        page.evaluate('''() => {
          const foot = document.querySelector("#customOpts .shape-group[data-group=foot]");
          for (const el of foot.parentElement.children) {
            if (el !== foot) el.style.display = "none";
          }
          document.querySelectorAll(".actions, .cloud, .credit, #status").forEach(el => { el.style.display = "none"; });
          const sheet = document.getElementById("sheet");
          const panel = document.getElementById("panel");
          sheet.style.maxHeight = "none";
          sheet.style.overflow = "visible";
          panel.style.overflow = "visible";
          panel.style.maxHeight = "none";
          sheet.scrollTop = 0;
        }''')
        page.wait_for_timeout(80)
        save(page, shot.replace('.png', '-view.png'))
        save_el(page, '#customOpts .shape-group[data-group="foot"]', shot)
        page.evaluate('''() => {
          const foot = document.querySelector("#customOpts .shape-group[data-group=foot]");
          for (const el of foot.parentElement.children) el.style.display = "";
          document.querySelectorAll(".actions, .cloud, .credit, #status").forEach(el => { el.style.display = ""; });
          const sheet = document.getElementById("sheet");
          const panel = document.getElementById("panel");
          sheet.style.maxHeight = "";
          sheet.style.overflow = "";
          panel.style.overflow = "";
          panel.style.maxHeight = "";
        }''')

    page.close()

    iphone = dict(pw.devices['iPhone 13'])
    ctx = browser.new_context(**iphone)
    m = ctx.new_page()
    collect(m)
    m.goto(url)
    m.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    m.wait_for_timeout(400)
    m.evaluate('() => __sim.setSheet("pot", false)')
    m.wait_for_timeout(350)
    fit = m.evaluate('''() => {
      const v = document.getElementById("view").getBoundingClientRect();
      const p = __sim.potInView(10);
      return { viewH: Math.round(v.height), viewW: Math.round(v.width), sheet: __sim.sheet, collapsed: document.body.classList.contains("sheet-collapsed"), inside: p && p.inside, p };
    }''')
    print('phone pot tab', json.dumps(fit, default=str))
    check(not fit['collapsed'] and fit['sheet'] == 'pot', 'phone Pot sheet is open')
    check(fit['viewH'] < 280, 'phone Pot tab keeps a short 3D view above the sheet')
    check(fit['inside'], 'whole pot fits in the visible canvas above the sheet')
    save(m, 'phone-pot-tab-fit.png')

    m.evaluate('(s) => { __sim.setShape("custom"); __sim.setCustom(s); __sim.setSheet("pot", false); __sim.setShapeGroup("foot"); }', spec)
    m.wait_for_timeout(300)
    for style in ('ring', 'flat', 'pedestal'):
        m.evaluate('(st) => __sim.setCustom({ footStyle: st })', style)
        m.wait_for_timeout(200)
        vis = m.evaluate(FOOT_JS)
        print('phone', style, json.dumps(vis))
        expect_sliders(vis, style)
        fit2 = m.evaluate('() => __sim.potInView(12)')
        print('phone fit', style, json.dumps(fit2, default=str))
        check(fit2 and fit2['inside'], f'phone Foot tab ({style}) still shows the whole pot')
    save(m, 'phone-foot-tab-fit.png')

    m.evaluate('() => { __sim.setShapeGroup("handle"); __sim.setSheet("pot", false); }')
    m.wait_for_timeout(250)
    fit3 = m.evaluate('() => __sim.potInView(12)')
    check(fit3 and fit3['inside'], 'phone Handle tab still shows the whole pot')
    m.evaluate('() => __sim.setSheet("glaze", false)')
    m.wait_for_timeout(250)
    fit4 = m.evaluate('() => __sim.potInView(12)')
    check(fit4 and fit4['inside'], 'phone Glaze tab still shows the whole pot')
    m.close()
    ctx.close()
    browser.close()

print('CONSOLE ERRORS:', errors or 'none')
if errors:
    fail = True
if fail:
    sys.exit(1)
print('ALL CHECKS PASSED')
httpd.shutdown()
