"""One calibration step: compare our rendered body median (/tmp/ours.json from tests/amaco_match.py) with the reference
median (ref/samples.json: Sheffield cone 6 cup if present, else the amaco.com photo) and scale that glaze's fired stops,
breakCol and variegation colours by the per-channel linear-light gain (damped). Usage: python tools/calibrate.py id [id...]"""
import json, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(ROOT, 'ref/samples.json'))); O = json.load(open('/tmp/ours.json'))
lin = lambda v: (v / 255 / 12.92) if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4
srgb = lambda x: 255 * (x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055)
h2 = lambda h: [int(h[i:i + 2], 16) for i in (1, 3, 5)]
TARGET = {'shino': 'amaco_photo', 'crackle': 'amaco_photo_thick', 'amber': 'amaco_photo', 'rose': 'amaco_photo2', 'plum': 'amaco_photo2', 'cobalt': 'amaco_photo2'}
src = open(os.path.join(ROOT, 'js/glazes.js')).read()
for gid in sys.argv[1:]:
    R = S[gid]['regions']; key = TARGET.get(gid) or ('sheffield_cone6' if 'sheffield_cone6' in R else 'amaco_photo')
    t, o = h2(R[key]['median']), h2(O[gid])
    g = [max(0.5, min(2.0, (lin(a) + 1e-3) / (lin(b) + 1e-3))) ** 0.8 for a, b in zip(t, o)]
    print(gid, 'target', R[key]['median'], f'({key})', 'ours', O[gid], 'gain', [round(x, 2) for x in g])
    i = src.index(f"{{ id: '{gid}'"); j = src.index('\n  { id:', i + 5) if '\n  { id:' in src[i + 5:] else src.index('\n];', i)
    ent = src[i:j]
    def sc(m):
        c = h2(m.group(0)); return '#%02x%02x%02x' % tuple(int(round(max(0, min(255, srgb(min(1, lin(v) * k)))))) for v, k in zip(c, g))
    ent2 = re.sub(r'(?<=fired: )\[.*?\]\],', lambda m: re.sub(r'#[0-9a-f]{6}', sc, m.group(0)), ent, flags=re.S)
    ent2 = re.sub(r"(breakCol: )'(#[0-9a-f]{6})'", lambda m: m.group(1) + "'" + sc(re.match(r'#[0-9a-f]{6}', m.group(2))) + "'", ent2)
    ent2 = re.sub(r"(col: )'(#[0-9a-f]{6})'", lambda m: m.group(1) + "'" + sc(re.match(r'#[0-9a-f]{6}', m.group(2))) + "'", ent2)
    src = src[:i] + ent2 + src[j:]
open(os.path.join(ROOT, 'js/glazes.js'), 'w').write(src)
