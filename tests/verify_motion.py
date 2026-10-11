"""Light check: reduced-motion CSS, interactive transitions, phone drawer chrome.
Writes shots/mobile_motion_after_*.png and sheet/chip frames.
Usage: python3 tests/verify_motion.py
"""
import os, re, shutil, sys, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.stdout.reconfigure(line_buffering=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
CSS = os.path.join(ROOT, 'css', 'style.css')
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


css = open(CSS, encoding='utf-8').read()
check('prefers-reduced-motion: reduce' in css, 'prefers-reduced-motion: reduce is declared')
check('@keyframes sheetRise' in css, 'sheet expand uses sheetRise keyframes')
check('scale(0.98)' in css, 'control press uses scale(0.98)')
check('scale(0.97)' in css, 'Fire press uses scale(0.97)')
check('.glaze.active .sw' in css and 'scale(1.08)' in css, 'selected glaze chip scales the swatch')
check('transform: scaleX(0)' in css and 'scaleX(1)' in css, 'tab/mode underline uses scaleX')
check('--motion: 180ms' in css and '--motion-sheet: 240ms' in css, 'motion tokens sit in 150–280ms')
check('transition:' in css and 'transform var(--motion)' in css, 'interactive elements declare transform transitions')
check('animation: sheetRise' in css, 'open pot/tool/glaze sheets play sheetRise')
check('body:not(.sheet-collapsed)[data-sheet="pot"] .build-stamp' in css, 'open pot sheet hides the build stamp')

durations = [int(m) for m in re.findall(r'--motion(?:-sheet)?:\s*(\d+)ms', css)]
check(durations and all(150 <= d <= 280 for d in durations),
      f'motion token durations are 150–280ms ({durations})')
check('from { opacity: 0; transform: translateY(14px); }' in css,
      'sheetRise animates opacity and translateY, not height')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, fmt, *args):
        pass


httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{httpd.server_address[1]}/'


def wait_ready(page):
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(400)


PROBE = '''() => {
  const btn = document.querySelector('.mobile-tabs button[data-sheet="pot"]');
  const fire = document.getElementById('fireBtn');
  const chip = [...document.querySelectorAll('button.glaze')].find(b => {
    const r = b.getBoundingClientRect();
    return r.height > 8 && getComputedStyle(b).display !== 'none';
  });
  const fold = document.getElementById('foldBtn');
  const fam = document.querySelector('.glaze-fams button');
  const stamp = document.getElementById('buildStamp');
  const cs = (el) => el ? getComputedStyle(el) : null;
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, y: r.y, b: r.bottom, vis: r.height > 0 && getComputedStyle(el).display !== 'none' };
  };
  return {
    sheet: document.body.dataset.sheet,
    collapsed: document.body.classList.contains('sheet-collapsed'),
    tabH: box(btn),
    fireH: box(fire),
    foldH: box(fold),
    famH: box(fam),
    chipH: box(chip),
    stampVis: stamp ? getComputedStyle(stamp).display !== 'none' : false,
    tabTransition: cs(btn) && cs(btn).transitionProperty,
    fireTransition: cs(fire) && cs(fire).transitionProperty,
    chipSwTransform: (() => {
      const sw = document.querySelector('.glaze.active .sw');
      return sw ? getComputedStyle(sw).transform : '';
    })(),
    sheetAnim: cs(document.getElementById('sheet')).animationName,
  };
}'''


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    ctx = browser.new_context(
        viewport={'width': 390, 'height': 844},
        device_scale_factor=3,
        is_mobile=True,
        has_touch=True,
        user_agent=('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) '
                    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'),
    )
    page = ctx.new_page()
    page.goto(url, timeout=120000)
    wait_ready(page)

    page.evaluate('__sim.setSheet("pot", false)')
    page.wait_for_timeout(280)
    pot = page.evaluate(PROBE)
    print('pot', pot)
    check(pot['tabH'] and pot['tabH']['h'] >= 40, f'Pot tab is 40px-class ({pot["tabH"]})')
    check(pot['foldH'] and pot['foldH']['h'] >= 44, f'Fold is 44px ({pot["foldH"]})')
    check(not pot['stampVis'], 'open pot sheet hides the build stamp')
    check(pot['tabTransition'] and 'transform' in pot['tabTransition'],
          f'tabs transition transform ({pot["tabTransition"]})')
    check(pot['fireTransition'] and 'transform' in pot['fireTransition'],
          f'Fire transitions transform ({pot["fireTransition"]})')
    save(page, 'mobile_motion_after_pot.png')

    page.evaluate('__sim.setSheet("pot", true)')
    page.wait_for_timeout(80)
    save(page, 'mobile_motion_sheet_collapsed.png')
    page.evaluate('__sim.setSheet("pot", false)')
    page.wait_for_timeout(80)
    save(page, 'mobile_motion_sheet_80ms.png')
    page.wait_for_timeout(200)
    save(page, 'mobile_motion_sheet_280ms.png')

    page.evaluate('__sim.setSheet("glaze", false)')
    page.wait_for_timeout(80)
    save(page, 'mobile_motion_glaze_80ms.png')
    page.wait_for_timeout(200)
    glaze = page.evaluate(PROBE)
    print('glaze', glaze)
    check(glaze['famH'] and glaze['famH']['h'] >= 36, f'glaze family hits are 36px+ ({glaze["famH"]})')
    check(glaze['chipH'] and glaze['chipH']['h'] >= 40, f'glaze chips are 40px+ ({glaze["chipH"]})')
    save(page, 'mobile_motion_after_glaze.png')

    loc = page.locator('button.glaze[data-glaze="tenmoku"]').first
    loc.scroll_into_view_if_needed()
    page.wait_for_timeout(80)
    save(page, 'mobile_motion_chip_before.png')
    loc.tap()
    page.wait_for_timeout(200)
    selected = page.evaluate(PROBE)
    check('matrix' in (selected.get('chipSwTransform') or '') or 'scale' in (selected.get('chipSwTransform') or ''),
          f'selected chip swatch is transformed ({selected.get("chipSwTransform")})')
    save(page, 'mobile_motion_chip_after.png')

    page.emulate_media(reduced_motion='reduce')
    page.reload(timeout=120000)
    wait_ready(page)
    page.evaluate('__sim.setSheet("pot", false)')
    page.wait_for_timeout(80)
    reduced = page.evaluate('''() => {
      const btn = document.querySelector('.mobile-tabs button');
      const sheet = document.getElementById('sheet');
      const cs = getComputedStyle(btn);
      const sc = getComputedStyle(sheet);
      const parse = (s) => {
        let max = 0;
        for (const part of String(s).split(',')) {
          const t = part.trim();
          const n = parseFloat(t);
          if (!Number.isFinite(n)) continue;
          const ms = /ms$/i.test(t) ? n : n * 1000;
          if (ms > max) max = ms;
        }
        return max;
      };
      return {
        trans: cs.transitionDuration,
        anim: sc.animationDuration,
        transMs: parse(cs.transitionDuration),
        animMs: parse(sc.animationDuration),
      };
    }''')
    print('reduced', reduced)
    # 0.01ms token, or browser-normalized near-zero.
    check(reduced['transMs'] < 30 and reduced['animMs'] < 30,
          f'reduced-motion collapses durations ({reduced})')
    save(page, 'mobile_motion_reduced.png')

    page.close()
    ctx.close()
    browser.close()

httpd.shutdown()
if fail:
    print('FAILURES')
    raise SystemExit(1)
print('ALL CHECKS PASSED')
