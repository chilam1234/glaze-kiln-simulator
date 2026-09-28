// Glaze state stored in UV space: one thickness map + paint-order stamp map per glaze (so any number of glazes
// can overlap per texel and we know which is on top). Painting, pouring, CPU firing simulation (leveling,
// gravity flow with drips), and composition into the textures the shader samples.
import { TEX_W, TEX_H } from './pot.js';
import { GLAZES, pairFor, CONE10 } from './glazes.js';
import { fbm3, voronoi3 } from './noise.js';

const W = TEX_W, H = TEX_H, N = W * H;
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hexLin(h) {
  const n = parseInt(h.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
}
const LUT = new Uint8Array(4097);
for (let i = 0; i <= 4096; i++) { const v = i / 4096; LUT[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
const toS = v => LUT[(clamp01(v) * 4096) | 0];

let G = [];
let fireCone = 6;
function buildGlazeTable(cone) {
  const c10 = cone === 10;
  return GLAZES.map(g => {
    const pal = c10 ? CONE10[g.id] : null;
    const fired = pal?.fired
      ? g.fired.map((s, i) => pal.fired[i] ? [s[0], pal.fired[i], s[2], s[3]] : s)
      : g.fired;
    const stops = fired.map(s => {
      let rough = s[3];
      if (c10) rough = rough > 0.15 ? 0.15 + (rough - 0.15) * 0.55 : rough * 0.85;
      return [s[0], s[1], s[2], rough];
    });
    const breakCol = pal?.breakCol || g.breakCol;
    const vari = pal?.vari !== undefined ? pal.vari : g.vari;
    return {
      ...g,
      fired: stops,
      breakCol,
      vari,
      fluidity: c10 ? Math.min(1.45, g.fluidity * 1.38) : g.fluidity,
      poolAmt: c10 ? g.poolAmt * 1.22 : g.poolAmt,
      float: c10 ? Math.min(1, (g.float ?? 0.3) * 1.12) : (g.float ?? 0.3),
      breakAmt: c10 ? Math.min(1.15, g.breakAmt * 1.08) : g.breakAmt,
      rawL: hexLin(g.raw),
      stopsL: stops.map(s => [s[0], hexLin(s[1]), s[2], s[3]]),
      breakL: breakCol ? hexLin(breakCol) : null,
      variA: (vari ? [].concat(vari) : []).map(v => ({ ...v, L: hexLin(v.col) })),
      transl: g.transl || 0, rutile: g.rutile || 0, iron: g.iron || 0, metal: g.metal || 0,
    };
  });
}
G = buildGlazeTable(6);
export function setFireCone(cone) { fireCone = cone === 10 ? 10 : 6; G = buildGlazeTable(fireCone); }
export function getFireCone() { return fireCone; }
const NG = G.length, RUTILE_GOLD = hexLin('#9a6630'), RUTILE_CREAM = hexLin('#d9c9a0');
const nz = v => clamp01((v - 0.5) * 3.2 + 0.5);   // stretch fbm (clustered around 0.5) to ~0..1
export const GLAZE_INDEX = Object.fromEntries(GLAZES.map((g, i) => [g.id, i]));
const PAIR_L = {};
for (let a = 0; a < G.length; a++) for (let b = 0; b < G.length; b++) {
  const p = pairFor(G[a].id, G[b].id);
  PAIR_L[a * NG + b] = p ? { color: hexLin(p.color), halo: hexLin(p.halo), strength: p.strength, cover: p.cover || 0 } : null;
}
function sampleStops(g, t, out) { // out: [r,g,b,op,rough]
  const s = G[g].stopsL;
  if (t <= s[0][0]) { const k = t / s[0][0]; out[0] = s[0][1][0]; out[1] = s[0][1][1]; out[2] = s[0][1][2]; out[3] = s[0][2] * k; out[4] = s[0][3]; return; }
  for (let i = 1; i < s.length; i++) if (t <= s[i][0]) {
    const a = s[i - 1], b = s[i], k = (t - a[0]) / (b[0] - a[0]);
    out[0] = a[1][0] + (b[1][0] - a[1][0]) * k; out[1] = a[1][1] + (b[1][1] - a[1][1]) * k; out[2] = a[1][2] + (b[1][2] - a[1][2]) * k;
    out[3] = a[2] + (b[2] - a[2]) * k; out[4] = a[3] + (b[3] - a[3]) * k; return;
  }
  const l = s[s.length - 1]; out[0] = l[1][0]; out[1] = l[1][1]; out[2] = l[1][2]; out[3] = l[2]; out[4] = l[3];
}
const CLAY_RAW_A = hexLin('#b3aba1'), CLAY_RAW_B = hexLin('#a0978b');
const CLAY_F_A = hexLin('#6f5848'), CLAY_F_B = hexLin('#8c7461'), CLAY_F_DARK = hexLin('#6e4630'), CLAY_FLASH = hexLin('#95603e'), BODY_UNDER = hexLin('#6f6a60');
const CARBON = hexLin('#5f5751'), TEN_RUST = hexLin('#8a3b12'), TEN_FUR = hexLin('#5a2a10');

export class GlazeState {
  constructor() {
    this.thick = GLAZES.map(() => new Float32Array(N));
    this.stamp = GLAZES.map(() => new Uint16Array(N));
    this.fired = null;            // post-flow thickness arrays when fired
    this.strokeBuf = new Float32Array(N);
    this.strokeId = 1;
    this.color = new Uint8Array(N * 4); this.props = new Uint8Array(N * 4); this.fx = new Uint8Array(N * 4); this.height = new Uint8Array(N * 4);
    this.mode = 'raw';
    this.waxFoot = true;
    this.onUpload = () => {};
  }
  setPot(pot) {
    this.pot = pot; const R = pot.rows;
    this.nLow = new Float32Array(N); this.nMid = new Float32Array(N); this.nLow2 = new Float32Array(N); this.streak = new Float32Array(N);
    this.cellE = new Float32Array(N); this.cellId = new Float32Array(N); const vo = [0, 0];   // floating cells
    const cs = new Float32Array(W), sn = new Float32Array(W);
    for (let j = 0; j < W; j++) { const th = (j + 0.5) / W * Math.PI * 2; cs[j] = Math.cos(th); sn[j] = Math.sin(th); }
    const Fm = R.frame;
    for (let k = 0; k < H; k++) {
      const r = R.r[k], y0 = R.y[k], hf = Fm && k >= Fm.from;
      for (let j = 0; j < W; j++) {
        const i = k * W + j;
        let x = r * cs[j], y = y0, z = r * sn[j];
        if (hf) { x = Fm.cx[k] + r * (cs[j] * Fm.nx[k] + sn[j] * Fm.bx[k]); y = Fm.cy[k] + r * (cs[j] * Fm.ny[k] + sn[j] * Fm.by[k]); z = Fm.cz[k] + r * (cs[j] * Fm.nz[k] + sn[j] * Fm.bz[k]); }
        this.nLow[i] = fbm3(x * 2.5, y * 2.5, z * 2.5, 3);
        this.nMid[i] = fbm3(x * 14 + 3, y * 14, z * 14, 2);
        this.nLow2[i] = fbm3(x * 5 + 9, y * 5, z * 5, 3);
        this.streak[i] = fbm3(x * 16 + 1, y * 1.6, z * 16, 3);
        const wq = 0.9 * (this.nMid[i] - 0.5); voronoi3(x * 17 + wq, y * 17 - wq, z * 17 + wq, vo); this.cellE[i] = vo[0]; this.cellId[i] = vo[1];
      }
    }
    this.clear();
  }
  clear() {
    for (const a of this.thick) a.fill(0);
    for (const a of this.stamp) a.fill(0);
    this.fired = null; this.mode = 'raw'; this.strokeId = 1;
    this.composeRaw(0, H - 1);
  }
  stats() {
    return GLAZES.map((g, gi) => { let s = 0; const a = this.thick[gi]; for (let i = 0; i < N; i++) s += a[i]; return [g.id, +(s / N).toFixed(5)]; });
  }
  // ---------- painting ----------
  beginStroke() { this.strokeBuf.fill(0); this.strokeId = (this.strokeId + 1) & 0xffff || 1; }
  dab(u, v, radius, gi, amount) {
    const R = this.pot.rows, ds = R.ds, kc = Math.min(H - 1, Math.floor(v * H)), sc = v * H;
    const kr = Math.ceil(radius / ds) + 1, T = this.thick[gi], S = this.stamp[gi], sb = this.strokeBuf;
    // stay inside the part that was hit: the thrown body's rows or the handle's rows
    const inHandle = kc >= R.handleFrom, lo = inHandle ? R.handleFrom : 0, hi = inHandle ? H - 1 : R.potRows - 1;
    const k0 = Math.max(lo, kc - kr), k1 = Math.min(hi, kc + kr);
    const jc = u * W;
    for (let k = k0; k <= k1; k++) {
      if ((this.waxFoot && R.wax[k]) || R.sep[k]) continue;
      const dsd = (k + 0.5 - sc) * ds; if (Math.abs(dsd) > radius) continue;
      const rr = Math.max(R.r[k], 1e-3), dth = 2 * Math.PI / W;
      let half = Math.ceil(Math.sqrt(radius * radius - dsd * dsd) / (rr * dth)) + 1; if (half > W / 2) half = W / 2;
      for (let dj = -half; dj < half; dj++) {
        const jj = Math.floor(jc) + dj, j = ((jj % W) + W) % W;
        const du = (jj + 0.5 - jc) * dth * rr;
        const d = Math.sqrt(du * du + dsd * dsd) / radius; if (d >= 1) continue;
        const i = k * W + j;
        const f = smooth(1.0, 0.35, d) * (0.82 + 0.36 * this.nMid[i]);
        if (f > sb[i]) { T[i] = Math.min(2.5, T[i] + (f - sb[i]) * amount); sb[i] = f; S[i] = this.strokeId; }
      }
    }
    this.composeRaw(k0, k1);
  }
  pour(gi, h, mode, amount) {
    this.beginStroke();
    const R = this.pot.rows, yh = h >= 0.99 ? this.pot.height + 0.2 : h <= 0.01 ? -0.2 : h * this.pot.height, T = this.thick[gi], S = this.stamp[gi];
    for (let k = 0; k < H; k++) {
      if ((this.waxFoot && R.wax[k]) || R.sep[k]) continue;
      const y = R.y[k];
      if (Math.abs(y - yh) > 0.08 && ((mode === 'below') !== (y < yh))) continue;
      for (let j = 0; j < W; j++) {
        const i = k * W + j;
        const line = yh + 0.035 * (this.nLow[i] - 0.5) + 0.008 * (this.nMid[i] - 0.5);
        const f = mode === 'below' ? smooth(line + 0.006, line - 0.006, y) : smooth(line - 0.006, line + 0.006, y);
        if (f <= 0) continue;
        T[i] = Math.min(2.5, T[i] + f * amount * (0.92 + 0.16 * this.nLow2[i])); S[i] = this.strokeId;
      }
    }
    this.composeRaw(0, H - 1);
  }
  // ---------- raw (unfired) composition ----------
  composeRaw(k0, k1) {
    if (this.mode !== 'raw') return;
    const R = this.pot.rows, C = this.color, P = this.props, F = this.fx, Hh = this.height, ng = G.length;
    const idx = new Int32Array(ng);
    for (let k = k0; k <= k1; k++) for (let j = 0; j < W; j++) {
      const i = k * W + j, o = i * 4;
      const nl = this.nLow[i], nm = this.nMid[i];
      let r = CLAY_RAW_A[0] + (CLAY_RAW_B[0] - CLAY_RAW_A[0]) * nl, g = CLAY_RAW_A[1] + (CLAY_RAW_B[1] - CLAY_RAW_A[1]) * nl, b = CLAY_RAW_A[2] + (CLAY_RAW_B[2] - CLAY_RAW_A[2]) * nl;
      let n = 0, tot = 0;
      for (let q = 0; q < ng; q++) if (this.thick[q][i] > 0.004) { idx[n++] = q; tot += this.thick[q][i]; }
      // sort by paint order (bottom first)
      for (let a = 1; a < n; a++) { const x = idx[a]; let c = a - 1; while (c >= 0 && this.stamp[idx[c]][i] > this.stamp[x][i]) { idx[c + 1] = idx[c]; c--; } idx[c + 1] = x; }
      for (let a = 0; a < n; a++) {
        const q = idx[a], t = this.thick[q][i], op = smooth(0.0, 0.16, t) * 0.97, shade = (1 - 0.07 * Math.min(t, 1.5)) * (0.955 + 0.09 * nm), rc = G[q].rawL;
        r += (rc[0] * shade - r) * op; g += (rc[1] * shade - g) * op; b += (rc[2] * shade - b) * op;
      }
      C[o] = toS(r); C[o + 1] = toS(g); C[o + 2] = toS(b); C[o + 3] = 255;
      const cov = smooth(0, 0.12, tot);
      P[o] = 0; P[o + 1] = 235 - 15 * cov; P[o + 2] = 0; P[o + 3] = 255;
      F[o] = 0; F[o + 1] = 0; F[o + 2] = Math.round(255 * (1 - cov) * 0.55); F[o + 3] = 0;
      Hh[o] = Math.min(255, tot * 110); Hh[o + 1] = Hh[o]; Hh[o + 2] = Hh[o]; Hh[o + 3] = 255;
    }
    this.onUpload();
  }
  // ---------- firing ----------
  async fire(onProgress = () => {}, seed) {
    this._t0 = performance.now();
    this.seed = (seed ?? this.fixedSeed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const R = this.pot.rows;
    const act = [], actG = [];
    for (let q = 0; q < G.length; q++) { let s = 0; const a = this.thick[q]; for (let i = 0; i < N; i += 7) s += a[i]; if (s > 0) { act.push(Float32Array.from(a)); actG.push(q); } }
    const A = act.length;
    const fired = GLAZES.map(() => null); actG.forEach((q, n) => fired[q] = act[n]);
    const fl = actG.map(q => G[q].fluidity);
    const t0 = performance.now();
    const tmp = new Float32Array(N);
    const cone10 = fireCone === 10;
    // 1) melt leveling: brush marks relax (anisotropic small blur, stronger for fluid glazes)
    for (let n = 0; n < A; n++) {
      const a = act[n], c = 0.12 + 0.3 * fl[n];
      for (let pass = 0; pass < (cone10 ? 4 : 3); pass++) {
        for (let k = 0; k < H; k++) for (let j = 0; j < W; j++) {
          const i = k * W + j, l = k * W + ((j + W - 1) % W), rr = k * W + ((j + 1) % W), up = k < H - 1 ? i + W : i, dn = k > 0 ? i - W : i;
          tmp[i] = a[i] + c * 0.25 * (a[l] + a[rr] + a[up] + a[dn] - 4 * a[i]);
        }
        a.set(tmp);
      }
    }
    // 1b) long-range gravity redistribution: a cheap 1D run along the profile (per row: covered fraction + mean
    //     thickness of the covered part) for many steps per glaze. Glaze thickens toward the foot, bowl bottoms and the
    //     lower edge of a band, and thins high on walls; mapped back as a per-row ratio. The 2D passes add local runs.
    const T0 = cone10 ? 0.34 : 0.42;
    const stpAll = actG.map(q => Uint16Array.from(this.stamp[q]));
    for (let n = 0; n < A; n++) {
      const a = act[n], f = new Float64Array(H), tc = new Float64Array(H);
      for (let k = 0; k < H; k++) { let s1 = 0, c1 = 0; for (let j = 0; j < W; j++) { const t = a[k * W + j]; if (t > 0.05) { s1 += t; c1++; } } f[k] = c1 / W; tc[k] = c1 ? s1 / c1 : 0; }
      const fe = new Float64Array(H); for (let k = 0; k < H; k++) fe[k] = Math.max(f[k], 0.03);
      const T1 = Float64Array.from(tc), D = new Float64Array(H), c = 0.5 * fl[n];
      for (let it = 0; it < (cone10 ? 1100 : 900); it++) {
        D.fill(0);
        for (let k = 0; k < H; k++) {
          const dir = R.dir[k]; if (!dir || R.wax[k]) continue; const kd = k + dir; if (kd < 0 || kd >= H || R.wax[kd] || f[kd] < 0.05) continue;   // sheet stops at the edge of the glazed area; drips carry it on
          const t = T1[k]; if (t <= T0) continue;
          let q = c * R.steep[k] * (t - T0) * t; if (q > 0.3 * (t - T0)) q = 0.3 * (t - T0);
          D[k] -= q; D[kd] += q * (R.w[k] * fe[k]) / (R.w[kd] * fe[kd]);
        }
        for (let k = 0; k < H; k++) T1[k] += D[k];
      }
      const g = new Float32Array(H);
      for (let k = 0; k < H; k++) g[k] = (R.wax[k] || tc[k] < 0.05) ? 1 : Math.min(3.0, Math.max(0.35, T1[k] / tc[k]));
      const gs = new Float32Array(H); for (let k = 0; k < H; k++) { let s2 = 0, c2 = 0; for (let d = -3; d <= 3; d++) { const kk = k + d; if (kk >= 0 && kk < H) { s2 += g[kk]; c2++; } } gs[k] = s2 / c2; }
      for (let k = 0; k < H; k++) { const m = gs[k]; if (m === 1) continue; for (let j = 0; j < W; j++) a[k * W + j] *= m; }
    }
    const stp = stpAll;   // fired copy of paint order; runs carry their order along
    const applyDrips = this.addDrips(act, actG, fl, stp, T0);   // paths now, deposits after the sheet flow
    onProgress(0.1);
    // 2) gravity flow: film flux ~ excess * thickness (kinematic wave -> beads/drips), streak noise -> rivulets
    const ITER = cone10 ? 190 : 150, dls = act.map(() => new Float32Array(N)), kq = 0.3;
    // flow rate modulation: gentle sheet variation + sparse narrow "drip channels" (object-space noise stretched vertically)
    const rowMod = new Float32Array(N), chan = new Float32Array(N);
    {
      const cs = new Float32Array(W), sn = new Float32Array(W);
      for (let j = 0; j < W; j++) { const th = (j + 0.5) / W * Math.PI * 2; cs[j] = Math.cos(th); sn[j] = Math.sin(th); }
      const Fm = R.frame;
      for (let k = 0; k < H; k++) { const r = R.r[k], y0 = R.y[k], hf = Fm && k >= Fm.from; for (let j = 0; j < W; j++) {
        const i = k * W + j;
        let x = r * cs[j], y = y0, z = r * sn[j];
        if (hf) { x = Fm.cx[k] + r * (cs[j] * Fm.nx[k] + sn[j] * Fm.bx[k]); y = Fm.cy[k] + r * (cs[j] * Fm.ny[k] + sn[j] * Fm.by[k]); z = Fm.cz[k] + r * (cs[j] * Fm.nz[k] + sn[j] * Fm.bz[k]); }
        const d = fbm3(x * 30 + 5, y * 0.9, z * 30, 2);
        rowMod[i] = 0.5 + 0.7 * this.streak[i]; chan[i] = 4.5 * smooth(0.6, 0.8, d);
      } }
    }
    for (let it = 0; it < ITER; it++) {
      for (const d of dls) d.fill(0);
      for (let k = 0; k < H; k++) {
        const dir = R.dir[k]; if (!dir) continue;
        const kd = k + dir; if (kd < 0 || kd >= H || R.wax[kd]) continue;
        const st = R.steep[k]; if (st < 0.004) continue;
        // how many rows a fast drip channel may advance this step (keeps channels faster than the sheet while staying monotone)
        let maxS = 1; while (maxS < 3) { const kk = k + dir * (maxS + 1); if (kk < 0 || kk >= H || R.wax[kk] || R.dir[k + dir * maxS] !== dir) break; maxS++; }
        const base = kq * st;
        for (let j = 0; j < W; j++) {
          const i = k * W + j;
          let tot = 0, fs = 0, m1 = 0, m2 = 0;
          for (let n = 0; n < A; n++) { const t = act[n][i]; tot += t; fs += t * fl[n]; if (t > m1) { m2 = m1; m1 = t; } else if (t > m2) m2 = t; }
          if (tot <= T0) continue;
          const mix = m2 > 0 ? 4 * m1 * m2 / ((m1 + m2) * (m1 + m2)) : 0;
          const F = fs / tot * (1 + 1.8 * mix);   // the top glaze fluxes the one below: overlaps melt runnier
          const cf = chan[i] * smooth(0.35, 0.9, F);
          let q = base * F * (rowMod[i] + cf) * (tot - T0) * tot;
          if (q > 0.3 * (tot - T0)) q = 0.3 * (tot - T0);   // monotone/stable: never overshoot the yield thickness
          const sN = 1;
          const kk = k + dir * sN, id = kk * W + j, f = q / tot, wr = R.w[k] / R.w[kk];
          for (let n = 0; n < A; n++) { const dq = act[n][i] * f; dls[n][i] -= dq; dls[n][id] += dq * wr; if (dq > 0.01 && stp[n][id] < stp[n][i]) stp[n][id] = stp[n][i]; }
        }
      }
      for (let n = 0; n < A; n++) { const a = act[n], d = dls[n]; for (let i = 0; i < N; i++) a[i] += d[i]; }
      if (it % 6 === 5) for (let n = 0; n < A; n++) { // surface-tension leveling keeps the melt smooth
        const a = act[n], c = 0.06 + 0.1 * fl[n];
        for (let k = 0; k < H; k++) { if (R.wax[k]) { for (let j = 0; j < W; j++) tmp[k * W + j] = a[k * W + j]; continue; }
          for (let j = 0; j < W; j++) {
          const i = k * W + j, l = k * W + ((j + W - 1) % W), rr = k * W + ((j + 1) % W);
          const up = k < H - 1 && !R.wax[k + 1] ? i + W : i, dn = k > 0 && !R.wax[k - 1] ? i - W : i;
          tmp[i] = a[i] + c * 0.25 * (a[l] + a[rr] + a[up] + a[dn] - 4 * a[i]);
        } }
        a.set(tmp);
      }
      if (it % 10 === 9) { onProgress(0.1 + 0.8 * it / ITER); await new Promise(r => setTimeout(r, 0)); }
    }
    applyDrips();
    this.firedStamp = GLAZES.map(() => null); actG.forEach((q, n) => this.firedStamp[q] = stp[n]);
    console.log(`fire sim: ${A} glazes, ${(performance.now() - t0).toFixed(0)} ms`);
    this.fired = fired; this.mode = 'fired';
    const tc = performance.now(); this.composeFired(); this.composeMs = performance.now() - tc; this.fireMs = performance.now() - this._t0;
    onProgress(1);
  }
  // 3) runs/drips. Seeded per firing. Sources are sampled where the melt is thicker than a wall can hold, with
  //    probability, volume and width driven by local excess thickness x fluidity (thin areas: few or none). Each drip is
  //    a small volume that walks downhill, meandering sideways (coherent surface noise + its own random walk), gets
  //    kicked sideways and slowed by throwing rings, may fork, may be drawn into and merge with an earlier drip, and
  //    ends in a bead whose size is whatever volume it has left (or pools at the wax line / where the wall flattens).
  addDrips(act, actG, fl, stp, T0) {
    const R = this.pot.rows, A = act.length, Tdrip = T0 + 0.1, seed = this.seed >>> 0;
    let st = seed || 1;
    const rnd = () => { st = (st + 0x6D2B79F5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const texPerWorld = k => W / (2 * Math.PI * Math.max(R.r[k], 0.05));
    const noiseShift = Math.floor(rnd() * W);           // shifts the coherent wander field per firing
    const potentialAt = (i, k) => {
      let tot = 0, fs = 0, m1 = 0, m2 = 0;
      for (let n = 0; n < A; n++) { const t = act[n][i]; tot += t; fs += t * fl[n]; if (t > m1) { m2 = m1; m1 = t; } else if (t > m2) m2 = t; }
      if (tot <= Tdrip) return null;
      const mix = m2 > 0 ? 4 * m1 * m2 / ((m1 + m2) * (m1 + m2)) : 0;
      const F = fs / tot * (1 + 1.8 * mix);   // the top glaze fluxes the one below: overlaps melt runnier
      return { tot, F, e: tot - Tdrip, P: (tot - Tdrip) * F * R.steep[k] };
    };
    // ---- source sampling: jittered coarse cells, probability ~ potential, irregular min spacing ----
    const CS = 6, cand = [];
    for (let k0 = 0; k0 < H; k0 += CS) for (let j0 = 0; j0 < W; j0 += CS) {
      // best spot in the cell (the melt piles up in thin rims, e.g. at the lower edge of a band)
      let best = null, bk = 0, bj = 0;
      for (let kk = k0; kk < Math.min(H, k0 + CS); kk += 2) {
        if (R.wax[kk] || !R.dir[kk] || R.steep[kk] < 0.35) continue;
        const jj = Math.min(W - 1, j0 + Math.floor(rnd() * CS));
        const p = potentialAt(kk * W + jj, kk); if (p && (!best || p.P > best.P)) { best = p; bk = kk; bj = jj; }
      }
      const r0 = rnd(); if (!best) continue;
      const prob = 1 - Math.exp(-best.P * (0.3 + 1.3 * best.P) * (0.6 + 0.8 * Math.min(1.2, best.F)));
      if (r0 < prob) cand.push({ k: bk, j: bj, ...best, y: R.y[bk] });
    }
    // strongest first, then enforce spacing (random per source) so drips cluster and gap irregularly
    cand.sort((a, b) => b.P - a.P);
    if (this.debugDrips) { let mt = 0; for (let i = 0; i < N; i++) { let t = 0; for (let n = 0; n < A; n++) t += act[n][i]; if (t > mt) mt = t; } console.log('drip dbg maxTot', mt.toFixed(3), 'cands', cand.length, 'topP', cand.slice(0, 5).map(c => c.P.toFixed(3)).join(',')); }
    const src = [];
    for (const c of cand) {
      const sp = (0.018 + 0.09 * rnd() * rnd()) / Math.max(0.35, Math.sqrt(c.P)) / (0.6 + 0.5 * Math.min(1.2, c.F)); let ok = true;
      for (const d of src) {
        const dy = Math.abs(d.y - c.y); if (dy > 0.12) continue;
        let du = Math.abs(d.j - c.j); du = Math.min(du, W - du);
        if (du / texPerWorld(c.k) < sp && dy < 0.08) { ok = false; break; }
      }
      if (ok) src.push(c);
      if (src.length > 160) break;
    }
    src.sort((a, b) => b.y - a.y);   // higher drips walk first so lower/later ones can merge into them
    // ---- walk ----
    const occ = new Int32Array(N).fill(-1), occIdx = new Int32Array(N);
    const drips = [];
    const queue = src.map(c => {
      const i = c.k * W + c.j, frac = act.map(a2 => a2[i] / c.tot), sst = stp.map(s2 => s2[i]);
      const r1 = rnd(), r2 = rnd();
      const V = (c.e + 0.06) * c.F * (40 + 340 * Math.pow(r1, 1.6));                               // thickness*rows
      const w = (0.005 + 0.02 * Math.sqrt(c.e * c.F) * (0.4 + 1.1 * r2 * r2));           // world half-width
      return { k: c.k, u: c.j + 0.5, du: (rnd() - 0.5) * 0.002, V, V0: V, w, a: Math.min(1.0, 0.3 + 0.55 * c.e) * (0.8 + 0.4 * rnd()), F: c.F, frac, sst, parent: -1, gen: 0 };
    });
    let forks = 0, merges = 0;
    while (queue.length) {
      const d = queue.shift(); const id = drips.length; d.path = []; d.extra = 0; drips.push(d);
      let { k, u, du, V } = d; const w0 = d.w;
      let end = 'vol';
      for (let s2 = 0; s2 < 600; s2++) {
        const dir = R.dir[k]; if (!dir) { end = 'flat'; break; }
        const kn = k + dir;
        if (kn < 0 || kn >= H) { end = 'flat'; break; }
        if (R.wax[kn]) { end = 'wax'; break; }
        if (R.steep[kn] < 0.12) { end = 'flat'; break; }
        const tpw = texPerWorld(kn);
        // coherent lateral drift from surface noise (per-firing shift) + own random walk, with some momentum
        const jc = ((Math.floor(u) + noiseShift) % W + W) % W;
        const field = this.nMid[kn * W + jc] - 0.5, field2 = this.streak[kn * W + jc] - 0.5;
        du = du * 0.88 + field * 0.0034 + field2 * 0.0014 + (rnd() - 0.5) * 0.0028;
        // throwing rings / bumps: a ridge (strong local curvature) slows the drip and shoves it sideways
        const bump = Math.min(1, Math.abs(R.kap[kn]) / 12);
        let cost = d.a * (d.w / 0.012) * (1 + 1.5 * (1 - R.steep[kn])) * (1.4 - 0.75 * Math.min(1, d.F));
        if (bump > 0.25 && rnd() < 0.5 * bump) { du += (rnd() < 0.5 ? -1 : 1) * (0.0015 + 0.003 * rnd()) * bump; cost *= 1 + 0.6 * bump; }
        const lim = 0.0045; du = Math.max(-lim, Math.min(lim, du));
        // attraction to a nearby earlier drip just below -> converging Y, then merge
        const look = Math.ceil((d.w * 2.5 + 0.012) * tpw);
        let near = 0, nd = 1e9;
        for (let o = -look; o <= look; o++) { const jj = ((Math.floor(u) + o) % W + W) % W, q = occ[kn * W + jj]; if (q >= 0 && q !== id && q !== d.parent && Math.abs(o) < Math.abs(nd)) { nd = o; near = q; } }
        if (nd !== 1e9) {
          if (Math.abs(nd) <= Math.max(1, d.w * tpw * 0.8) && s2 > 4 && rnd() < 0.85) {
            // merge: hand remaining volume to the other drip's trail downstream of the hit point
            const other = drips[near], idx = occIdx[kn * W + (((Math.floor(u) + nd) % W + W) % W)];
            other.merges = other.merges || []; other.merges.push({ idx, V }); merges++;
            d.path.push([kn, u + nd * 0.5, d.w, d.a]); end = 'merged'; V = 0; break;
          }
          du += Math.sign(nd) * 0.0009;
        }
        u += du * tpw; k = kn;
        V -= cost;
        const wNow = d.w * (0.55 + 0.45 * Math.max(0, 1 - V / d.V0)) * (0.92 + 0.16 * rnd());
        d.path.push([k, u, wNow, d.a]);
        const hw = Math.max(1, Math.round(wNow * tpw * 0.8));
        for (let o = -hw; o <= hw; o++) { const i = k * W + ((((Math.floor(u) + o) % W) + W) % W); if (occ[i] < 0) { occ[i] = id; occIdx[i] = d.path.length - 1; } }
        // fork: a fat, still-loaded drip occasionally splits in two
        if (d.gen < 2 && V > 0.45 * d.V0 && d.w > 0.008 && s2 > 8 && rnd() < 0.012 * d.F) {
          const sgn = rnd() < 0.5 ? -1 : 1, part = 0.3 + 0.2 * rnd();
          queue.unshift({ k, u, du: du - sgn * 0.003, V: V * part, V0: V * part, w: d.w * (0.6 + 0.2 * rnd()), a: d.a * 0.9, F: d.F, frac: d.frac, sst: d.sst, parent: id, gen: d.gen + 1 });
          V *= 1 - part; du += sgn * 0.0025; forks++;
        }
        if (V <= 0) break;
      }
      d.end = end; d.Vleft = Math.max(0, V); d.w = w0;
    }
    // sources give up glaze where runs broke away (before the sheet flow)
    for (const c of src) { const tpw = texPerWorld(c.k), rw = Math.max(2, Math.round(0.012 * tpw)); for (let p2 = 0; p2 <= 12; p2++) { const kk = c.k + R.dir[c.k] * -p2; if (kk < 0 || kk >= H) continue; for (let dj = -rw; dj <= rw; dj++) { const i = kk * W + ((c.j + dj + W) % W), f = 0.1 * (1 - Math.abs(dj) / (rw + 1)); for (let g = 0; g < A; g++) act[g][i] *= 1 - f; } } }
    this.dripStats = { seed, sources: src.length, drips: drips.length, forks, merges };
    console.log(`drips: seed=${seed} sources=${src.length} drips=${drips.length} forks=${forks} merges=${merges}`);
    // ---- render (called after the sheet flow): per-glaze max-buffers so overlapping stamps don't pile up ----
    return () => {
    const Dg = act.map(() => new Float32Array(N));
    const stamp = (k, u, hwTex, hvRows, amp, frac, pe = 1.5) => {
      const k0 = Math.max(0, Math.floor(k - hvRows)), k1 = Math.min(H - 1, Math.ceil(k + hvRows));
      const j0 = Math.floor(u - hwTex - 1), j1 = Math.ceil(u + hwTex + 1);
      for (let kk = k0; kk <= k1; kk++) {
        if (R.wax[kk]) continue;
        const dv = (kk + 0.5 - k) / hvRows; if (Math.abs(dv) >= 1) continue;
        for (let jj = j0; jj <= j1; jj++) {
          const dh = (jj + 0.5 - u) / hwTex, rr = dh * dh + dv * dv; if (rr >= 1) continue;
          const prof = (1 - rr); const v = amp * Math.pow(prof, pe), i = kk * W + (((jj % W) + W) % W);
          for (let g = 0; g < A; g++) { const x = v * frac[g]; if (x > Dg[g][i]) Dg[g][i] = x; }
        }
      }
    };
    for (const d of drips) {
      const P = d.path, n = P.length; if (n < 3) continue;
      const boost = new Float32Array(n);
      if (d.merges) for (const m of d.merges) { const len = Math.max(1, n - m.idx); for (let q = m.idx; q < n; q++) boost[q] += m.V / len * 0.9; d.Vleft += m.V * 0.35; }
      for (let q = 0; q < n; q++) {
        const [k, u, w, a] = P[q], tpw = texPerWorld(k), t = q / (n - 1);
        const amp = a * (0.62 + 0.38 * t) + boost[q] * 0.25;
        const hw = Math.max(0.9, w * tpw * (1 + 0.6 * Math.min(1, boost[q]))), hv = Math.max(1.2, w / R.ds * 0.9);
        // interpolate from the previous point so sideways steps leave no gaps
        const pu = q ? P[q - 1][1] : u, pk = q ? P[q - 1][0] : k, sub = Math.max(1, Math.ceil(Math.abs(u - pu) / Math.max(0.6, hw * 0.5)));
        for (let s3 = 1; s3 <= sub; s3++) { const f = s3 / sub; stamp(pk + (k - pk) * f, pu + (u - pu) * f, hw, hv, amp, d.frac); }
      }
      if (d.end !== 'merged') {
        // bead: size from leftover volume; pools wider on the wax line / flat ground
        const [k, u, w] = P[n - 1], tpw = texPerWorld(k);
        const vol = d.Vleft + 0.25 * d.V0 * (d.end === 'vol' ? 0.4 : 1);
        let wMax = 0; for (let q = Math.max(0, n - 25); q < n; q++) wMax = Math.max(wMax, P[q][2]);
        const rb = Math.min(0.055, Math.max(wMax * 1.45, w * (1.4 + 1.2 * rnd() * rnd()) + 0.006 * Math.sqrt(vol)));
        const amp = Math.min(1.5, d.a * (1.6 + 0.6 * rnd()) + 0.1 * Math.sqrt(vol));
        const wide = d.end === 'wax' ? 1.5 : d.end === 'flat' ? 1.25 : 1;
        const hv = rb / R.ds * (d.end === 'wax' ? 0.85 : 1.2);
        const back = -R.dir[k] * hv * 0.5;   // bead centre sits uphill so the tip bottom is a round cap just past the path end
        // neck: the trail swells smoothly into the bead (teardrop), then the full rounded bead itself
        const neck = Math.round(hv * 1.6);
        for (let q = 1; q <= 4; q++) { const f = q / 4, kk = k + back - R.dir[k] * neck * f * 0.9, ww = rb * (1 - 0.55 * f); stamp(kk, P[Math.max(0, n - 1 - Math.round(neck * f))][1], ww * tpw * wide, ww / R.ds * 1.1, amp * (1 - 0.35 * f), d.frac, 0.9); }
        stamp(k + back, u, rb * tpw * wide * 1.3, hv * 1.3, amp * 0.35, d.frac, 2.0);   // soft skirt: the bead edge feathers into the base
        stamp(k + back, u, rb * tpw * wide, hv, amp, d.frac, 0.9);
      }
      // mark paint order so the running glaze sits on top where it lands
      for (let q = 0; q < n; q += 2) { const i = P[q][0] * W + ((((Math.floor(P[q][1])) % W) + W) % W); for (let g = 0; g < A; g++) if (d.frac[g] > 0.05 && stp[g][i] < d.sst[g]) stp[g][i] = d.sst[g]; }
    }
    // drip deposits land last, so they sit on top of everything (30001+paint order; sheet-flowed glaze without a paint stamp reads as 30000)
    // only a drip's main glaze(s) take the top stamp; a minor share (e.g. a little shino carried in a tenmoku run) must not
    // flip the layer order at the thin skirt of a bead (that made dotted pale rings)
    const svs = act.map((_, g) => Math.min(65535, 30001 + Math.max(0, ...drips.map(d => d.sst[g] || 0))));   // keeps the glazes' paint order among drips
    for (let i = 0; i < N; i++) {
      let mx = 0; for (let g = 0; g < A; g++) if (Dg[g][i] > mx) mx = Dg[g][i];
      if (mx <= 0) continue;
      for (let g = 0; g < A; g++) { const v = Dg[g][i]; if (v <= 0) continue; act[g][i] += v; if (mx > 0.004 && v >= 0.5 * mx) stp[g][i] = svs[g]; }
    }
    };
  }
  unfire() { this.fired = null; this.mode = 'raw'; this.composeRaw(0, H - 1); }

  composeFired() {
    const R = this.pot.rows, C = this.color, P = this.props, F = this.fx, Hh = this.height, ng = G.length, fired = this.fired;
    const te = new Float32Array(ng), col = [0, 0, 0, 0, 0];
    // blurred coverage for flashing on bare clay near glaze edges
    const cov = new Float32Array(N), tmp = new Float32Array(N);
    for (let i = 0; i < N; i++) { let s = 0; for (let q = 0; q < ng; q++) if (fired[q]) s += fired[q][i]; cov[i] = s > 0.03 ? 1 : 0; }
    const rad = 12;
    for (let k = 0; k < H; k++) { let s = 0; for (let d = -rad; d <= rad; d++) s += cov[k * W + ((d + W) % W)]; for (let j = 0; j < W; j++) { tmp[k * W + j] = s / (2 * rad + 1); s += cov[k * W + ((j + rad + 1) % W)] - cov[k * W + ((j - rad + W) % W)]; } }
    for (let j = 0; j < W; j++) for (let k = 0; k < H; k++) { let s = 0, c = 0; for (let d = -rad; d <= rad; d += 3) { const kk = k + d; if (kk >= 0 && kk < H) { s += tmp[kk * W + j]; c++; } } cov[k * W + j] = s / c; }

    for (let k = 0; k < H; k++) {
      const E = R.edge[k], Cv = R.cavity[k];
      for (let j = 0; j < W; j++) {
        const i = k * W + j, o = i * 4, nl = this.nLow[i], nm = this.nMid[i], nl2 = this.nLow2[i], sk = this.streak[i];
        // fired clay: toasted, mottled, flashing near glaze
        let br0 = CLAY_F_A[0] + (CLAY_F_B[0] - CLAY_F_A[0]) * nl, bg0 = CLAY_F_A[1] + (CLAY_F_B[1] - CLAY_F_A[1]) * nl, bb0 = CLAY_F_A[2] + (CLAY_F_B[2] - CLAY_F_A[2]) * nl;
        let cr = CLAY_F_A[0] + (CLAY_F_B[0] - CLAY_F_A[0]) * nl, cg = CLAY_F_A[1] + (CLAY_F_B[1] - CLAY_F_A[1]) * nl, cb = CLAY_F_A[2] + (CLAY_F_B[2] - CLAY_F_A[2]) * nl;
        const dk = 0.35 * smooth(0.45, 0.75, nl2) * nm; cr += (CLAY_F_DARK[0] - cr) * dk; cg += (CLAY_F_DARK[1] - cg) * dk; cb += (CLAY_F_DARK[2] - cb) * dk;
        const fla = 0.3 * smooth(0.02, 0.5, cov[i]); cr += (CLAY_FLASH[0] - cr) * fla; cg += (CLAY_FLASH[1] - cg) * fla; cb += (CLAY_FLASH[2] - cb) * fla;
        let T = 0, top = -1, topS = -1, n = 0;
        for (let q = 0; q < ng; q++) {
          const a = fired[q]; te[q] = 0; if (!a) continue; const t = a[i]; if (t < 0.006) continue;
          const g = G[q];
          te[q] = t * Math.max(0.05, 1 - g.breakAmt * 0.85 * E) * (1 + g.poolAmt * 1.3 * Cv);
          if (g.id === 'shino') te[q] *= 0.45 + 1.0 * nl2;
          else if (g.id === 'ash') te[q] *= 0.6 + 0.8 * smooth(0.25, 0.8, sk);   // ash: glassy green rivulets between drier brown   // shino: uneven application reads as orange/white mottling
          T += te[q]; n++;
          let s = this.firedStamp[q][i]; if (s === 0) s = 30000;   // no stamp = it flowed here during the firing, so it lies over the painted coats (drip deposits are > 30000)
          if (s > topS || (s === topS && te[q] > te[top])) { topS = s; top = q; }
        }
        let mtlO = 0, r = cr, g = cg, b = cb, rough = 0.74, cc = 0, crk = 0, crkF = 0, crkT = 0, spk = 1, h = 0;
        if (T > 0.006) {
          let wr = 0, wg = 0, wb = 0, ws = 0, wsC = 0, tR = 0, tG = 0, tB = 0, tW = 0, ro = 0, roU = 0, roT = 0, tr = 1, cK = 0, cF = 0, cT = 0, sp = 0, sec = -1, secT = 0, mtl = 0;
          for (let q = 0; q < ng; q++) {
            const t = te[q]; if (t <= 0) continue;
            if (q !== top && t > secT) { secT = t; sec = q; }
            // a thin top coat over another glaze reads as a translucent veil of its *body* colour (not its bare-thin colour), fading by weight
            const veil = q === top && n > 1;   // the top coat is composited over the rest below, not averaged in
            let tE = veil ? t : t + 0.3 * (T - t); if (veil && G[q].veilT) tE = Math.max(tE, G[q].veilT * Math.min(1, T / 0.8));
            sampleStops(q, tE, col);
            let cR = col[0], cG = col[1], cB = col[2];
            const gd = G[q];
            if (gd.id === 'tenmoku') { // hare's-fur streaks and rust in thinner areas
              const s = smooth(0.5, 0.78, sk) * smooth(0.1, 0.3, t) * (1 - smooth(0.5, 1.1, t));
              cR += (TEN_FUR[0] - cR) * s * 0.12; cG += (TEN_FUR[1] - cG) * s * 0.12; cB += (TEN_FUR[2] - cB) * s * 0.12;
            } else if (gd.id === 'shino') { // carbon trap patches where thinner
              const s = 0.25 * smooth(0.5, 0.66, this.nLow[i]) * smooth(0.45, 0.75, nm) * (1 - smooth(0.5, 1.1, t));
              cR += (CARBON[0] - cR) * s; cG += (CARBON[1] - cG) * s; cB += (CARBON[2] - cB) * s;
            } else if (gd.id === 'ash') {
              const s = 0.25 * (sk - 0.5); cR *= 1 - s; cG *= 1 + s * 0.4; cB *= 1 - s * 0.2;
            }
            for (const v of gd.variA) {   // single-glaze variegation: rutile streaks, mottling, floating colour where thick, fine flecks
              const vc = v.L; let s = 0;
              if (v.type === 'rutile') s = v.amt * smooth(0.5, 0.72, sk + 0.18 * (nm - 0.5)) * smooth(0.12, 0.4, t) * (1 - 0.6 * smooth(0.9, 1.6, t));
              else if (v.type === 'float') s = v.amt * smooth(0.42, 0.62, 0.55 * nl2 + 0.45 * nm) * smooth(0.35, 0.9, t);
              else if (v.type === 'fleck') { const hsh = Math.sin(i * 12.9898 + 78.233) * 43758.5453; s = (hsh - Math.floor(hsh)) > 1 - (v.dens || 0.1) * (0.6 + 0.8 * nm) ? v.amt : 0; }
              else s = v.amt * smooth(0.35, 0.75, nz(0.6 * nm + 0.4 * nl2));
              cR += (vc[0] - cR) * s; cG += (vc[1] - cG) * s; cB += (vc[2] - cB) * s;
            }
            if (gd.breakL) {  // break colour on sharp edges / rims
              const s = (gd.breakStr ?? 0.6) * smooth(0.2, 0.7, E) * (1 - smooth(0.3, 0.9, t));
              cR += (gd.breakL[0] - cR) * s; cG += (gd.breakL[1] - cG) * s; cB += (gd.breakL[2] - cB) * s;
            }
            const w = t * (0.15 + col[3]) * (q === top ? 1.8 : 1);   // thin translucent coats let the glaze below show
            if (veil) { tR = cR; tG = cG; tB = cB; tW = w; roT = col[4]; } else { wr += cR * w; wg += cG * w; wb += cB * w; wsC += w; roU += col[4] * w; }
            ws += w; ro += col[4] * w; mtl += gd.metal * w;
            tr *= 1 - col[3];
            cK += gd.crackle * w; cF += gd.crackleFine * w; cT += gd.crackTint * w; sp += gd.speckle * w;
          }
          let mr = wr / wsC, mg = wg / wsC, mb = wb / wsC; rough = ro / ws; const op = 1 - tr;
          let metal = mtl / ws;
          if (tW > 0 && sec >= 0) {
            // ===== general two-glaze layering model (any pair; hand-tuned PAIRS act as overrides for colour) =====
            const gT = G[top], gU = G[sec], ur0 = mr, ug0 = mg, ub0 = mb;
            const tt = te[top], fb = secT / (tt + secT), fa = 1 - fb, fmin = Math.min(fa, fb), I = 4 * fa * fb;
            const p = PAIR_L[top * NG + sec], pc = p ? p.cover : 0.35 * (1 - gT.transl);
            // translucent veil: filter the base with the top's hue, then its body colour takes over as it thickens.
            // A translucent top (celadon, amber) keeps showing the base tinted through it; an opaque one hides it.
            const ft = tW / (tW + wsC), mx = Math.max(tR, tG, tB, 1e-4), fl = Math.min(1, ft * 1.6);
            const sv = smooth(0.06, 0.68, ft) * (1 - gT.transl * 0.72 * (1 - 0.35 * smooth(0.8, 1.6, tt)));
            const tint = gT.transl * smooth(0.05, 0.4, ft);   // multiplicative stain of the base by a translucent top
            mr *= 1 + (tR / mx - 1) * fl; mg *= 1 + (tG / mx - 1) * fl; mb *= 1 + (tB / mx - 1) * fl;
            mr *= 1 + (Math.min(1, tR * 2.2) - 1) * tint; mg *= 1 + (Math.min(1, tG * 2.2) - 1) * tint; mb *= 1 + (Math.min(1, tB * 2.2) - 1) * tint;
            mr += (tR - mr) * sv; mg += (tG - mg) * sv; mb += (tB - mb) * sv;
            // reaction colour: iron under a rutile/opalescent top pulls gold-brown; otherwise a saturated geometric mean
            let rr, rg, rb;
            if (p) { rr = p.color[0]; rg = p.color[1]; rb = p.color[2]; }
            else {
              rr = Math.sqrt(tR * ur0); rg = Math.sqrt(tG * ug0); rb = Math.sqrt(tB * ub0);
              const L = (rr + rg + rb) / 3; rr = L + (rr - L) * 1.45; rg = L + (rg - L) * 1.45; rb = L + (rb - L) * 1.45;
              const ir = gU.iron * Math.max(gT.rutile, 0.5 * gT.float);
              if (ir > 0.05) { const k2 = Math.min(0.6, ir * 0.7); rr += (RUTILE_GOLD[0] - rr) * k2; rg += (RUTILE_GOLD[1] - rg) * k2; rb += (RUTILE_GOLD[2] - rb) * k2; }
              rr = Math.max(0, rr); rg = Math.max(0, rg); rb = Math.max(0, rb);
            }
            const hide = 1 - pc * smooth(0.25, 0.9, tt);   // a thick opaque top hides the interaction
            const m = smooth(0.06, 0.5, fa) * hide;
            // floating: the top breaks into the colour below in cells (opaque/shino/matte) or streaks (rutile tops)
            const fp = gT.float * (0.2 + 0.8 * I) * (1 - 0.55 * smooth(0.7, 1.5, tt)) * smooth(0.08, 0.3, fa) * smooth(0.04, 0.2, fb) * (p ? 0.75 : 1);
            // top breaks into a lace over the base: base-colour cells (voronoi) or streaks (rutile tops) open as fp grows
            let fm;
            if (gT.rutile > 0.3) { const sn = 0.75 * sk + 0.25 * nm; fm = smooth(0.66 - 0.28 * fp, 0.72 - 0.28 * fp, sn); }
            else {   // blotchy regions where the top has opened up; inside them a lace of top colour around base-colour cells
              // each pair samples the noise rotated around the pot (different patches per pair); runny pairs streak downward
              const i2 = k * W + ((j + (top * 97 + sec * 193) % W) % W), fl2 = 0.5 * (gT.fluidity + gU.fluidity);
              const bn = nz(0.55 * this.nMid[i2] + 0.45 * this.nLow2[i2] + (0.1 + 0.7 * fl2) * (this.streak[i2] - 0.5)), th = 1 - 0.9 * fp;
              const blob = smooth(th - 0.2, th + 0.1, bn), e0 = 0.05 + 0.12 * this.cellId[i2] * (1 - blob * 0.6);
              fm = blob * (0.55 + 0.45 * smooth(e0, e0 + 0.12, this.cellE[i2]));
            }
            fm *= smooth(0.05, 0.25, fp);
            if (fm > 0) {   // inside the float cells: under colour, stained by the reaction colour
              const fr = ur0 + (rr - ur0) * 0.4, fg = ug0 + (rg - ug0) * 0.4, fbb = ub0 + (rb - ub0) * 0.4, s2 = fm * 0.85;
              mr += (fr - mr) * s2; mg += (fg - mg) * s2; mb += (fbb - mb) * s2;
            }
            { const rim = 4 * fm * (1 - fm) * (0.35 + 0.65 * I) * 0.75;   // reaction rims around each cell / streak
              mr += (rr - mr) * rim; mg += (rg - mg) * rim; mb += (rb - mb) * rim; }
            // rutile top over iron: gold/brown streaks pulled out of the base
            const rs = gT.rutile * gU.iron * smooth(0.6, 0.76, sk) * (0.3 + 0.7 * I) * hide;
            if (rs > 0 && !p) { const k3 = rs * 0.55; mr += (RUTILE_GOLD[0] - mr) * k3; mg += (RUTILE_GOLD[1] - mg) * k3; mb += (RUTILE_GOLD[2] - mb) * k3; }
            // overall reaction tint in the mixing zone
            const s = p ? m * p.strength : m * 0.3 * (0.4 + 0.6 * I);
            mr += (rr - mr) * s; mg += (rg - mg) * s; mb += (rb - mb) * s;
            if (p) {   // hand-tuned pairs: soft boundary line only where the under-glaze thins out (no drip rings)
              const hal = smooth(0.04, 0.09, fmin) * (1 - smooth(0.12, 0.2, fmin)) * smooth(0.6, 0.8, fa), hs = hal * 0.28;
              mr += (p.halo[0] - mr) * hs; mg += (p.halo[1] - mg) * hs; mb += (p.halo[2] - mb) * hs;
            } else {   // generic: pale opalescent reaction band where the top feathers out over the base
              const hb = smooth(0.07, 0.16, fa) * (1 - smooth(0.3, 0.45, fa)) * smooth(0.25, 0.5, fb) * (0.5 + 0.5 * nm), hs = hb * 0.38;
              const L = (mr + mg + mb) / 3, hr = Math.min(1, (L * 0.5 + rr * 0.5) * 1.55 + 0.03), hg = Math.min(1, (L * 0.5 + rg * 0.5) * 1.55 + 0.03), hbb = Math.min(1, (L * 0.5 + rb * 0.5) * 1.5 + 0.03);
              mr += (hr - mr) * hs; mg += (hg - mg) * hs; mb += (hbb - mb) * hs;
            }
            // gloss: fluxed overlap is glossier than either (matte under glossy -> satin-gloss)
            const roUm = roU / Math.max(wsC, 1e-6);
            rough = (roUm + (roT - roUm) * smooth(0.1, 0.6, fa)) * (1 - 0.4 * I * hide);
            // metallic: a metallic top stays metallic except in float cells; a non-metal top buries a metallic base
            metal = gT.metal > 0 ? gT.metal * smooth(0.15, 0.5, fa) * (1 - fm * 0.8) : metal * (1 - smooth(0.15, 0.5, fa));
          } else if (tW > 0) {
            const ft = tW / (tW + wsC), mx = Math.max(tR, tG, tB, 1e-4), fl = Math.min(1, ft * 1.6), sv = smooth(0.06, 0.68, ft);
            mr *= 1 + (tR / mx - 1) * fl; mg *= 1 + (tG / mx - 1) * fl; mb *= 1 + (tB / mx - 1) * fl;
            mr += (tR - mr) * sv; mg += (tG - mg) * sv; mb += (tB - mb) * sv;
          }
          crk = cK / ws * smooth(0.08, 0.35, T); crkF = cF / ws; crkT = cT / ws;
          // bare clay under translucent glaze reads darker/wetter
          // body under glaze: reduction-fired stoneware reads grey-buff and darker/wetter
          const ur = (br0 + BODY_UNDER[0]) * 0.36, ug = (bg0 + BODY_UNDER[1]) * 0.36, ub = (bb0 + BODY_UNDER[2]) * 0.36;
          r = ur + (mr - ur) * op; g = ug + (mg - ug) * op; b = ub + (mb - ub) * op;
          const cover = smooth(0.006, 0.06, T);
          r = cr + (r - cr) * cover; g = cg + (g - cg) * cover; b = cb + (b - cb) * cover;
          rough = 0.74 + (rough - 0.74) * cover;
          cc = cover * Math.pow(clamp01(1 - rough * 1.6), 1.3);
          spk = (1 - cover) + cover * (sp / ws + (1 - op) * 0.2);   // clay specks show only faintly through thin glaze
          h = T; mtlO = metal * cover;
        }
        if (this.debugThickness) { const v = toS(Math.min(1, h / 2)); r = g = b = 0; C[o] = C[o + 1] = C[o + 2] = v; C[o + 3] = 255; }
        else { C[o] = toS(r); C[o + 1] = toS(g); C[o + 2] = toS(b); C[o + 3] = 255; }
        P[o] = Math.round(255 * cc * (1 - 0.6 * mtlO)); P[o + 1] = Math.round(255 * clamp01(rough)); P[o + 2] = Math.round(255 * clamp01(mtlO)); P[o + 3] = 255;
        F[o] = Math.round(255 * clamp01(crk)); F[o + 1] = Math.round(255 * crkF); F[o + 2] = Math.round(255 * clamp01(spk)); F[o + 3] = Math.round(255 * crkT);
        Hh[o] = 255 * Math.tanh(h * 0.43); Hh[o + 1] = Hh[o]; Hh[o + 2] = Hh[o]; Hh[o + 3] = 255;   // soft clamp: thick beads never plateau into a hard bump edge
      }
    }
    this.onUpload();
  }
}
