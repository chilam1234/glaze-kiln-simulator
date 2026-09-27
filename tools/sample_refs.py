"""Sample reference colours from the AMACO / Sheffield photos into ref/samples.json (reference only, not shipped).
Regions, not pixels: background (white/grey studio backdrop) is masked out by distance from the corner colour,
specular highlights (top 6% luminance) and deepest shadow (bottom 2%) are dropped, then we report the median plus
dark-band (pooled/thick for translucent glazes) and light-band (thin/break) means and 3 k-means clusters (variegation)."""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from amaco_refs import MATCH, APP, SHEF_URL
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
hx = lambda c: '#%02x%02x%02x' % tuple(int(round(v)) for v in c)
def pixels(path, rect=None, inner=None, mask_bg=True):
    im = Image.open(os.path.join(ROOT, path)).convert('RGB')
    if rect: im = im.crop(rect)
    a = np.asarray(im).astype(float)
    if inner:  # fractional inner crop (x0,y0,x1,y1)
        h, w = a.shape[:2]; a = a[int(inner[1] * h):int(inner[3] * h), int(inner[0] * w):int(inner[2] * w)]
    p = a.reshape(-1, 3)
    if mask_bg:
        h, w = a.shape[:2]; cs = np.concatenate([a[:6, :6].reshape(-1, 3), a[:6, -6:].reshape(-1, 3), a[-6:, :6].reshape(-1, 3), a[-6:, -6:].reshape(-1, 3)])
        bg = np.median(cs, 0)
        if bg.min() > 200:   # only mask real white/grey studio backdrops
            p = p[np.linalg.norm(p - bg, axis=1) > 32]
    return p
def stats(p, k=3):
    L = p @ [0.2126, 0.7152, 0.0722]; o = np.argsort(L); p, L = p[o], L[o]; n = len(p)
    p = p[int(n * 0.02):int(n * 0.94)]; n = len(p)
    band = lambda a, b: p[int(n * a):int(n * b)].mean(0)
    rng = np.random.default_rng(0); q = p[rng.choice(n, min(n, 6000), replace=False)]
    c = q[rng.choice(len(q), k, replace=False)]
    for _ in range(25):
        lab = np.argmin(((q[:, None] - c[None]) ** 2).sum(2), 1)
        c = np.array([q[lab == i].mean(0) if (lab == i).any() else c[i] for i in range(k)])
    share = np.bincount(lab, minlength=k) / len(q); o = np.argsort(-share)
    return {'median': hx(np.median(p, 0)), 'dark': hx(band(0.05, 0.25)), 'mid': hx(band(0.4, 0.6)), 'light': hx(band(0.75, 0.95)),
            'clusters': [[hx(c[i]), round(float(share[i]), 2)] for i in o], 'n': int(n)}
CUP_INNER = (0.14, 0.22, 0.86, 0.84)
out = {'_about': 'Reference colour samples for glaze matching. NOT shipped with the app. dark/light = mean of the 5-25% / 75-95% luminance bands '
                 '(highlights and shadows trimmed); clusters = 3-means with area share.', '_sources': {'amaco': 'https://shop.amaco.com/', 'sheffield': SHEF_URL},
       '_sheffield_chart_check': 'Codes/names on the Sheffield cone 6 + cone 10 charts agree with amaco.com for PC-2 Saturation Gold, PC-20 Blue Rutile, PC-30 Temmoku, PC-31 Oatmeal, PC-40 True Celadon, PC-42 Seaweed, PC-59 Deep Firebrick. The chart also shows PC-50 Shino, which is not on amaco.com now, so shino is matched to SH-11 Chai Gloss instead (PC-50 kept here as a related sample). Default match target: cone 6.'}
for gid, m in MATCH.items():
    if m is None: out[gid] = {'match': None, 'note': 'no reasonable AMACO match; generic glaze kept'}; continue
    e = {'match': f"{m['code']} {m['name']}", 'url': m['url'], 'regions': {}}
    R = e['regions']
    if 'app' in m:
        for key, rc in APP.items(): R[f'amaco_app_{key}'] = dict(src=m['app'], rect=rc, note={'t1': 'application tile: light coat (thin)', 't2': 'slightly light coat', 't3': 'slightly heavy coat (thick)', 'cup': 'sake cup (ridges: breaks + pools)'}[key], **stats(pixels(m['app'], rc, mask_bg=key == 'cup')))
    if 'photo' in m:
        if 'rects' in m:
            for key, rc in m['rects'].items(): R[f'amaco_photo_{key}'] = dict(src=m['photo'], rect=rc, note=f'application tile ({key})', **stats(pixels(m['photo'], rc, mask_bg=False)))
        else: R['amaco_photo'] = dict(src=m['photo'], note='whole product photo, backdrop masked', **stats(pixels(m['photo'])))
    if 'photo2' in m:
        if 'rects2' in m:
            for key, rc in m['rects2'].items(): R[f'amaco_photo2_{key}'] = dict(src=m['photo2'], rect=rc, note=f'application tile ({key})', **stats(pixels(m['photo2'], rc, mask_bg=False)))
        else: R['amaco_photo2'] = dict(src=m['photo2'], note='whole product photo, backdrop masked', **stats(pixels(m['photo2'])))
    for key, cone in (('c6', 6), ('c10', 10)):
        rel = m.get(key + '_rel'); box = m.get(key) or (rel[1] if rel else None)
        if box:
            src = f'ref/sheffield/pc-cone{cone}.jpg'
            R[f'sheffield_cone{cone}'] = dict(src=src, rect=box, note=f'Sheffield chart cone {cone} test {"cup" if cone == 6 else "tile"}, inner body region' + (f' - related glaze {rel[0]}' if rel else ''),
                                            **stats(pixels(src, box, CUP_INNER if cone == 6 else (0.1, 0.1, 0.9, 0.9))))
    out[gid] = e
json.dump(out, open(os.path.join(ROOT, 'ref/samples.json'), 'w'), indent=1)
for gid, e in out.items():
    if gid.startswith('_'): continue
    print('==', gid, e.get('match'))
    for k, r in (e.get('regions') or {}).items(): print(f'   {k:22s} med {r["median"]} dark {r["dark"]} light {r["light"]} cl {r["clusters"]}')
