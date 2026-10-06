"""Fire the same painted pot at cone 6 and cone 10 (fixed seed) and write side-by-side shots.
Also a mobile screenshot of the cone toggle. Cone 6 must match the pre-change look (same sim path).
Usage: python3 tests/verify_cone.py
"""
import json, os, sys, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(line_buffering=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'shots')
ART = '/opt/cursor/artifacts'
os.makedirs(OUT, exist_ok=True)
os.makedirs(ART, exist_ok=True)

from playwright.sync_api import sync_playwright

CHROME = '/usr/bin/google-chrome'
ARGS = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist', '--enable-webgl', '--enable-precise-memory-info']
SEED = 20260928
GLAZES = ('oatmeal', 'seaweed', 'rutile', 'celadon', 'bluemidnight', 'flambe')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def log_message(self, fmt, *args):
        pass


def start_server():
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{httpd.server_address[1]}/'


def save(im, name):
    p = os.path.join(OUT, name)
    im.save(p)
    try:
        import shutil
        shutil.copy2(p, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', p)
    return p


def side_by_side(a, b, label_a, label_b, title):
    pad, cap = 10, 36
    w, h = a.width + b.width + pad * 3, max(a.height, b.height) + cap + pad
    im = Image.new('RGB', (w, h), (232, 238, 242))
    im.paste(a, (pad, cap)); im.paste(b, (a.width + pad * 2, cap))
    d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
        fs = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
    except OSError:
        f = fs = ImageFont.load_default()
    d.text((pad, 10), title, font=f, fill=(7, 70, 132))
    d.text((pad, cap - 16), label_a, font=fs, fill=(82, 93, 125))
    d.text((a.width + pad * 2, cap - 16), label_b, font=fs, fill=(82, 93, 125))
    return im


def wait_ready(page):
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(600)


def heap_cdp(page):
    try:
        sess = page.context.new_cdp_session(page)
        sess.send('Performance.enable')
        mets = sess.send('Performance.getMetrics')['metrics']
        by = {m['name']: m['value'] for m in mets}
        return {
            'jsHeapUsedMB': round(by.get('JSHeapUsedSize', 0) / 1e6, 1),
            'jsHeapTotalMB': round(by.get('JSHeapTotalSize', 0) / 1e6, 1),
        }
    except Exception as e:
        return {'error': str(e)}


def paint_and_fire(page, glaze, cone):
    page.evaluate('__sim.clear()')
    page.evaluate('__sim.setShape("vase")')
    page.wait_for_timeout(250)
    page.evaluate(f'__sim.setCone({cone})')
    page.evaluate(f'__sim.pour("{glaze}", 0.72, "below", 0.85)')
    if glaze in ('rutile', 'seaweed'):
        page.evaluate(f'__sim.brushBand("{glaze}", 0.9, 0.7, 0.16)')
    page.evaluate(f'__sim.setSeed({SEED})')
    page.evaluate('document.getElementById("fireBtn").click()')
    page.wait_for_function('window.__sim.state === "fired"', timeout=120000)
    page.evaluate('__sim.setView(20, 12)')
    page.wait_for_timeout(400)
    return page.locator('#view').screenshot()


def run():
    httpd, url = start_server()
    print('serving', url)
    errors = []
    failed = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        page.goto(url)
        wait_ready(page)
        t_nav = page.evaluate('() => performance.timing ? (performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart) : 0')
        t_ready = page.evaluate('() => performance.now()')
        atlas = page.evaluate('() => __sim.atlas()')
        smoke = page.evaluate('() => __sim.smokeGlazes()')
        print('atlas', json.dumps(atlas))
        print('smoke', json.dumps(smoke))
        print('startup_nav_ms', t_nav, 'ready_ms', round(t_ready))
        heap0 = {'perf': atlas.get('heap'), 'cdp': heap_cdp(page)}
        print('heap_startup_desktop', json.dumps(heap0))
        if atlas.get('cpuMapsMB', 99) > 5 or atlas.get('liveMaps', 99) != 0:
            failed.append(f'startup allocated glaze maps: {atlas}')
        if smoke.get('n') != 68:
            failed.append(f'expected 68 glazes, got {smoke.get("n")}')
        if smoke.get('errors'):
            failed.append(f'smoke palette errors: {smoke["errors"][:8]}')
        picker_n = page.evaluate('() => document.querySelectorAll("button.glaze").length')
        fams = page.evaluate("() => [...document.querySelectorAll('#glazes .fam')].map(x => x.textContent)")
        print('picker', picker_n, fams)
        if picker_n != 68:
            failed.append(f'picker has {picker_n} glazes, want 68')
        if len(fams) != 6:
            failed.append(f'want 6 family groups, got {fams}')
        programs0 = page.evaluate('() => __sim.programs')
        page.evaluate('''() => {
          const ids = __sim.glazeIds();
          for (const id of ids) __sim.setGlaze(id);
        }''')
        programs1 = page.evaluate('() => __sim.programs')
        atlas_switch = page.evaluate('() => __sim.atlas()')
        print('programs before/after glaze switch', programs0, programs1, 'maps', atlas_switch.get('liveMaps'))
        if programs1 > programs0:
            failed.append(f'glaze switch recompiled shaders ({programs0} -> {programs1})')
        if atlas_switch.get('liveMaps', 99) != 0:
            failed.append(f'setGlaze allocated maps: {atlas_switch}')
        custom_click = page.evaluate('''() => {
          const t0 = performance.now();
          __sim.setShape("custom");
          return { ms: performance.now() - t0, atlas: __sim.atlas(), programs: __sim.programs };
        }''')
        print('custom_click', json.dumps(custom_click))
        if custom_click['atlas'].get('liveMaps', 99) != 0:
            failed.append(f'Custom click allocated maps: {custom_click}')
        if custom_click['programs'] > programs1:
            failed.append(f'Custom click recompiled shaders ({programs1} -> {custom_click["programs"]})')
        first_paint = page.evaluate('''() => {
          __sim.clear();
          const a = __sim.dabOnce("shino", 0.5, 0.55, 0.08, 0.7);
          const b = __sim.dabOnce("shino", 0.52, 0.55, 0.08, 0.7);
          const c = __sim.dabOnce("tenmoku", 0.48, 0.58, 0.08, 0.7);
          return { first: a, second: b, unused: c, atlas: __sim.atlas() };
        }''')
        print('first_paint', json.dumps(first_paint))
        if first_paint['first']['firstMapMs'] > 50:
            failed.append(f'first unused glaze alloc {first_paint["first"]["firstMapMs"]}ms > 50ms')
        if first_paint['unused']['firstMapMs'] > 50:
            failed.append(f'second unused glaze alloc {first_paint["unused"]["firstMapMs"]}ms > 50ms')
        six = page.evaluate('''() => {
          __sim.clear();
          const ids = ["shino","tenmoku","celadon","oatmeal","rutile","bluemidnight"];
          for (const id of ids) __sim.pour(id, 0.7, "below", 0.35);
          return __sim.atlas();
        }''')
        heap6 = {'perf': six.get('heap'), 'cdp': heap_cdp(page)}
        print('atlas_six', json.dumps(six))
        print('heap_six_desktop', json.dumps(heap6))
        if six.get('liveMaps', 0) > 6:
            failed.append(f'typical pot liveMaps {six.get("liveMaps")} > 6')
        if six.get('cpuMapsMB', 99) > 50:
            failed.append(f'typical pot cpuMapsMB {six.get("cpuMapsMB")} > 50 (6×6 MB)')
        page.evaluate('__sim.clear()')
        for cone in (6, 10):
            page.evaluate(f'__sim.setCone({cone})')
            prev = page.evaluate('() => __sim.previewFiredAll()')
            atlas_prev = page.evaluate('() => __sim.atlas()')
            print('previewFiredAll', prev, 'maps', atlas_prev.get('liveMaps'), atlas_prev.get('cpuMapsMB'))
            if prev.get('n') != 68 or prev.get('painted', 0) < 10:
                failed.append(f'previewFiredAll cone {cone} failed: {prev}')
            if atlas_prev.get('liveMaps', 0) > 0:
                failed.append(f'previewFiredAll allocated maps: {atlas_prev}')
        page.evaluate('__sim.clear(); __sim.setCone(6)')
        info = page.evaluate('''() => ({
          cone: __sim.cone,
          c6: document.querySelector('#cone [data-cone="6"]').classList.contains('active'),
          fireOn: !document.getElementById('fireBtn').disabled,
          note: document.getElementById('glazeNow').innerText,
          temps: [...document.querySelectorAll('#cone button')].map(b => b.textContent.replace(/\\s+/g,' ').trim()),
        })''')
        print('ui', info)
        if info['cone'] != 6 or not info['c6']:
            failed.append('default cone is not 6')
        if '1222' not in ' '.join(info['temps']) or '1285' not in ' '.join(info['temps']):
            failed.append(f'missing temperatures: {info["temps"]}')

        for gid in GLAZES:
            print('firing', gid, 'cone 6')
            t0 = time.time()
            png6 = paint_and_fire(page, gid, 6)
            print(f'  cone 6 in {time.time()-t0:.1f}s  note={page.evaluate("document.getElementById(\"glazeNow\").innerText")}')
            print('firing', gid, 'cone 10')
            t0 = time.time()
            png10 = paint_and_fire(page, gid, 10)
            note = page.evaluate('document.getElementById("glazeNow").innerText')
            print(f'  cone 10 in {time.time()-t0:.1f}s  note={note}')
            if gid in ('oatmeal', 'seaweed', 'rutile', 'celadon', 'palladium', 'bluemidnight') and 'Sheffield' not in note:
                failed.append(f'{gid} should cite Sheffield cone 10 ref, got {note!r}')
            a = Image.open(__import__('io').BytesIO(png6)).convert('RGB')
            b = Image.open(__import__('io').BytesIO(png10)).convert('RGB')
            from PIL import ImageChops, ImageStat
            mad = sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3
            print(f'  mean abs pixel delta cone6 vs 10: {mad:.2f}')
            if gid in ('oatmeal', 'celadon', 'bluemidnight') and mad < 1.5:
                failed.append(f'{gid}: cone 6 and 10 look the same (mad={mad:.2f})')
            title = f'{gid}  seed {SEED}'
            im = side_by_side(a, b, 'Cone 6 ~1222°C', 'Cone 10 ~1285°C', title)
            save(im, f'cone6_vs_cone10_{gid}.png')

        # estimated glaze note
        page.evaluate('__sim.setGlaze("cobalt"); __sim.setCone(10)')
        note = page.evaluate('document.getElementById("glazeNow").innerText')
        print('estimated note', note)
        if 'estimated' not in note:
            failed.append(f'cobalt should be estimated, got {note!r}')

        # mobile toggle screenshot
        ctx = browser.new_context(**pw.devices['iPhone 13'])
        m = ctx.new_page()
        m.on('console', lambda msg: msg.type == 'error' and errors.append(msg.text))
        m.goto(url, timeout=120000)
        wait_ready(m)
        phone_boot = m.evaluate('''() => ({
          ready: performance.now(),
          atlas: __sim.atlas(),
        })''')
        phone_heap = {'perf': phone_boot['atlas'].get('heap'), 'cdp': heap_cdp(m)}
        print('phone_boot', json.dumps({'ready_ms': round(phone_boot['ready']), 'atlas': phone_boot['atlas']}))
        print('heap_startup_iphone', json.dumps(phone_heap))
        if phone_boot['atlas'].get('liveMaps', 99) != 0 or phone_boot['atlas'].get('cpuMapsMB', 99) > 5:
            failed.append(f'iphone startup allocated maps: {phone_boot["atlas"]}')
        phone_six = m.evaluate('''() => {
          const ids = ["shino","tenmoku","celadon","oatmeal","rutile","bluemidnight"];
          for (const id of ids) __sim.pour(id, 0.7, "below", 0.35);
          return __sim.atlas();
        }''')
        phone_heap6 = {'perf': phone_six.get('heap'), 'cdp': heap_cdp(m)}
        print('atlas_six_iphone', json.dumps(phone_six))
        print('heap_six_iphone', json.dumps(phone_heap6))
        if phone_six.get('cpuMapsMB', 99) > 50:
            failed.append(f'iphone typical pot cpuMapsMB {phone_six.get("cpuMapsMB")}')
        m.evaluate('__sim.clear(); __sim.setCone(10); __sim.setSheet("glaze", true)')
        m.wait_for_timeout(300)
        m.screenshot(path=os.path.join(OUT, 'mobile_cone_toggle.png'), full_page=True)
        try:
            import shutil
            shutil.copy2(os.path.join(OUT, 'mobile_cone_toggle.png'), os.path.join(ART, 'mobile_cone_toggle.png'))
        except OSError:
            pass
        print('saved mobile_cone_toggle.png')
        active = m.evaluate('document.querySelector("#cone [data-cone=\\"10\\"]").classList.contains("active")')
        fire_h = m.evaluate('document.getElementById("fireBtn").getBoundingClientRect().height')
        print('mobile cone10 active', active, 'fire h', fire_h)
        if not active:
            failed.append('mobile cone 10 toggle not active')
        if fire_h < 44:
            failed.append(f'mobile fire too small ({fire_h})')
        m.close(); ctx.close()
        browser.close()
    httpd.shutdown()
    print('CONSOLE ERRORS:', errors or 'none')
    if errors:
        failed.append(f'console: {errors}')
    if failed:
        print('FAILURES:')
        for f in failed:
            print(' -', f)
        return 1
    print('ALL CHECKS PASSED')
    return 0


if __name__ == '__main__':
    sys.exit(run())
