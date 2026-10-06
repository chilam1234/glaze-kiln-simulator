"""Step timings for Custom click and post-drag full rebuild.
SwiftShader and 4× CPU throttle as proxies. Writes shots/custom-build-timings.json.
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
BEFORE = {
    'desktop': {'clickSync': 1043.4, 'fullSync': 1029.5, 'fullPainted': 1164.6},
    'desktop-cpu4': {'clickSync': 4240.2, 'fullSync': 4197.0, 'fullPainted': 4442.3},
    'desktop-high': {'clickSync': 1130.1, 'fullSync': 1089.2, 'fullPainted': 1130.0},
    'desktop-high-cpu4': {'clickSync': 4240.2, 'fullSync': 4197.0, 'fullPainted': 4442.3},
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def log_message(self, fmt, *args):
        pass


httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{httpd.server_address[1]}/'
errors = []

MEASURE = '''() => {
  const out = {};
  out.gpu = __sim.gpu;
  out.lite = __sim.lite;
  const tClick0 = performance.now();
  __sim.setShape("custom");
  const clickSync = performance.now() - tClick0;
  out.click = { syncMs: clickSync, lastBuildMs: __sim.lastBuildMs, timings: __sim.timings && JSON.parse(JSON.stringify(__sim.timings)), previewing: __sim.previewing };
  const flush = __sim.flushBuild ? __sim.flushBuild() : null;
  out.click.flushMs = flush && flush.total;
  out.click.afterFlush = __sim.timings && JSON.parse(JSON.stringify(__sim.timings));
  out.click.previewingAfter = __sim.previewing;
  const s = __sim.getCustom();
  const tPrev0 = performance.now();
  for (let i = 0; i < 8; i++) {
    s.nodes[1].r = 0.70 + (i % 4) * 0.04;
    __sim.setCustom({ nodes: s.nodes, bulges: s.bulges }, { preview: true });
  }
  out.previewPer = (performance.now() - tPrev0) / 8;
  s.nodes[1].r = 0.78;
  const tFull0 = performance.now();
  __sim.setCustom({ nodes: s.nodes, bulges: s.bulges });
  out.full = {
    syncMs: performance.now() - tFull0,
    lastBuildMs: __sim.lastBuildMs,
    timings: __sim.timings && JSON.parse(JSON.stringify(__sim.timings)),
  };
  __sim.pour("shino", 0.8, "below", 0.7);
  s.nodes[1].r = 0.74;
  const tPaint0 = performance.now();
  __sim.setCustom({ nodes: s.nodes, bulges: s.bulges });
  out.fullPainted = {
    syncMs: performance.now() - tPaint0,
    lastBuildMs: __sim.lastBuildMs,
    timings: __sim.timings && JSON.parse(JSON.stringify(__sim.timings)),
  };
  return out;
}'''


def run(page, label, cpu, quality=None):
    if cpu and cpu > 1:
        sess = page.context.new_cdp_session(page)
        sess.send('Emulation.setCPUThrottlingRate', {'rate': cpu})
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    if quality:
        page.evaluate('(q) => __sim.setQuality(q)', quality)
        page.wait_for_timeout(200)
    page.wait_for_timeout(250)
    row = page.evaluate(MEASURE)
    row['label'] = label
    row['cpu'] = cpu
    print(json.dumps(row, indent=2))
    return row


results = []
fail = False
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    page.goto(url)
    results.append(run(page, 'desktop', 1))
    page.screenshot(path=os.path.join(OUT, 'custom-build-desktop.png'))
    try:
        shutil.copy2(os.path.join(OUT, 'custom-build-desktop.png'), os.path.join(ART, 'custom-build-desktop.png'))
    except OSError:
        pass
    page.close()

    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(url)
    results.append(run(page, 'desktop-high', 1, 'high'))
    page.screenshot(path=os.path.join(OUT, 'custom-build-high.png'))
    try:
        shutil.copy2(os.path.join(OUT, 'custom-build-high.png'), os.path.join(ART, 'custom-build-high.png'))
    except OSError:
        pass
    page.close()

    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(url)
    results.append(run(page, 'desktop-cpu4', 4))
    page.screenshot(path=os.path.join(OUT, 'custom-build-cpu4.png'))
    try:
        shutil.copy2(os.path.join(OUT, 'custom-build-cpu4.png'), os.path.join(ART, 'custom-build-cpu4.png'))
    except OSError:
        pass
    page.close()
    browser.close()

dest = os.path.join(OUT, 'custom-build-timings.json')
open(dest, 'w').write(json.dumps({'before': BEFORE, 'after': results}, indent=2))
try:
    shutil.copy2(dest, os.path.join(ART, 'custom-build-timings.json'))
except OSError:
    pass

print('CONSOLE ERRORS:', errors or 'none')
if errors:
    fail = True
for row in results:
    b = BEFORE.get(row['label'])
    if b:
        print('%s: click %.1fms (was %.0f)  full %.1fms (was %.0f)  painted %.1fms (was %.0f)' % (
            row['label'], row['click']['syncMs'], b['clickSync'],
            row['full']['syncMs'], b['fullSync'],
            row['fullPainted']['syncMs'], b['fullPainted']))
    if row['label'] in ('desktop', 'desktop-high'):
        if row['click']['syncMs'] > 150:
            print('FAIL: Custom click blocked', round(row['click']['syncMs'], 1), 'ms'); fail = True
        if row['full']['syncMs'] > 150:
            print('FAIL: post-drag full rebuild blocked', round(row['full']['syncMs'], 1), 'ms'); fail = True
if fail:
    sys.exit(1)
print('ALL CHECKS PASSED')
httpd.shutdown()
