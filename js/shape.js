// Custom pot silhouette: foot → 0–12 middle nodes → rim, each span a quadratic Bezier
// with a draggable bulge control. Shared by the lathe builder and the editor UI.
import * as THREE from 'three';

export const UNIT_CM = 10;            // 1 world unit = 10 cm (capacity: 1 unit³ = 1000 ml)
export const MAX_MID = 12;
export const MIN_NODE_GAP = 0.045;
export const LIMITS = {
  height: [0.32, 3.6],
  // Rim opening is independent of height: a tall pot can still flare wide.
  rimR: [0.12, 2.7],
  footR: [0.14, 1.85],
  wall: [0.028, 0.14],
  nodeR: [0.1, 2.7],
};

export function footAndBase(p, o) {
  const { recessR, footIn, footOut, wallR, wallY } = o;
  p.moveTo(0, 0.075);
  p.lineTo(recessR, 0.075);
  p.quadraticCurveTo(recessR + 0.06, 0.075, recessR + 0.07, 0.03);
  p.quadraticCurveTo(footIn - 0.005, 0.0, footIn + 0.025, 0.0);
  p.lineTo(footOut - 0.035, 0.0);
  p.quadraticCurveTo(footOut, 0.0, footOut + 0.008, 0.04);
  p.quadraticCurveTo(footOut + 0.02, wallY - 0.02, wallR, wallY);
}

export function cloneSpec(s) {
  return {
    nodes: s.nodes.map(p => ({ r: p.r, y: p.y })),
    bulges: s.bulges.map(p => ({ r: p.r, y: p.y })),
    wall: s.wall,
    handle: s.handle,
    handlePos: s.handlePos,
    handleHeight: s.handleHeight,
    handleWidth: s.handleWidth,
    handleThick: s.handleThick,
    spout: s.spout,
    spoutSize: s.spoutSize,
    source: s.source,
  };
}

export function quadPoint(p0, c, p1, t) {
  const u = 1 - t;
  return {
    r: u * u * p0.r + 2 * u * t * c.r + t * t * p1.r,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

export function sampleOuter(spec, n = 80) {
  const segs = spec.nodes.length - 1;
  const per = Math.max(4, Math.ceil(n / segs));
  const pts = [];
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < per; k++) {
      if (i > 0 && k === 0) continue;
      pts.push(quadPoint(spec.nodes[i], spec.bulges[i], spec.nodes[i + 1], k / per));
    }
  }
  const last = spec.nodes[spec.nodes.length - 1];
  pts.push({ r: last.r, y: last.y });
  return pts;
}

export function radiusAt(spec, y) {
  const n = spec.nodes;
  if (y <= n[0].y) return n[0].r;
  if (y >= n[n.length - 1].y) return n[n.length - 1].r;
  for (let i = 0; i < n.length - 1; i++) {
    if (y > n[i + 1].y) continue;
    let lo = 0, hi = 1, p = n[i];
    for (let k = 0; k < 18; k++) {
      const m = (lo + hi) / 2;
      p = quadPoint(n[i], spec.bulges[i], n[i + 1], m);
      if (p.y < y) lo = m; else hi = m;
    }
    return p.r;
  }
  return n[n.length - 1].r;
}

function bezierLen(p0, c, p1) {
  let s = 0, prev = p0;
  for (let k = 1; k <= 8; k++) {
    const p = quadPoint(p0, c, p1, k / 8);
    s += Math.hypot(p.r - prev.r, p.y - prev.y);
    prev = p;
  }
  return s;
}

export function capacityMl(spec) {
  const pts = sampleOuter(spec, 160);
  const wall = spec.wall;
  let V = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dy = pts[i + 1].y - pts[i].y;
    if (dy <= 0) continue;
    const r0 = Math.max(0, pts[i].r - wall);
    const r1 = Math.max(0, pts[i + 1].r - wall);
    V += Math.PI * (r0 * r0 + r1 * r1) * 0.5 * dy;
  }
  return V * (UNIT_CM ** 3);
}

export function dimsCm(spec) {
  const h = spec.nodes[spec.nodes.length - 1].y * UNIT_CM;
  const rim = spec.nodes[spec.nodes.length - 1].r * 2 * UNIT_CM;
  const foot = spec.nodes[0].r * 2 * UNIT_CM;
  const wall = spec.wall * UNIT_CM;
  return { height: h, rim, foot, wall, ml: capacityMl(spec) };
}

function splitSpan(spec, i, t) {
  const p0 = spec.nodes[i], c = spec.bulges[i], p1 = spec.nodes[i + 1];
  const mid = quadPoint(p0, c, p1, t);
  const c1 = { r: (1 - t) * p0.r + t * c.r, y: (1 - t) * p0.y + t * c.y };
  const c2 = { r: (1 - t) * c.r + t * p1.r, y: (1 - t) * c.y + t * p1.y };
  spec.nodes.splice(i + 1, 0, mid);
  spec.bulges.splice(i, 1, c1, c2);
  return i + 1;
}

export function addNode(spec) {
  if (spec.nodes.length >= 2 + MAX_MID) return spec;
  let best = 0, bestL = -1;
  for (let i = 0; i < spec.nodes.length - 1; i++) {
    const L = bezierLen(spec.nodes[i], spec.bulges[i], spec.nodes[i + 1]);
    if (L > bestL) { bestL = L; best = i; }
  }
  splitSpan(spec, best, 0.5);
  return spec;
}

export function addNodeAt(spec, y) {
  if (spec.nodes.length >= 2 + MAX_MID) return -1;
  const n = spec.nodes;
  if (y <= n[0].y + MIN_NODE_GAP || y >= n[n.length - 1].y - MIN_NODE_GAP) return -1;
  let i = 0;
  for (; i < n.length - 1; i++) if (y <= n[i + 1].y) break;
  if (y - n[i].y < MIN_NODE_GAP || n[i + 1].y - y < MIN_NODE_GAP) return -1;
  const p0 = n[i], c = spec.bulges[i], p1 = n[i + 1];
  let lo = 0, hi = 1;
  for (let k = 0; k < 20; k++) {
    const m = (lo + hi) / 2;
    if (quadPoint(p0, c, p1, m).y < y) lo = m; else hi = m;
  }
  return splitSpan(spec, i, (lo + hi) / 2);
}

export function removeNode(spec, index) {
  if (spec.nodes.length <= 2) return -1;
  let best = index;
  if (best == null || best <= 0 || best >= spec.nodes.length - 1) {
    const midH = (spec.nodes[0].y + spec.nodes[spec.nodes.length - 1].y) / 2;
    best = 1; let bd = 1e9;
    for (let i = 1; i < spec.nodes.length - 1; i++) {
      const d = Math.abs(spec.nodes[i].y - midH);
      if (d < bd) { bd = d; best = i; }
    }
  }
  return removeNodeAt(spec, best);
}

export function removeNodeAt(spec, index) {
  if (spec.nodes.length <= 2) return -1;
  if (index <= 0 || index >= spec.nodes.length - 1) return -1;
  const nc = { r: spec.nodes[index].r, y: spec.nodes[index].y };
  spec.nodes.splice(index, 1);
  spec.bulges.splice(index - 1, 2, nc);
  return index;
}

export function setHeight(spec, h) {
  h = Math.min(LIMITS.height[1], Math.max(LIMITS.height[0], h));
  const n = spec.nodes, base = n[0].y, old = n[n.length - 1].y;
  const s = (h - base) / Math.max(0.08, old - base);
  for (let i = 1; i < n.length; i++) n[i].y = base + (n[i].y - base) * s;
  for (const b of spec.bulges) b.y = base + (b.y - base) * s;
  n[n.length - 1].y = h;
}

export function setRimR(spec, r) {
  r = Math.min(LIMITS.rimR[1], Math.max(LIMITS.rimR[0], r));
  spec.nodes[spec.nodes.length - 1].r = r;
}

export function setFootR(spec, r) {
  spec.nodes[0].r = Math.min(LIMITS.footR[1], Math.max(LIMITS.footR[0], r));
}

export function constrainNode(spec, i, r, y) {
  const n = spec.nodes;
  r = Math.min(LIMITS.nodeR[1], Math.max(LIMITS.nodeR[0], r));
  if (i <= 0) {
    n[0].r = Math.min(LIMITS.footR[1], Math.max(LIMITS.footR[0], r));
    return;
  }
  if (i >= n.length - 1) {
    n[i].r = Math.min(LIMITS.rimR[1], Math.max(LIMITS.rimR[0], r));
    // Horizontal "open the mouth" drags should not squash the whole profile.
    if (y != null && Math.abs(y - n[i].y) > 0.045) setHeight(spec, y);
    return;
  }
  const lo = n[i - 1].y + 0.05, hi = n[i + 1].y - 0.05;
  n[i].r = r;
  n[i].y = Math.min(hi, Math.max(lo, y));
}

export function constrainBulge(spec, i, r, y) {
  const n = spec.nodes;
  const lo = n[i].y + 0.01, hi = n[i + 1].y - 0.01;
  spec.bulges[i].r = Math.min(LIMITS.nodeR[1], Math.max(0.06, r));
  spec.bulges[i].y = Math.min(hi, Math.max(lo, y));
}

function handleCurve(spec) {
  const H = spec.nodes[spec.nodes.length - 1].y;
  const pos = Math.max(0.04, spec.handlePos);
  const hh = Math.max(0.18, spec.handleHeight);
  const hw = Math.max(0.16, spec.handleWidth);
  const topY = Math.min(H - 0.02, H - pos);
  const botY = Math.max(spec.nodes[0].y + 0.06, topY - hh);
  const rTop = radiusAt(spec, topY), rBot = radiusAt(spec, botY);
  const thick = Math.max(0.03, spec.handleThick);
  if (spec.handle === 'c') {
    return {
      curve: new THREE.CubicBezierCurve3(
        new THREE.Vector3(rTop * 0.96, topY, 0),
        new THREE.Vector3(rTop + hw, topY + hh * 0.06, 0),
        new THREE.Vector3(rBot + hw * 0.95, botY - hh * 0.03, 0),
        new THREE.Vector3(rBot * 0.96, botY, 0)
      ),
      radius: thick,
      flat: 0.7,
    };
  }
  const midY = (topY + botY) / 2;
  const rMid = radiusAt(spec, midY);
  const span = Math.max(0.1, (topY - botY) * 0.42);
  return {
    curve: new THREE.CubicBezierCurve3(
      new THREE.Vector3(rMid * 0.96, midY + span, 0),
      new THREE.Vector3(rMid + hw * 0.9, midY + span * 0.55, 0),
      new THREE.Vector3(rMid + hw * 1.05, midY - span * 0.35, 0),
      new THREE.Vector3(rMid * 0.98, midY - span * 0.12, 0)
    ),
    radius: thick * 0.92,
    flat: 0.85,
  };
}

function spoutCurve(spec) {
  const H = spec.nodes[spec.nodes.length - 1].y;
  const maxR = Math.max(...spec.nodes.map(n => n.r), ...spec.bulges.map(b => b.r), 0.4);
  const y0 = spec.nodes[0].y + (H - spec.nodes[0].y) * 0.5;
  const r0 = radiusAt(spec, y0);
  const sz = spec.spoutSize || 1;
  const len = Math.max(0.55, 0.48 * maxR + 0.18 * H) * (0.8 + 0.45 * sz);
  const lift = Math.max(0.2, 0.32 * H) * sz;
  const s = spec.handle !== 'none' ? -1 : 1;
  const radRoot = Math.max(0.082, 0.11 * maxR) * (0.9 + 0.35 * sz);
  const radTip = Math.max(0.028, 0.034 * maxR) * (0.85 + 0.3 * sz);
  const embed = Math.min(r0 * 0.28, radRoot * 1.25);
  return {
    curve: new THREE.CubicBezierCurve3(
      new THREE.Vector3(s * (r0 - embed), y0, 0),
      new THREE.Vector3(s * (r0 + len * 0.22), y0 + lift * 0.05, 0),
      new THREE.Vector3(s * (r0 + len * 0.78), y0 + lift * 0.55, 0),
      new THREE.Vector3(s * (r0 + len), y0 + lift, 0)
    ),
    radius: radRoot,
    radiusEnd: radTip,
    radiusTaper: 2.25,
    flat: 1,
  };
}

export function specToDef(spec) {
  const nodes = spec.nodes;
  const foot = nodes[0];
  const rim = nodes[nodes.length - 1];
  const height = rim.y;
  const wall = spec.wall;
  const p = new THREE.Path();
  const wallY = foot.y;
  footAndBase(p, {
    recessR: foot.r * 0.58,
    footIn: foot.r * 0.70,
    footOut: foot.r * 0.91,
    wallR: foot.r,
    wallY,
  });
  for (let i = 0; i < nodes.length - 1; i++) {
    const b = spec.bulges[i];
    p.quadraticCurveTo(b.r, b.y, nodes[i + 1].r, nodes[i + 1].y);
  }
  const rw = Math.min(wall * 0.9, 0.07);
  p.quadraticCurveTo(rim.r + rw * 0.08, height + rw * 0.28, rim.r - wall * 0.35, height + rw * 0.12);
  p.quadraticCurveTo(rim.r - wall, height, rim.r - wall, height - rw * 0.85);

  const outer = sampleOuter(spec, 140);
  const rimCut = height - rw * 0.9;
  for (let i = outer.length - 1; i >= 0; i--) {
    if (outer[i].y > rimCut) continue;
    const a = outer[Math.max(0, i - 1)], b = outer[Math.min(outer.length - 1, i + 1)];
    const tx = b.r - a.r, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const nx = Math.max(0.4, ty / tl);
    const ir = Math.max(0.03, outer[i].r - wall * nx);
    p.lineTo(ir, outer[i].y);
  }
  const floorY = Math.min(0.26, Math.max(0.16, wall + 0.11));
  p.quadraticCurveTo(Math.max(0.04, foot.r - wall) * 0.45, floorY, 0, floorY);

  const handle = spec.handle === 'c' || spec.handle === 'side' ? handleCurve(spec) : null;
  const spoutTube = spec.spout === 'teapot' ? spoutCurve(spec) : null;
  const lip = spec.spout === 'lip' ? {
    theta: spec.handle !== 'none' ? Math.PI : 0,
    sigma: 0.34,
    span: Math.min(0.14, height * 0.16),
    amt: 0.2 * (0.8 + 0.4 * (spec.spoutSize || 1)),
  } : null;
  const maxR = Math.max(...nodes.map(n => n.r), ...spec.bulges.map(b => b.r));
  const elev = height < 0.55 * maxR ? 0.74 : height < 1.15 ? 0.52 : 0.3;
  return {
    path: p, height, waxY: Math.min(wallY + 0.015, 0.2), ridges: 0.002,
    handle, spoutTube, lip, elev,
  };
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const a = pts[0], b = pts[pts.length - 1];
  const lab = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b[1] - a[1]) * pts[i][0] - (b[0] - a[0]) * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / lab;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const left = rdp(pts.slice(0, idx + 1), eps);
    const right = rdp(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

export function extractCustom(path, meta) {
  const raw = path.getSpacedPoints(2500).map(p => [p.x, p.y]);
  let iRim = 0;
  for (let i = 0; i < raw.length; i++) if (raw[i][1] > raw[iRim][1]) iRim = i;
  let i0 = 0;
  for (let i = 0; i <= iRim; i++) {
    if (raw[i][1] >= (meta.waxY || 0.12) + 0.008 && raw[i][0] > 0.12) { i0 = i; break; }
  }
  const outer = raw.slice(i0, iRim + 1);
  const midY = (raw[i0][1] + raw[iRim][1]) * 0.55;
  let outerR = 0, innerR = 1e9;
  for (const p of raw) {
    if (Math.abs(p[1] - midY) < 0.05) {
      if (p[0] > outerR) outerR = p[0];
      if (p[0] > 0.04 && p[0] < innerR) innerR = p[0];
    }
  }
  let wall = 0.055;
  if (innerR < 1e8 && outerR - innerR > 0.025 && outerR - innerR < 0.11) wall = outerR - innerR;
  wall = Math.min(LIMITS.wall[1], Math.max(LIMITS.wall[0], wall));

  const cap = 2 + MAX_MID;
  let eps = 0.042, nodes = rdp(outer, eps);
  while (nodes.length > cap && eps < 0.35) { eps *= 1.28; nodes = rdp(outer, eps); }
  if (nodes.length < 2) nodes = [outer[0], outer[outer.length - 1]];
  if (nodes.length > cap) {
    const mid = nodes.slice(1, -1);
    const keep = [];
    const mids = Math.min(MAX_MID, mid.length);
    for (let k = 0; k < mids; k++) keep.push(mid[Math.round(k * (mid.length - 1) / Math.max(1, mids - 1))]);
    nodes = [nodes[0], ...keep, nodes[nodes.length - 1]];
  }
  const npts = nodes.map(p => ({ r: p[0], y: p[1] }));
  for (let i = 1; i < npts.length; i++) {
    if (npts[i].y <= npts[i - 1].y + 0.03) npts[i].y = npts[i - 1].y + 0.04;
  }
  npts[0].r = Math.max(LIMITS.footR[0], npts[0].r);
  npts[npts.length - 1].y = raw[iRim][1];
  npts[npts.length - 1].r = raw[iRim][0];

  const bulges = [];
  for (let i = 0; i < npts.length - 1; i++) {
    const yMid = (npts[i].y + npts[i + 1].y) / 2;
    let best = outer[0], bd = 1e9;
    for (const p of outer) {
      const d = Math.abs(p[1] - yMid);
      if (d < bd) { bd = d; best = p; }
    }
    bulges.push({
      r: Math.max(0.1, 2 * best[0] - 0.5 * (npts[i].r + npts[i + 1].r)),
      y: 2 * best[1] - 0.5 * (npts[i].y + npts[i + 1].y),
    });
  }

  const H = npts[npts.length - 1].y;
  const mug = meta.kind === 'mug';
  return {
    nodes: npts,
    bulges,
    wall,
    handle: mug ? 'c' : 'none',
    handlePos: mug ? 0.22 : 0.14,
    handleHeight: mug ? Math.min(0.78, H * 0.55) : Math.min(0.65, H * 0.42),
    handleWidth: mug ? 0.5 : 0.45,
    handleThick: 0.055,
    spout: 'none',
    spoutSize: 1,
    source: meta.kind,
  };
}
