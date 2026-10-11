"""Light check: liquid-glass tokens, radii, reduced-transparency fallback.
Usage: python3 tests/verify_glass.py
"""
import os, sys

sys.stdout.reconfigure(line_buffering=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
CSS = os.path.join(ROOT, 'css', 'style.css')
css = open(CSS, encoding='utf-8').read()
fail = False


def check(ok, msg):
    global fail
    print(('OK  ' if ok else 'FAIL') + ' ' + msg)
    if not ok:
        fail = True


check('--radius-panel: 20px' in css, 'panel radius token is 20px')
check('--radius-ctrl: 12px' in css, 'control radius token is 12px')
check('--radius-chip: 14px' in css, 'chip radius token is 14px')
check('backdrop-filter: blur(var(--glass-blur))' in css, 'panels use backdrop-filter blur')
check('-webkit-backdrop-filter' in css, 'Safari -webkit-backdrop-filter is set')
check('prefers-reduced-transparency: reduce' in css, 'reduced-transparency fallback exists')
check('--glass: color-mix(in srgb, var(--paper) 78%, transparent)' in css,
      'glass fill is cream at ~78%')
check('border-radius: var(--radius-ctrl)' in css, 'buttons use control radius')
check('border-radius: var(--radius-chip)' in css, 'glaze chips use chip radius')
check('prefers-reduced-motion: reduce' in css, 'motion reduced-motion block still present')
check('sheetRise' in css and 'scale(0.98)' in css, 'PR #22 motion rules still present')
check('--glass: var(--paper)' in css.split('prefers-reduced-transparency')[-1],
      'reduced-transparency falls back to solid cream')

if fail:
    print('FAILURES')
    raise SystemExit(1)
print('ALL CHECKS PASSED')
