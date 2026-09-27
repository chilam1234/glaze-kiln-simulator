"""Find the glaze tiles/cups in the Sheffield Pottery PC charts (ref only) by connected components of non-white pixels."""
import sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from collections import deque
def comps(path, step=3, minpx=900):
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(int)
    sm = a[::step, ::step]; mx, mn = sm.max(2), sm.min(2)
    mask = ((mx - mn) > 28) | (mx < 150)          # coloured or dark = glaze (text is thin: removed by size)
    H, W = mask.shape; lab = np.zeros((H, W), int); out = []; n = 0
    for y in range(H):
        for x in range(W):
            if mask[y, x] and not lab[y, x]:
                n += 1; q = deque([(y, x)]); lab[y, x] = n; ys = []; xs = []
                while q:
                    cy, cx = q.popleft(); ys.append(cy); xs.append(cx)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        yy, xx = cy + dy, cx + dx
                        if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; q.append((yy, xx))
                if len(ys) * step * step >= minpx * 9:
                    out.append([min(xs) * step, min(ys) * step, max(xs) * step, max(ys) * step, len(ys)])
    return im, out
if __name__ == '__main__':
    res = {}
    for f in sys.argv[1:]:
        im, bx = comps(f); bx.sort(key=lambda b: (round(b[1] / 60), b[0]))
        d = ImageDraw.Draw(im); fnt = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 16)
        for i, b in enumerate(bx): d.rectangle(b[:4], outline=(255, 0, 0), width=2); d.text((b[0] + 3, b[1] + 3), str(i), font=fnt, fill=(255, 0, 255))
        im.save('/tmp/' + f.split('/')[-1] + '.boxes.png'); res[f] = bx; print(f, len(bx))
    json.dump(res, open('/tmp/sheffield_boxes.json', 'w'))
