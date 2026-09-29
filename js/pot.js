// Pot shapes: profile curves -> custom lathe geometry with arc-length UVs, plus per-row geometric maps
// (radius, height, normal, curvature-derived edge/cavity maps, gravity direction) used by painting and firing.
import * as THREE from 'three';
import { footAndBase, specToDef, extractCustom as extractFromPath } from './shape.js';
export { UNIT_CM, dimsCm, capacityMl, cloneSpec, addNode, removeNode, setHeight, setRimR, setFootR, constrainNode, constrainBulge, LIMITS, MAX_MID } from './shape.js';

export const TEX_W = 1024;   // around the pot (u)
export const TEX_H = 1024;   // along the profile, foot -> outer wall -> rim -> inner wall -> centre (v)

const PROFILES = {
  cylinder() {
    const p = new THREE.Path();
    footAndBase(p, { recessR: 0.46, footIn: 0.56, footOut: 0.73, wallR: 0.80, wallY: 0.13 });
    p.bezierCurveTo(0.815, 0.6, 0.80, 1.4, 0.78, 1.93);
    p.quadraticCurveTo(0.776, 2.0, 0.745, 2.0);           // rounded rim
    p.quadraticCurveTo(0.712, 2.0, 0.708, 1.94);
    p.bezierCurveTo(0.725, 1.4, 0.735, 0.7, 0.725, 0.36); // inner wall
    p.quadraticCurveTo(0.72, 0.245, 0.6, 0.245);          // inner corner fillet (recess)
    p.lineTo(0.0, 0.235);
    return { path: p, height: 2.0, waxY: 0.135, ridges: 0.0022 };
  },
  bowl() {
    const p = new THREE.Path();
    footAndBase(p, { recessR: 0.34, footIn: 0.43, footOut: 0.58, wallR: 0.66, wallY: 0.13 });
    p.bezierCurveTo(0.98, 0.2, 1.17, 0.55, 1.22, 1.0);
    p.quadraticCurveTo(1.228, 1.07, 1.19, 1.07);           // rim
    p.quadraticCurveTo(1.152, 1.07, 1.148, 1.01);
    p.bezierCurveTo(1.1, 0.58, 0.8, 0.21, 0.0, 0.2);       // inner bowl to centre (horizontal tangent)
    return { path: p, height: 1.07, waxY: 0.135, ridges: 0.0 };
  },
  vase() {
    const p = new THREE.Path();
    footAndBase(p, { recessR: 0.36, footIn: 0.45, footOut: 0.6, wallR: 0.68, wallY: 0.14 });
    p.bezierCurveTo(0.96, 0.3, 1.06, 0.78, 0.97, 1.18);    // lower body to belly
    p.bezierCurveTo(0.90, 1.48, 0.46, 1.62, 0.33, 1.84);   // shoulder
    p.quadraticCurveTo(0.27, 1.96, 0.30, 2.14);            // neck
    p.quadraticCurveTo(0.33, 2.32, 0.46, 2.38);            // flaring lip
    p.quadraticCurveTo(0.49, 2.40, 0.465, 2.425);          // rim
    p.quadraticCurveTo(0.44, 2.44, 0.41, 2.415);
    p.quadraticCurveTo(0.28, 2.33, 0.25, 2.14);            // inner lip/neck
    p.quadraticCurveTo(0.215, 1.95, 0.28, 1.82);
    p.bezierCurveTo(0.42, 1.58, 0.85, 1.46, 0.91, 1.18);
    p.bezierCurveTo(0.99, 0.78, 0.9, 0.34, 0.6, 0.27);
    p.quadraticCurveTo(0.45, 0.24, 0.0, 0.24);
    return { path: p, height: 2.44, waxY: 0.15, ridges: 0.002 };
  },
  plate() {
    // wide and shallow: low foot ring, flaring outer wall, rounded raised rim, sloping marly down into a flat well
    const p = new THREE.Path();
    p.moveTo(0, 0.06);
    p.lineTo(0.6, 0.06);
    p.quadraticCurveTo(0.66, 0.06, 0.67, 0.025);
    p.quadraticCurveTo(0.68, 0.0, 0.71, 0.0);
    p.lineTo(0.83, 0.0);
    p.quadraticCurveTo(0.86, 0.0, 0.865, 0.03);
    p.quadraticCurveTo(0.875, 0.075, 0.95, 0.085);
    p.bezierCurveTo(1.12, 0.1, 1.28, 0.2, 1.34, 0.285);    // outer wall
    p.quadraticCurveTo(1.365, 0.325, 1.325, 0.335);        // rolled rim
    p.quadraticCurveTo(1.285, 0.34, 1.255, 0.305);
    p.bezierCurveTo(1.15, 0.2, 0.98, 0.15, 0.86, 0.148);   // marly sloping into the well
    p.quadraticCurveTo(0.8, 0.145, 0.7, 0.14);             // well wall -> floor
    p.lineTo(0.0, 0.135);
    return { path: p, height: 0.34, waxY: 0.07, ridges: 0.0, elev: 0.78 };
  },
  chawan() {
    // tea bowl: tall trimmed foot ring left bare, upright slightly swelling walls, soft irregular rim
    const p = new THREE.Path();
    p.moveTo(0, 0.1);
    p.lineTo(0.28, 0.1);
    p.quadraticCurveTo(0.33, 0.1, 0.34, 0.05);
    p.quadraticCurveTo(0.35, 0.0, 0.39, 0.0);
    p.lineTo(0.45, 0.0);
    p.quadraticCurveTo(0.49, 0.0, 0.495, 0.045);
    p.lineTo(0.485, 0.165);                                  // tall foot wall
    p.quadraticCurveTo(0.485, 0.215, 0.56, 0.225);           // trimmed step under the body
    p.bezierCurveTo(0.8, 0.26, 0.92, 0.55, 0.89, 0.97);     // body
    p.quadraticCurveTo(0.885, 1.035, 0.85, 1.035);           // rim
    p.quadraticCurveTo(0.815, 1.035, 0.815, 0.975);
    p.bezierCurveTo(0.84, 0.56, 0.72, 0.31, 0.0, 0.29);     // inside to the centre (chadamari)
    return { path: p, height: 1.04, waxY: 0.2, ridges: 0.0028, elev: 0.5,
      // hand-thrown irregularity: the rim undulates and the body is slightly out of round
      wobble: (th, y, h) => {
        const tr = smooth(0.72, 0.99, y / h), bd = smooth(0.25, 0.9, y / h);
        return { dy: tr * (0.03 * Math.sin(2 * th + 0.7) + 0.017 * Math.sin(3 * th + 2.1) + 0.009 * Math.sin(5 * th + 0.3)),
                 sr: 1 + bd * (0.02 * Math.sin(3 * th + 1.3) + 0.01 * Math.sin(2 * th + 4.0)) };
      } };
  },
  bottle() {
    const p = new THREE.Path();
    footAndBase(p, { recessR: 0.3, footIn: 0.38, footOut: 0.52, wallR: 0.6, wallY: 0.13 });
    p.bezierCurveTo(0.95, 0.3, 1.0, 0.95, 0.8, 1.3);       // round body
    p.bezierCurveTo(0.58, 1.58, 0.22, 1.62, 0.175, 1.88);  // shoulder into the neck
    p.bezierCurveTo(0.155, 2.1, 0.15, 2.4, 0.155, 2.62);   // long narrow neck
    p.quadraticCurveTo(0.16, 2.72, 0.2, 2.75);             // lip
    p.quadraticCurveTo(0.215, 2.78, 0.18, 2.79);           // rim
    p.quadraticCurveTo(0.14, 2.795, 0.125, 2.72);
    p.bezierCurveTo(0.118, 2.4, 0.12, 2.1, 0.13, 1.88);    // inner neck
    p.bezierCurveTo(0.17, 1.6, 0.52, 1.52, 0.74, 1.28);
    p.bezierCurveTo(0.93, 0.95, 0.88, 0.32, 0.55, 0.26);
    p.quadraticCurveTo(0.4, 0.24, 0.0, 0.24);
    return { path: p, height: 2.8, waxY: 0.14, ridges: 0.002 };
  },
  jar() {
    const p = new THREE.Path();
    footAndBase(p, { recessR: 0.42, footIn: 0.52, footOut: 0.68, wallR: 0.76, wallY: 0.13 });
    p.bezierCurveTo(1.0, 0.35, 1.2, 0.95, 1.16, 1.35);     // body up to the broad shoulder
    p.bezierCurveTo(1.12, 1.62, 0.76, 1.73, 0.54, 1.75);   // shoulder
    p.quadraticCurveTo(0.475, 1.76, 0.475, 1.81);          // short collar
    p.lineTo(0.482, 1.9);
    p.quadraticCurveTo(0.487, 1.955, 0.452, 1.955);        // rim
    p.quadraticCurveTo(0.42, 1.955, 0.42, 1.9);
    p.lineTo(0.418, 1.8);
    p.bezierCurveTo(0.7, 1.67, 1.06, 1.57, 1.1, 1.35);     // inside the shoulder
    p.bezierCurveTo(1.14, 0.95, 0.95, 0.36, 0.65, 0.27);
    p.quadraticCurveTo(0.5, 0.24, 0.0, 0.24);
    return { path: p, height: 1.96, waxY: 0.14, ridges: 0.0022 };
  },
  mug() {
    const p = new THREE.Path();
    footAndBase(p, { recessR: 0.36, footIn: 0.44, footOut: 0.56, wallR: 0.62, wallY: 0.12 });
    p.bezierCurveTo(0.645, 0.5, 0.632, 1.0, 0.622, 1.4);
    p.quadraticCurveTo(0.619, 1.45, 0.59, 1.45);           // rim
    p.quadraticCurveTo(0.561, 1.45, 0.558, 1.4);
    p.bezierCurveTo(0.572, 1.0, 0.582, 0.5, 0.572, 0.3);   // inner wall
    p.quadraticCurveTo(0.567, 0.205, 0.45, 0.2);
    p.lineTo(0.0, 0.19);
    // pulled handle in the x-y plane (u = 0 side), both ends buried in the wall
    const handle = new THREE.CubicBezierCurve3(new THREE.Vector3(0.6, 1.2, 0), new THREE.Vector3(1.12, 1.3, 0), new THREE.Vector3(1.08, 0.42, 0), new THREE.Vector3(0.61, 0.42, 0));
    return { path: p, height: 1.45, waxY: 0.13, ridges: 0.002, handle: { curve: handle, radius: 0.055, flat: 0.7 } };
  },
};
export const SHAPES = Object.keys(PROFILES);

export function extractCustom(kind) {
  const def = PROFILES[kind]();
  return extractFromPath(def.path, { kind, waxY: def.waxY, height: def.height });
}

function resample(pts, n) {
  // pts: array of [r,y]; returns n+1 points evenly spaced in arc length, and total length
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  const out = []; let k = 0;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * L;
    while (k < cum.length - 2 && cum[k + 1] < s) k++;
    const t = (s - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
    out.push([pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t]);
  }
  return { pts: out, L };
}
function sampleAt(dense, v) { // v in [0,1]
  const f = v * (dense.length - 1); const i = Math.min(dense.length - 2, Math.floor(f)); const t = f - i;
  return [dense[i][0] + (dense[i + 1][0] - dense[i][0]) * t, dense[i][1] + (dense[i + 1][1] - dense[i][1]) * t];
}
function gaussBlur1D(a, sigma) {
  const r = Math.ceil(sigma * 3), n = a.length, out = new Float32Array(n), w = [];
  let ws = 0; for (let i = -r; i <= r; i++) { const x = Math.exp(-(i * i) / (2 * sigma * sigma)); w.push(x); ws += x; }
  for (let i = 0; i < n; i++) { let s = 0; for (let j = -r; j <= r; j++) { const k = Math.min(n - 1, Math.max(0, i + j)); s += a[k] * w[j + r]; } out[i] = s / ws; }
  return out;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildPot(kind, opts) {
  return finishPot(kind, PROFILES[kind](), opts);
}
export function buildCustomPot(spec, opts) {
  return finishPot('custom', specToDef(spec), opts);
}

function finishPot(kind, def, opts = {}) {
  const preview = !!opts.preview;
  const nRaw = preview ? 900 : 4000;
  const nDense = preview ? 1600 : 6000;
  const raw = def.path.getSpacedPoints(nRaw).map(p => [p.x, p.y]);
  let { pts: dense } = resample(raw, nRaw);
  // throwing ridges on near-vertical walls
  if (def.ridges > 0 && !preview) {
    const n = dense.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = dense[Math.max(0, i - 1)], b = dense[Math.min(n - 1, i + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      const nx = ty / tl, ny = -tx / tl;
      const y = dense[i][1];
      const m = smooth(0.75, 0.95, Math.abs(nx)) * smooth(def.waxY + 0.12, def.waxY + 0.3, y) * (1 - smooth(def.height - 0.3, def.height - 0.12, y));
      const phase = nx > 0 ? 0 : 1.7;
      const off = def.ridges * m * (Math.sin(y * 2 * Math.PI / 0.13 + phase) + 0.35 * Math.sin(y * 2 * Math.PI / 0.047));
      out.push([dense[i][0] + nx * off, y + ny * off]);
    }
    dense = out;
  }
  const rs = resample(dense, nDense); dense = rs.pts; const L = rs.L;

  // ---- texture rows: body [0, Hp); extras (handle, teapot spout) after separator rows ----
  const extras = [];
  if (def.handle) extras.push({ ...def.handle, kind: 'handle' });
  if (def.spoutTube) extras.push({ ...def.spoutTube, kind: 'spout' });
  const H = TEX_H, SEP = 6;
  const extraL = extras.map(e => e.curve.getLength());
  const Lh = extraL.reduce((a, b) => a + b, 0);
  const nSep = extras.length * SEP;
  const ds = (L + Lh) / Math.max(1, H - nSep);
  const Hp = extras.length ? Math.round(L / ds) : H;
  const ranges = [];
  let cursor = Hp;
  for (let i = 0; i < extras.length; i++) {
    cursor += SEP;
    const start = cursor;
    const restL = extraL.slice(i).reduce((a, b) => a + b, 0);
    const restRows = H - start;
    const take = i === extras.length - 1 ? restRows : Math.max(8, Math.round(restRows * extraL[i] / Math.max(1e-6, restL)));
    extras[i].v0 = start / H;
    extras[i].v1 = (start + take) / H;
    ranges.push({ start, end: start + take, extra: extras[i] });
    cursor = start + take;
  }

  const r = new Float32Array(H), y = new Float32Array(H), nr = new Float32Array(H), ny = new Float32Array(H), kap = new Float32Array(H);
  for (let k = 0; k < Hp; k++) {
    const v = (k + 0.5) / Hp;
    const p = sampleAt(dense, v), a = sampleAt(dense, Math.max(0, v - 0.5 / Hp)), b = sampleAt(dense, Math.min(1, v + 0.5 / Hp));
    r[k] = p[0]; y[k] = p[1];
    const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    nr[k] = ty / tl; ny[k] = -tx / tl;
  }
  const ang = new Float32Array(Hp);
  for (let k = 0; k < Hp; k++) ang[k] = Math.atan2(-nr[k], ny[k]);
  for (let k = 0; k < Hp; k++) {
    const a = ang[Math.max(0, k - 1)], b = ang[Math.min(Hp - 1, k + 1)];
    let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const span = (Math.min(Hp - 1, k + 1) - Math.max(0, k - 1)) * ds;
    kap[k] = d / span + 0.2 * nr[k] / Math.max(r[k], 0.25);
  }
  const kpot = kap.subarray(0, Hp);
  const kEdge = gaussBlur1D(kpot, 0.018 / ds), kCav = gaussBlur1D(kpot, 0.03 / ds), kWide = gaussBlur1D(kpot, 0.08 / ds);
  const edge = new Float32Array(H), cavity = new Float32Array(H), dir = new Int8Array(H), steep = new Float32Array(H), w = new Float32Array(H), wax = new Uint8Array(H), sep = new Uint8Array(H);
  for (let k = 0; k < Hp; k++) {
    edge[k] = smooth(3.0, 14.0, kEdge[k]);
    cavity[k] = Math.max(smooth(2.5, 10.0, -kCav[k]), 0.6 * smooth(0.8, 3.5, -kWide[k]));
    const dy = y[Math.min(Hp - 1, k + 1)] - y[Math.max(0, k - 1)];
    const dsl = (Math.min(Hp - 1, k + 1) - Math.max(0, k - 1)) * ds;
    steep[k] = Math.min(1, Math.abs(dy) / dsl);
    dir[k] = dy > 1e-6 ? -1 : (dy < -1e-6 ? 1 : 0);
    w[k] = Math.sqrt(r[k] * r[k] + 0.09 * 0.09);
    wax[k] = y[k] < def.waxY ? 1 : 0;
  }
  let handleFrom = H, handleTo = H, spoutFrom = H, spoutTo = H;
  const frame = extras.length ? { cx: new Float32Array(H), cy: new Float32Array(H), cz: new Float32Array(H), nx: new Float32Array(H), ny: new Float32Array(H), nz: new Float32Array(H), bx: new Float32Array(H), by: new Float32Array(H), bz: new Float32Array(H), from: ranges[0].start } : null;
  const Bv = new THREE.Vector3(0, 0, 1);
  let sepAt = Hp;
  for (const rg of ranges) {
    for (let k = sepAt; k < rg.start; k++) { wax[k] = 1; sep[k] = 1; r[k] = 0.05; y[k] = def.height; w[k] = 0.05; }
    const hd = rg.extra, Hh = Math.max(1, rg.end - rg.start);
    if (hd.kind === 'handle') { handleFrom = rg.start; handleTo = rg.end; }
    if (hd.kind === 'spout') { spoutFrom = rg.start; spoutTo = rg.end; }
    for (let k = rg.start; k < rg.end; k++) {
      const t = (k - rg.start + 0.5) / Hh;
      const tt = Math.min(1, Math.max(0, t));
      const c = hd.curve.getPointAt(tt), T = hd.curve.getTangentAt(tt), Nn = new THREE.Vector3().crossVectors(T, Bv).normalize();
      const rad = hd.radius + ((hd.radiusEnd ?? hd.radius) - hd.radius) * tt;
      r[k] = rad; y[k] = c.y; w[k] = rad;
      frame.cx[k] = c.x; frame.cy[k] = c.y; frame.cz[k] = c.z; frame.nx[k] = Nn.x; frame.ny[k] = Nn.y; frame.nz[k] = Nn.z; frame.bx[k] = Bv.x; frame.by[k] = Bv.y; frame.bz[k] = Bv.z;
      nr[k] = 0; ny[k] = 0; kap[k] = 0;
      steep[k] = Math.min(1, Math.abs(T.y)); dir[k] = T.y > 1e-3 ? -1 : (T.y < -1e-3 ? 1 : 0);
      edge[k] = 0.3; const end = Math.min(tt, 1 - tt); cavity[k] = 0.7 * (1 - smooth(0.02, 0.09, end));
    }
    sepAt = rg.end;
  }
  const rows = { r, y, nr, ny, edge, cavity, dir, steep, w, wax, sep, ds, L, kap, potRows: Hp, handleFrom, handleTo, spoutFrom, spoutTo, frame };

  const vs = Hp / H;
  const latheN = preview ? 180 : 480, latheS = preview ? 72 : 192;
  const lathe = makeLathe(dense, latheN, latheS, vs, def), latheLo = makeLathe(dense, 200, 72, vs, def);
  let geo = lathe, pickGeometry = latheLo;
  for (const ex of extras) {
    geo = mergeGeo(geo, makeTube(ex, preview ? 90 : 200, preview ? 20 : 48, ex.v0, ex.v1));
    pickGeometry = mergeGeo(pickGeometry, makeTube(ex, 80, 16, ex.v0, ex.v1));
  }
  function outerRadiusAt(h) {
    let best = 0;
    for (let k = 0; k < Hp; k++) if (Math.abs(y[k] - h) < 0.02 && r[k] > best) best = r[k];
    return best;
  }
  return { kind, geometry: geo, pickGeometry, rows, height: def.height, waxY: def.waxY, L, outerRadiusAt, elev: def.elev };
}

// tube around a curve, u around the tube (theta = u*2pi on the N/B frame), v from v0 to v1 along the curve
function makeTube(hd, NS, SEG, v0, v1 = 1) {
  const pos = [], nor = [], uv = [], index = [], B = new THREE.Vector3(0, 0, 1);
  const r0 = hd.radius, r1 = hd.radiusEnd ?? hd.radius;
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, c = hd.curve.getPointAt(t), T = hd.curve.getTangentAt(t), Nn = new THREE.Vector3().crossVectors(T, B).normalize();
    const rad = r0 + (r1 - r0) * t;
    for (let j = 0; j <= SEG; j++) {
      const th = j / SEG * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
      const f = hd.flat;
      const ox = Nn.x * cs * rad * f + B.x * sn * rad, oy = Nn.y * cs * rad * f + B.y * sn * rad, oz = Nn.z * cs * rad * f + B.z * sn * rad;
      pos.push(c.x + ox, c.y + oy, c.z + oz);
      const nx = Nn.x * cs / f + B.x * sn, ny = Nn.y * cs / f + B.y * sn, nz = Nn.z * cs / f + B.z * sn, nl = Math.hypot(nx, ny, nz);
      nor.push(nx / nl, ny / nl, nz / nl);
      uv.push(j / SEG, v0 + (v1 - v0) * t);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < SEG; j++) { const a = i * (SEG + 1) + j, b = a + SEG + 1; index.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  const A = new THREE.Vector3().fromArray(pos, 0), Bv = new THREE.Vector3().fromArray(pos, (SEG + 1) * 3), C = new THREE.Vector3().fromArray(pos, 3);
  const fn = new THREE.Vector3().subVectors(Bv, A).cross(new THREE.Vector3().subVectors(C, A));
  if (fn.dot(new THREE.Vector3().fromArray(nor, 0)) < 0) { const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const tmp = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = tmp; } }
  return g;
}
function mergeGeo(a, b) {
  const g = new THREE.BufferGeometry(), na = a.attributes.position.count;
  for (const name of ['position', 'normal', 'uv']) {
    const x = a.attributes[name].array, y = b.attributes[name].array, out = new Float32Array(x.length + y.length);
    out.set(x); out.set(y, x.length); g.setAttribute(name, new THREE.BufferAttribute(out, a.attributes[name].itemSize));
  }
  const ia = a.index.array, ib = b.index.array, idx = new Uint32Array(ia.length + ib.length);
  idx.set(ia); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + na;
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
  return g;
}

function makeLathe(dense, NS, SEG, vs = 1, def = {}) {
  const pos = new Float32Array((NS + 1) * (SEG + 1) * 3), nor = new Float32Array(pos.length), uv = new Float32Array((NS + 1) * (SEG + 1) * 2);
  for (let i = 0; i <= NS; i++) {
    const v = i / NS;
    const p = sampleAt(dense, v), a = sampleAt(dense, Math.max(0, v - 0.6 / NS)), b = sampleAt(dense, Math.min(1, v + 0.6 / NS));
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const pnr = ty, pny = -tx;
    for (let j = 0; j <= SEG; j++) {
      const u = j / SEG, th = u * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const idx = i * (SEG + 1) + j;
      const wb = def.wobble ? def.wobble(th, p[1], def.height) : null;
      let rr = p[0] * (wb ? wb.sr : 1), yy = p[1] + (wb ? wb.dy : 0);
      if (def.lip && pnr > 0.15) {
        let dth = th - def.lip.theta;
        dth = Math.atan2(Math.sin(dth), Math.cos(dth));
        const ang = Math.exp(-(dth * dth) / (2 * def.lip.sigma * def.lip.sigma));
        const ny = (p[1] - (def.height - def.lip.span)) / Math.max(1e-4, def.lip.span);
        const vert = ny <= 0 ? 0 : ny >= 1 ? Math.max(0, 1.15 - ny) * Math.max(0, 1.15 - ny) : ny * ny * (3 - 2 * ny);
        rr += def.lip.amt * ang * vert;
        yy += def.lip.amt * 0.14 * ang * vert;
      }
      pos[idx * 3] = rr * c; pos[idx * 3 + 1] = yy; pos[idx * 3 + 2] = rr * s;
      nor[idx * 3] = pnr * c; nor[idx * 3 + 1] = pny; nor[idx * 3 + 2] = pnr * s;
      uv[idx * 2] = u; uv[idx * 2 + 1] = v * vs;
    }
  }
  const index = [];
  for (let i = 0; i < NS; i++) for (let j = 0; j < SEG; j++) {
    const a = i * (SEG + 1) + j, b = a + SEG + 1, c = a + 1, d = b + 1;
    index.push(a, c, b, c, d, b);
  }
  {
    const i = Math.floor(NS * 0.3), a = i * (SEG + 1), b = a + SEG + 1, c = a + 1;
    const A = new THREE.Vector3().fromArray(pos, a * 3), B = new THREE.Vector3().fromArray(pos, b * 3), C = new THREE.Vector3().fromArray(pos, c * 3);
    const fn = new THREE.Vector3().subVectors(C, A).cross(new THREE.Vector3().subVectors(B, A));
    const vn = new THREE.Vector3().fromArray(nor, a * 3);
    if (fn.dot(vn) < 0) for (let t = 0; t < index.length; t += 3) { const tmp = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = tmp; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}
