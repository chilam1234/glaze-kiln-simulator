"""Phone glaze-chip tap: WebKit iPhone 13 and Chromium iPhone 13.
Taps several chips in the mobile Glaze sheet and checks selection + paint color.
Writes shots/glaze-tap-*.png.
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

def check(ok, msg):
    global fail
    print(('OK  ' if ok else 'FAIL') + ' ' + msg)
    if not ok:
        fail = True

def save(page, name):
    dest = os.path.join(OUT, name)
    page.screenshot(path=dest, full_page=True)
    try:
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)
    return dest

PROBE = '''(id) => {
  const btn = document.querySelector(`button.glaze[data-glaze="${id}"]`);
  const fire = document.getElementById('fireBtn');
  const unfire = document.getElementById('unfireBtn');
  if (!btn) return { missing: true };
  const r = btn.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  const stack = document.elementsFromPoint(x, y).slice(0, 6).map(el => el.id || el.className || el.tagName);
  const fireR = fire.getBoundingClientRect();
  const unfireR = unfire.getBoundingClientRect();
  const covered = stack.some(s => s === 'fireBtn' || s === 'unfireBtn' || s === 'undoBtn' || s === 'clearBtn' || s === 'sheet');
  const onChip = !!(hit && (hit === btn || btn.contains(hit)));
  return {
    glaze: (document.querySelector('.glaze.active') || {}).dataset?.glaze || null,
    sheet: document.body.dataset.sheet,
    collapsed: document.body.classList.contains('sheet-collapsed'),
    chipsOpen: document.querySelector('.glaze-chips')?.open,
    famOpen: btn.closest('details')?.open,
    box: { x: r.x, y: r.y, w: r.width, h: r.height },
    hit: hit ? { id: hit.id, tag: hit.tagName, glaze: hit.dataset?.glaze } : null,
    stack,
    covered,
    onChip,
    fireY: fireR.y,
    unfireY: unfireR.y,
    belowKiln: r.bottom > fireR.top + 2 && r.top < unfireR.bottom,
  };
}'''

def tap_chip(page, glaze_id):
    loc = page.locator(f'button.glaze[data-glaze="{glaze_id}"]')
    loc.first.scroll_into_view_if_needed()
    page.wait_for_timeout(120)
    box = loc.first.bounding_box()
    if not box:
        return None
    page.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.wait_for_timeout(200)
    return page.evaluate(PROBE, glaze_id)

def run_phone(pw, engine, device_name='iPhone 13'):
    print(f'\n== {engine} {device_name} ==')
    if engine == 'webkit':
        browser = pw.webkit.launch(headless=True)
    else:
        browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=SWIFT)
    ctx = browser.new_context(**pw.devices[device_name])
    page = ctx.new_page()
    page.on('pageerror', lambda e: check(False, f'{engine} pageerror: {e}'))
    page.goto(url)
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(400)
    page.evaluate('() => __sim.setSheet("glaze", false)')
    page.wait_for_timeout(250)

    start = page.evaluate('() => ({ glaze: (document.querySelector(".glaze.active")||{}).dataset?.glaze, sheet: __sim.sheet, mobile: __sim.mobile })')
    print('start', start)
    check(start['mobile'] and start['sheet'] == 'glaze', f'{engine} opened the phone Glaze sheet')

    first = page.evaluate(PROBE, 'tenmoku')
    print('tenmoku hit', json.dumps(first))
    check(first.get('box', {}).get('h', 0) >= 40, f'{engine} tenmoku chip is tappable height')
    check(not first.get('covered') and first.get('onChip'),
          f'{engine} tenmoku chip is hittable, not under Fire/Unfire/sheet ({first.get("stack")})')

    save(page, f'glaze-tap-{engine}-sheet.png')

    picks = ['celadon', 'junebug', 'oatmeal', 'ancientcopper']
    last = None
    for gid in picks:
        # Family tabs first so the chip is in the visible family.
        page.evaluate('''(id) => {
          const g = __sim.glazeIri ? null : null;
          const b = document.querySelector(`button.glaze[data-glaze="${id}"]`);
          const fam = b && b.dataset.fam;
          if (fam) {
            const tab = document.querySelector(`#glazeFams button[data-fam="${fam}"]`);
            if (tab) tab.click();
          }
        }''', gid)
        page.wait_for_timeout(80)
        info = tap_chip(page, gid)
        print('tap', gid, json.dumps({k: info.get(k) for k in ('glaze', 'covered', 'hit', 'chipsOpen', 'famOpen')} if info else {}))
        check(info and info.get('glaze') == gid, f'{engine} tap {gid} selects that glaze (got {info and info.get("glaze")})')
        check(info and info.get('chipsOpen') and info.get('famOpen'), f'{engine} tap {gid} does not collapse the chip list')
        check(info and not info.get('covered'), f'{engine} {gid} stays clear of the kiln bar')
        last = gid

    active = page.evaluate('() => (document.querySelector(".glaze.active")||{}).dataset?.glaze')
    check(active == last, f'{engine} active chip stays {last}')

    # Paint with the last selected glaze — not via setGlaze, so we prove the tap stuck.
    page.evaluate('() => { __sim.setTool("brush"); __sim.setBrushSize(0.16); __sim.setView(20, 12); }')
    page.wait_for_timeout(200)
    before = dict(page.evaluate('() => __sim.stats()')).get(last, 0)
    # UV brush using the currently selected glaze (active chip), not an explicit id.
    # stats() is [[id, amt], ...]; Object.fromEntries so we can read by glaze id.
    painted = page.evaluate('''() => {
      const id = (document.querySelector('.glaze.active')||{}).dataset?.glaze;
      __sim.brushBand(id, 0.55, 0.6, 0.14);
      const stats = Object.fromEntries(__sim.stats() || []);
      return { id, after: stats[id] };
    }''')
    print('paint', painted, 'before', before)
    check(painted['id'] == last, f'{engine} paint uses the tapped glaze {last}')
    check((painted.get('after') or 0) > (before or 0) + 1e-4, f'{engine} stroke laid {last} on the pot')

    save(page, f'glaze-tap-{engine}-after.png')

    # Phone Pot / Handle / Spout / Foot subtabs still switch groups.
    page.evaluate('() => { __sim.setShape("custom"); __sim.setSheet("pot", false); }')
    page.wait_for_timeout(200)
    for group in ('pot', 'handle', 'spout', 'foot'):
        loc = page.locator(f'#shapeSubtabs button[data-group="{group}"]')
        loc.first.scroll_into_view_if_needed()
        box = loc.first.bounding_box()
        check(bool(box), f'{engine} {group} tab has a box')
        if box:
            page.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
            page.wait_for_timeout(120)
        info = page.evaluate('() => ({ group: __sim.shapeGroup, active: document.querySelector("#shapeSubtabs button.active")?.dataset?.group })')
        check(info.get('group') == group and info.get('active') == group,
              f'{engine} tap {group} tab selects that shape group (got {info})')

    browser.close()

with sync_playwright() as pw:
    run_phone(pw, 'webkit')
    run_phone(pw, 'chromium')

print('FAIL' if fail else 'PASS')
sys.exit(1 if fail else 0)
