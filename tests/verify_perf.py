"""Fire and drag timings: desktop, iPhone 13, 4× CPU throttle.
Writes shots/perf-*.png and shots/perf-timings.json.
"""
import json, os, shutil, sys, threading, time
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
BEFORE = {
    'desktop': {'dragPer': 1040.8, 'fireWall': 8.092, 'fireMs': 2976.8},
    'iphone': {'dragPer': 1000.9, 'fireWall': 7.438, 'fireMs': 2962.4},
    'desktop-cpu4': {'dragPer': 4377.4, 'fireWall': 8.930, 'fireMs': 3266.5},
    'iphone-cpu4': {'dragPer': 4253.6, 'fireWall': 8.303, 'fireMs': 3352.4},
}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def log_message(self, fmt, *args):
        pass

httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{httpd.server_address[1]}/'

spec = {
    'nodes': [{'r': 0.80, 'y': 0.13}, {'r': 0.82, 'y': 0.90}, {'r': 0.825, 'y': 1.63}],
    'bulges': [{'r': 0.82, 'y': 0.48}, {'r': 0.83, 'y': 1.28}],
    'wall': 0.055, 'handle': 'c', 'handlePos': 0.14, 'handleHeight': 0.42,
    'handleWidth': 0.45, 'handleThick': 0.055, 'spout': 'teapot', 'spoutSize': 1,
    'spoutY': 0.5, 'spoutMouth': 1,
}

errors = []

def save(page, name):
    dest = os.path.join(OUT, name)
    page.screenshot(path=dest, full_page=False)
    try:
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)


def measure(page, label, cpu):
    if cpu and cpu > 1:
        sess = page.context.new_cdp_session(page)
        sess.send('Emulation.setCPUThrottlingRate', {'rate': cpu})
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    gpu = page.evaluate('() => __sim.gpu')
    page.evaluate('(s) => { __sim.setShape("custom"); __sim.setCustom(s); }', spec)
    page.wait_for_timeout(150)
    page.evaluate('''() => {
      const s = __sim.getCustom();
      for (let i = 0; i < 4; i++) {
        s.nodes[1].r = 0.70 + (i % 4) * 0.04;
        __sim.setCustom({ nodes: s.nodes, bulges: s.bulges }, { preview: true });
      }
    }''')
    drag = page.evaluate('''() => {
      const s = __sim.getCustom();
      const t0 = performance.now();
      let n = 0, last = 0;
      for (let i = 0; i < 12; i++) {
        s.nodes[1].r = 0.70 + (i % 4) * 0.04;
        __sim.setCustom({ nodes: s.nodes, bulges: s.bulges }, { preview: true });
        last = __sim.lastBuildMs;
        n++;
      }
      const ms = performance.now() - t0;
      return { ms, n, per: ms / n, lastBuildMs: last };
    }''')
    full = page.evaluate('''() => {
      const s = __sim.getCustom();
      const t0 = performance.now();
      s.nodes[1].r = 0.78;
      __sim.setCustom({ nodes: s.nodes, bulges: s.bulges });
      return { ms: performance.now() - t0, lastBuildMs: __sim.lastBuildMs };
    }''')
    page.evaluate('__sim.setCustom({ handle: "none", spout: "none" })')
    page.evaluate('__sim.pour("shino", 0.8, "below", 0.7)')
    page.evaluate('__sim.setSeed(20260929); __sim.setCone(6)')
    t0 = time.time()
    page.click('#fireBtn')
    page.wait_for_function('__sim.state === "fired"', timeout=180000)
    wall = time.time() - t0
    sim = page.evaluate('() => ({ fireMs: __sim.fireMs, composeMs: __sim.composeMs, fireWallMs: __sim.fireWallMs, engine: __sim.engine, pixelRatio: __sim.pixelRatio })')
    out = {'label': label, 'cpu': cpu, 'gpu': gpu, 'drag': drag, 'full': full, 'fireWall': wall, **sim}
    print(json.dumps(out))
    return out


results = []
fail = False
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    page.goto(url)
    results.append(measure(page, 'desktop', 1))
    save(page, 'perf-desktop-fired.png')
    page.close()

    ctx = browser.new_context(**pw.devices['iPhone 13'])
    m = ctx.new_page()
    m.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    m.goto(url)
    results.append(measure(m, 'iphone', 1))
    save(m, 'perf-iphone-fired.png')
    m.close(); ctx.close()

    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(url)
    results.append(measure(page, 'desktop-cpu4', 4))
    save(page, 'perf-desktop-cpu4.png')
    page.close()

    ctx = browser.new_context(**pw.devices['iPhone 13'])
    m = ctx.new_page()
    m.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    m.goto(url)
    results.append(measure(m, 'iphone-cpu4', 4))
    save(m, 'perf-iphone-cpu4.png')
    m.close(); ctx.close()
    browser.close()

for row in results:
    b = BEFORE[row['label']]
    row['before'] = b
    row['dragSpeedup'] = b['dragPer'] / max(0.001, row['drag']['per'])
    row['fireSpeedup'] = b['fireWall'] / max(0.001, row['fireWall'])
    print('%s: drag %.1fms/rebuild (was %.0f, %.1fx)  fire wall %.2fs (was %.2fs, %.1fx)  fireMs %.0f (was %.0f)' % (
        row['label'], row['drag']['per'], b['dragPer'], row['dragSpeedup'],
        row['fireWall'], b['fireWall'], row['fireSpeedup'],
        row['fireMs'], b['fireMs']))
    if row['drag']['per'] > b['dragPer'] * 0.85:
        print('FAIL: drag did not speed up on', row['label']); fail = True
    if row['fireWall'] > b['fireWall'] * 0.92:
        print('FAIL: fire wall-clock did not speed up on', row['label']); fail = True
    if row['label'] in ('desktop', 'iphone') and row['drag']['per'] > 80:
        print('WARN: preview rebuild', row['drag']['per'], 'ms — target ~16ms for 60fps; still much faster than full mesh')

open(os.path.join(OUT, 'perf-timings.json'), 'w').write(json.dumps({'before': BEFORE, 'after': results}, indent=2))
try:
    shutil.copy2(os.path.join(OUT, 'perf-timings.json'), os.path.join(ART, 'perf-timings.json'))
except OSError:
    pass

print('CONSOLE ERRORS:', errors or 'none')
if errors:
    fail = True
if fail:
    sys.exit(1)
print('ALL CHECKS PASSED')
httpd.shutdown()
