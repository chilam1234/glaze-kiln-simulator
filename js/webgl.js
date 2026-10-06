// Probe WebGL the way a phone actually fails: WebGL2 with the performance caveat,
// then WebGL2 without it (SwiftShader / software), then a friendly stop if nothing
// can create a context. three.js r165+ is WebGL2-only, so a WebGL1-only GPU still
// gets the help overlay rather than a crash.

const SOFT = /swiftshader|llvmpipe|softpipe|microsoft basic render|mesa offscreen|software rasterizer|google swiftshader/i;

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

function isSoftware(name) {
  return SOFT.test(name.vendor + ' ' + name.renderer);
}

export function isMobileView() {
  return window.matchMedia('(max-width: 700px), (max-height: 520px) and (max-width: 960px)').matches;
}

export function pixelRatioFor(reduced) {
  const dpr = window.devicePixelRatio || 1;
  if (reduced) return Math.min(dpr, 1);
  if (isMobileView()) return Math.min(dpr, 1.25);
  return Math.min(dpr, 1.5);
}

export function probeGpu() {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('data-engine', 'glaze-kiln');
  const attempts = [
    { kind: 'webgl2', caveat: true, antialias: true },
    { kind: 'webgl2', caveat: true, antialias: false },
    { kind: 'webgl2', caveat: false, antialias: false },
    { kind: 'webgl', caveat: true, antialias: false },
    { kind: 'webgl', caveat: false, antialias: false },
  ];
  let gl = null, used = null;
  for (const a of attempts) {
    gl = tryContext(canvas, a.kind, a.caveat, a.antialias);
    if (gl) { used = a; break; }
  }
  const name = rendererName(gl);
  const webgl2 = !!(gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
  const software = isSoftware(name);
  const ok = webgl2; // three.js r165+ refuses WebGL 1
  const reduced = !!(ok && (software || (used && !used.caveat)));
  return {
    canvas, gl, used, ok, webgl2, software, reduced,
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
    <h3>Safari</h3>
    <ol>
      <li>Safari → Settings → Feature Flags (or Develop → Experimental Features)</li>
      <li>Enable WebGL and GPU process / hardware acceleration</li>
      <li>On iPhone or iPad, stay on a recent iOS build — WebGL cannot be forced on if the system disabled it</li>
    </ol>
    <p class="hint">If you launched Chrome with <code>--disable-gpu</code> or <code>--disable-webgl</code>, drop those flags. Software rendering (SwiftShader) still works in a reduced-quality mode; a missing context does not.</p>
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
  const gpuInfo = infoOf(gpu, false);
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
  };
}

export function infoOf(gpu, ok) {
  return {
    ok: !!ok,
    reduced: !!(gpu && gpu.reduced),
    software: !!(gpu && gpu.software),
    webgl2: !!(gpu && gpu.webgl2),
    vendor: (gpu && gpu.vendor) || '',
    renderer: (gpu && gpu.renderer) || '',
    reason: (gpu && gpu.reason) || '',
  };
}

export function showReducedNote(view) {
  let el = document.getElementById('gpuNote');
  if (!el) {
    el = document.createElement('p');
    el.id = 'gpuNote';
    el.className = 'gpu-note';
    view.appendChild(el);
  }
  el.hidden = false;
  el.textContent = 'Software graphics. Quality is reduced so the kiln still runs.';
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
