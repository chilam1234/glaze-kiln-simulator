"""View-dependent thin-film on iridescent glazes (fancy material only).
High quality on SwiftShader: packing, program count, orbit frame time,
front-vs-graze chroma, idle rAF. Writes shots/iri-*.png.
"""
import json, math, os, shutil, sys, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from PIL import Image

sys.stdout.reconfigure(line_buffering=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'shots')
ART = '/opt/cursor/artifacts'
os.makedirs(OUT, exist_ok=True)
os.makedirs(ART, exist_ok=True)
CHROME = '/usr/bin/google-chrome'
SWIFT = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
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

def save(page, name, locator='#view'):
    dest = os.path.join(OUT, name)
    page.wait_for_timeout(250)
    page.locator(locator).screenshot(path=dest)
    try:
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)
    return dest

def check(ok, msg):
    global fail
    print(('OK  ' if ok else 'FAIL') + ' ' + msg)
    if not ok:
        fail = True

def chroma(p):
    s = p['r'] + p['g'] + p['b'] + 1e-6
    return (p['r'] / s, p['g'] / s, p['b'] / s)

def cdist(a, b):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

def stitch(paths, dest_name):
    imgs = [Image.open(p).convert('RGB') for p in paths]
    h = max(im.height for im in imgs)
    w = sum(im.width for im in imgs)
    out = Image.new('RGB', (w, h), (245, 241, 232))
    x = 0
    for im in imgs:
        out.paste(im, (x, (h - im.height) // 2))
        x += im.width
    dest = os.path.join(OUT, dest_name)
    out.save(dest)
    try:
        shutil.copy2(dest, os.path.join(ART, dest_name))
    except OSError:
        pass
    print('saved', dest)
    return dest

NEED_IRI = {
    'tenmoku', 'junebug', 'ancientcopper', 'vintagegold', 'satmetal', 'palladium',
    'lustre', 'purplecrystal', 'vertlustre', 'lustjade', 'aventurine', 'blackavent',
}

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=SWIFT)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    page.goto(url)
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(400)

    q = page.evaluate('() => { __sim.setQuality("high"); return { quality: __sim.quality, lite: __sim.lite, gpu: __sim.gpu }; }')
    print('quality', json.dumps(q))
    check(q['quality'] == 'high' and not q['lite'], 'High quality override (film lives on the fancy shader)')

    ids = page.evaluate('() => __sim.glazeIds()')
    iri_map = page.evaluate('() => Object.fromEntries(__sim.glazeIds().map(id => [id, __sim.glazeIri(id)]))')
    missing = sorted(g for g in NEED_IRI if not iri_map.get(g))
    extra_plain = [g for g in ('oatmeal', 'celadon', 'cobalt', 'shino') if iri_map.get(g)]
    print('iri', {k: v for k, v in iri_map.items() if v})
    check(not missing, f'listed iridescent glazes have iri fields ({missing})')
    check(not extra_plain, f'plain glazes stay without iri ({extra_plain})')
    jb = iri_map.get('junebug') or {}
    ac = iri_map.get('ancientcopper') or {}
    check(jb.get('nm', 0) > 380 and 0.4 < jb.get('hue', 0) < 0.6, 'June Bug film is teal/blue-green (thick ~435 nm)')
    check(ac.get('nm', 0) < 320 and ac.get('hue', 1) < 0.12, 'Ancient Copper film is salmon/pink (thin ~275 nm)')

    page.evaluate('() => { __sim.setShape("vase"); __sim.clear(); __sim.pour("junebug", 0.92, "below", 0.7); }')
    page.wait_for_timeout(200)
    pack_jb = page.evaluate('() => __sim.iriAt(0.5, 0.55)')
    page.evaluate('() => { __sim.clear(); __sim.pour("oatmeal", 0.92, "below", 0.7); }')
    page.wait_for_timeout(200)
    pack_oa = page.evaluate('() => __sim.iriAt(0.5, 0.55)')
    print('pack', pack_jb, pack_oa)
    check(pack_jb['amt'] > 20, f'June Bug packs film amount ({pack_jb["amt"]})')
    check(pack_oa['amt'] == 0, f'Oatmeal packs no film ({pack_oa["amt"]})')

    page.evaluate('() => { __sim.clear(); __sim.pour("junebug", 0.92, "below", 0.08); }')
    page.wait_for_timeout(150)
    pack_thin = page.evaluate('() => __sim.iriAt(0.5, 0.55)')
    page.evaluate('() => { __sim.clear(); __sim.pour("junebug", 0.92, "below", 0.7); }')
    page.wait_for_timeout(150)
    pack_thick = page.evaluate('() => __sim.iriAt(0.5, 0.55)')
    print('thickness', pack_thin, pack_thick)
    check(pack_thick['amt'] > pack_thin['amt'] + 8, 'film amount follows painted thickness')

    page.evaluate('() => { __sim.clear(); __sim.pour("junebug", 0.92, "below", 0.7); __sim.brushBand("oatmeal", 0.55, 0.85, 0.22); }')
    page.wait_for_timeout(200)
    pack_top = page.evaluate('() => __sim.iriAt(0.5, 0.55)')
    page.evaluate('() => { __sim.clear(); __sim.pour("oatmeal", 0.92, "below", 0.7); __sim.brushBand("junebug", 0.55, 0.85, 0.22); }')
    page.wait_for_timeout(200)
    pack_top_iri = page.evaluate('() => __sim.iriAt(0.5, 0.55)')
    print('layer', pack_top, pack_top_iri)
    check(pack_top['amt'] < pack_thick['amt'] * 0.55, 'thick oatmeal top buries June Bug film')
    check(pack_top_iri['amt'] > 15, "thick June Bug top coat's film wins")

    page.evaluate('() => { __sim.clear(); __sim.pour("oatmeal", 0.92, "below", 0.7); }')
    page.wait_for_timeout(200)
    page.evaluate('() => __sim.forceRender()')
    n0 = page.evaluate('() => __sim.programs')
    for gid in ('junebug', 'ancientcopper', 'vintagegold', 'oatmeal', 'tenmoku', 'palladium'):
        page.evaluate('(id) => { __sim.clear(); __sim.pour(id, 0.92, "below", 0.7); }', gid)
        page.wait_for_timeout(80)
        page.evaluate('() => __sim.forceRender()')
    n1 = page.evaluate('() => __sim.programs')
    print('programs', n0, n1)
    check(n1 == n0 and n0 > 0, f'shader program count stays flat across glaze switches ({n0} → {n1})')

    page.evaluate('() => { __sim.clear(); __sim.pour("oatmeal", 0.92, "below", 0.7); __sim.setView(20, 12); }')
    page.wait_for_timeout(400)
    page.wait_for_timeout(800)
    idle0 = page.evaluate('() => ({ drawn: __sim.framesDrawn, rafs: __sim.rafs, uploads: __sim.uploads })')
    page.wait_for_timeout(700)
    idle1 = page.evaluate('() => ({ drawn: __sim.framesDrawn, rafs: __sim.rafs, uploads: __sim.uploads })')
    print('idle', idle0, idle1)
    check(idle1['drawn'] - idle0['drawn'] <= 2, 'idle render-on-demand stays idle')
    check(idle1['rafs'] - idle0['rafs'] <= 4, 'idle does not keep a continuous rAF loop')
    check(idle1['uploads'] - idle0['uploads'] == 0, 'idle does not upload textures')

    page.evaluate('() => { __sim.clear(); __sim.pour("oatmeal", 0.92, "below", 0.7); __sim.setView(20, 12); }')
    page.wait_for_timeout(200)
    page.evaluate('() => __sim.forceRender()')
    before = page.evaluate('() => __sim.orbitBench(30)')
    page.evaluate('() => { __sim.clear(); __sim.pour("junebug", 0.92, "below", 0.7); __sim.setView(20, 12); }')
    page.wait_for_timeout(200)
    page.evaluate('() => __sim.forceRender()')
    after = page.evaluate('() => __sim.orbitBench(30)')
    print('orbit-before', json.dumps(before))
    print('orbit-after', json.dumps(after))
    check(before['uploads'] == 0 and after['uploads'] == 0, 'orbit does not upload textures')
    check(before['programs'] == after['programs'], 'orbit does not compile a new program for film')
    check(after['calls'] == before['calls'], 'orbit draw-call count is unchanged')
    timings = {'oatmeal': before, 'junebug': after, 'deltaMs': round(after['median'] - before['median'], 3)}
    tpath = os.path.join(OUT, 'iri-orbit-timings.json')
    open(tpath, 'w').write(json.dumps(timings, indent=2))
    try:
        shutil.copy2(tpath, os.path.join(ART, 'iri-orbit-timings.json'))
    except OSError:
        pass
    print('orbit-delta-ms', timings['deltaMs'])

    def sample_pair():
        page.evaluate('() => __sim.setView(18, 10, 1)')
        page.wait_for_timeout(200)
        front = page.evaluate('() => __sim.sampleScreen(0.52, 0, 3)')
        graze = page.evaluate('() => __sim.sampleScreen(0.52, 68, 3)')
        page.evaluate('() => __sim.setView(18, 52, 0.85)')
        page.wait_for_timeout(200)
        high = page.evaluate('() => __sim.sampleScreen(0.52, 0, 3)')
        return front, graze, high

    page.evaluate('() => { __sim.clear(); __sim.pour("junebug", 0.92, "below", 0.75); __sim.setSeed(20261008); }')
    page.evaluate('() => __sim.fire(20261008)')
    page.wait_for_function('window.__sim.state === "fired"', timeout=180000)
    page.wait_for_timeout(400)
    page.evaluate('() => __sim.setView(18, 10)')
    save(page, 'iri-junebug-front.png')
    pack_fired = page.evaluate('() => __sim.iriAt(0.5, 0.55)')
    print('fired-pack', pack_fired)
    check(pack_fired['amt'] > 40, 'fired June Bug keeps a full-strength film')
    jb_front, jb_graze, jb_high = sample_pair()
    page.evaluate('() => __sim.setView(18, 52, 0.85)')
    save(page, 'iri-junebug-graze.png')
    print('junebug samples', jb_front, jb_graze, jb_high)

    page.evaluate('() => { __sim.unfire(); __sim.clear(); __sim.pour("oatmeal", 0.92, "below", 0.75); __sim.setSeed(20261008); }')
    page.evaluate('() => __sim.fire(20261008)')
    page.wait_for_function('window.__sim.state === "fired"', timeout=180000)
    page.wait_for_timeout(400)
    oa_front, oa_graze, oa_high = sample_pair()
    page.evaluate('() => __sim.setView(18, 10)')
    save(page, 'iri-oatmeal.png')
    print('oatmeal samples', oa_front, oa_graze, oa_high)

    jb_edge = cdist(chroma(jb_front), chroma(jb_graze))
    oa_edge = cdist(chroma(oa_front), chroma(oa_graze))
    jb_el = cdist(chroma(jb_front), chroma(jb_high))
    oa_el = cdist(chroma(oa_front), chroma(oa_high))
    print('chroma', json.dumps({'jb_edge': jb_edge, 'oa_edge': oa_edge, 'jb_el': jb_el, 'oa_el': oa_el}))
    check(jb_edge > oa_edge + 0.012 or jb_edge > oa_edge * 1.35,
          f'June Bug chroma shifts more than Oatmeal from front to graze ({jb_edge:.4f} vs {oa_edge:.4f})')
    check(jb_el > oa_el + 0.008 or jb_el > oa_el * 1.25,
          f'June Bug chroma shifts more than Oatmeal from front to high camera ({jb_el:.4f} vs {oa_el:.4f})')

    page.evaluate('() => { __sim.unfire(); __sim.clear(); __sim.pour("ancientcopper", 0.92, "below", 0.75); __sim.setSeed(20261008); }')
    page.evaluate('() => __sim.fire(20261008)')
    page.wait_for_function('window.__sim.state === "fired"', timeout=180000)
    page.wait_for_timeout(400)
    page.evaluate('() => __sim.setView(18, 10)')
    save(page, 'iri-ancientcopper.png')
    stitch([
        os.path.join(OUT, 'iri-junebug-front.png'),
        os.path.join(OUT, 'iri-ancientcopper.png'),
        os.path.join(OUT, 'iri-oatmeal.png'),
    ], 'iri-compare.png')

    js_errors = [e for e in errors if not e.startswith('warning')]
    check(not js_errors, f'no page errors ({js_errors[:4]})')
    browser.close()

print('FAIL' if fail else 'PASS')
sys.exit(1 if fail else 0)
