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

export const FOOT_LIMITS = {
  height: [0.025, 0.88],
  thick: [0.02, 0.36],
  carve: [0.0, 0.24],
  stem: [0.14, 0.82],
  flare: [1.05, 2.45],
};

export const FOOT_STYLES = {
  ring: { family: 'visible', label: 'Visible foot ring', defaultH: 0.13 },
  raised: { family: 'visible', label: 'Raised foot ring', defaultH: 0.28 },
  pedestal: { family: 'visible', label: 'Pedestal / stem', defaultH: 0.55 },
  hidden: { family: 'hidden', label: 'Hidden foot ring', defaultH: 0.12 },
  recessed: { family: 'hidden', label: 'Recessed foot', defaultH: 0.07 },
  flat: { family: 'hidden', label: 'Flat base', defaultH: 0.032 },
};

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

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

export const SPOUT_LIMITS = {
  yFrac: [0.14, 0.88],
  len: [0.28, 2.55],
  tilt: [-0.72, 1.15],
  mouth: [0.45, 2.4],
};

export function ensureFoot(spec) {
  if (!spec) return spec;
  if (!FOOT_STYLES[spec.footStyle]) spec.footStyle = 'ring';
  if (spec.footH == null && spec.nodes && spec.nodes[0]) spec.footH = spec.nodes[0].y;
  if (spec.footThick == null) spec.footThick = clamp(spec.nodes[0].r * 0.18, FOOT_LIMITS.thick[0], FOOT_LIMITS.thick[1]);
  if (spec.footCarve == null) spec.footCarve = 0.075;
  if (spec.footStem == null) spec.footStem = 0.42;
  if (spec.footFlare == null) spec.footFlare = 1.55;
  return spec;
}

export function cloneSpec(s) {
  return ensureFoot({
    nodes: s.nodes.map(p => ({ r: p.r, y: p.y })),
    bulges: s.bulges.map(p => ({ r: p.r, y: p.y })),
    wall: s.wall,
    handle: s.handle,
    handlePos: s.handlePos,
    handleHeight: s.handleHeight,
    handleWidth: s.handleWidth,
    handleThick: s.handleThick,
    handleAz: s.handleAz,
    handleNodes: s.handleNodes ? s.handleNodes.map(p => ({ r: p.r, y: p.y })) : null,
    spout: s.spout,
    spoutSize: s.spoutSize,
    spoutY: s.spoutY,
    spoutLen: s.spoutLen,
    spoutTilt: s.spoutTilt,
    spoutMouth: s.spoutMouth,
    spoutAz: s.spoutAz,
    source: s.source,
    footStyle: s.footStyle,
    footH: s.footH,
    footThick: s.footThick,
    footCarve: s.footCarve,
    footStem: s.footStem,
    footFlare: s.footFlare,
  });
}

export function footGeom(spec) {
  ensureFoot(spec);
  const R = Math.max(0.12, spec.nodes[0].r);
  const Y = Math.max(0.02, spec.nodes[0].y);
  const style = spec.footStyle || 'ring';
  const thick = clamp(spec.footThick ?? R * 0.18, FOOT_LIMITS.thick[0], Math.min(FOOT_LIMITS.thick[1], R * 0.62));
  const carve = clamp(spec.footCarve ?? 0.075, FOOT_LIMITS.carve[0], FOOT_LIMITS.carve[1]);
  const stemF = clamp(spec.footStem ?? 0.42, FOOT_LIMITS.stem[0], FOOT_LIMITS.stem[1]);
  const flare = clamp(spec.footFlare ?? 1.55, FOOT_LIMITS.flare[0], FOOT_LIMITS.flare[1]);
  let footOut, footIn, recessR, stemR, baseR;
  if (style === 'pedestal') {
    stemR = Math.max(0.055, R * stemF);
    baseR = clamp(stemR * flare, stemR + 0.03, Math.max(R * 1.08, stemR * 1.25));
    footOut = baseR;
    footIn = Math.max(0.05, baseR - thick);
    recessR = footIn * 0.7;
  } else if (style === 'raised') {
    footOut = clamp(R * 0.7, 0.12, R - 0.025);
    footIn = Math.max(0.075, footOut - thick);
    recessR = footIn * 0.76;
    stemR = footOut;
    baseR = footOut;
  } else if (style === 'hidden') {
    footOut = clamp(R * 0.56, 0.11, R * 0.72);
    footIn = Math.max(0.075, footOut - thick);
    recessR = footIn * 0.74;
    stemR = footOut;
    baseR = footOut;
  } else if (style === 'recessed') {
    footOut = R * 0.97;
    footIn = Math.max(0.1, footOut - thick);
    recessR = footIn * 0.68;
    stemR = R;
    baseR = R;
  } else if (style === 'flat') {
    footOut = R;
    footIn = R;
    recessR = R * 0.5;
    stemR = R;
    baseR = R;
  } else {
    footOut = R * 0.93;
    footIn = Math.max(0.08, footOut - thick);
    recessR = footIn * 0.76;
    stemR = footOut;
    baseR = footOut;
  }
  const recessY = style === 'recessed'
    ? clamp(Math.max(carve, 0.055), 0.04, 0.28)
    : clamp(carve, 0.012, Math.max(0.02, Y * 0.72));
  return { R, Y, style, thick, carve, stemF, flare, footOut, footIn, recessR, stemR, baseR, recessY };
}

export function innerFloorY(spec) {
  ensureFoot(spec);
  const wall = spec.wall;
  const join = spec.nodes[0].y;
  const g = footGeom(spec);
  if (g.style === 'pedestal' || g.style === 'raised') return join + Math.max(0.05, wall * 0.95);
  if (g.style === 'flat') return Math.max(wall * 1.25, 0.055);
  if (g.style === 'recessed') return Math.max(g.recessY + wall + 0.035, join + wall * 0.6);
  return Math.max(join + 0.025, Math.min(join + wall + 0.1, Math.max(0.14, wall + 0.1)));
}

export function footWaxY(spec) {
  const g = footGeom(spec);
  if (g.style === 'flat') return 0.016;
  if (g.style === 'pedestal') return Math.min(0.04, 0.02 + g.thick * 0.12);
  if (g.style === 'recessed') return Math.min(g.Y + 0.02, Math.max(0.04, g.recessY + 0.01));
  if (g.style === 'hidden') return Math.min(g.Y * 0.42, Math.max(0.035, g.recessY * 0.45 + 0.018));
  if (g.style === 'raised') return Math.min(g.Y * 0.4, 0.11);
  return Math.min(g.Y * 0.48, 0.085);
}

export function drawCustomFoot(p, spec) {
  const g = footGeom(spec);
  const { R, Y, style, thick, footOut, footIn, recessR, stemR, baseR, recessY } = g;

  if (style === 'flat') {
    const y0 = 0.003;
    p.moveTo(0, y0);
    p.lineTo(Math.max(0.08, R - 0.045), y0);
    p.quadraticCurveTo(R - 0.012, y0, R, Math.min(0.018, Y * 0.45));
    if (Y > 0.022) p.lineTo(R, Y);
    else p.lineTo(R, Y);
    return g;
  }

  if (style === 'recessed') {
    const cy = recessY;
    const ringOut = Math.max(footOut, R * 0.94);
    const ringIn = Math.max(0.08, ringOut - thick);
    p.moveTo(0, cy);
    p.lineTo(ringIn * 0.7, cy);
    p.quadraticCurveTo(ringIn * 0.9, cy, ringIn, cy * 0.22);
    p.quadraticCurveTo(ringIn + thick * 0.2, 0, ringIn + thick * 0.5, 0);
    p.lineTo(Math.max(ringIn + thick * 0.5, ringOut - 0.012), 0);
    p.quadraticCurveTo(ringOut, 0, R, 0.01);
    p.lineTo(R, Y);
    return g;
  }

  if (style === 'hidden') {
    p.moveTo(0, recessY);
    p.lineTo(recessR, recessY);
    p.quadraticCurveTo(footIn - 0.008, recessY * 0.32, footIn, 0);
    p.lineTo(footOut, 0);
    p.quadraticCurveTo(footOut + 0.01, Y * 0.26, footOut + thick * 0.12, Y * 0.4);
    p.quadraticCurveTo(R * 0.96, Y * 0.16, R * 0.99, Y * 0.52);
    p.quadraticCurveTo(R, Y * 0.8, R, Y);
    return g;
  }

  if (style === 'pedestal') {
    const cy = Math.max(0.018, Math.min(recessY, 0.07));
    const inBase = Math.max(0.055, baseR - thick);
    const stemTop = Math.max(cy + 0.08, Y - 0.085);
    p.moveTo(0, cy);
    p.lineTo(inBase * 0.68, cy);
    p.quadraticCurveTo(inBase * 0.9, cy * 0.35, inBase, 0);
    p.lineTo(Math.max(inBase, baseR - 0.014), 0);
    p.quadraticCurveTo(baseR, 0, baseR, 0.028);
    p.quadraticCurveTo(baseR * 0.5 + stemR * 0.5, Y * 0.13, stemR, Y * 0.22);
    p.lineTo(stemR, stemTop);
    p.quadraticCurveTo(stemR * 0.35 + R * 0.65, Y - 0.028, R, Y);
    return g;
  }

  if (style === 'raised') {
    p.moveTo(0, recessY);
    p.lineTo(recessR, recessY);
    p.quadraticCurveTo(footIn * 0.88, recessY * 0.28, footIn, 0);
    p.lineTo(Math.max(footIn, footOut - 0.01), 0);
    p.quadraticCurveTo(footOut, 0, footOut, 0.022);
    p.lineTo(footOut, Math.max(0.05, Y * 0.76));
    p.quadraticCurveTo(footOut, Y * 0.9, (footOut + R) * 0.52, Y * 0.95);
    p.quadraticCurveTo(R * 0.9, Y, R, Y);
    return g;
  }

  p.moveTo(0, recessY);
  p.lineTo(recessR, recessY);
  p.quadraticCurveTo(recessR + 0.045, recessY, recessR + 0.05, recessY * 0.32);
  p.quadraticCurveTo(footIn - 0.004, 0, footIn + 0.018, 0);
  p.lineTo(Math.max(footIn + 0.018, footOut - 0.018), 0);
  p.quadraticCurveTo(footOut, 0, footOut + 0.006, 0.032);
  p.quadraticCurveTo(footOut + 0.016, Y - 0.022, R, Y);
  return g;
}

export function setFootH(spec, h) {
  ensureFoot(spec);
  h = clamp(h, FOOT_LIMITS.height[0], FOOT_LIMITS.height[1]);
  const dy = h - spec.nodes[0].y;
  if (Math.abs(dy) < 1e-9) {
    spec.footH = h;
    return;
  }
  for (const n of spec.nodes) n.y += dy;
  for (const b of spec.bulges) b.y += dy;
  if (spec.handleNodes) for (const n of spec.handleNodes) n.y += dy;
  spec.footH = spec.nodes[0].y;
}

export function setFootStyle(spec, style) {
  ensureFoot(spec);
  if (!FOOT_STYLES[style]) style = 'ring';
  spec.footStyle = style;
  setFootH(spec, FOOT_STYLES[style].defaultH);
  if (style === 'recessed' && spec.footCarve < 0.12) spec.footCarve = 0.14;
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
  const floorY = innerFloorY(spec);
  let V = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    let y0 = pts[i].y, y1 = pts[i + 1].y;
    let r0 = pts[i].r, r1 = pts[i + 1].r;
    if (y1 <= y0) continue;
    if (y1 <= floorY) continue;
    if (y0 < floorY) {
      const t = (floorY - y0) / (y1 - y0);
      r0 = r0 + (r1 - r0) * t;
      y0 = floorY;
    }
    const ir0 = Math.max(0, r0 - wall);
    const ir1 = Math.max(0, r1 - wall);
    V += Math.PI * (ir0 * ir0 + ir1 * ir1) * 0.5 * (y1 - y0);
  }
  return V * (UNIT_CM ** 3);
}

export function dimsCm(spec) {
  const h = spec.nodes[spec.nodes.length - 1].y * UNIT_CM;
  const rim = spec.nodes[spec.nodes.length - 1].r * 2 * UNIT_CM;
  const foot = spec.nodes[0].r * 2 * UNIT_CM;
  const wall = spec.wall * UNIT_CM;
  return { height: h, rim, foot, wall, ml: capacityMl(spec), floor: innerFloorY(spec) * UNIT_CM };
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

function inPlane(radial, y, az) {
  return new THREE.Vector3(radial * Math.cos(az), y, radial * Math.sin(az));
}

function planeBinormal(az) {
  return new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
}

export function spoutAzimuth(spec) {
  if (spec.spoutAz != null) return spec.spoutAz;
  return spec.handle !== 'none' ? Math.PI : 0;
}

export function handleAzimuth(spec) {
  if (spec.handleAz != null) return spec.handleAz;
  return spoutAzimuth(spec) + Math.PI;
}

export function spoutParams(spec) {
  const H = spec.nodes[spec.nodes.length - 1].y;
  const yFoot = spec.nodes[0].y;
  const wallH = Math.max(0.08, H - yFoot);
  const yFrac = clamp(spec.spoutY ?? 0.5, SPOUT_LIMITS.yFrac[0], SPOUT_LIMITS.yFrac[1]);
  const y0 = yFoot + wallH * yFrac;
  const r0 = radiusAt(spec, y0);
  const maxR = Math.max(...spec.nodes.map(n => n.r), ...spec.bulges.map(b => b.r), 0.4);
  const sz = spec.spoutSize || 1;
  const az = spoutAzimuth(spec);
  const baseOut = Math.max(0.55, 0.48 * maxR + 0.18 * H) * (0.8 + 0.45 * sz);
  const baseLift = Math.max(0.2, 0.32 * H) * sz;
  const defTilt = Math.atan2(baseLift, baseOut);
  const defL = Math.hypot(baseOut, baseLift);
  const len = clamp(spec.spoutLen != null ? spec.spoutLen : defL, SPOUT_LIMITS.len[0], SPOUT_LIMITS.len[1]);
  const tilt = clamp(spec.spoutTilt != null ? spec.spoutTilt : defTilt, SPOUT_LIMITS.tilt[0], SPOUT_LIMITS.tilt[1]);
  const mouth = clamp(spec.spoutMouth != null ? spec.spoutMouth : 1, SPOUT_LIMITS.mouth[0], SPOUT_LIMITS.mouth[1]);
  const out = len * Math.cos(tilt);
  const lift = len * Math.sin(tilt);
  const radRoot = Math.max(0.082, 0.11 * maxR) * (0.9 + 0.35 * sz);
  const radTip = Math.max(0.028, 0.034 * maxR) * (0.85 + 0.3 * sz) * mouth;
  const embed = Math.min(r0 * 0.32, radRoot * 1.35);
  return { H, yFoot, wallH, yFrac, y0, r0, az, len, tilt, out, lift, mouth, radRoot, radTip, embed, maxR };
}

export function setSpoutHeight(spec, y) {
  const H = spec.nodes[spec.nodes.length - 1].y;
  const yFoot = spec.nodes[0].y;
  const wallH = Math.max(0.08, H - yFoot);
  spec.spoutY = clamp((y - yFoot) / wallH, SPOUT_LIMITS.yFrac[0], SPOUT_LIMITS.yFrac[1]);
}

export function setSpoutTip(spec, radial, y) {
  const p = spoutParams(spec);
  const dr = radial - p.r0;
  const dy = y - p.y0;
  const len = clamp(Math.hypot(Math.max(0.12, dr), dy), SPOUT_LIMITS.len[0], SPOUT_LIMITS.len[1]);
  spec.spoutLen = len;
  spec.spoutTilt = clamp(Math.atan2(dy, Math.max(0.12, dr)), SPOUT_LIMITS.tilt[0], SPOUT_LIMITS.tilt[1]);
}

export function spoutWorld(spec) {
  const p = spoutParams(spec);
  const root = inPlane(p.r0, p.y0, p.az);
  const tip = inPlane(p.r0 + p.out, p.y0 + p.lift, p.az);
  const buried = inPlane(p.r0 - p.embed, p.y0, p.az);
  return { ...p, root, tip, buried };
}

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 6;
export const HANDLE_EMBED = 0.96;

function handleAttachYs(spec) {
  const H = spec.nodes[spec.nodes.length - 1].y;
  const pos = Math.max(0.04, spec.handlePos ?? 0.14);
  const hh = Math.max(0.18, spec.handleHeight ?? 0.42);
  const topY = Math.min(H - 0.02, H - pos);
  const botY = Math.max(spec.nodes[0].y + 0.06, topY - hh);
  return { H, topY, botY, hh, pos };
}

export function defaultHandleNodes(spec) {
  const { topY, botY, hh } = handleAttachYs(spec);
  const hw = Math.max(0.16, spec.handleWidth ?? 0.45);
  const rTop = radiusAt(spec, topY), rBot = radiusAt(spec, botY);
  if (spec.handle === 'side') {
    const midY = (topY + botY) / 2;
    const rMid = radiusAt(spec, midY);
    const span = Math.max(0.1, (topY - botY) * 0.42);
    return [
      { r: rMid * HANDLE_EMBED, y: midY + span },
      { r: rMid + hw * 0.9, y: midY + span * 0.55 },
      { r: rMid + hw * 1.05, y: midY - span * 0.35 },
      { r: rMid * HANDLE_EMBED, y: midY - span * 0.12 },
    ];
  }
  return [
    { r: rTop * HANDLE_EMBED, y: topY },
    { r: rTop + hw, y: topY + hh * 0.06 },
    { r: rBot + hw * 0.95, y: botY - hh * 0.03 },
    { r: rBot * HANDLE_EMBED, y: botY },
  ];
}

export function snapHandleEnds(spec) {
  const nodes = spec.handleNodes;
  if (!nodes || nodes.length < 2) return;
  const H = spec.nodes[spec.nodes.length - 1].y;
  const yLo = spec.nodes[0].y + 0.05;
  const yHi = H - 0.015;
  nodes[0].y = clamp(nodes[0].y, yLo, yHi);
  nodes[nodes.length - 1].y = clamp(nodes[nodes.length - 1].y, yLo, yHi);
  if (nodes[0].y < nodes[nodes.length - 1].y + 0.08) {
    // keep a usable span if both ends were clamped together
    if (nodes[0].y < (yLo + yHi) * 0.5) nodes[0].y = Math.min(yHi, nodes[nodes.length - 1].y + 0.12);
    else nodes[nodes.length - 1].y = Math.max(yLo, nodes[0].y - 0.12);
  }
  nodes[0].r = radiusAt(spec, nodes[0].y) * HANDLE_EMBED;
  nodes[nodes.length - 1].r = radiusAt(spec, nodes[nodes.length - 1].y) * HANDLE_EMBED;
}

export function ensureHandleNodes(spec) {
  if (spec.handle !== 'c' && spec.handle !== 'side') {
    spec.handleNodes = null;
    return null;
  }
  if (!spec.handleNodes || spec.handleNodes.length < HANDLE_MIN) {
    spec.handleNodes = defaultHandleNodes(spec);
  }
  if (spec.handleNodes.length > HANDLE_MAX) spec.handleNodes.length = HANDLE_MAX;
  snapHandleEnds(spec);
  return spec.handleNodes;
}

export function resetHandleNodes(spec) {
  spec.handleNodes = (spec.handle === 'c' || spec.handle === 'side') ? defaultHandleNodes(spec) : null;
  if (spec.handleNodes) snapHandleEnds(spec);
  return spec.handleNodes;
}

function handleNodeOut(spec, n) {
  return n.r - radiusAt(spec, n.y);
}

function syncHandleSlidersFromNodes(spec) {
  const nodes = spec.handleNodes;
  if (!nodes || nodes.length < 2) return;
  const H = spec.nodes[spec.nodes.length - 1].y;
  spec.handlePos = clamp(H - nodes[0].y, 0.04, 0.6);
  spec.handleHeight = clamp(Math.abs(nodes[0].y - nodes[nodes.length - 1].y), 0.2, 1.2);
  let maxOut = 0;
  for (let i = 1; i < nodes.length - 1; i++) maxOut = Math.max(maxOut, handleNodeOut(spec, nodes[i]));
  if (maxOut > 0) spec.handleWidth = clamp(maxOut, 0.16, 0.9);
}

export function setHandleWidth(spec, w) {
  w = clamp(w, 0.16, 0.9);
  const nodes = ensureHandleNodes(spec);
  if (!nodes) { spec.handleWidth = w; return; }
  let maxOut = 0;
  for (let i = 1; i < nodes.length - 1; i++) maxOut = Math.max(maxOut, handleNodeOut(spec, nodes[i]));
  const s = w / Math.max(0.08, maxOut);
  for (let i = 1; i < nodes.length - 1; i++) {
    const wall = radiusAt(spec, nodes[i].y);
    nodes[i].r = wall + Math.max(0.08, handleNodeOut(spec, nodes[i]) * s);
  }
  spec.handleWidth = w;
}

export function setHandlePlacement(spec, pos, hh) {
  const nodes = ensureHandleNodes(spec);
  pos = clamp(pos, 0.04, 0.6);
  hh = clamp(hh, 0.2, 1.2);
  spec.handlePos = pos;
  spec.handleHeight = hh;
  if (!nodes) return;
  const { topY, botY } = handleAttachYs(spec);
  const oldTop = nodes[0].y, oldBot = nodes[nodes.length - 1].y;
  const span0 = oldTop - oldBot || 1;
  const span1 = topY - botY;
  for (const n of nodes) {
    const t = (oldTop - n.y) / span0;
    n.y = topY - t * span1;
  }
  snapHandleEnds(spec);
}

export function constrainHandleNode(spec, i, r, y) {
  const nodes = ensureHandleNodes(spec);
  if (!nodes || i < 0 || i >= nodes.length) return;
  const H = spec.nodes[spec.nodes.length - 1].y;
  const yLo = spec.nodes[0].y + 0.04, yHi = H - 0.015;
  y = clamp(y, yLo, yHi);
  if (i === 0 || i === nodes.length - 1) {
    nodes[i].y = y;
    snapHandleEnds(spec);
    syncHandleSlidersFromNodes(spec);
    return;
  }
  const wall = radiusAt(spec, y);
  nodes[i].r = clamp(r, wall + 0.07, wall + 1.65);
  nodes[i].y = y;
  syncHandleSlidersFromNodes(spec);
}

export function addHandleNode(spec) {
  const nodes = ensureHandleNodes(spec);
  if (!nodes || nodes.length >= HANDLE_MAX) return -1;
  let best = 1, bestL = -1;
  for (let i = 0; i < nodes.length - 1; i++) {
    const L = Math.hypot(nodes[i + 1].r - nodes[i].r, nodes[i + 1].y - nodes[i].y);
    if (L > bestL) { bestL = L; best = i; }
  }
  const a = nodes[best], b = nodes[best + 1];
  nodes.splice(best + 1, 0, { r: (a.r + b.r) * 0.5, y: (a.y + b.y) * 0.5 });
  return best + 1;
}

export function addHandleNodeAtPoint(spec, r, y) {
  const nodes = ensureHandleNodes(spec);
  if (!nodes || nodes.length >= HANDLE_MAX) return -1;
  let bestI = 1, bestD = 1e9, bestT = 0.5;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const dx = b.r - a.r, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((r - a.r) * dx + (y - a.y) * dy) / L2, 0, 1);
    const pr = a.r + dx * t, py = a.y + dy * t;
    const d = Math.hypot(pr - r, py - y);
    if (d < bestD) { bestD = d; bestI = i + 1; bestT = t; }
  }
  if (bestT < 0.12 || bestT > 0.88) return -1;
  const a = nodes[bestI - 1], b = nodes[bestI];
  const nr = a.r + (b.r - a.r) * bestT, ny = a.y + (b.y - a.y) * bestT;
  for (const n of nodes) {
    if (Math.hypot(n.r - nr, n.y - ny) < 0.055) return -1;
  }
  nodes.splice(bestI, 0, { r: nr, y: ny });
  return bestI;
}

export function removeHandleNode(spec, index) {
  const nodes = spec.handleNodes;
  if (!nodes || nodes.length <= HANDLE_MIN) return -1;
  let best = index;
  if (best == null || best <= 0 || best >= nodes.length - 1) {
    best = Math.floor(nodes.length / 2);
  }
  if (best <= 0 || best >= nodes.length - 1) return -1;
  nodes.splice(best, 1);
  snapHandleEnds(spec);
  return best;
}

export function handleWorldNodes(spec) {
  const nodes = ensureHandleNodes(spec);
  if (!nodes) return [];
  const az = handleAzimuth(spec);
  return nodes.map((n, i) => {
    const p = inPlane(n.r, n.y, az);
    return { r: n.r, y: n.y, index: i, x: p.x, z: p.z, world: p };
  });
}

function handleCurve(spec) {
  const nodes = ensureHandleNodes(spec);
  const az = handleAzimuth(spec);
  const thick = Math.max(0.03, spec.handleThick);
  const binormal = planeBinormal(az);
  if (!nodes) return null;
  const pts = nodes.map(n => inPlane(n.r, n.y, az));
  return {
    curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.3),
    radius: spec.handle === 'side' ? thick * 0.92 : thick,
    flat: spec.handle === 'side' ? 0.85 : 0.7,
    binormal,
  };
}

export function sampleHandleWorld(spec, n = 36) {
  const hd = handleCurve(spec);
  if (!hd) return [];
  const out = [];
  for (let i = 0; i <= n; i++) out.push(hd.curve.getPointAt(i / n));
  return out;
}

function spoutCurve(spec) {
  const p = spoutParams(spec);
  const P = (r, y) => inPlane(r, y, p.az);
  return {
    curve: new THREE.CubicBezierCurve3(
      P(p.r0 - p.embed, p.y0),
      P(p.r0 + p.out * 0.22, p.y0 + p.lift * 0.05),
      P(p.r0 + p.out * 0.78, p.y0 + p.lift * 0.55),
      P(p.r0 + p.out, p.y0 + p.lift)
    ),
    radius: p.radRoot,
    radiusEnd: p.radTip,
    radiusTaper: 2.25,
    flat: 1,
    mouthFlat: 0.52,
    mouthFlare: 1.28,
    mouthCut: 0.9,
    binormal: planeBinormal(p.az),
  };
}

export function specToDef(spec) {
  ensureFoot(spec);
  const nodes = spec.nodes;
  const foot = nodes[0];
  const rim = nodes[nodes.length - 1];
  const height = rim.y;
  const wall = spec.wall;
  const p = new THREE.Path();
  const wallY = foot.y;
  drawCustomFoot(p, spec);
  for (let i = 0; i < nodes.length - 1; i++) {
    const b = spec.bulges[i];
    p.quadraticCurveTo(b.r, b.y, nodes[i + 1].r, nodes[i + 1].y);
  }
  const rw = Math.min(wall * 0.9, 0.07);
  p.quadraticCurveTo(rim.r + rw * 0.08, height + rw * 0.28, rim.r - wall * 0.35, height + rw * 0.12);
  p.quadraticCurveTo(rim.r - wall, height, rim.r - wall, height - rw * 0.85);

  const outer = sampleOuter(spec, 140);
  const rimCut = height - rw * 0.9;
  const floorY = innerFloorY(spec);
  for (let i = outer.length - 1; i >= 0; i--) {
    if (outer[i].y > rimCut || outer[i].y < floorY) continue;
    const a = outer[Math.max(0, i - 1)], b = outer[Math.min(outer.length - 1, i + 1)];
    const tx = b.r - a.r, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const nx = Math.max(0.4, ty / tl);
    const ir = Math.max(0.03, outer[i].r - wall * nx);
    p.lineTo(ir, Math.max(floorY, outer[i].y));
  }
  p.quadraticCurveTo(Math.max(0.04, foot.r - wall) * 0.45, floorY, 0, floorY);

  const handle = spec.handle === 'c' || spec.handle === 'side' ? handleCurve(spec) : null;
  const spoutTube = spec.spout === 'teapot' ? spoutCurve(spec) : null;
  const lip = spec.spout === 'lip' ? {
    theta: spoutAzimuth(spec),
    sigma: 0.34,
    span: Math.min(0.14, height * 0.16),
    amt: 0.2 * (0.8 + 0.4 * (spec.spoutMouth || spec.spoutSize || 1)),
  } : null;
  const maxR = Math.max(...nodes.map(n => n.r), ...spec.bulges.map(b => b.r));
  const elev = spec.footStyle === 'pedestal' ? 0.36
    : spec.footStyle === 'raised' ? 0.4
    : height < 0.55 * maxR ? 0.74 : height < 1.15 ? 0.52 : 0.3;
  return {
    path: p, height, waxY: footWaxY(spec), ridges: 0.002,
    handle, spoutTube, lip, elev, wallY,
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
    handleAz: mug ? 0 : undefined,
    handleNodes: null,
    spout: 'none',
    spoutSize: 1,
    spoutY: 0.5,
    spoutLen: undefined,
    spoutTilt: undefined,
    spoutMouth: 1,
    spoutAz: mug ? Math.PI : 0,
    source: meta.kind,
    footStyle: 'ring',
    footH: npts[0].y,
    footThick: clamp(npts[0].r * 0.18, FOOT_LIMITS.thick[0], FOOT_LIMITS.thick[1]),
    footCarve: 0.075,
    footStem: 0.42,
    footFlare: 1.55,
  };
}
