// Small deterministic 3D value-noise + fBm used on the CPU side (object-space, so it is seamless on the lathe).
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
const fade = t => t * t * (3 - 2 * t);
export function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const a = hash3(xi, yi, zi), b = hash3(xi + 1, yi, zi);
  const c = hash3(xi, yi + 1, zi), d = hash3(xi + 1, yi + 1, zi);
  const e = hash3(xi, yi, zi + 1), f = hash3(xi + 1, yi, zi + 1);
  const g = hash3(xi, yi + 1, zi + 1), h = hash3(xi + 1, yi + 1, zi + 1);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}
export function fbm3(x, y, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise3(x * f + i * 17.3, y * f - i * 9.1, z * f + i * 5.7); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export function rand01(i) { return hash3(i, i * 7 + 3, 11); }
// 3D Voronoi: returns [F2-F1 (distance to the cell border, cell units), random id of the nearest cell]. Used for floating cells.
export function voronoi3(x, y, z, out) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let d1 = 9, d2 = 9, id = 0;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, cz = zi + k;
    const px = cx + hash3(cx, cy, cz), py = cy + hash3(cy + 31, cz, cx), pz = cz + hash3(cz - 17, cx, cy);
    const dx = px - x, dy = py - y, dz = pz - z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < d1) { d2 = d1; d1 = d; id = hash3(cx + 7, cy - 3, cz + 11); } else if (d < d2) d2 = d;
  }
  out[0] = d2 - d1; out[1] = id;
}
