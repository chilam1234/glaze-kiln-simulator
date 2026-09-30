"""Playwright: custom pot shape can be set, dragged, given extra profile nodes, a handle and spout, painted, and fired at cone 6 and 10.
Writes shots/custom-*.png. Usage: python3 tests/verify_custom.py
"""
import json, os, sys, threading, time
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
SEED = 20260929


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def log_message(self, fmt, *args):
        pass


def start_server():
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{httpd.server_address[1]}/'


def save(page, name, full=True):
    dest = os.path.join(OUT, name)
    if full:
        page.screenshot(path=dest, full_page=True)
    else:
        page.locator('#view').screenshot(path=dest)
    try:
        import shutil
        shutil.copy2(dest, os.path.join(ART, name))
    except OSError:
        pass
    print('saved', dest)
    return dest


def fail(msg):
    print('FAIL:', msg)
    raise SystemExit(1)


def wait_ready(page):
    page.wait_for_function('window.__sim && window.__sim.state === "raw"', timeout=120000)
    page.wait_for_timeout(400)


def wide_bowl():
    return {
        'nodes': [{'r': 0.62, 'y': 0.13}, {'r': 1.15, 'y': 0.48}, {'r': 1.22, 'y': 0.92}],
        'bulges': [{'r': 0.88, 'y': 0.28}, {'r': 1.28, 'y': 0.70}],
        'wall': 0.055,
        'handle': 'c',
        'handlePos': 0.12,
        'handleHeight': 0.42,
        'handleWidth': 0.42,
        'handleThick': 0.05,
        'spout': 'lip',
        'spoutSize': 1,
        'spoutY': 0.5,
        'spoutMouth': 1,
    }


def tall_cylinder():
    # ~16.3 cm tall, ~16.5 cm rim — matches the phone screenshot pot
    return {
        'nodes': [
            {'r': 0.55, 'y': 0.13},
            {'r': 0.80, 'y': 0.48},
            {'r': 0.82, 'y': 0.90},
            {'r': 0.825, 'y': 1.28},
            {'r': 0.825, 'y': 1.63},
        ],
        'bulges': [
            {'r': 0.70, 'y': 0.28},
            {'r': 0.82, 'y': 0.68},
            {'r': 0.83, 'y': 1.08},
            {'r': 0.825, 'y': 1.46},
        ],
        'wall': 0.055,
        'handle': 'none',
        'handlePos': 0.14,
        'handleHeight': 0.42,
        'handleWidth': 0.45,
        'handleThick': 0.055,
        'spout': 'teapot',
        'spoutSize': 1,
        'spoutY': 0.5,
        'spoutMouth': 1,
    }


def cdp(page):
    sess = getattr(page, '_cdp', None)
    if sess is None:
        sess = page.context.new_cdp_session(page)
        page._cdp = sess
    return sess


def cdp_drag(page, pts, pid=0):
    s = cdp(page)
    s.send('Input.dispatchTouchEvent', {
        'type': 'touchStart',
        'touchPoints': [{'x': pts[0]['x'], 'y': pts[0]['y'], 'id': pid, 'radiusX': 16, 'radiusY': 16, 'force': 0.5}],
    })
    for p in pts[1:]:
        s.send('Input.dispatchTouchEvent', {
            'type': 'touchMove',
            'touchPoints': [{'x': p['x'], 'y': p['y'], 'id': pid, 'radiusX': 16, 'radiusY': 16, 'force': 0.5}],
        })
    s.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})


def cdp_tap(page, pt, pid=0):
    cdp_drag(page, [pt], pid=pid)


def cdp_two_finger(page, a0, a1, b0, b1, steps=10):
    s = cdp(page)
    def pack(a, b):
        return [
            {'x': a['x'], 'y': a['y'], 'id': 0, 'radiusX': 14, 'radiusY': 14, 'force': 0.5},
            {'x': b['x'], 'y': b['y'], 'id': 1, 'radiusX': 14, 'radiusY': 14, 'force': 0.5},
        ]
    s.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': pack(a0, b0)})
    for k in range(1, steps + 1):
        t = k / steps
        a = {'x': a0['x'] + (a1['x'] - a0['x']) * t, 'y': a0['y'] + (a1['y'] - a0['y']) * t}
        b = {'x': b0['x'] + (b1['x'] - b0['x']) * t, 'y': b0['y'] + (b1['y'] - b0['y']) * t}
        s.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': pack(a, b)})
    s.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})


def run():
    failed, errors = [], []
    httpd, url = start_server()
    print('serving', url)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        page.goto(url)
        wait_ready(page)

        page.click('button[data-shape="bowl"]')
        page.wait_for_timeout(400)
        page.click('button[data-shape="custom"]')
        page.wait_for_timeout(600)
        spec = page.evaluate('() => __sim.getCustom()')
        if not spec or len(spec['nodes']) < 2:
            fail(f'custom spec missing after click: {spec}')
        dims0 = page.evaluate('() => __sim.getDims()')
        print('extracted from bowl', json.dumps({k: round(dims0[k], 2) if isinstance(dims0[k], float) else dims0[k] for k in dims0}))
        if dims0['ml'] <= 0:
            fail('capacity should be positive')

        giz = page.evaluate('() => !!__sim.gizmoScreen("node", -1)')
        if not giz:
            fail('rim gizmo has no screen position')

        max_mid = page.evaluate('() => __sim.maxMid')
        print('maxMid', max_mid)
        if max_mid < 12:
            failed.append(f'MAX_MID should be >= 12, got {max_mid}')
        rim_max = page.evaluate('() => __sim.getLimits().rimR[1]')
        if rim_max < 2.5:
            failed.append(f'rimR max too small: {rim_max}')
        slider_max = page.evaluate('() => +document.getElementById("customRim").max')
        if slider_max < 50:
            failed.append(f'rim slider max too small: {slider_max}')

        # mouse-drag the rim node outward
        rim0 = spec['nodes'][-1]['r']
        pt = page.evaluate('() => __sim.gizmoScreen("node", -1)')
        page.mouse.move(pt['x'], pt['y'])
        page.mouse.down()
        page.mouse.move(pt['x'] + 55, pt['y'] - 8, steps=8)
        page.mouse.up()
        page.wait_for_timeout(400)
        rim1 = page.evaluate('() => __sim.getCustom().nodes.at(-1).r')
        print(f'rim drag {rim0:.3f} -> {rim1:.3f}')
        if abs(rim1 - rim0) < 0.01:
            failed.append('dragging rim node did not change radius')

        # live status during a drag (must update before pointerup)
        page.evaluate('(s) => __sim.setCustom(s)', tall_cylinder())
        page.wait_for_timeout(250)
        page.evaluate('__sim.setView(25, 18)')
        page.wait_for_timeout(200)
        ml_before = page.evaluate('() => Math.round(__sim.getDims().ml)')
        pt = page.evaluate('() => __sim.gizmoScreen("node", -1)')
        page.mouse.move(pt['x'], pt['y'])
        page.mouse.down()
        page.mouse.move(pt['x'] + 90, pt['y'], steps=10)
        live = page.evaluate('''() => ({
          status: document.getElementById('status').textContent,
          ml: Math.round(__sim.getDims().ml),
        })''')
        page.mouse.up()
        page.wait_for_timeout(200)
        print(f'live status during drag: {live} (ml before {ml_before})')
        if str(live['ml']) not in live['status']:
            failed.append(f'status lagged during drag: {live["status"]!r} vs {live["ml"]} ml')
        if live['ml'] == ml_before:
            failed.append('tall-pot rim drag did not change capacity')

        # rim on a tall pot can open well past a narrow mouth
        page.evaluate('(s) => __sim.setCustom(s)', tall_cylinder())
        page.wait_for_timeout(200)
        r_tall0 = page.evaluate('() => __sim.getCustom().nodes.at(-1).r')
        pt = page.evaluate('() => __sim.gizmoScreen("node", -1)')
        page.mouse.move(pt['x'], pt['y'])
        page.mouse.down()
        page.mouse.move(pt['x'] + 140, pt['y'] + 2, steps=12)
        page.mouse.up()
        page.wait_for_timeout(300)
        r_tall1 = page.evaluate('() => __sim.getCustom().nodes.at(-1).r')
        h_tall = page.evaluate('() => __sim.getCustom().nodes.at(-1).y')
        print(f'tall rim {r_tall0:.3f} -> {r_tall1:.3f} at h={h_tall:.3f}')
        if r_tall1 < r_tall0 + 0.15:
            failed.append(f'tall pot mouth did not open freely {r_tall0:.3f}->{r_tall1:.3f}')
        if r_tall1 > 2.7 + 1e-6:
            failed.append(f'rim exceeded LIMITS.rimR {r_tall1}')
        save(page, 'custom-wide-mouth.png')

        # add nodes up to MAX_MID, including outline click
        page.evaluate('(s) => __sim.setCustom(s)', wide_bowl())
        page.wait_for_timeout(250)
        page.evaluate('__sim.setView(25, 18)')
        page.wait_for_timeout(200)
        n0 = page.evaluate('() => __sim.getCustom().nodes.length')
        pt_out = page.evaluate('() => __sim.outlineTapTarget()')
        print('outline tap target', pt_out)
        if not pt_out or pt_out.get('clear', 0) < 12:
            failed.append(f'no clear outline tap target: {pt_out}')
        else:
            page.mouse.click(pt_out['x'], pt_out['y'])
            page.wait_for_timeout(300)
            n1 = page.evaluate('() => __sim.getCustom().nodes.length')
            print(f'outline click nodes {n0} -> {n1}')
            if n1 != n0 + 1:
                failed.append(f'outline click did not add a node {n0}->{n1}')
        # fill to the cap
        added = 0
        while page.evaluate('() => __sim.getCustom().nodes.length < 2 + __sim.maxMid'):
            ok = page.evaluate('() => __sim.addNode()')
            if not ok:
                break
            added += 1
        n_max = page.evaluate('() => __sim.getCustom().nodes.length')
        print(f'nodes after fill {n_max} (added {added})')
        if n_max != 2 + max_mid:
            failed.append(f'expected {2 + max_mid} nodes, got {n_max}')
        extra = page.evaluate('() => __sim.addNode()')
        if extra:
            failed.append('addNode should refuse past MAX_MID')
        # select a middle node and delete it
        page.evaluate('() => __sim.selectNode(3)')
        page.wait_for_timeout(150)
        hud = page.evaluate('''() => {
          const b = document.getElementById('nodeDelHud');
          const r = b.getBoundingClientRect();
          return { hidden: document.getElementById('shapeTools').hidden, h: r.height, disabled: b.disabled };
        }''')
        print('delete hud', hud)
        if hud['hidden'] or hud['disabled']:
            failed.append(f'Delete node HUD should show for a selected middle node {hud}')
        if hud['h'] < 40:
            failed.append(f'Delete node HUD too small {hud["h"]}')
        n_before_del = page.evaluate('() => __sim.getCustom().nodes.length')
        page.click('#nodeDelHud')
        page.wait_for_timeout(250)
        n_after_del = page.evaluate('() => __sim.getCustom().nodes.length')
        if n_after_del != n_before_del - 1:
            failed.append(f'Delete HUD did not remove a node {n_before_del}->{n_after_del}')
        page.evaluate('() => __sim.selectNode(2)')
        page.wait_for_timeout(100)
        page.evaluate('() => { if (document.activeElement) document.activeElement.blur(); }')
        n_key0 = page.evaluate('() => __sim.getCustom().nodes.length')
        page.keyboard.press('Delete')
        page.wait_for_timeout(250)
        n_key1 = page.evaluate('() => __sim.getCustom().nodes.length')
        print(f'Delete key nodes {n_key0} -> {n_key1}')
        if n_key1 != n_key0 - 1:
            failed.append(f'Delete key did not remove selected node {n_key0}->{n_key1}')
        # refill for the many-node screenshot on a tall pot
        page.evaluate('(s) => __sim.setCustom(s)', tall_cylinder())
        page.wait_for_timeout(200)
        while page.evaluate('() => __sim.getCustom().nodes.length < 2 + __sim.maxMid'):
            if not page.evaluate('() => __sim.addNode()'):
                break
        page.wait_for_timeout(300)
        page.evaluate('__sim.setView(28, 16)')
        page.wait_for_timeout(200)
        save(page, 'custom-many-nodes.png')

        page.evaluate('(s) => __sim.setCustom(s)', wide_bowl())
        page.wait_for_timeout(500)
        page.evaluate('__sim.setView(25, 18)')
        page.wait_for_timeout(300)
        save(page, 'custom-desktop-edit.png')

        hs = page.evaluate('() => __sim.handleStats()')
        if hs is None:
            fail('C-loop handle missing row stats')
        hn0 = page.evaluate('() => (__sim.getCustom().handleNodes || []).length')
        print('handle nodes after C-loop', hn0)
        if hn0 < 3 or hn0 > 6:
            failed.append(f'C-loop should start with 3–6 handle nodes, got {hn0}')
        max_h = page.evaluate('() => __sim.maxHandle')
        if max_h != 6:
            failed.append(f'maxHandle should be 6, got {max_h}')
        giz_h = page.evaluate('() => __sim.gizmoScreen("handle", 1)')
        print('handle mid gizmo', giz_h)
        if not giz_h:
            fail('handle node gizmos missing on desktop')
        page.evaluate('__sim.setView(80, 14)')
        page.wait_for_timeout(250)
        r_h0 = page.evaluate('() => __sim.getCustom().handleNodes[1].r')
        pt_h = page.evaluate('() => __sim.gizmoScreen("handle", 1)')
        page.mouse.move(pt_h['x'], pt_h['y'])
        page.mouse.down()
        page.mouse.move(pt_h['x'] + 70, pt_h['y'] - 20, steps=10)
        page.mouse.up()
        page.wait_for_timeout(350)
        r_h1 = page.evaluate('() => __sim.getCustom().handleNodes[1].r')
        print(f'handle node drag {r_h0:.3f} -> {r_h1:.3f}')
        if abs(r_h1 - r_h0) < 0.02:
            failed.append(f'dragging handle node did not reshape {r_h0:.3f}->{r_h1:.3f}')
        n_h0 = page.evaluate('() => __sim.getCustom().handleNodes.length')
        pt_ho = page.evaluate('() => __sim.handleOutlineTapTarget()')
        print('handle outline tap target', pt_ho)
        if not pt_ho:
            failed.append('handle outline tap target missing')
        else:
            page.mouse.click(pt_ho['x'], pt_ho['y'])
            page.wait_for_timeout(300)
            n_h1 = page.evaluate('() => __sim.getCustom().handleNodes.length')
            print(f'handle outline click nodes {n_h0} -> {n_h1}')
            if n_h1 != n_h0 + 1:
                failed.append(f'handle outline click did not add a node {n_h0}->{n_h1}')
        page.evaluate('() => __sim.selectHandle(2)')
        page.wait_for_timeout(100)
        n_hd0 = page.evaluate('() => __sim.getCustom().handleNodes.length')
        page.evaluate('() => { if (document.activeElement) document.activeElement.blur(); }')
        page.keyboard.press('Delete')
        page.wait_for_timeout(250)
        n_hd1 = page.evaluate('() => __sim.getCustom().handleNodes.length')
        print(f'Delete key handle nodes {n_hd0} -> {n_hd1}')
        if n_hd1 != n_hd0 - 1:
            failed.append(f'Delete key did not remove handle node {n_hd0}->{n_hd1}')
        extra_h = page.evaluate('''() => {
          let n = 0;
          while (__sim.getCustom().handleNodes.length < __sim.maxHandle) {
            if (!__sim.addHandleNode()) break;
            n += 1;
          }
          return { n, len: __sim.getCustom().handleNodes.length, extra: __sim.addHandleNode() };
        }''')
        print('handle fill', extra_h)
        if extra_h['len'] != 6:
            failed.append(f'expected 6 handle nodes at cap, got {extra_h["len"]}')
        if extra_h['extra']:
            failed.append('addHandleNode should refuse past 6')
        page.evaluate('''() => __sim.setCustom({
          handle: 'c', spout: 'none',
          handleNodes: [
            {r: 1.16, y: 0.80}, {r: 1.62, y: 0.98}, {r: 1.92, y: 0.72},
            {r: 1.88, y: 0.42}, {r: 1.48, y: 0.22}, {r: 1.10, y: 0.28}
          ]
        })''')
        page.evaluate('__sim.setView(22, 16)')
        page.wait_for_timeout(300)
        save(page, 'custom-handle-nodes.png')

        # ends stay on the wall after a reshape
        ends = page.evaluate('''() => {
          const s = __sim.getCustom();
          const a = s.handleNodes[0], b = s.handleNodes.at(-1);
          return { a, b, wallA: a.r, wallB: b.r };
        }''')
        print('handle ends', ends)
        if ends['a']['r'] < 0.2 or ends['b']['r'] < 0.2:
            failed.append(f'handle ends not attached {ends}')

        # spout placement: sliders + on-canvas grips
        page.evaluate('(s) => __sim.setCustom(s)', tall_cylinder())
        page.wait_for_timeout(300)
        page.evaluate('__sim.setView(55, 14)')
        page.wait_for_timeout(200)
        giz_root = page.evaluate('() => __sim.gizmoScreen("spoutRoot")')
        giz_tip = page.evaluate('() => __sim.gizmoScreen("spoutTip")')
        print('spout gizmos', giz_root, giz_tip)
        if not giz_root or not giz_tip:
            fail(f'teapot spout grips missing: root={giz_root} tip={giz_tip}')
        pose0 = page.evaluate('() => __sim.spoutPose()')
        print('spout pose0', json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in pose0.items() if k not in ('root', 'tip')}))

        # drag root up the wall
        page.mouse.move(giz_root['x'], giz_root['y'])
        page.mouse.down()
        page.mouse.move(giz_root['x'], giz_root['y'] - 70, steps=10)
        page.mouse.up()
        page.wait_for_timeout(350)
        pose_h = page.evaluate('() => __sim.spoutPose()')
        print(f'spout root drag yFrac {pose0["yFrac"]:.3f} -> {pose_h["yFrac"]:.3f}')
        if pose_h['yFrac'] <= pose0['yFrac'] + 0.04:
            failed.append(f'spout root drag did not raise height {pose0["yFrac"]:.3f}->{pose_h["yFrac"]:.3f}')

        # drag tip up and out (length + tilt together)
        tip = page.evaluate('() => __sim.gizmoScreen("spoutTip")')
        if not tip:
            fail('spout tip grip missing after root drag')
        page.mouse.move(tip['x'], tip['y'])
        page.mouse.down()
        page.mouse.move(tip['x'] + 50, tip['y'] - 55, steps=10)
        page.mouse.up()
        page.wait_for_timeout(350)
        pose_t = page.evaluate('() => __sim.spoutPose()')
        print(f'spout tip drag len {pose_h["len"]:.3f}->{pose_t["len"]:.3f} tilt {pose_h["tilt"]:.3f}->{pose_t["tilt"]:.3f}')
        if pose_t['len'] <= pose_h['len'] + 0.03 and pose_t['tilt'] <= pose_h['tilt'] + 0.04:
            failed.append(f'spout tip drag did not change length/tilt {pose_h}->{pose_t}')

        # sliders: high + angled up
        page.evaluate('''() => __sim.setCustom({
          handle: 'c', spout: 'teapot', spoutY: 0.78, spoutTilt: 0.62, spoutLen: 1.15,
          spoutMouth: 1.25, spoutAz: 0, handlePos: 0.18, handleHeight: 0.55
        })''')
        page.wait_for_timeout(350)
        high = page.evaluate('() => __sim.spoutPose()')
        print('spout high', json.dumps({k: round(high[k], 3) for k in ('yFrac', 'tilt', 'len', 'az', 'mouth')}))
        if high['yFrac'] < 0.7:
            failed.append(f'spout height slider did not stick {high["yFrac"]}')
        if high['tilt'] < 0.45:
            failed.append(f'spout tilt slider did not stick {high["tilt"]}')
        if high['len'] < 1.0:
            failed.append(f'spout length slider did not stick {high["len"]}')
        page.evaluate('__sim.frame()')
        page.wait_for_timeout(200)
        tip_in = page.evaluate('() => __sim.gripInView("spoutTip", 0, 20)')
        print('spout tip in view after frame', tip_in)
        if not tip_in or not tip_in.get('inside'):
            failed.append(f'spout mouth grip not kept inside the canvas {tip_in}')
        page.evaluate('__sim.setView(50, 16)')
        page.wait_for_timeout(250)
        save(page, 'custom-spout-high.png')

        # rotate around the pot onto the side (+Z)
        page.evaluate('() => __sim.setCustom({ spoutAz: Math.PI / 2 })')
        page.wait_for_timeout(300)
        page.evaluate('__sim.setView(5, 16)')
        page.wait_for_timeout(250)
        side = page.evaluate('() => __sim.spoutPose()')
        print('spout side az', side['az'])
        if abs(abs(side['az']) - 1.57) > 0.12:
            failed.append(f'spout around-pot did not rotate {side["az"]}')
        save(page, 'custom-spout-side.png')

        # opening size
        mouth0 = page.evaluate('() => __sim.spoutRadii()')
        page.evaluate('() => __sim.setCustom({ spoutMouth: 2.0 })')
        page.wait_for_timeout(250)
        mouth1 = page.evaluate('() => __sim.spoutRadii()')
        print('spout mouth', mouth0, mouth1)
        if not mouth1 or mouth1['tip'] <= mouth0['tip'] * 1.08:
            failed.append(f'spout opening slider did not widen the mouth {mouth0} -> {mouth1}')
        if mouth1['root'] < mouth1['tip'] * 1.15:
            failed.append(f'spout root should stay thicker than a wide mouth {mouth1}')

        # reset a high/angled teapot with a custom-bent handle for paint + fire
        page.evaluate('''() => __sim.setCustom({
          handle: 'c', spout: 'teapot', spoutY: 0.74, spoutTilt: 0.5, spoutLen: 1.05,
          spoutMouth: 1.2, spoutAz: 0, handlePos: 0.16, handleHeight: 0.5,
          handleNodes: [
            {r: 0.80, y: 1.32}, {r: 1.58, y: 1.52}, {r: 1.90, y: 1.12},
            {r: 1.72, y: 0.68}, {r: 0.78, y: 0.52}
          ]
        })''')
        page.wait_for_timeout(400)

        # paint + pour on the custom wall
        page.evaluate('__sim.setTool("brush")')
        page.evaluate('__sim.pour("shino", 0.85, "below", 0.75)')
        page.evaluate('__sim.brushBand("tenmoku", 0.78, 0.7, 0.14)')
        before = dict(page.evaluate('__sim.stats()'))
        if before.get('shino', 0) <= 0:
            fail('pour did not land on custom shape')

        page.evaluate(f'__sim.setCone(6); __sim.setSeed({SEED})')
        t0 = time.time()
        page.click('#fireBtn')
        page.wait_for_function('__sim.state === "fired"', timeout=180000)
        print(f'cone 6 fired in {time.time()-t0:.1f}s', page.evaluate('__sim.dripStats'))
        locked = page.evaluate('''() => {
          const r0 = __sim.getCustom().nodes[0].r;
          __sim.setCustom({ wall: 0.08 });
          return Math.abs(__sim.getCustom().nodes[0].r - r0) < 1e-9 && __sim.state === "fired";
        }''')
        # setCustom should refuse while fired
        if page.evaluate('__sim.state') != 'fired':
            failed.append('setCustom while fired should not unfire')
        page.evaluate('__sim.setView(48, 16)')
        page.wait_for_timeout(400)
        save(page, 'custom-fired-cone6.png', full=False)

        page.click('#unfireBtn')
        page.wait_for_function('__sim.state === "raw"', timeout=10000)
        # keep the moved teapot spout; check taper still holds
        spout = page.evaluate('() => __sim.spoutRadii()')
        print('spout radii', spout)
        if not spout:
            failed.append('teapot spout missing row stats')
        else:
            if spout['root'] < 0.07:
                failed.append(f'spout root still thin {spout["root"]}')
            if spout['root'] < spout['tip'] * 1.35:
                failed.append(f'spout root not thicker than tip {spout}')
        pose_fire = page.evaluate('() => __sim.spoutPose()')
        if not pose_fire or pose_fire['yFrac'] < 0.6:
            failed.append(f'fired pot lost spout placement {pose_fire}')
        page.evaluate(f'__sim.setCone(10); __sim.setSeed({SEED})')
        t0 = time.time()
        page.click('#fireBtn')
        page.wait_for_function('__sim.state === "fired"', timeout=180000)
        print(f'cone 10 fired in {time.time()-t0:.1f}s', page.evaluate('__sim.dripStats'))
        page.evaluate('__sim.setView(50, 16)')
        page.wait_for_timeout(400)
        save(page, 'custom-fired-cone10.png', full=False)

        if errors:
            failed.append(f'desktop console: {errors}')

        # iPhone-sized Shape mode drag
        page.close()
        iphone = dict(pw.devices['iPhone 13'])
        ctx = browser.new_context(**iphone)
        m = ctx.new_page()
        merr = []
        m.on('console', lambda msg: msg.type == 'error' and merr.append(msg.text))
        m.on('pageerror', lambda e: merr.append(f'pageerror: {e}'))
        m.goto(url)
        wait_ready(m)
        m.evaluate('__sim.setSheet("pot", false)')
        m.wait_for_timeout(200)
        m.click('button[data-shape="custom"]')
        m.wait_for_timeout(500)
        mode = m.evaluate('() => __sim.touchMode')
        if mode != 'shape':
            failed.append(f'mobile custom should enter Shape mode, got {mode}')
        m.evaluate('__sim.setSheet("pot", true)')
        m.wait_for_timeout(200)
        tabs = m.evaluate('''() => {
          const bar = document.getElementById('mobileBar').getBoundingClientRect();
          const view = document.getElementById('view').getBoundingClientRect();
          const tabs = [...document.querySelectorAll('#mobileBar button')].map(b => {
            const r = b.getBoundingClientRect();
            return { t: b.textContent.trim(), h: r.height, y: r.y };
          });
          return { barY: bar.y, innerH: innerHeight, viewH: view.height,
                   overlayHidden: document.getElementById('sectionOverlay').hidden, tabs };
        }''')
        print('mobile tabs', json.dumps(tabs))
        small = [t for t in tabs['tabs'] if t['h'] < 40]
        if small:
            failed.append(f'mobile small targets {small}')
        if tabs['viewH'] < tabs['innerH'] * 0.38:
            failed.append(f'mobile canvas too short {tabs["viewH"]} vs {tabs["innerH"]}')
        if tabs['barY'] + 8 < tabs['viewH']:
            failed.append('mobile tab bar overlaps the canvas')
        m.evaluate('(s) => __sim.setCustom(s)', wide_bowl())
        m.evaluate('__sim.setTouchMode("shape")')
        m.evaluate('__sim.setSheet("pot", false)')
        m.evaluate('__sim.setShapeGroup("handle")')
        m.wait_for_timeout(250)
        drawer = m.evaluate('''() => {
          const sheet = document.getElementById('sheet').getBoundingClientRect();
          const fire = document.getElementById('fireBtn').getBoundingClientRect();
          const bar = document.getElementById('mobileBar').getBoundingClientRect();
          const cone = document.getElementById('cone').getBoundingClientRect();
          const un = document.getElementById('unfireBtn').getBoundingClientRect();
          const hw = document.getElementById('hW');
          const lab = hw.closest('label').getBoundingClientRect();
          const inp = hw.getBoundingClientRect();
          const ht = document.getElementById('hT').getBoundingClientRect();
          const view = document.getElementById('view').getBoundingClientRect();
          const groups = [...document.querySelectorAll('#shapeSubtabs button')].map(b => ({
            t: b.textContent.trim(), h: b.getBoundingClientRect().height,
            on: b.classList.contains('active')
          }));
          return {
            sheetH: sheet.height, sheetY: sheet.y, fireH: fire.height, fireY: fire.y,
            fireVisible: fire.height > 0 && fire.bottom <= innerHeight + 1,
            coneH: cone.height, unH: un.height, barY: bar.y, barH: bar.height,
            sliderH: lab.height, inputH: inp.height, thickH: ht.height,
            viewH: view.height, innerH: innerHeight, groups,
            fireOverlapsBar: fire.y < bar.bottom - 2 && fire.bottom > bar.y + 2,
            handleTab: groups.find(g => g.t === 'Handle'),
            shapesHidden: document.getElementById('shapes').getBoundingClientRect().height < 8,
            widthVisible: lab.top >= sheet.top - 4 && lab.bottom <= sheet.bottom + 8,
            thickVisible: ht.top >= sheet.top - 4 && ht.bottom <= sheet.bottom + 8
          };
        }''')
        print('mobile slider drawer', json.dumps(drawer))
        if drawer['sheetH'] < 200:
            failed.append(f'mobile slider area still cramped {drawer["sheetH"]}')
        if drawer['sheetH'] < drawer['innerH'] * 0.28:
            failed.append(f'mobile sliders should take most of the drawer {drawer}')
        if drawer['inputH'] < 36 or drawer['sliderH'] < 40:
            failed.append(f'mobile Width slider too small {drawer["sliderH"]} / {drawer["inputH"]}')
        if drawer['fireH'] > 42 or drawer['coneH'] > 44 or drawer['unH'] > 42:
            failed.append(f'mobile fire bar not compact fire={drawer["fireH"]} cone={drawer["coneH"]} un={drawer["unH"]}')
        if not drawer['fireVisible'] or drawer['fireH'] < 24:
            failed.append(f'mobile fire not visible {drawer}')
        if drawer['barY'] < 8:
            failed.append('mobile tab bar covered with Pot sheet open')
        if drawer['fireOverlapsBar']:
            failed.append('mobile fire bar covers the tab bar')
        if not drawer['handleTab'] or not drawer['handleTab']['on'] or drawer['handleTab']['h'] < 36:
            failed.append(f'mobile Handle section tab missing {drawer["groups"]}')
        if not drawer.get('shapesHidden'):
            failed.append('mobile Handle tab should hide the shape grid so sliders fit')
        if not drawer.get('widthVisible') or not drawer.get('thickVisible'):
            failed.append(f'mobile Width/Thickness sliders not fully visible {drawer}')
        save(m, 'custom-mobile-sliders.png')
        save(m, 'custom-mobile-firebar.png')

        m.evaluate('__sim.setSheet("pot", true)')
        m.evaluate('__sim.setView(20, 16)')
        m.wait_for_timeout(400)
        r_before = m.evaluate('() => __sim.getCustom().nodes.at(-1).r')
        pt = m.evaluate('() => __sim.gizmoScreen("node", -1)')
        if not pt:
            fail('mobile rim gizmo missing')
        cdp_drag(m, [pt, {'x': pt['x'] + 28, 'y': pt['y'] - 6}, {'x': pt['x'] + 48, 'y': pt['y'] - 10}])
        m.wait_for_timeout(500)
        r_after = m.evaluate('() => __sim.getCustom().nodes.at(-1).r')
        print(f'mobile shape drag rim {r_before:.3f} -> {r_after:.3f}')
        if abs(r_after - r_before) < 0.008:
            failed.append('mobile Shape mode did not drag a node')

        # outline tap adds a node
        spec_m = m.evaluate('() => __sim.getCustom()')
        n_m0 = len(spec_m['nodes'])
        pt_m = m.evaluate('() => __sim.outlineTapTarget()')
        print('mobile outline tap target', pt_m)
        if not pt_m:
            failed.append('mobile outline tap target missing')
        else:
            cdp_tap(m, pt_m)
            m.wait_for_timeout(400)
            n_m1 = m.evaluate('() => __sim.getCustom().nodes.length')
            print(f'mobile outline tap nodes {n_m0} -> {n_m1}')
            if n_m1 != n_m0 + 1:
                failed.append(f'mobile outline tap did not add a node {n_m0}->{n_m1}')
        # many nodes on a tall pot
        m.evaluate('(s) => __sim.setCustom(s)', tall_cylinder())
        m.evaluate('__sim.setTouchMode("shape")')
        m.evaluate('__sim.setView(22, 14)')
        while m.evaluate('() => __sim.getCustom().nodes.length < 2 + __sim.maxMid'):
            if not m.evaluate('() => __sim.addNode()'):
                break
        m.wait_for_timeout(300)
        n_phone = m.evaluate('() => __sim.getCustom().nodes.length')
        print('mobile many nodes', n_phone)
        if n_phone < 10:
            failed.append(f'mobile could not add many nodes ({n_phone})')
        save(m, 'custom-mobile-many-nodes.png')

        # handle nodes on the phone
        m.evaluate('(s) => { s.handle = "c"; s.spout = "none"; return __sim.setCustom(s); }', wide_bowl())
        m.evaluate('__sim.setTouchMode("shape")')
        m.evaluate('__sim.setView(80, 12)')
        m.wait_for_timeout(400)
        hn_m0 = m.evaluate('() => (__sim.getCustom().handleNodes || []).length')
        hg = m.evaluate('() => __sim.gizmoScreen("handle", 1)')
        print('mobile handle gizmos', hn_m0, hg)
        if hn_m0 < 3 or not hg:
            failed.append(f'mobile handle nodes missing count={hn_m0} giz={hg}')
        else:
            rh0 = m.evaluate('() => __sim.getCustom().handleNodes[1].r')
            cdp_drag(m, [hg, {'x': hg['x'] + 22, 'y': hg['y'] - 10}, {'x': hg['x'] + 40, 'y': hg['y'] - 16}])
            m.wait_for_timeout(400)
            rh1 = m.evaluate('() => __sim.getCustom().handleNodes[1].r')
            print(f'mobile handle node drag {rh0:.3f} -> {rh1:.3f}')
            if abs(rh1 - rh0) < 0.015:
                failed.append(f'mobile Shape mode did not drag a handle node {rh0:.3f}->{rh1:.3f}')
            pt_hm = m.evaluate('() => __sim.handleOutlineTapTarget()')
            n_hm0 = m.evaluate('() => __sim.getCustom().handleNodes.length')
            if pt_hm:
                cdp_tap(m, pt_hm)
                m.wait_for_timeout(350)
                n_hm1 = m.evaluate('() => __sim.getCustom().handleNodes.length')
                print(f'mobile handle outline tap {n_hm0} -> {n_hm1}')
                if n_hm1 != n_hm0 + 1:
                    failed.append(f'mobile handle outline tap did not add a node {n_hm0}->{n_hm1}')
            else:
                failed.append('mobile handle outline tap target missing')
        m.evaluate('''() => __sim.setCustom({
          handle: 'c', spout: 'none',
          handleNodes: [
            {r: 1.16, y: 0.80}, {r: 1.62, y: 0.98}, {r: 1.92, y: 0.72},
            {r: 1.88, y: 0.42}, {r: 1.48, y: 0.22}, {r: 1.10, y: 0.28}
          ]
        })''')
        m.evaluate('__sim.setTouchMode("shape")')
        m.evaluate('__sim.setView(22, 14)')
        m.wait_for_timeout(350)
        save(m, 'custom-mobile-handle.png')

        # teapot spout grips in Shape mode (touch drag)
        m.evaluate('(s) => { s.handle = "c"; s.spout = "teapot"; s.spoutY = 0.55; s.spoutAz = 0; return __sim.setCustom(s); }', tall_cylinder())
        m.evaluate('__sim.setTouchMode("shape")')
        m.evaluate('__sim.setView(48, 14)')
        m.wait_for_timeout(400)
        root_m = m.evaluate('() => __sim.gizmoScreen("spoutRoot")')
        tip_m = m.evaluate('() => __sim.gizmoScreen("spoutTip")')
        print('mobile spout grips', root_m, tip_m)
        if not root_m or not tip_m:
            failed.append(f'mobile spout grips missing root={root_m} tip={tip_m}')
        else:
            y0 = m.evaluate('() => __sim.spoutPose().yFrac')
            cdp_drag(m, [root_m, {'x': root_m['x'], 'y': root_m['y'] - 36}, {'x': root_m['x'] + 4, 'y': root_m['y'] - 58}])
            m.wait_for_timeout(450)
            y1 = m.evaluate('() => __sim.spoutPose().yFrac')
            print(f'mobile spout root drag {y0:.3f} -> {y1:.3f}')
            if y1 <= y0 + 0.03:
                failed.append(f'mobile Shape mode did not drag spout root {y0:.3f}->{y1:.3f}')
            tip2 = m.evaluate('() => __sim.gizmoScreen("spoutTip")')
            tilt0 = m.evaluate('() => __sim.spoutPose().tilt')
            if tip2:
                cdp_drag(m, [tip2, {'x': tip2['x'] + 18, 'y': tip2['y'] - 28}, {'x': tip2['x'] + 28, 'y': tip2['y'] - 44}])
                m.wait_for_timeout(400)
            tilt1 = m.evaluate('() => __sim.spoutPose().tilt')
            print(f'mobile spout tip tilt {tilt0:.3f} -> {tilt1:.3f}')
            if tilt1 <= tilt0 + 0.03:
                failed.append(f'mobile Shape mode did not drag spout tip {tilt0:.3f}->{tilt1:.3f}')
            tip_box = m.evaluate('() => __sim.gripInView("spoutTip", 0, 16)')
            print('mobile spout tip in view', tip_box)
            if tip_box and not tip_box.get('inside'):
                failed.append(f'mobile spout mouth grip at canvas edge {tip_box}')
        # drawer open should not cover the tab bar
        m.evaluate('__sim.setSheet("pot", false)')
        m.wait_for_timeout(200)
        cover = m.evaluate('''() => {
          const bar = document.getElementById('mobileBar').getBoundingClientRect();
          const sheet = document.getElementById('sheet').getBoundingClientRect();
          const tools = document.getElementById('shapeTools').getBoundingClientRect();
          return { barY: bar.y, barH: bar.height, sheetBottom: sheet.bottom,
                   toolsBottom: tools.bottom, toolsHidden: document.getElementById('shapeTools').hidden,
                   innerH: innerHeight };
        }''')
        print('mobile spout drawer', json.dumps(cover))
        if cover['barY'] < 8:
            failed.append('mobile tab bar not visible with Pot drawer open')
        m.evaluate('__sim.setSheet("pot", true)')
        m.wait_for_timeout(150)
        m.evaluate('__sim.setView(48, 14)')
        m.wait_for_timeout(250)
        save(m, 'custom-mobile-spout.png')

        # two-finger orbit still works in Shape mode
        view0 = m.evaluate('() => __sim.getView()')
        va = m.evaluate('() => __sim.screenAt(0.55, -25)')
        vb = m.evaluate('() => __sim.screenAt(0.55, 25)')
        cdp_two_finger(m,
                       va, {'x': va['x'] + 36, 'y': va['y'] + 8},
                       vb, {'x': vb['x'] + 36, 'y': vb['y'] + 8})
        m.wait_for_timeout(400)
        view1 = m.evaluate('() => __sim.getView()')
        daz = abs(view1['az'] - view0['az'])
        print(f'two-finger orbit dAz={daz:.3f}')
        if daz < 0.04:
            failed.append(f'two-finger orbit in Shape mode did not rotate (dAz={daz:.3f})')
        save(m, 'custom-mobile-edit.png')
        if merr:
            failed.append(f'mobile console: {merr}')
        m.close(); ctx.close()
        browser.close()

    httpd.shutdown()
    if failed:
        print('FAILURES:')
        for f in failed:
            print(' -', f)
        return 1
    print('ALL CHECKS PASSED')
    print('CONSOLE ERRORS: none' if not errors else errors)
    return 0


if __name__ == '__main__':
    sys.exit(run())
