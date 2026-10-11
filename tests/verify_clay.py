"""Clay-weight estimate: lathe volume tracks height and wall; UI updates on a vase.
Writes shots/clay-*.png and copies them to /opt/cursor/artifacts.
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


def clay_of(page, **opts):
    return page.evaluate('''(o) => __sim.clay(o)''', opts or {})


def set_custom(page, partial):
    page.evaluate('''(p) => __sim.setCustom(p)''', partial)
    page.wait_for_timeout(120)


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: check(False, f'pageerror: {e}'))
    page.goto(url)
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(400)

    page.evaluate('() => __sim.setShape("vase")')
    page.wait_for_timeout(200)
    vase = clay_of(page)
    print('vase', json.dumps({k: vase.get(k) for k in ('weighG', 'cm3', 'lb', 'oz', 'density', 'waste', 'label')}))
    check(vase.get('weighG', 0) > 400, f'vase weighs out a ball of clay (got {vase.get("weighG")} g)')
    check(vase.get('waste') == 0.2 and abs(vase.get('density', 0) - 1.8) < 1e-6, 'default 1.8 g/cm³ and 20% trim')
    check(vase.get('label', '').startswith('≈') and 'g /' in vase.get('label', '') and 'lb' in vase.get('label', ''),
          f'vase label shows grams and pounds ({vase.get("label")})')
    ui = page.evaluate('''() => ({
      text: document.getElementById('clayOut').textContent,
      vis: getComputedStyle(document.getElementById('clayRow')).display !== 'none',
      h: document.getElementById('clayRow').getBoundingClientRect().height,
    })''')
    check(ui['vis'] and ui['h'] > 8 and ui['text'] == vase['label'], f'clay row is on the Pot sheet ({ui})')
    save(page, 'clay-vase-desktop.png')

    page.evaluate('() => __sim.setShape("plate")')
    page.wait_for_timeout(150)
    plate = clay_of(page)
    print('plate', plate.get('weighG'), 'vase', vase.get('weighG'))
    check(plate.get('weighG', 0) > 80, f'plate still estimates clay (got {plate.get("weighG")} g)')
    check(vase['weighG'] > plate['weighG'] * 1.15, 'taller vase estimates more clay than a plate')

    page.evaluate('() => __sim.setShape("custom")')
    page.wait_for_timeout(250)
    set_custom(page, {
        'nodes': [{'r': 0.55, 'y': 0.14}, {'r': 0.62, 'y': 0.9}],
        'bulges': [{'r': 0.7, 'y': 0.5}],
        'wall': 0.04, 'wallTaper': False,
        'handle': 'none', 'spout': 'none', 'footStyle': 'flat',
    })
    short = clay_of(page)
    set_custom(page, {
        'nodes': [{'r': 0.55, 'y': 0.14}, {'r': 0.62, 'y': 2.4}],
        'bulges': [{'r': 0.7, 'y': 1.2}],
        'wall': 0.04, 'wallTaper': False,
        'handle': 'none', 'spout': 'none', 'footStyle': 'flat',
    })
    tall = clay_of(page)
    print('short-thin', short.get('weighG'), 'tall-thin', tall.get('weighG'))
    check(tall['weighG'] > short['weighG'] * 1.4, f'taller pot uses more clay ({short["weighG"]:.0f} → {tall["weighG"]:.0f} g)')

    set_custom(page, {'wall': 0.16})
    thick = clay_of(page)
    print('tall-thick', thick.get('weighG'))
    check(thick['weighG'] > tall['weighG'] * 1.25, f'thicker wall uses more clay ({tall["weighG"]:.0f} → {thick["weighG"]:.0f} g)')

    dens = clay_of(page, density=2.0, waste=0.2)
    check(abs(dens['weighG'] / thick['weighG'] - 2.0 / 1.8) < 0.02, 'density 2.0 scales the weigh-out')
    waste = clay_of(page, density=1.8, waste=0.25)
    check(abs(waste['weighG'] / thick['weighG'] - 1.25 / 1.20) < 0.03, '25% trim weighs out more than 20%')

    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate('() => { __sim.setShape("vase"); __sim.setSheet("pot", false); }')
    page.wait_for_timeout(250)
    phone = page.evaluate('''() => {
      const row = document.getElementById('clayRow');
      const r = row.getBoundingClientRect();
      const view = document.getElementById('view').getBoundingClientRect();
      return {
        text: document.getElementById('clayOut').textContent,
        y: r.y, h: r.height, vis: r.height > 8 && getComputedStyle(row).display !== 'none',
        overlapView: r.top < view.bottom - 8 && r.bottom > view.top + 8 && r.height > 8,
      };
    }''')
    print('phone', phone)
    check(phone['vis'] and 'g /' in phone['text'], f'phone Pot sheet shows the estimate ({phone})')
    check(not phone['overlapView'], 'clay line stays in the drawer, not over the pot')
    save(page, 'clay-vase-phone.png')

    browser.close()

print('FAIL' if fail else 'PASS')
sys.exit(1 if fail else 0)
