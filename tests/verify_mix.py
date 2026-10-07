"""v3 verification on the single-file build (file://, no server):
 - glaze picker has all glazes, grouped + scrollable -> shots/palette-ui.png
 - showcase vase: tenmoku dip, blue rutile dip over it, and a REAL mouse-drag turquoise stroke across both; fire -> shots/mix-vase.png
 - reports: stroke painted?, fire works?, console errors, firing time."""
import os, time
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
URL = os.environ.get('GLAZE_URL', 'file://' + os.path.join(ROOT, 'dist/glaze-kiln.html'))
OUT = os.path.join(ROOT, 'shots')
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1400, 'height': 900})
    errors = []
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(URL); page.wait_for_function('window.__sim && __sim.state === "raw"', timeout=120000)
    # --- palette UI
    info = page.evaluate('''() => { const g = document.getElementById('glazes'); return { n: g.querySelectorAll('button.glaze').length,
        fams: [...g.querySelectorAll('.fam')].map(x => x.textContent), credit: (document.querySelector('.credit') || {}).textContent, scroll: g.scrollHeight > g.clientHeight, h: g.clientHeight, sh: g.scrollHeight }; }''')
    print('picker:', info)
    if info['n'] < 60:
        print('FAIL: expected ~68 glaze buttons, got', info['n']); raise SystemExit(1)
    if len(info['fams']) != 6:
        print('FAIL: expected 6 family groups, got', info['fams']); raise SystemExit(1)
    page.click('button[data-glaze="rutile"]'); page.mouse.move(700, 450); page.wait_for_timeout(250)
    page.locator('[data-sheet="glaze"]').screenshot(path='/tmp/_pal_a.png')
    page.evaluate("const el = document.querySelector('.glaze-chips') || document.getElementById('glazes'); el.scrollTop = 1e4"); page.wait_for_timeout(200)
    page.locator('[data-sheet="glaze"]').screenshot(path='/tmp/_pal_b.png')
    page.evaluate("document.getElementById('glazes').scrollTop = 0")
    from PIL import Image, ImageDraw, ImageFont
    a, bb = Image.open('/tmp/_pal_a.png'), Image.open('/tmp/_pal_b.png'); hh = min(a.height, 640)
    im = Image.new('RGB', (a.width * 2 + 30, hh + 40), (232, 238, 242)); im.paste(a.crop((0, 0, a.width, hh)), (10, 34)); im.paste(bb.crop((0, 0, a.width, hh)), (a.width + 20, 34))
    d = ImageDraw.Draw(im); f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 13)
    d.text((12, 10), 'Glaze picker (top of list)', font=f, fill=(7, 70, 132)); d.text((a.width + 22, 10), 'Same picker scrolled to the end', font=f, fill=(7, 70, 132))
    im.save(os.path.join(OUT, 'palette-ui.png'))
    # --- showcase vase
    page.click('button[data-shape="vase"]'); page.wait_for_timeout(400)
    page.evaluate('__sim.pour("tenmoku", 0.74, "below", 0.8)')
    page.evaluate('__sim.pour("rutile", 0.42, "above", 0.75)')
    page.click('button[data-glaze="turquoise"]'); page.click('button[data-tool="brush"]')
    page.fill('#size', '0.16'); page.dispatch_event('#size', 'input')
    page.evaluate('__sim.setView(20, 12)'); page.wait_for_timeout(300)
    before = dict(page.evaluate('__sim.stats()'))['turquoise']
    for hf in (0.62, 0.56):   # two real drag passes, diagonal-ish across the front, crossing both dips
        pts = [page.evaluate(f'__sim.screenAt({hf + a / 900}, {a})') for a in (-70, -35, 0, 35, 70)]
        page.mouse.move(pts[0]['x'], pts[0]['y']); page.mouse.down()
        for p in pts[1:]: page.mouse.move(p['x'], p['y'], steps=10)
        page.mouse.up()
    after = dict(page.evaluate('__sim.stats()'))['turquoise']
    print(f'turquoise mean before/after drag: {before} -> {after}', 'PAINTED' if after > before else 'NOT PAINTED')
    page.mouse.move(100, 850); page.evaluate('__sim.setSeed(20260927)')
    t = time.time(); page.click('#fireBtn'); page.wait_for_function('__sim.state === "fired"', timeout=240000)
    print(f'fire: wall {time.time() - t:.1f}s (incl. 2.6s glow animation), sim {page.evaluate("Math.round(__sim.fireMs)")} ms (compose {page.evaluate("Math.round(__sim.composeMs)")} ms), drips {page.evaluate("JSON.stringify(__sim.dripStats)")[:120]}')
    page.wait_for_timeout(600); page.evaluate('__sim.setView(20, 12)'); page.wait_for_timeout(400)
    page.locator('#view').screenshot(path=os.path.join(OUT, 'mix-vase.png'))
    print('console errors:', errors or 'none'); b.close()
