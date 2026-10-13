"""Moon jar (달항아리) preset: spherical whiteware silhouette, clay/section/custom.
Writes shots/moonjar-*.png and copies them to /opt/cursor/artifacts.
Usage: python3 tests/verify_moonjar.py
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

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: check(False, f'pageerror: {e}'))
    page.goto(url)
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(400)

    btn = page.locator('button[data-shape="moonjar"]')
    check(btn.count() == 1, 'Moon jar button is on the shape grid')
    label = btn.inner_text().strip()
    check(label == 'Moon jar', f'button label is Moon jar (got {label!r})')
    check('Mon jar' not in label, 'does not use the typo Mon jar')
    title = btn.get_attribute('title') or ''
    check('moon jar' in title.lower() or '달항아리' in title, f'button title mentions moon jar ({title!r})')

    others = page.evaluate('''() => [...document.querySelectorAll('#shapes [data-shape]')].map(b => b.dataset.shape)''')
    for kind in ('cylinder', 'bowl', 'vase', 'plate', 'chawan', 'bottle', 'jar', 'mug', 'moonjar', 'custom'):
        check(kind in others, f'{kind} is still on the grid')
    check(others.index('moonjar') < others.index('custom'), 'Moon jar sits with the presets, Custom stays last')

    page.click('button[data-shape="moonjar"]')
    page.wait_for_timeout(350)
    status = page.evaluate('() => document.getElementById("status").textContent')
    check(status.startswith('Moon jar ready'), f'status says Moon jar ready ({status!r})')
    check('Moonjar' not in status, 'status uses a space: Moon jar, not Moonjar')

    sil = page.evaluate('() => __sim.silhouette()')
    print('silhouette', json.dumps(sil))
    check(sil and sil.get('kind') == 'moonjar', f'silhouette kind is moonjar ({sil})')
    ratio = sil.get('ratio', 0)
    check(0.85 <= ratio <= 1.15, f'nearly spherical: maxD/height={ratio:.3f} in [0.85, 1.15]')
    check(sil['maxR'] > sil['rimR'] * 1.6, f'belly wider than mouth ({sil["maxR"]:.3f} vs rim {sil["rimR"]:.3f})')
    check(sil['maxR'] > sil['footR'] * 1.6, f'belly wider than foot ({sil["maxR"]:.3f} vs foot {sil["footR"]:.3f})')
    check(0.28 <= sil['rimR'] <= 0.50, f'modest rim r={sil["rimR"]:.3f}')
    check(0.28 <= sil['footR'] <= 0.55, f'modest foot r={sil["footR"]:.3f}')
    belly_frac = sil['bellyY'] / max(1e-6, sil['height'])
    check(0.38 <= belly_frac <= 0.62, f'equator sits mid-body (bellyY={sil["bellyY"]:.3f} / h={sil["height"]:.3f}, frac={belly_frac:.3f})')

    clay = page.evaluate('() => __sim.clay()')
    print('clay', json.dumps({k: clay.get(k) for k in ('weighG', 'cm3', 'lb', 'label')}))
    check(clay.get('weighG', 0) > 400, f'moon jar weighs out a ball of clay (got {clay.get("weighG")} g)')
    check(clay.get('label', '').startswith('≈') and 'g' in clay.get('label', ''), f'clay label ({clay.get("label")})')
    ui = page.evaluate('''() => ({
      text: document.getElementById('clayOut').textContent,
      vis: getComputedStyle(document.getElementById('clayRow')).display !== 'none',
    })''')
    check(ui['vis'] and ui['text'] == clay['label'], f'clay row shows the estimate ({ui})')

    page.evaluate('() => { document.getElementById("claySectionFold").open = true; }')
    page.wait_for_timeout(150)
    page.evaluate('() => __sim.clay()')
    sec = page.evaluate('() => __sim.sectionInfo()')
    print('section', json.dumps({k: sec.get(k) for k in ('open', 'height', 'maxD', 'pts', 'caption')}))
    check(sec.get('open') and sec.get('pts', 0) > 20, f'section draws the moon jar ({sec.get("pts")} pts)')
    check(sec.get('maxD', 0) > 10 and sec.get('height', 0) > 10, f'section height/maxD look pot-sized ({sec.get("height")} / {sec.get("maxD")})')
    ratio_cm = sec['maxD'] / sec['height']
    check(0.85 <= ratio_cm <= 1.15, f'section maxD/height={ratio_cm:.3f} is spherical')

    page.evaluate('() => __sim.setView(18, 8)')
    page.wait_for_timeout(250)
    save(page, 'moonjar-desktop.png')
    page.locator('#view').screenshot(path=os.path.join(OUT, 'moonjar-desktop-view.png'))
    try:
        shutil.copy2(os.path.join(OUT, 'moonjar-desktop-view.png'), os.path.join(ART, 'moonjar-desktop-view.png'))
    except OSError:
        pass

    page.evaluate('() => __sim.setShape("custom")')
    page.wait_for_timeout(280)
    custom = page.evaluate('() => __sim.getCustom()')
    check(custom and custom.get('source') == 'moonjar', f'Custom extracts from moonjar ({custom and custom.get("source")})')
    check(custom.get('handle') == 'none', 'moon jar Custom has no mug handle')
    nodes = custom.get('nodes') or []
    bulges = custom.get('bulges') or []
    check(len(nodes) >= 2, f'Custom has foot and rim nodes ({len(nodes)})')
    belly = max([n['r'] for n in nodes] + [b['r'] for b in bulges], default=0)
    rim = nodes[-1]['r']
    foot = nodes[0]['r']
    print('custom nodes', nodes, 'bulges', bulges)
    check(belly > rim * 1.4 and belly > foot * 1.3, f'Custom keeps the spherical belly ({belly:.3f} vs rim {rim:.3f} / foot {foot:.3f})')
    cstat = page.evaluate('() => document.getElementById("status").textContent')
    check('Moon jar' in cstat, f'Custom status names Moon jar ({cstat!r})')

    page.evaluate('() => __sim.setShape("moonjar")')
    page.wait_for_timeout(200)
    page.evaluate('() => { __sim.pour("celadon", 0.7, "below", 0.65); }')
    page.wait_for_timeout(200)
    painted = page.evaluate('''() => {
      const s = __sim.stats();
      const map = Array.isArray(s) ? Object.fromEntries(s) : s;
      return map.celadon || 0;
    }''')
    print('celadon paint', painted)
    check(painted > 0.02, f'pour paints the moon jar (celadon {painted})')

    page.evaluate('() => __sim.setShape("vase")')
    page.wait_for_timeout(200)
    vase_sil = page.evaluate('() => __sim.silhouette()')
    check(vase_sil and vase_sil.get('kind') == 'vase', 'switching back to vase still works')
    check(vase_sil['height'] > sil['height'] * 1.05, f'vase stays taller than the moon jar ({vase_sil["height"]:.2f} vs {sil["height"]:.2f})')

    page.close()

    phone = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    phone.on('pageerror', lambda e: check(False, f'phone pageerror: {e}'))
    phone.goto(url)
    phone.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    phone.wait_for_timeout(300)
    phone.evaluate('() => { __sim.setShape("moonjar"); __sim.setSheet("pot", false); __sim.setView(18, 8); }')
    phone.wait_for_timeout(350)
    grid = phone.evaluate('''() => {
      const btn = document.querySelector('button[data-shape="moonjar"]');
      const r = btn.getBoundingClientRect();
      const det = document.getElementById('shapeDetails');
      return {
        label: btn.textContent.trim(),
        on: btn.classList.contains('active'),
        h: r.height, vis: r.height > 8,
        detailsHidden: !!(det && det.hidden),
        clay: document.getElementById('clayOut').textContent,
      };
    }''')
    print('phone', grid)
    check(grid['label'] == 'Moon jar' and grid['vis'], f'phone grid shows Moon jar ({grid})')
    check(grid['on'], 'Moon jar is the active preset on the phone')
    check(grid['detailsHidden'], 'Moon jar hides Shape details until Custom, like other presets')
    save(phone, 'moonjar-phone.png')

    phone.evaluate('() => { __sim.setShape("custom"); __sim.setSheet("pot", false); }')
    phone.wait_for_timeout(280)
    custom_phone = phone.evaluate('''() => {
      const det = document.getElementById('shapeDetails');
      const wall = document.getElementById('customWall');
      return {
        hidden: !!(det && det.hidden),
        open: !!(det && det.open),
        source: (__sim.getCustom() || {}).source,
        wallH: wall ? wall.getBoundingClientRect().height : 0,
      };
    }''')
    print('phone custom', custom_phone)
    check(not custom_phone['hidden'] and custom_phone['source'] == 'moonjar',
          f'Custom from Moon jar shows Shape details ({custom_phone})')
    phone.evaluate('() => __sim.setShapeDetails(true)')
    phone.wait_for_timeout(200)
    opened = phone.evaluate('''() => {
      const det = document.getElementById('shapeDetails');
      const wall = document.getElementById('customWall');
      const cs = wall && getComputedStyle(wall);
      return {
        open: !!(det && det.open),
        wallVis: !!(wall && wall.getBoundingClientRect().height > 4 && cs.display !== 'none'),
      };
    }''')
    check(opened['open'] and opened['wallVis'], f'Shape details wall slider works on the moon jar ({opened})')
    save(phone, 'moonjar-phone-details.png')

    phone.evaluate('() => { __sim.setShape("moonjar"); __sim.setSheet("pot", true); }')
    phone.wait_for_timeout(250)
    phone.evaluate('() => __sim.setView(22, 6)')
    phone.wait_for_timeout(200)
    save(phone, 'moonjar-phone-view.png')

    phone.close()
    browser.close()

httpd.shutdown()
print('FAIL' if fail else 'PASS')
sys.exit(1 if fail else 0)
