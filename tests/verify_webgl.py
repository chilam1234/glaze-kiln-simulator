"""WebGL fallback: normal SwiftShader, disable-gpu, disable-webgl, simulated context loss.
Writes shots/webgl-*.png. No uncaught page errors.
"""
import os, shutil, sys, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

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

def save(page, name):
    dest = os.path.join(OUT, name)
    page.screenshot(path=dest, full_page=False)
    try:
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)


def collect(page, bucket):
    page.on('pageerror', lambda e: bucket.append(f'pageerror: {e}'))
    page.on('console', lambda m: bucket.append(f'{m.type}: {m.text}') if m.type == 'error' else None)


def check_errors(label, bucket):
    global fail
    print(label, 'CONSOLE ERRORS:', bucket or 'none')
    pageerrors = [e for e in bucket if e.startswith('pageerror:')]
    if label == 'context-loss':
        allow = ('CONTEXT_LOST', 'Context Lost', 'context lost')
        unexpected = [e for e in bucket if not any(a.lower() in e.lower() for a in allow)]
        pageerrors = [e for e in pageerrors if not any(a.lower() in e.lower() for a in allow)]
        print(label, 'unexpected:', unexpected or 'none')
        if pageerrors:
            fail = True
            print('FAIL: uncaught pageerror in', label, pageerrors)
        return
    if bucket:
        fail = True
        print('FAIL: unexpected errors in', label)


with sync_playwright() as pw:
    # --- normal (SwiftShader): must still render, typically reduced ---
    err = []
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=SWIFT)
    page = browser.new_page(viewport={'width': 1100, 'height': 800})
    collect(page, err)
    page.goto(url)
    page.wait_for_function('window.__sim', timeout=120000)
    st = page.evaluate('() => ({ state: __sim.state, gpu: __sim.gpu, hasCanvas: !!document.querySelector("#view canvas"), overlay: !!document.getElementById("noGpu"), note: !!(document.getElementById("gpuNote") && !document.getElementById("gpuNote").hidden) })')
    print('normal', json_dump := __import__('json').dumps(st))
    if st['state'] != 'raw' or not st['hasCanvas'] or st['overlay']:
        print('FAIL: normal mode should render a pot'); fail = True
    if not st['gpu']['ok']:
        print('FAIL: normal SwiftShader should get a WebGL2 context'); fail = True
    save(page, 'webgl-normal-reduced.png' if st['gpu'].get('reduced') else 'webgl-normal.png')
    if st['gpu'].get('reduced') or st['note']:
        save(page, 'webgl-reduced-mode.png')
    check_errors('normal', err)
    page.close(); browser.close()

    # --- --disable-gpu --disable-software-rasterizer ---
    err = []
    args = ['--disable-gpu', '--disable-software-rasterizer', '--disable-gpu-compositing']
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=args)
    page = browser.new_page(viewport={'width': 1100, 'height': 800})
    collect(page, err)
    page.goto(url)
    page.wait_for_function('window.__sim', timeout=120000)
    page.wait_for_timeout(800)
    st = page.evaluate('() => ({ state: __sim.state, gpu: __sim.gpu, overlay: !!document.getElementById("noGpu"), hasCanvas: !!document.querySelector("#view canvas"), text: (document.getElementById("noGpu")||{}).innerText || "", note: !!(document.getElementById("gpuNote") && !document.getElementById("gpuNote").hidden) })')
    print('disable-gpu', __import__('json').dumps({k: st[k] for k in st if k != 'text'}))
    if st['overlay']:
        if 'chrome://settings/system' not in st['text'] or 'Safari' not in st['text']:
            print('FAIL: overlay missing Chrome/Safari steps'); fail = True
        save(page, 'webgl-disable-gpu-fallback.png')
    elif st['gpu']['ok'] and st['hasCanvas']:
        print('disable-gpu still rendered (reduced=%s)' % st['gpu'].get('reduced'))
        save(page, 'webgl-disable-gpu-reduced.png')
    else:
        print('FAIL: disable-gpu left neither overlay nor canvas'); fail = True
    if st['state'] not in ('raw', 'nogpu'):
        print('FAIL: unexpected state', st['state']); fail = True
    check_errors('disable-gpu', err)
    page.close(); browser.close()

    # --- --disable-webgl ---
    err = []
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=['--disable-webgl', '--disable-webgl2'])
    page = browser.new_page(viewport={'width': 1100, 'height': 800})
    collect(page, err)
    page.goto(url)
    page.wait_for_function('window.__sim', timeout=120000)
    page.wait_for_timeout(600)
    st = page.evaluate('() => ({ state: __sim.state, gpu: __sim.gpu, overlay: !!document.getElementById("noGpu"), text: (document.getElementById("noGpu")||{}).innerText || "" })')
    print('disable-webgl', __import__('json').dumps({k: st[k] for k in st if k != 'text'}))
    if not st['overlay'] or st['state'] != 'nogpu' or st['gpu']['ok']:
        print('FAIL: disable-webgl should show the no-GPU overlay'); fail = True
    if 'chrome://settings/system' not in st['text'] or 'Safari' not in st['text'] or 'hardware acceleration' not in st['text'].lower():
        print('FAIL: overlay missing hardware-acceleration steps'); fail = True
        print(st['text'][:400])
    save(page, 'webgl-disable-webgl-fallback.png')
    check_errors('disable-webgl', err)
    page.close(); browser.close()

    # --- simulated context loss ---
    err = []
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=SWIFT)
    page = browser.new_page(viewport={'width': 1100, 'height': 800})
    collect(page, err)
    page.goto(url)
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(400)
    lost = page.evaluate('''() => {
      __sim.loseContext();
      return { lost: __sim.contextLost, state: __sim.state };
    }''')
    print('lost-immediate', lost)
    page.wait_for_function('__sim.contextLost === true', timeout=10000)
    lost = page.evaluate('() => ({ lost: __sim.contextLost, state: __sim.state })')
    print('lost', lost)
    page.wait_for_timeout(400)
    if not lost.get('lost'):
        print('FAIL: contextLost should be true after loseContext'); fail = True
    save(page, 'webgl-context-lost.png')
    page.evaluate('__sim.restoreContext()')
    page.wait_for_function('__sim.contextLost === false', timeout=10000)
    page.wait_for_timeout(800)
    restored = page.evaluate('() => ({ lost: __sim.contextLost, state: __sim.state, gpu: __sim.gpu })')
    print('restored', restored)
    if restored['state'] != 'raw' or restored['lost']:
        print('FAIL: restore should leave the pot usable'); fail = True
    save(page, 'webgl-context-restored.png')
    check_errors('context-loss', err)
    page.close(); browser.close()

if fail:
    sys.exit(1)
print('ALL CHECKS PASSED')
httpd.shutdown()
