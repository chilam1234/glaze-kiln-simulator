"""Quick look-dev: scripted glazing via the __sim hook, fire, and capture views. Not the required verification."""
import sys, time
from playwright.sync_api import sync_playwright
SCEN = sys.argv[1] if len(sys.argv) > 1 else 'vase'
OUT = '/tmp/look'
import os; os.makedirs(OUT, exist_ok=True)
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width':1100,'height':800})
    page.on('console', lambda m: m.type in ('error','warning','log') and print('console', m.type, m.text))
    page.on('pageerror', lambda e: print('pageerror', e))
    page.goto('http://localhost:8765/')
    page.wait_for_function('window.__sim && __sim.state=="raw"')
    t=time.time()
    for cmd in open(f'tests/scen_{SCEN}.txt').read().strip().splitlines():
        if cmd.startswith('#') or not cmd.strip(): continue
        if cmd.startswith('SHOT '):
            _, name, view = cmd.split(' ', 2)
            page.evaluate(f'__sim.setView({view})'); page.wait_for_timeout(300)
            page.locator('#view').screenshot(path=f'{OUT}/{SCEN}-{name}.png'); print('shot', name, round(time.time()-t,1))
        elif cmd == 'FIRE':
            page.evaluate('__sim.fire()'); page.wait_for_function('__sim.state=="fired"', timeout=300000); print('fired', round(time.time()-t,1))
        else:
            page.evaluate(cmd)
    b.close()
