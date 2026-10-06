"""Quality: Auto lite on SwiftShader, High override, idle rAF, D3D11 stays High.
FPS and drag/fire under --use-angle=swiftshader and 4× CPU throttle.
Writes shots/quality-*.png.
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
SWIFT = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-webgl']
BEFORE = {
    'swiftshader': {'fps': 7.81, 'dragPer': 1.63, 'fireWall': 3.86},
    'swiftshader-cpu4': {'fps': 4.73, 'dragPer': 6.10, 'fireWall': 4.75},
}

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

def save(page, name):
    dest = os.path.join(OUT, name)
    page.screenshot(path=dest, full_page=False)
    try:
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)

def collect(page):
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type == 'error' else None)

spec = {
    'nodes': [{'r': 0.80, 'y': 0.13}, {'r': 0.82, 'y': 0.90}, {'r': 0.825, 'y': 1.63}],
    'bulges': [{'r': 0.82, 'y': 0.48}, {'r': 0.83, 'y': 1.28}],
    'wall': 0.055, 'handle': 'c', 'handlePos': 0.14, 'handleHeight': 0.42,
    'handleWidth': 0.45, 'handleThick': 0.055, 'spout': 'none',
}

def check(ok, msg):
    global fail
    print(('OK  ' if ok else 'FAIL') + ' ' + msg)
    if not ok:
        fail = True

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=SWIFT)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    collect(page)
    page.goto(url)
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(400)

    st = page.evaluate('() => ({ state: __sim.state, gpu: __sim.gpu, quality: __sim.quality, lite: __sim.lite, banner: !!(document.getElementById("gpuNote") && !document.getElementById("gpuNote").hidden), help: (document.querySelector("#gpuNote a")||{}).href || "", qbtns: [...document.querySelectorAll("#quality button")].map(b => b.dataset.quality) })')
    print('boot', json.dumps(st))
    check(st['quality'] == 'auto', 'default quality is Auto')
    check(st['lite'] and st['gpu']['software'] and st['gpu']['lite'], 'SwiftShader Auto uses Lite')
    check(not st['gpu']['d3d11Hardware'], 'SwiftShader is not D3D11 hardware')
    check(st['banner'], 'auto-lite banner is visible')
    check('support.google.com/chrome' in st['help'], 'banner links to Chrome hardware-accel help')
    check(st['qbtns'] == ['auto', 'high', 'lite'], 'Quality toggle Auto/High/Lite')
    save(page, 'quality-auto-lite.png')

    d3d = page.evaluate('''() => {
      const d3d11 = __sim.classifyGpu("Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11-27.21.14.5671)");
      const gtx1060 = __sim.classifyGpu("Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 3GB Direct3D11 vs_5_0 ps_5_0)");
      const warp = __sim.classifyGpu("Google Inc. (Microsoft)", "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)");
      const swift = __sim.classifyGpu("Google Inc. (Google)", "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)");
      return {
        d3d11, gtx1060, warp, swift,
        autoD3d: __sim.decideQuality("auto", { ...d3d11 }),
        autoGtx: __sim.decideQuality("auto", { ...gtx1060 }),
        autoSlowD3d: __sim.decideQuality("auto", { ...d3d11 }, { fps: 28, medianDt: 36 }),
        autoFastD3d: __sim.decideQuality("auto", { ...d3d11 }, { fps: 58, medianDt: 16.7 }),
        autoWarp: __sim.decideQuality("auto", { ...warp, software: warp.software }),
        highSoft: __sim.decideQuality("high", { software: true, d3d11Hardware: false }),
      };
    }''')
    print('classify', json.dumps(d3d))
    check(d3d['d3d11']['d3d11Hardware'] and not d3d['d3d11']['software'], 'ANGLE D3D11 hardware is not software')
    check(d3d['gtx1060']['d3d11Hardware'] and not d3d['gtx1060']['software'], 'GTX 1060 ANGLE D3D11 is hardware, not software')
    check(not d3d['autoD3d']['lite'] and d3d['autoD3d']['reason'] == 'd3d11', 'Auto keeps D3D11 on High without a slow frame probe')
    check(not d3d['autoGtx']['lite'] and d3d['autoGtx']['reason'] == 'd3d11', 'Auto keeps GTX 1060 D3D11 on High without a slow frame probe')
    check(d3d['autoSlowD3d']['lite'] and d3d['autoSlowD3d']['reason'] == 'slow-frames', 'Auto steps D3D11 down to Lite when frames are slow')
    check(not d3d['autoFastD3d']['lite'] and d3d['autoFastD3d']['reason'] == 'd3d11', 'Auto keeps fast D3D11 on High')
    check(d3d['warp']['software'] or d3d['warp']['warp'], 'WARP / Basic Render Driver is software')
    check(d3d['autoWarp']['lite'], 'Auto uses Lite for WARP')
    check(d3d['swift']['software'], 'SwiftShader classified as software')
    check(not d3d['highSoft']['lite'], 'High preference stays High even on software')

    page.click('#quality button[data-quality="high"]')
    page.wait_for_timeout(300)
    hi = page.evaluate('() => ({ quality: __sim.quality, lite: __sim.lite, banner: !!(document.getElementById("gpuNote") && !document.getElementById("gpuNote").hidden) })')
    print('high', hi)
    check(hi['quality'] == 'high' and not hi['lite'], 'Quality High override on SwiftShader')
    check(not hi['banner'], 'banner hides on High')
    save(page, 'quality-high-override.png')

    sh0 = page.evaluate('() => __sim.shadowUpdates')
    page.evaluate('() => { for (let a = 0; a < 8; a++) __sim.setView(a * 25, 18, 1); }')
    page.wait_for_timeout(400)
    sh1 = page.evaluate('() => __sim.shadowUpdates')
    print('shadows-orbit', sh0, sh1)
    check(sh1 - sh0 <= 1, 'orbit does not rebuild the shadow map every frame')

    uploads_hi0 = page.evaluate('() => ({ n: __sim.uploads, bytes: __sim.uploadBytes })')
    page.evaluate('''() => {
      __sim.setTool("brush");
      for (let i = 0; i < 20; i++) __sim.brushBand("shino", 0.5 + i * 0.002, 0.4, 0.1, 0, 8);
    }''')
    page.wait_for_timeout(80)
    uploads_hi1 = page.evaluate('() => ({ n: __sim.uploads, bytes: __sim.uploadBytes })')
    print('high-uploads', uploads_hi0, uploads_hi1)
    check(uploads_hi1['n'] - uploads_hi0['n'] < 20, 'High painting does not upload once per dab')
    FULL = 1024 * 1024 * 4 * 4  # four RGBA maps
    check(uploads_hi1['bytes'] - uploads_hi0['bytes'] < FULL, 'High painting does not re-upload full glaze maps')

    page.click('#quality button[data-quality="lite"]')
    page.wait_for_timeout(300)
    lo = page.evaluate('() => ({ quality: __sim.quality, lite: __sim.lite, stored: localStorage.getItem("glaze-kiln-quality") })')
    print('lite', lo)
    check(lo['quality'] == 'lite' and lo['lite'] and lo['stored'] == 'lite', 'Lite saved in localStorage')
    save(page, 'quality-lite-toggle.png')

    page.click('#quality button[data-quality="auto"]')
    page.wait_for_timeout(200)

    page.wait_for_timeout(900)
    idle0 = page.evaluate('() => ({ drawn: __sim.framesDrawn, rafs: __sim.rafs })')
    page.wait_for_timeout(700)
    idle1 = page.evaluate('() => ({ drawn: __sim.framesDrawn, rafs: __sim.rafs })')
    print('idle', idle0, idle1)
    check(idle1['drawn'] - idle0['drawn'] <= 2, 'idle does not keep drawing every frame')
    check(idle1['rafs'] - idle0['rafs'] <= 4, 'idle does not keep a continuous rAF loop')

    page.evaluate('(s) => { __sim.setShape("custom"); __sim.setCustom(s); }', spec)
    uploads0 = page.evaluate('() => __sim.uploads')
    page.evaluate('''() => {
      __sim.setTool("brush");
      const p = __sim.screenAt(0.55, 0);
      // several dabs in one stroke should not each force a full upload
      for (let i = 0; i < 20; i++) __sim.brushBand("shino", 0.5 + i * 0.002, 0.4, 0.1, 0, 8);
    }''')
    page.wait_for_timeout(80)
    uploads1 = page.evaluate('() => __sim.uploads')
    print('uploads', uploads0, uploads1)
    check(uploads1 - uploads0 < 20, 'painting does not upload once per dab')

    fps = page.evaluate('() => __sim.measureFps(2000)')
    print('fps', fps)
    check(fps['fps'] > 12, 'lite SwiftShader FPS improved over ~8 fps continuous loop')

    drag = page.evaluate('''() => {
      const s = __sim.getCustom();
      const t0 = performance.now();
      for (let i = 0; i < 12; i++) {
        s.nodes[1].r = 0.70 + (i % 4) * 0.04;
        __sim.setCustom({ nodes: s.nodes, bulges: s.bulges }, { preview: true });
      }
      return { per: (performance.now() - t0) / 12 };
    }''')
    page.evaluate('__sim.setCustom({ handle: "none" })')
    page.evaluate('__sim.pour("shino", 0.8, "below", 0.7); __sim.setSeed(20261006); __sim.setCone(6)')
    t0 = time.time()
    page.click('#fireBtn')
    page.wait_for_function('__sim.state === "fired"', timeout=180000)
    wall = time.time() - t0
    after = {'label': 'swiftshader', 'fps': fps, 'drag': drag, 'fireWall': wall}
    print('after-1x', json.dumps(after))
    save(page, 'quality-swiftshader-fired.png')
    check(fps['fps'] > BEFORE['swiftshader']['fps'] * 1.15, 'FPS faster than pre-change continuous loop')
    check(drag['per'] < 40, 'preview drag stays cheap')

    page.close()
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    collect(page)
    sess = page.context.new_cdp_session(page)
    sess.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    page.goto(url)
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    fps4 = page.evaluate('() => __sim.measureFps(2000)')
    page.evaluate('(s) => { __sim.setShape("custom"); __sim.setCustom(s); }', spec)
    drag4 = page.evaluate('''() => {
      const s = __sim.getCustom();
      const t0 = performance.now();
      for (let i = 0; i < 12; i++) {
        s.nodes[1].r = 0.70 + (i % 4) * 0.04;
        __sim.setCustom({ nodes: s.nodes, bulges: s.bulges }, { preview: true });
      }
      return { per: (performance.now() - t0) / 12 };
    }''')
    page.evaluate('__sim.setCustom({ handle: "none" }); __sim.pour("shino", 0.8, "below", 0.7); __sim.setSeed(20261006); __sim.setCone(6)')
    t0 = time.time()
    page.click('#fireBtn')
    page.wait_for_function('__sim.state === "fired"', timeout=180000)
    wall4 = time.time() - t0
    after4 = {'label': 'swiftshader-cpu4', 'fps': fps4, 'drag': drag4, 'fireWall': wall4}
    print('after-4x', json.dumps(after4))
    save(page, 'quality-swiftshader-cpu4.png')
    check(fps4['fps'] > BEFORE['swiftshader-cpu4']['fps'] * 1.1, '4× CPU FPS improved')
    page.close()
    browser.close()

    # Hardware-WebGL Chromium (or whatever the VM GPU is) as a non-SwiftShader proxy.
    hw_browser = pw.chromium.launch(
        executable_path=CHROME, headless=True,
        args=['--ignore-gpu-blocklist', '--enable-webgl', '--use-gl=angle'],
    )
    hw = hw_browser.new_page(viewport={'width': 1280, 'height': 800})
    collect(hw)
    hw.goto(url)
    hw.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    hw.wait_for_timeout(2400)  # let Auto frame-time probe finish on real GPUs
    hw_boot = hw.evaluate('''() => ({
      gpu: __sim.gpu, quality: __sim.quality, lite: __sim.lite,
      stats: __sim.drawStats, pr: __sim.pixelRatio,
    })''')
    print('hardware-boot', json.dumps(hw_boot))
    hw_idle0 = hw.evaluate('() => ({ drawn: __sim.framesDrawn, rafs: __sim.rafs, shadows: __sim.shadowUpdates })')
    hw.wait_for_timeout(700)
    hw_idle1 = hw.evaluate('() => ({ drawn: __sim.framesDrawn, rafs: __sim.rafs, shadows: __sim.shadowUpdates })')
    print('hardware-idle', hw_idle0, hw_idle1)
    check(hw_idle1['drawn'] - hw_idle0['drawn'] <= 2, 'hardware idle does not keep drawing every frame')
    check(hw_idle1['rafs'] - hw_idle0['rafs'] <= 4, 'hardware idle does not keep a continuous rAF loop')
    check(hw_idle1['shadows'] - hw_idle0['shadows'] <= 1, 'hardware idle does not rebuild shadows')
    hw_up0 = hw.evaluate('() => ({ n: __sim.uploads, bytes: __sim.uploadBytes })')
    hw.evaluate('''() => {
      __sim.setTool("brush");
      for (let i = 0; i < 16; i++) __sim.brushBand("shino", 0.48 + i * 0.002, 0.4, 0.1, 0, 8);
    }''')
    hw.wait_for_timeout(80)
    hw_up1 = hw.evaluate('() => ({ n: __sim.uploads, bytes: __sim.uploadBytes })')
    print('hardware-uploads', hw_up0, hw_up1)
    check(hw_up1['n'] - hw_up0['n'] < 16, 'hardware painting does not upload once per dab')
    hw_fps = hw.evaluate('() => __sim.measureFps(2000)')
    print('hardware-fps', hw_fps)
    save(hw, 'quality-hardware.png')
    hw_after = {
        'label': 'hardware',
        'gpu': hw_boot.get('gpu'),
        'lite': hw_boot.get('lite'),
        'fps': hw_fps,
        'idleDrawn': hw_idle1['drawn'] - hw_idle0['drawn'],
        'idleRafs': hw_idle1['rafs'] - hw_idle0['rafs'],
        'uploads': hw_up1['n'] - hw_up0['n'],
        'uploadBytes': hw_up1['bytes'] - hw_up0['bytes'],
        'probe': (hw_boot.get('stats') or {}).get('probe'),
    }
    hw.close()
    hw_browser.close()

timings = {'before': BEFORE, 'after': {'swiftshader': after, 'swiftshader-cpu4': after4, 'hardware': hw_after}}
open(os.path.join(OUT, 'quality-timings.json'), 'w').write(json.dumps(timings, indent=2))
try:
    shutil.copy2(os.path.join(OUT, 'quality-timings.json'), os.path.join(ART, 'quality-timings.json'))
except OSError:
    pass

print('CONSOLE ERRORS:', errors or 'none')
if errors:
    fail = True
if fail:
    sys.exit(1)
print('ALL CHECKS PASSED')
httpd.shutdown()
