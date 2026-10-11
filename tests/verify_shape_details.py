"""Phone Pot drawer: sculpt controls live in a collapsed Shape details accordion.
Writes shots/shape-details-*.png.
Usage: python3 tests/verify_shape_details.py
"""
import os, shutil, sys, threading
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


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, fmt, *args):
        pass


httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{httpd.server_address[1]}/'

PROBE = '''() => {
  const q = (id) => document.getElementById(id);
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { y: r.y, b: r.bottom, h: r.height, vis: r.height > 4 && cs.display !== 'none' && !el.hidden };
  };
  const fire = q('fireBtn');
  const wall = q('customWall');
  const det = q('shapeDetails');
  const sec = q('claySectionFold');
  return {
    fire: box(fire),
    fireOnScreen: !!(fire && fire.getBoundingClientRect().bottom <= innerHeight + 2),
    shapes: box(q('shapes')),
    clay: box(q('clayRow')),
    sectionOpen: !!(sec && sec.open),
    sectionSum: box(sec && sec.querySelector('summary')),
    detailsHidden: !!(det && det.hidden),
    detailsOpen: !!(det && det.open),
    detailsSum: box(det && det.querySelector('summary')),
    wallVis: !!(wall && wall.getBoundingClientRect().height > 4 && getComputedStyle(wall).display !== 'none'
      && !wall.closest('[hidden]') && det && det.open),
    innerH: innerHeight,
    sheet: document.body.dataset.sheet,
  };
}'''


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)

    desk = browser.new_page(viewport={'width': 1280, 'height': 800})
    desk.goto(url, timeout=120000)
    desk.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    desk.wait_for_timeout(300)
    desk.evaluate('__sim.setShape("custom")')
    desk.wait_for_timeout(200)
    d = desk.evaluate(PROBE)
    print('desktop custom', d)
    check(d['detailsOpen'] and not d['detailsHidden'], 'desktop Shape details stays expanded')
    check(d['wallVis'], 'desktop wall slider is available')
    desk.close()

    phone = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    phone.goto(url, timeout=120000)
    phone.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    phone.wait_for_timeout(300)
    phone.evaluate('__sim.setSheet("pot", false)')
    phone.wait_for_timeout(250)
    vase = phone.evaluate(PROBE)
    print('phone vase', vase)
    check(vase['shapes'] and vase['shapes']['vis'], 'vase keeps the shape grid')
    check(vase['clay'] and vase['clay']['vis'], 'vase keeps the clay estimate')
    check(vase['sectionSum'] and vase['sectionSum']['vis'], 'section summary stays visible')
    check(not vase['sectionOpen'], 'phone section starts collapsed')
    check(vase['detailsHidden'], 'vase hides Shape details until Custom')
    check(vase['fireOnScreen'], 'vase Fire is on-screen without scrolling')
    check(vase['fire']['y'] < vase['innerH'] - 20, 'Fire sits near the bottom of the drawer')
    check(vase['sectionSum']['b'] <= vase['fire']['y'] + 2,
          f'section summary sits above Fire ({vase["sectionSum"]} vs {vase["fire"]})')
    check(vase['clay']['b'] <= vase['fire']['y'] + 2,
          f'clay line sits above Fire ({vase["clay"]} vs {vase["fire"]})')
    save(phone, 'shape_details_after_pot.png')

    phone.evaluate('__sim.setShape("custom")')
    phone.wait_for_timeout(250)
    phone.evaluate('__sim.setSheet("pot", false)')
    phone.wait_for_timeout(200)
    custom = phone.evaluate(PROBE)
    print('phone custom closed', custom)
    check(not custom['detailsHidden'], 'Custom shows the Shape details row')
    check(not custom['detailsOpen'], 'Shape details starts collapsed on the phone')
    check(custom['shapes'] and custom['shapes']['vis'], 'collapsed Custom still shows the shape grid')
    check(custom['clay'] and custom['clay']['vis'], 'collapsed Custom still shows clay')
    check(not custom['wallVis'], 'wall sliders stay inside the closed accordion')
    check(custom['fireOnScreen'], 'Custom Fire is on-screen without scrolling past sliders')
    check(custom['detailsSum'] and custom['detailsSum']['h'] >= 40, 'Shape details hit is 40px-class')
    check(custom['detailsSum']['b'] <= custom['fire']['y'] + 2,
          f'Shape details sits above Fire ({custom["detailsSum"]} vs {custom["fire"]})')
    save(phone, 'shape_details_after_custom.png')

    phone.evaluate('__sim.setShapeDetails(true)')
    phone.wait_for_timeout(200)
    opened = phone.evaluate(PROBE)
    print('phone custom open', opened)
    check(opened['detailsOpen'] and opened['wallVis'], 'opening Shape details reveals sculpt sliders')
    save(phone, 'shape_details_after_open.png')

    phone.evaluate('__sim.setShapeGroup("handle")')
    phone.wait_for_timeout(200)
    handle = phone.evaluate('''() => {
      const row = document.getElementById('handleType');
      const r = row ? row.getBoundingClientRect() : { height: 0 };
      const tab = [...document.querySelectorAll('#shapeSubtabs button')].find(b => b.dataset.group === 'handle');
      return { h: r.height, vis: r.height > 8, tabOn: !!(tab && tab.classList.contains('active')) };
    }''')
    check(handle['vis'] and handle['tabOn'],
          f'setShapeGroup(handle) opens details on the Handle tab ({handle})')

    phone.close()
    browser.close()

httpd.shutdown()
if fail:
    print('FAILURES')
    raise SystemExit(1)
print('ALL CHECKS PASSED')
