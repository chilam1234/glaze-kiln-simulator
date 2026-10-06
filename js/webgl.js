// Probe WebGL the way a phone actually fails: WebGL2 with the performance caveat,
// then WebGL2 without it (SwiftShader / software), then a friendly stop if nothing
// can create a context. three.js r165+ is WebGL2-only, so a WebGL1-only GPU still
// gets the help overlay rather than a crash.

const SOFT = /swiftshader|llvmpipe|softpipe|microsoft basic render|mesa offscreen|software rasterizer|google swiftshader|\bwarp\b|d3d11\s*warp|d3d-?11warp/i;
export const QUALITY_KEY = 'glaze-kiln-quality';
export const HW_HELP = 'https://support.google.com/chrome/answer/96816';

function attrs(caveat, antialias) {
  return {
    alpha: false,
    depth: true,
    stencil: false,
    antialias: !!antialias,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
    powerPreference: caveat ? 'high-performance' : 'low-power',
    failIfMajorPerformanceCaveat: !!caveat,
  };
}

function tryContext(canvas, kind, caveat, antialias) {
  try {
    return canvas.getContext(kind, attrs(caveat, antialias));
  } catch (_) {
    return null;
  }
}

function rendererName(gl) {
  if (!gl) return { vendor: '', renderer: '' };
  let vendor = '', renderer = '';
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) {
      vendor = String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL) || '');
      renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || '');
    }
  } catch (_) {}
  if (!renderer) {
    try { renderer = String(gl.getParameter(gl.RENDERER) || ''); } catch (_) {}
  }
  if (!vendor) {
    try { vendor = String(gl.getParameter(gl.VENDOR) || ''); } catch (_) {}
  }
  return { vendor, renderer };
}

export function classifyRenderer(vendor, renderer) {
  const s = `${vendor || ''} ${renderer || ''}`;
  const software = SOFT.test(s);
  const d3d11 = /direct3d\s*11|\bd3d11\b/i.test(s);
  const d3d11Hardware = d3d11 && !software;
  return {
    software,
    d3d11Hardware,
    warp: /\bwarp\b/i.test(s) || /microsoft basic render/i.test(s),
  };
}

export function isMobileView() {
  return window.matchMedia('(max-width: 700px), (max-height: 520px) and (max-width: 960px)').matches;
}

export function pixelRatioFor(lite) {
  const dpr = window.devicePixelRatio || 1;
  if (lite) return Math.min(dpr, 1);
  return Math.min(dpr, 1.25);
}

// MSAA on a 1.25× backing store is a big fill-rate hit (GTX 1060 @ 2048×1152). Super-sampling
// from devicePixelRatio already anti-aliases; keep context MSAA only at ~1×.
export function wantAntialias() {
  return (window.devicePixelRatio || 1) <= 1.05;
}

export function readQualityPref() {
  try {
    const q = new URLSearchParams(location.search).get('quality');
    if (q === 'auto' || q === 'high' || q === 'lite') return q;
    const s = localStorage.getItem(QUALITY_KEY);
    if (s === 'auto' || s === 'high' || s === 'lite') return s;
  } catch (_) {}
  return 'auto';
}

export function saveQualityPref(v) {
  try { localStorage.setItem(QUALITY_KEY, v); } catch (_) {}
}

export function decideLite(pref, gpu, frame) {
  if (pref === 'lite') return { lite: true, reason: 'pref' };
  if (pref === 'high') return { lite: false, reason: 'pref' };
  if (gpu && gpu.software) return { lite: true, reason: 'software' };
  if (frame && (frame.fps < 40 || frame.medianDt > 25)) return { lite: true, reason: 'slow-frames' };
  if (gpu && gpu.d3d11Hardware) return { lite: false, reason: 'd3d11' };
  return { lite: false, reason: 'auto-ok' };
}

export function probeGpu() {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('data-engine', 'glaze-kiln');
  const aa = wantAntialias();
  const attempts = [];
  if (aa) attempts.push({ kind: 'webgl2', caveat: true, antialias: true });
  attempts.push(
    { kind: 'webgl2', caveat: true, antialias: false },
    { kind: 'webgl2', caveat: false, antialias: false },
    { kind: 'webgl', caveat: true, antialias: false },
    { kind: 'webgl', caveat: false, antialias: false },
  );
  let gl = null, used = null;
  for (const a of attempts) {
    gl = tryContext(canvas, a.kind, a.caveat, a.antialias);
    if (gl) { used = a; break; }
  }
  const name = rendererName(gl);
  const webgl2 = !!(gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
  const classif = classifyRenderer(name.vendor, name.renderer);
  const ok = webgl2;
  return {
    canvas, gl, used, ok, webgl2,
    software: classif.software,
    d3d11Hardware: classif.d3d11Hardware,
    warp: classif.warp,
    antialias: !!(used && used.antialias),
    reduced: !!(ok && classif.software),
    vendor: name.vendor, renderer: name.renderer,
    reason: !gl ? 'no-context' : (webgl2 ? '' : 'webgl1-only'),
  };
}

export function installNoGpu(view, gpu) {
  document.body.classList.add('no-gpu');
  const el = document.createElement('aside');
  el.id = 'noGpu';
  el.className = 'gpu-fallback';
  el.setAttribute('role', 'alert');
  const why = gpu && gpu.reason === 'webgl1-only'
    ? 'This browser only has WebGL 1, and the kiln needs WebGL 2.'
    : 'This browser could not start 3D graphics (WebGL is off, or hardware acceleration is off).';
  el.innerHTML = `
    <h2>The kiln needs a GPU</h2>
    <p>${why} Turn hardware acceleration on, then reload.</p>
    <h3>Chrome</h3>
    <ol>
      <li>Open <code>chrome://settings/system</code></li>
      <li>Turn on <b>Use graphics acceleration when available</b></li>
      <li>Relaunch Chrome and reload this page</li>
    </ol>
    <p><a href="${HW_HELP}" target="_blank" rel="noopener">Chrome help: fix graphics issues</a></p>
    <h3>Safari</h3>
    <ol>
      <li>Safari → Settings → Feature Flags (or Develop → Experimental Features)</li>
      <li>Enable WebGL and GPU process / hardware acceleration</li>
      <li>On iPhone or iPad, stay on a recent iOS build — WebGL cannot be forced on if the system disabled it</li>
    </ol>
    <p class="hint">If you launched Chrome with <code>--disable-gpu</code> or <code>--disable-webgl</code>, drop those flags. Software rendering (SwiftShader) still works in Lite mode; a missing context does not.</p>
  `;
  view.appendChild(el);
  const status = document.getElementById('status');
  if (status) status.textContent = 'No usable 3D graphics. Turn on hardware acceleration.';
  const engine = document.getElementById('engineLine');
  if (engine) engine.textContent = 'No GPU';
  window.__sim = makeStub(gpu);
}

function makeStub(gpu) {
  const noop = () => {};
  const gpuInfo = infoOf(gpu, false, { pref: 'auto', lite: false, reason: 'no-gpu' });
  return {
    get state() { return 'nogpu'; },
    gpu: gpuInfo,
    fire: async () => {},
    unfire: noop, clear: noop, setShape: noop, setGlaze: noop, setTool: noop,
    setThickness: noop, setBrushSize: noop, pour: noop, brushBand: noop,
    setView: noop, getView: () => ({ az: 0, el: 0, d: 1, x: 0, y: 0, z: 0 }),
    setSheet: noop, setCone: noop, recipe: () => ({}), loadRecipe: async () => {},
    get cone() { return 6; },
    get touchOrbit() { return false; },
    get touchMode() { return 'paint'; },
    setTouchOrbit: noop, setTouchMode: noop,
    get sheet() { return 'glaze'; },
    get mobile() { return isMobileView(); },
    get pixelRatio() { return 1; },
    screenAt: () => ({ x: 0, y: 0 }),
    stats: () => [],
    setSeed: noop,
    get seed() { return 0; },
    get fireMs() { return 0; },
    get composeMs() { return 0; },
    get engine() { return 'none'; },
    get glow() { return 0; },
    loseContext: noop,
    restoreContext: noop,
    shown: () => ({ engine: 'none', mode: 'raw', maps: {}, sim: {} }),
    classifyGpu: (v, r) => classifyRenderer(v, r),
    decideQuality: (p, g, f) => decideLite(p, g, f),
    setQuality: noop,
    get quality() { return 'auto'; },
    get lite() { return false; },
    get framesDrawn() { return 0; },
    get uploads() { return 0; },
    get uploadBytes() { return 0; },
    get shadowUpdates() { return 0; },
    get drawStats() { return { drawn: 0, rafs: 0, uploads: 0, uploadBytes: 0, shadows: 0, probe: null }; },
    get lastFrameProbe() { return null; },
    get rafs() { return 0; },
  };
}

export function infoOf(gpu, ok, extra = {}) {
  return {
    ok: !!ok,
    reduced: !!(extra.lite ?? (gpu && gpu.reduced)),
    lite: !!(extra.lite ?? (gpu && gpu.reduced)),
    software: !!(gpu && gpu.software),
    d3d11Hardware: !!(gpu && gpu.d3d11Hardware),
    warp: !!(gpu && gpu.warp),
    antialias: extra.antialias ?? !!(gpu && gpu.antialias),
    webgl2: !!(gpu && gpu.webgl2),
    vendor: (gpu && gpu.vendor) || '',
    renderer: (gpu && gpu.renderer) || '',
    reason: extra.reason || (gpu && gpu.reason) || '',
    quality: extra.pref || 'auto',
  };
}

export function showLiteBanner(view, opts = {}) {
  let el = document.getElementById('gpuNote');
  if (!el) {
    el = document.createElement('aside');
    el.id = 'gpuNote';
    el.className = 'gpu-note';
    view.appendChild(el);
  }
  const auto = opts.reason === 'software' || opts.reason === 'slow-frames';
  const why = opts.reason === 'slow-frames'
    ? 'This machine is drawing frames too slowly.'
    : 'This browser is using software graphics (SwiftShader, WARP, or similar).';
  el.hidden = false;
  el.innerHTML = auto
    ? `<p><b>Lite mode</b> turned on automatically. ${why}</p>
       <p class="gpu-note-help"><a href="${HW_HELP}" target="_blank" rel="noopener">How to enable hardware acceleration in Chrome</a>
       · open <code>chrome://settings/system</code> and turn on graphics acceleration.</p>`
    : `<p><b>Lite mode</b> is on. Lower resolution, no shadows, simpler shading.</p>
       <p class="gpu-note-help"><a href="${HW_HELP}" target="_blank" rel="noopener">How to enable hardware acceleration in Chrome</a></p>`;
}

export function hideLiteBanner() {
  const el = document.getElementById('gpuNote');
  if (el) el.hidden = true;
}

export function bindContextEvents(canvas, gl, hooks) {
  let lost = false;
  const ext = gl && gl.getExtension('WEBGL_lose_context');
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    if (hooks && hooks.onLost) hooks.onLost();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    if (hooks && hooks.onRestored) hooks.onRestored();
  });
  return {
    get lost() { return lost; },
    lose() { if (ext) ext.loseContext(); },
    restore() { if (ext) ext.restoreContext(); },
  };
}
