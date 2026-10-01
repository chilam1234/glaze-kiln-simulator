"""The kiln thread returns new color maps. The pot must draw those maps, and a stroke after Unfire must show.

A firing that only updates the sim arrays, leaving the textures on the raw image, used to pass the thickness
checks: the coat was fired, but the vase still showed the raw glaze and later strokes never appeared.

Serves the repo itself and drives window.__sim. Requires the module worker, so this is not the file:// build.
Usage: python3 tests/verify_fire_view.py
"""
import os, sys, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.stdout.reconfigure(line_buffering=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

from playwright.sync_api import sync_playwright

CHROME = os.environ.get('CHROME') or (
    '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome')
    else '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
ARGS = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist', '--enable-webgl']
SEED = 20260926


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, fmt, *args):
        pass


def start_server():
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{httpd.server_address[1]}/'


def shown(page):
    # Two frames: the render loop rebinds textures on the frame after a firing uploads.
    return page.evaluate('''() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(__sim.shown())));
    })''')


def fire(page, seed):
    page.evaluate('(seed) => __sim.fire(seed)', seed)


def mean(page, glaze):
    return dict(page.evaluate('__sim.stats()'))[glaze]


def drag_band(page, h):
    page.evaluate('__sim.setView(20, 12)')
    page.wait_for_timeout(200)
    pts = [page.evaluate(f'__sim.screenAt({h}, {a})') for a in (-40, -20, 0, 20, 40)]
    page.mouse.move(pts[0]['x'], pts[0]['y'])
    page.mouse.down()
    for p in pts[1:]:
        page.mouse.move(p['x'], p['y'], steps=4)
    page.mouse.up()


def main():
    failed = []
    errors = []

    def check(ok, msg):
        print(('OK  ' if ok else 'FAIL') + ' ' + msg)
        if not ok:
            failed.append(msg)

    def assert_shown(view, label):
        check(view['mode'] in ('raw', 'fired'), f'{label}: mode is {view["mode"]}')
        for k, m in view['maps'].items():
            check(m['bound'], f'{label}: {k} texture is the sim map')
            check(m['sum'] == view['sim'][k], f'{label}: shown {k} matches the sim bytes')

    httpd, url = start_server()
    print('serving', url)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
            page = browser.new_page(viewport={'width': 1280, 'height': 800})
            page.set_default_timeout(180000)
            page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
            page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
            page.goto(url)
            page.wait_for_function('window.__sim && __sim.state === "raw"', timeout=120000)

            page.evaluate('__sim.clear(); __sim.setShape("vase"); __sim.setCone(6); __sim.setTool("brush")')
            page.evaluate('__sim.pour("cobalt", 0.8, "below", 0.7)')
            raw = shown(page)
            assert_shown(raw, 'raw coat')
            check(raw['engine'] == 'page', f'before firing the engine is page (got {raw["engine"]})')

            fire(page, SEED)
            page.wait_for_function('__sim.state === "fired"', timeout=180000)
            fired = shown(page)
            assert_shown(fired, 'fired')
            check(fired['engine'] == 'worker', f'firing ran on the kiln thread (got {fired["engine"]})')
            check(fired['mode'] == 'fired', 'mode is fired')
            check(fired['maps']['color']['sum'] != raw['maps']['color']['sum'], 'fired color is not the raw picture')
            check(fired['maps']['props']['sum'] != raw['maps']['props']['sum'], 'fired surface is not the raw surface')

            cobalt_fired = mean(page, 'cobalt')
            page.evaluate('__sim.setGlaze("copper"); __sim.setTool("brush")')
            drag_band(page, 0.55)
            check(mean(page, 'copper') == 0, 'a stroke while fired does not add glaze')
            check(mean(page, 'cobalt') == cobalt_fired, 'firing coat is unchanged by a stroke while fired')
            locked = shown(page)
            assert_shown(locked, 'still fired')
            check(locked['maps']['color']['sum'] == fired['maps']['color']['sum'], 'a stroke while fired does not change the picture')

            page.evaluate('__sim.unfire()')
            page.wait_for_function('__sim.state === "raw"', timeout=10000)
            opened = shown(page)
            assert_shown(opened, 'unfired')
            check(opened['mode'] == 'raw', 'unfire returns to raw')
            check(opened['maps']['color']['sum'] != fired['maps']['color']['sum'], 'unfire shows the raw coat again')

            page.evaluate('__sim.brushBand("yellow", 0.35, 0.9, 0.16)')
            painted = shown(page)
            assert_shown(painted, 'paint after unfire')
            check(painted['maps']['color']['sum'] != opened['maps']['color']['sum'], 'a stroke after unfire changes the picture')
            check(mean(page, 'yellow') > 0.001, 'yellow landed in the coat')

            page.evaluate('__sim.setGlaze("copper"); __sim.setTool("brush")')
            drag_band(page, 0.55)
            copper = mean(page, 'copper')
            check(copper > 0, f'the brush works again after unfire (copper mean {copper})')
            brushed = shown(page)
            assert_shown(brushed, 'brush after unfire')
            check(brushed['maps']['color']['sum'] != painted['maps']['color']['sum'], 'the brush stroke is in the picture')

            fire(page, SEED + 1)
            page.wait_for_function('__sim.state === "fired"', timeout=180000)
            again = shown(page)
            assert_shown(again, 'second firing')
            check(again['engine'] == 'worker', 'second firing still uses the kiln thread')
            check(again['maps']['color']['sum'] != brushed['maps']['color']['sum'], 'second firing replaces the picture')

            page.evaluate('__sim.unfire()')
            page.evaluate('__sim.brushBand("celadon", 0.7, 0.8, 0.14)')
            after = shown(page)
            assert_shown(after, 'paint after second unfire')
            check(after['maps']['color']['sum'] != again['maps']['color']['sum'], 'a stroke after the second firing shows')
            check(mean(page, 'celadon') > 0.001, 'celadon landed after the second firing')

            check(not errors, 'no page errors: ' + ' | '.join(errors[:4]))
            browser.close()
    finally:
        httpd.shutdown()

    if failed:
        print(f'{len(failed)} failed')
        sys.exit(1)
    print('fire view ok')


if __name__ == '__main__':
    main()
