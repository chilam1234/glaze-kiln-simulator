"""Pot-sheet cross-section: exists, caption matches clay estimate, thicker wall → thicker shell.
Writes shots/section-*.png and copies them to /opt/cursor/artifacts.
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


def info(page):
    return page.evaluate('''() => {
      const clay = __sim.clay();
      const sec = __sim.sectionInfo();
      const out = document.getElementById('clayOut');
      const cap = document.getElementById('claySectionCap');
      const fold = document.getElementById('claySectionFold');
      const cv = document.getElementById('claySection');
      const view = document.getElementById('view').getBoundingClientRect();
      const box = cv.getBoundingClientRect();
      return {
        clay, sec,
        out: out && out.textContent,
        cap: cap && cap.textContent,
        open: !!(fold && fold.open),
        canvas: { w: box.width, h: box.height, y: box.y },
        overlapView: box.height > 8 && box.top < view.bottom - 4 && box.bottom > view.top + 4
          && box.left < view.right - 4 && box.right > view.left + 4,
      };
    }''')


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: check(False, f'pageerror: {e}'))
    page.goto(url)
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(400)
    page.evaluate('() => { __sim.setShape("vase"); document.getElementById("claySectionFold").open = true; }')
    page.wait_for_timeout(250)
    page.evaluate('() => __sim.clay()')
    vase = info(page)
    print('vase', json.dumps({
        'out': vase['out'], 'cap': vase['cap'], 'open': vase['open'],
        'wall': vase['sec'].get('wallCm'), 'canvas': vase['canvas'],
    }))
    check(vase['open'] and vase['canvas']['h'] > 80, f'section canvas is open and tall enough ({vase["canvas"]})')
    check(vase['sec']['pts'] > 20, f'section uses the lathe path ({vase["sec"]["pts"]} pts)')
    check(vase['out'] and vase['out'] in vase['cap'], f'caption includes the clay line ({vase["out"]!r} vs {vase["cap"]!r})')
    check('g/cm³' in vase['cap'] and '%' in vase['cap'] and 'trim' in vase['cap'],
          f'caption has density and trim ({vase["cap"]})')
    check((vase['sec'].get('wall') or {}).get('mid', 0) > 0.02, 'vase mid wall is a visible clay shell')
    check(not vase['overlapView'], 'section stays in the Pot sheet, not over the 3D view')
    page.locator('#claySection').scroll_into_view_if_needed()
    save(page, 'section-vase-desktop.png')

    page.evaluate('() => __sim.setShape("custom")')
    page.wait_for_timeout(250)
    page.evaluate('''(p) => __sim.setCustom(p)''', {
        'nodes': [{'r': 0.55, 'y': 0.14}, {'r': 0.7, 'y': 1.6}],
        'bulges': [{'r': 0.82, 'y': 0.85}],
        'wall': 0.04, 'wallTaper': False,
        'handle': 'none', 'spout': 'none', 'footStyle': 'flat',
    })
    page.wait_for_timeout(150)
    thin = info(page)
    page.evaluate('''(p) => __sim.setCustom(p)''', {'wall': 0.16})
    page.wait_for_timeout(150)
    thick = info(page)
    print('thin mid', thin['sec']['wall'], 'thick mid', thick['sec']['wall'])
    check(thick['sec']['wall']['mid'] > thin['sec']['wall']['mid'] * 1.8,
          f'thicker wall draws a thicker shell ({thin["sec"]["wall"]["mid"]:.3f} → {thick["sec"]["wall"]["mid"]:.3f})')
    check(thick['out'] in thick['cap'], 'thick-wall caption still matches the estimate')

    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate('() => { __sim.setShape("vase"); __sim.setSheet("pot", false); document.getElementById("claySectionFold").open = true; }')
    page.wait_for_timeout(250)
    page.evaluate('() => __sim.clay({ density: 1.8, waste: 0.2 })')
    phone = info(page)
    print('phone', phone['out'], phone['cap'], phone['canvas'], 'overlap', phone['overlapView'])
    check(phone['open'] and phone['canvas']['h'] > 60, 'phone section is visible')
    check(phone['out'] in phone['cap'], f'phone caption matches clay ({phone["out"]!r} vs {phone["cap"]!r})')
    check(not phone['overlapView'], 'phone section stays in the drawer')
    page.locator('#claySection').scroll_into_view_if_needed()
    save(page, 'section-vase-phone.png')

    browser.close()

print('FAIL' if fail else 'PASS')
sys.exit(1 if fail else 0)
