"""Picker + new-glaze fire screenshots for the PC-line PR.
Writes shots/pc-*.png and copies to /opt/cursor/artifacts.
Does not commit AMACO photos; combo comparisons are generated test artifacts only.
"""
import json, os, shutil, sys, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(line_buffering=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'shots')
ART = '/opt/cursor/artifacts'
os.makedirs(OUT, exist_ok=True)
os.makedirs(ART, exist_ok=True)
CHROME = '/usr/bin/google-chrome'
ARGS = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist', '--enable-webgl']
SEED = 20261006

from playwright.sync_api import sync_playwright


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def log_message(self, fmt, *args):
        pass


httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{httpd.server_address[1]}/'


def save(page, name, full=True):
    dest = os.path.join(OUT, name)
    page.screenshot(path=dest, full_page=full)
    try:
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)
    return dest


def font(n=14):
    try:
        return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', n)
    except OSError:
        return ImageFont.load_default()


def side_by_side(a, b, la, lb, title, name):
    pad, cap = 12, 40
    w, h = a.width + b.width + pad * 3, max(a.height, b.height) + cap + pad
    im = Image.new('RGB', (w, h), (232, 238, 242))
    im.paste(a, (pad, cap))
    im.paste(b, (a.width + pad * 2, cap))
    d = ImageDraw.Draw(im)
    f, fs = font(14), font(12)
    d.text((pad, 10), title, font=f, fill=(7, 70, 132))
    d.text((pad, cap - 16), la, font=fs, fill=(82, 93, 125))
    d.text((a.width + pad * 2, cap - 16), lb, font=fs, fill=(82, 93, 125))
    dest = os.path.join(OUT, name)
    im.save(dest)
    try:
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)
    return dest


fail = False
errors = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)

    # --- desktop picker ---
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    t0 = time.time()
    page.goto(url)
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    after = {'startup_ms': round((time.time() - t0) * 1000),
             'perf_now': round(page.evaluate('() => performance.now()')),
             'atlas': page.evaluate('() => __sim.atlas()'),
             'programs': page.evaluate('() => __sim.programs'),
             'n': page.evaluate('() => __sim.glazeIds().length')}
    print('AFTER', json.dumps(after))
    programs0 = after['programs']
    page.evaluate('''() => { for (const id of __sim.glazeIds()) __sim.setGlaze(id); }''')
    programs1 = page.evaluate('() => __sim.programs')
    print('programs after switching all glazes', programs0, '->', programs1)
    if programs1 > programs0:
        print('FAIL: glaze switch recompiled'); fail = True
    page.evaluate('__sim.setSheet("glaze", false)')
    page.wait_for_timeout(250)
    save(page, 'pc-picker-desktop.png', full=False)
    page.fill('#glazeSearch', 'PC-12')
    page.wait_for_timeout(200)
    save(page, 'pc-picker-desktop-search.png', full=False)
    page.fill('#glazeSearch', '')
    page.evaluate('__sim.setGlaze("tuscanblue")')

    # --- phone picker 390x844 ---
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)')
    m = ctx.new_page()
    m.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    m.goto(url)
    m.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    m.evaluate('__sim.setSheet("glaze", false)')
    m.wait_for_timeout(400)
    layout = m.evaluate('''() => {
      const fire = document.getElementById('fireBtn').getBoundingClientRect();
      const tabs = document.getElementById('mobileBar').getBoundingClientRect();
      const sheet = document.getElementById('sheet').getBoundingClientRect();
      const glazes = document.getElementById('glazes').getBoundingClientRect();
      return { fire, tabs, sheet, glazes, n: document.querySelectorAll("button.glaze:not([hidden])").length,
               fams: document.querySelectorAll("#glazeFams button").length };
    }''')
    print('phone layout', json.dumps({k: {kk: round(v[kk]) for kk in ('top','bottom','height') if kk in v} if isinstance(v, dict) and 'top' in v else v for k,v in layout.items()}))
    if layout['sheet']['bottom'] > layout['fire']['top'] + 2:
        # sheet should not cover fire; allow a couple px
        print('WARN sheet vs fire', layout['sheet']['bottom'], layout['fire']['top'])
    save(m, 'pc-picker-phone.png', full=False)
    m.fill('#glazeSearch', 'flambe')
    m.wait_for_timeout(200)
    save(m, 'pc-picker-phone-search.png', full=False)
    m.close(); ctx.close()

    # --- fired pot with several new glazes ---
    page.evaluate('__sim.clear()')
    page.evaluate('__sim.setShape("vase")')
    page.wait_for_timeout(300)
    page.evaluate('__sim.setCone(6)')
    page.evaluate('__sim.pour("tuscanblue", 0.78, "below", 0.85)')
    page.evaluate('__sim.pour("flambe", 0.52, "above", 0.7)')
    page.evaluate('__sim.brushBand("honeyflux", 0.68, 0.6, 0.14, 40, 140)')
    page.evaluate('__sim.brushBand("arcticblue", 0.38, 0.7, 0.12, 180, 300)')
    page.evaluate('__sim.brushBand("vertlustre", 0.22, 0.7, 0.12, 0, 90)')
    page.evaluate(f'__sim.setSeed({SEED})')
    page.click('#fireBtn')
    page.wait_for_function('__sim.state === "fired"', timeout=240000)
    page.evaluate('__sim.setView(18, 10)')
    page.wait_for_timeout(500)
    save(page, 'pc-fired-new-glazes.png', full=False)
    page.locator('#view').screenshot(path=os.path.join(OUT, 'pc-fired-new-glazes-view.png'))
    shutil.copy2(os.path.join(OUT, 'pc-fired-new-glazes-view.png'), os.path.join(ART, 'pc-fired-new-glazes-view.png'))

    def fire_combo(top, under, name):
        if page.evaluate('() => __sim.state') == 'fired':
            page.evaluate('__sim.unfire()')
        page.evaluate('__sim.clear()')
        page.evaluate('__sim.setShape("vase")')
        page.wait_for_timeout(250)
        page.evaluate(f'__sim.pour("{under}", 0.76, "below", 0.85)')
        page.evaluate(f'__sim.pour("{top}", 0.48, "above", 0.8)')
        page.evaluate(f'__sim.setSeed({SEED})')
        page.click('#fireBtn')
        page.wait_for_function('__sim.state === "fired"', timeout=240000)
        page.evaluate('__sim.setView(20, 12)')
        page.wait_for_timeout(400)
        dest = os.path.join(OUT, name)
        page.locator('#view').screenshot(path=dest)
        shutil.copy2(dest, os.path.join(ART, name))
        print('saved', dest)
        return dest

    page.evaluate('__sim.unfire()')
    fire_combo('bluemidnight', 'amber', 'pc-combo-12-over-68.png')
    page.evaluate('__sim.unfire()')
    fire_combo('flambe', 'tuscanblue', 'pc-combo-71-over-18.png')

    ours12 = Image.open(os.path.join(OUT, 'pc-combo-12-over-68.png')).convert('RGB')
    ours71 = Image.open(os.path.join(OUT, 'pc-combo-71-over-18.png')).convert('RGB')
    am12 = os.path.join('/tmp/combos/pc12-over-pc68.jpg')
    am71 = os.path.join('/tmp/combos/pc71-over-pc18.jpg')
    if os.path.exists(am12):
        ref = Image.open(am12).convert('RGB')
        ref.thumbnail((ours12.width, ours12.height))
        side_by_side(ours12, ref, 'Simulator: PC-12 over PC-68', 'AMACO photo (reference, not in repo)',
                     'PC-12 Blue Midnight over PC-68 Golden Honey', 'pc-combo-12-over-68-vs-amaco.png')
    if os.path.exists(am71):
        ref = Image.open(am71).convert('RGB')
        ref.thumbnail((ours71.width, ours71.height))
        side_by_side(ours71, ref, 'Simulator: PC-71 over PC-18', 'AMACO photo (reference, not in repo)',
                     'PC-71 Flambé over PC-18 Tuscan Blue', 'pc-combo-71-over-18-vs-amaco.png')

    print('CONSOLE ERRORS:', errors or 'none')
    if errors:
        fail = True
    browser.close()

if fail:
    sys.exit(1)
print('SHOTS OK')
