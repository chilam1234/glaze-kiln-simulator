import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildPot, buildCustomPot, extractCustom, TEX_W, TEX_H, UNIT_CM, dimsCm, cloneSpec, addNode, addNodeAt, removeNode, setHeight, setRimR, setFootR, constrainNode, constrainBulge, LIMITS, MAX_MID, radiusAt, spoutParams, spoutWorld, setSpoutHeight, setSpoutTip, HANDLE_MIN, HANDLE_MAX, ensureHandleNodes, resetHandleNodes, setHandleWidth, setHandlePlacement, constrainHandleNode, addHandleNode as addHandleNodeSpec, addHandleNodeAtPoint, removeHandleNode as removeHandleNodeSpec, handleWorldNodes, sampleHandleWorld, handleAzimuth, FOOT_LIMITS, FOOT_STYLES, ensureFoot, footGeom, innerFloorY, setFootH, setFootStyle, ensureWall, wallAt, setWall, setWallZone } from './pot.js?v=fda7d2c-20261008-0853';
import { GLAZES, FAMILIES, cone10Note, CONE10 } from './glazes.js?v=fda7d2c-20261008-0853';
import { GlazeState, GLAZE_INDEX, setFireCone, smokeGlazes, MAP_CAP } from './sim.js?v=fda7d2c-20261008-0853';
import { peekUser, restoreSession, sendLink, signOut, saveRecipe, publishRecipe, loadShared, loadOwned, listMine, enabledSocial, socialSignIn, socialLabel } from './cloud.js?v=fda7d2c-20261008-0853';
import { makePotMaterial, makeSimplePotMaterial } from './material.js?v=fda7d2c-20261008-0853';
import { probeGpu, installNoGpu, showLiteBanner, hideLiteBanner, bindContextEvents, pixelRatioFor, infoOf, classifyRenderer, readQualityPref, saveQualityPref, decideLite, wantAntialias } from './webgl.js?v=fda7d2c-20261008-0853';
import { BUILD, BUILD_TIME } from './build-info.js?v=fda7d2c-20261008-0853';

const view = document.getElementById('view');
const statusEl = document.getElementById('status');
const setStatus = (t) => { statusEl.textContent = t; };
const MOBILE_MQ = '(max-width: 700px), (max-height: 520px) and (max-width: 960px)';
const isMobileLayout = () => window.matchMedia(MOBILE_MQ).matches;
(function showBuildStamp() {
  const el = document.getElementById('buildStamp');
  if (el) el.textContent = BUILD_TIME ? `build ${BUILD} · ${BUILD_TIME}` : `build ${BUILD}`;
})();

function syncAppSize() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  const w = vv ? vv.width : window.innerWidth;
  document.documentElement.style.setProperty('--app-h', h + 'px');
  document.documentElement.style.setProperty('--app-w', w + 'px');
}
syncAppSize();

(function () {
  const spc = Element.prototype.setPointerCapture, rpc = Element.prototype.releasePointerCapture;
  Element.prototype.setPointerCapture = function (id) { try { spc.call(this, id); } catch (_) {} };
  Element.prototype.releasePointerCapture = function (id) { try { rpc.call(this, id); } catch (_) {} };
})();

const gpuProbe = probeGpu();
if (!gpuProbe.ok) {
  installNoGpu(view, gpuProbe);
} else {
  startApp(gpuProbe);
}

function startApp(gpuProbe) {
const classif = classifyRenderer(gpuProbe.vendor, gpuProbe.renderer);
gpuProbe.software = classif.software;
gpuProbe.d3d11Hardware = classif.d3d11Hardware;
gpuProbe.warp = classif.warp;
let qualityPref = readQualityPref();
let qualityInfo = decideLite(qualityPref, gpuProbe, null);
let lite = qualityInfo.lite;
gpuProbe.reduced = lite;

// ---------- renderer / scene ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: gpuProbe.canvas,
    context: gpuProbe.gl,
    antialias: !lite && !isMobileLayout() && wantAntialias(),
    preserveDrawingBuffer: true,
    powerPreference: lite ? 'low-power' : 'high-performance',
    failIfMajorPerformanceCaveat: false,
    alpha: false,
  });
} catch (err) {
  console.warn('WebGL renderer failed', err && err.message);
  installNoGpu(view, { ...gpuProbe, ok: false, reason: gpuProbe.webgl2 ? 'no-context' : (gpuProbe.reason || 'no-context') });
  return;
}
renderer.setPixelRatio(pixelRatioFor(lite));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = !lite;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = !lite;
view.appendChild(renderer.domElement);
syncQualityBanner();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#F5F1E8');
let pmremTex = null;
if (lite) {
  scene.environment = null;
  scene.environmentIntensity = 0;
  scene.add(new THREE.AmbientLight(0xfff4ea, 0.62));
  scene.add(new THREE.HemisphereLight(0xf3f6ff, 0x8a7a68, 0.7));
} else {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmremTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = pmremTex;
  scene.environmentIntensity = 0.85;
}

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
const key = new THREE.DirectionalLight(0xfff6ee, lite ? 1.15 : 1.8);
key.position.set(3.5, 6, 4);
key.castShadow = !lite;
key.shadow.mapSize.set(lite ? 256 : 1024, lite ? 256 : 1024);
key.shadow.camera.left = -2.5; key.shadow.camera.right = 2.5; key.shadow.camera.top = 3.5; key.shadow.camera.bottom = -1.5;
key.shadow.camera.near = 1; key.shadow.camera.far = 20;
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = lite ? 2 : 6;
scene.add(key);
const ground = new THREE.Mesh(new THREE.CircleGeometry(12, lite ? 24 : 64), new THREE.ShadowMaterial({ opacity: lite ? 0.16 : 0.28 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = !lite; scene.add(ground);

// ---------- textures + glaze state ----------
function dataTex(arr, srgb) {
  const t = new THREE.DataTexture(arr, TEX_W, TEX_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.flipY = false;
  t.unpackAlignment = 1;
  configureTex(t);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true; return t;
}
function configureTex(t) {
  if (lite) {
    t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.anisotropy = 1;
  } else {
    t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  }
}
const state = new GlazeState();
const tex = { color: dataTex(state.color, true), props: dataTex(state.props), fx: dataTex(state.fx), height: dataTex(state.height) };
let dirty = false;
let lastBuildMs = 0, fireWallMs = 0, previewing = false;
let drawRequested = false, rafId = 0, measuring = false, frameProbing = false;
let lastFrameProbe = null;
const drawStats = { rafs: 0, drawn: 0, uploads: 0, uploadBytes: 0, shadows: 0, lastDt: 16, frames: [] };
// Packed row scratch used only when regionUpload is on (tests). Default is a
// full needsUpdate of every map — iOS Safari (Metal) still corrupts texSubImage
// sub-rects even with a packed buffer, which painted a terracotta band and
// left props/height on the wrong channels (glossy-dark / translucent grey).
let _packScratch = new Uint8Array(0);
let regionUpload = false;
const fancyMat = makePotMaterial(tex);
const simpleMat = makeSimplePotMaterial(tex, true);
let material = lite ? simpleMat : fancyMat;
const pickMat = new THREE.MeshBasicMaterial();
let pot = null, mesh = null, pickMesh = null;
let lastTimings = null;
let pendingFull = 0;
let builtWaiters = [];

function requestDraw() {
  drawRequested = true;
  if (!rafId) rafId = requestAnimationFrame(loop);
}
function meshOpts(extra = {}) {
  return { lite, ...extra };
}

function syncQualityBanner() {
  document.body.classList.toggle('is-lite', lite);
  if (lite && qualityPref !== 'high') showLiteBanner(view, { reason: qualityInfo.reason, pref: qualityPref });
  else hideLiteBanner();
  const engine = document.getElementById('engineLine');
  if (engine) engine.textContent = lite ? 'Lite graphics' : 'Clay, then fire';
  document.querySelectorAll('#quality button').forEach(b => {
    b.classList.toggle('active', b.dataset.quality === qualityPref);
  });
}

function markShadowsDirty() {
  if (!lite && renderer.shadowMap.enabled) {
    renderer.shadowMap.needsUpdate = true;
    drawStats.shadows++;
  }
}

function applyVisualQuality() {
  gpuProbe.reduced = lite;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.autoUpdate = false;
  key.castShadow = !lite;
  ground.receiveShadow = !lite;
  key.intensity = lite ? 1.15 : 1.8;
  if (lite) {
    scene.environment = null;
    scene.environmentIntensity = 0;
    material = simpleMat;
  } else {
    if (!pmremTex) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmremTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    }
    scene.environment = pmremTex;
    scene.environmentIntensity = 0.85;
    material = fancyMat;
  }
  if (mesh) {
    mesh.material = material;
    mesh.castShadow = !lite;
    mesh.receiveShadow = !lite;
  }
  for (const t of Object.values(tex)) configureTex(t);
  renderer.setPixelRatio(pixelRatioFor(lite));
  markShadowsDirty();
  resize();
  syncQualityBanner();
  uploadTextures({ full: true });
}

function setQualityPref(pref, opts = {}) {
  if (pref !== 'auto' && pref !== 'high' && pref !== 'lite') return;
  qualityPref = pref;
  if (!opts.skipSave) saveQualityPref(pref);
  const next = decideLite(qualityPref, gpuProbe, lastFrameProbe);
  const changed = next.lite !== lite;
  qualityInfo = next;
  lite = next.lite;
  applyVisualQuality();
  if (changed && pot) {
    if (ui.shape === 'custom' && customSpec) rebuildCustom();
    else applyBuiltPot(buildPot(ui.shape, meshOpts()), { keepGlaze: true, noFrame: true });
  }
  requestDraw();
  if (pref === 'auto' && !lite) probeFrameTime();
}

function probeFrameTime() {
  if (qualityPref !== 'auto' || lite || frameProbing) return;
  frameProbing = true;
  measuring = true;
  const samples = [];
  const tEnd = performance.now() + 2000;
  const tick = (t) => {
    samples.push(t);
    requestDraw();
    if (t < tEnd) return;
    measuring = false;
    frameProbing = false;
    const dts = [];
    for (let i = 1; i < samples.length; i++) dts.push(samples[i] - samples[i - 1]);
    dts.sort((a, b) => a - b);
    const medianDt = dts[Math.floor(dts.length / 2)] || 16;
    const fps = 1000 / Math.max(1, medianDt);
    lastFrameProbe = { fps, medianDt };
    qualityInfo = decideLite(qualityPref, gpuProbe, lastFrameProbe);
    if (qualityInfo.lite && !lite) {
      lite = true;
      applyVisualQuality();
      if (ui.shape === 'custom' && customSpec) rebuildCustom();
      else if (ui.shape) applyBuiltPot(buildPot(ui.shape, meshOpts()), { keepGlaze: true, noFrame: true });
      setStatus('Lite mode on — frames were slow. Use Quality → High to override.');
    }
    requestDraw();
  };
  let last = 0;
  const wrap = (now) => {
    if (last) tick(now);
    last = now;
    if (measuring) requestAnimationFrame(wrap);
  };
  requestAnimationFrame(wrap);
}
const ctxLost = bindContextEvents(renderer.domElement, renderer.getContext(), {
  onLost() { setStatus('Graphics paused — restoring…'); },
  onRestored() { uploadTextures({ full: true }); resize(); requestDraw(); setStatus('Graphics restored.'); },
});
function uploadOne(texture, k0, k1, forceFull) {
  const fullBytes = TEX_W * TEX_H * 4;
  const props = renderer.properties.get(texture);
  const ready = !!(props && props.__webglTexture);
  const rows = (k1 >= k0) ? (k1 - k0 + 1) : TEX_H;
  const useRegion = regionUpload && ready && !forceFull && k0 != null && k1 != null && k1 >= k0 && rows > 0 && rows < TEX_H;
  if (!useRegion) {
    texture.needsUpdate = true;
    drawStats.uploadBytes += fullBytes;
    return fullBytes;
  }
  texture.needsUpdate = false;
  const n = rows * TEX_W * 4;
  if (_packScratch.length < n) _packScratch = new Uint8Array(n);
  _packScratch.set(texture.image.data.subarray(k0 * TEX_W * 4, (k1 + 1) * TEX_W * 4), 0);
  const gl = renderer.getContext();
  renderer.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, texture.unpackAlignment || 1);
  if (gl.UNPACK_ROW_LENGTH != null) {
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  }
  const packed = _packScratch.length === n ? _packScratch : _packScratch.subarray(0, n);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, k0, TEX_W, rows, gl.RGBA, gl.UNSIGNED_BYTE, packed);
  if (texture.generateMipmaps) gl.generateMipmap(gl.TEXTURE_2D);
  renderer.state.unbindTexture();
  const bytes = n;
  drawStats.uploadBytes += bytes;
  return bytes;
}
function uploadTextures(opts = {}) {
  const k0 = state.lastComposeK0, k1 = state.lastComposeK1;
  const forceFull = !!opts.full || !regionUpload;
  for (const k of Object.keys(tex)) {
    const t = tex[k];
    if (t.image.data !== state[k]) t.image.data = state[k];
    uploadOne(t, k0, k1, forceFull);
  }
  dirty = false;
  drawStats.uploads++;
}
state.onUpload = () => { dirty = true; requestDraw(); };

// ---------- UI state ----------
const ui = { shape: 'vase', glaze: 'tenmoku', tool: 'brush', size: 0.12, pourH: 0.66, pourMode: 'below', simState: 'raw', sheet: 'glaze', touchOrbit: false, touchMode: 'paint', cone: 6, section: false, shapeGroup: 'pot' };
let customSpec = null;
let selectedNode = -1;
let selectedHandle = -1;
const LAYER = 0.3;
const LAYER_MIN = 1, LAYER_MAX = 5;
const clampLayers = (n) => Math.min(LAYER_MAX, Math.max(LAYER_MIN, Math.round(Number(n) || LAYER_MIN)));
const layersOf = (amount) => clampLayers(amount / LAYER);
const amountOf = (layers) => clampLayers(layers) * LAYER;
const thickness = Object.fromEntries(GLAZES.map(g => [g.id, g.defaultThickness]));

function frameCamera() {
  if (!pot || !controls) return;
  pot.geometry.computeBoundingBox();
  const bb = pot.geometry.boundingBox;
  const center = new THREE.Vector3().addVectors(bb.min, bb.max).multiplyScalar(0.5);
  const size = new THREE.Vector3().subVectors(bb.max, bb.min);
  const spanY = Math.max(0.2, size.y);
  const rMax = Math.max(size.x, size.z, 0.4) * 0.5;
  const el = pot.elev ?? (pot.kind === 'bowl' ? 0.62 : 0.3);
  const aspect = Math.max(0.2, camera.aspect || 1);
  const vHalf = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const sheetOpen = isMobileLayout() && !document.body.classList.contains('sheet-collapsed');
  const pad = sheetOpen ? 1.38 : 1.18;
  const radius = 0.5 * Math.hypot(size.x, size.y, size.z);
  const dist = Math.max(
    (spanY * 0.5 * pad) / Math.tan(vHalf),
    (rMax * pad) / Math.tan(hHalf),
    (radius * pad) / Math.sin(Math.min(vHalf, hHalf)),
    spanY * 1.35,
  );
  controls.target.copy(center);
  camera.position.set(center.x, center.y + Math.sin(el) * dist, center.z + Math.cos(el) * dist);
  camera.lookAt(center);
  controls.update();
  fitBoundsInView();
  ensureGripsInView();
}
function fitBoundsInView() {
  if (!pot || !controls) return;
  const rect = renderer.domElement.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return;
  pot.geometry.computeBoundingBox();
  const bb = pot.geometry.boundingBox;
  const corners = [];
  for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const pad = isMobileLayout() ? 0.14 : 0.08;
  const v = new THREE.Vector3();
  for (let iter = 0; iter < 12; iter++) {
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    let minX = 1, maxX = -1, minY = 1, maxY = -1;
    for (const c of corners) {
      v.copy(c).project(camera);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const limit = 1 - pad;
    const ox = Math.max(0, maxX - limit, -limit - minX);
    const oy = Math.max(0, maxY - limit, -limit - minY);
    if (ox < 0.012 && oy < 0.012) return;
    const t = controls.target;
    const off = camera.position.clone().sub(t);
    off.multiplyScalar(1 + Math.max(ox, oy) * 0.9);
    if (maxY > limit) t.y += (maxY - limit) * 0.12 * off.length();
    if (minY < -limit) t.y -= (-limit - minY) * 0.12 * off.length();
    camera.position.copy(t).add(off);
    controls.update();
  }
}
function applyBuiltPot(built, opts = {}) {
  const t0 = performance.now();
  pot = built;
  if (!mesh) {
    mesh = new THREE.Mesh(pot.geometry, material);
    scene.add(mesh);
  } else {
    if (mesh.geometry && mesh.geometry !== pot.geometry && !mesh.geometry.userData.pooled) mesh.geometry.dispose();
    mesh.geometry = pot.geometry;
    mesh.material = material;
  }
  const live = !opts.preview && !lite;
  mesh.castShadow = live; mesh.receiveShadow = live;
  if (pot.pickGeometry) {
    if (!pickMesh) pickMesh = new THREE.Mesh(pot.pickGeometry, pickMat);
    else {
      if (pickMesh.geometry && pickMesh.geometry !== pot.pickGeometry && !pickMesh.geometry.userData.pooled) {
        pickMesh.geometry.dispose();
      }
      pickMesh.geometry = pot.pickGeometry;
    }
    pickMesh.updateMatrixWorld();
  }
  if (live) markShadowsDirty();
  const ts = performance.now();
  state.setPot(pot, opts);
  const setPotMs = performance.now() - ts;
  lastBuildMs = performance.now() - t0;
  previewing = !!opts.preview;
  if (!opts.preview) ui.simState = 'raw';
  if (!opts.preview && !opts.noFrame) frameCamera();
  const sp = state.lastSetPotTimes || {};
  lastTimings = {
    kind: opts.preview ? 'preview' : (opts.keepGlaze ? 'shape' : 'switch'),
    geometry: built.times || null,
    applyMesh: lastBuildMs - setPotMs,
    setPot: setPotMs,
    noise: sp.noise || 0,
    clone: sp.clone || 0,
    remap: sp.remap || 0,
    compose: sp.compose || 0,
    painted: !!sp.painted,
    shadows: live,
    material: material === fancyMat ? 'physical' : 'simple',
    apply: lastBuildMs,
  };
  if (opts.skipUi) {
    updateGizmoDataFromSpec();
    placeGizmos();
    requestDraw();
    return;
  }
  refreshUI();
  rebuildGizmos();
  requestDraw();
}
function cancelPendingFull() {
  if (pendingFull) {
    clearTimeout(pendingFull);
    pendingFull = 0;
  }
}
function finishBuiltWaiters() {
  const w = builtWaiters.splice(0);
  for (const fn of w) fn(lastTimings);
}
function scheduleFullCustom() {
  cancelPendingFull();
  pendingFull = setTimeout(() => {
    pendingFull = 0;
    if (!customSpec || shapeLocked()) { finishBuiltWaiters(); return; }
    rebuildCustom({ skipUi: true });
    finishBuiltWaiters();
  }, 0);
}
function flushBuild() {
  cancelPendingFull();
  if (customSpec && !shapeLocked() && previewing) rebuildCustom({ skipUi: true });
  finishBuiltWaiters();
  return snapshotTimings();
}
function whenBuilt() {
  if (!pendingFull && !previewing) return Promise.resolve(snapshotTimings());
  return new Promise((resolve) => builtWaiters.push(() => resolve(snapshotTimings())));
}
function snapshotTimings() {
  return lastTimings ? JSON.parse(JSON.stringify(lastTimings)) : null;
}
function stampTotal(t0, extra = {}) {
  if (!lastTimings) lastTimings = {};
  lastTimings.total = performance.now() - t0;
  lastBuildMs = lastTimings.total;
  Object.assign(lastTimings, extra);
}

function setShape(kind) {
  if (ui.simState === 'firing') return;
  cancelPendingFull();
  if (kind === 'custom') {
    if (ui.shape === 'custom' && customSpec) { refreshUI(); return; }
    const t0 = performance.now();
    const src = ui.shape === 'custom' ? (customSpec?.source || 'vase') : ui.shape;
    const te = performance.now();
    customSpec = extractCustom(src);
    const extractMs = performance.now() - te;
    customSpec.source = src;
    selectedNode = customSpec.nodes.length - 1;
    selectedHandle = -1;
    ui.shapeGroup = 'pot';
    ui.shape = 'custom';
    applyBuiltPot(buildCustomPot(customSpec, meshOpts({ preview: true })), {
      preview: true, skipNoise: true, keepGlaze: true, skipCompose: true, remap: false,
    });
    stampTotal(t0, { kind: 'custom-click', extract: extractMs, deferred: true });
    scheduleFullCustom();
    if (isMobileLayout()) {
      ui.touchMode = 'shape'; ui.touchOrbit = false; syncOrbitTouches();
      document.body.classList.add('sheet-collapsed');
      refreshUI();
    }
    const d = dimsCm(customSpec);
    setStatus(`Custom ${src} — drag the red nodes. ${Math.round(d.ml)} ml.`);
    noteShape();
    return;
  }
  const same = ui.shape === kind && !customSpec;
  customSpec = null;
  selectedNode = -1;
  selectedHandle = -1;
  ui.shape = kind;
  applyBuiltPot(buildPot(kind, meshOpts()), { keepGlaze: false });
  setStatus(`${kind[0].toUpperCase() + kind.slice(1)} ready. Paint some glaze, then fire.`);
  if (same) {
    if (historyArmed && !historyLock) steps.push({ kind: 'clear' });
    refreshUI();
  } else noteShape();
}
function shapeLocked() { return ui.simState === 'fired' || ui.simState === 'firing'; }
function showingGizmos() {
  if (ui.shape !== 'custom' || !customSpec || shapeLocked()) return false;
  if (isMobileLayout()) return ui.touchMode === 'shape';
  return true;
}
function rebuildCustom(opts = {}) {
  if (!customSpec) return;
  if (shapeLocked()) { setStatus('Unfire first to edit the shape.'); return; }
  if (!opts.preview) cancelPendingFull();
  const t0 = performance.now();
  applyBuiltPot(buildCustomPot(customSpec, meshOpts({ preview: !!opts.preview })), {
    preview: !!opts.preview,
    skipNoise: true,
    keepGlaze: true,
    skipCompose: !!opts.preview || !state._hasGlaze(),
    remap: !opts.preview,
    noFrame: true,
    skipUi: !!opts.skipUi,
  });
  stampTotal(t0, { kind: opts.preview ? 'preview' : 'full' });
  if (!opts.preview) {
    ensureGripsInView();
    noteShape();
  }
}

// ---------- input: brush + pour on the mesh ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function hitAt(clientX, clientY) {
  const target = pickMesh || mesh;
  if (!target) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  camera.updateMatrixWorld(); raycaster.setFromCamera(ndc, camera);
  const h = raycaster.intersectObject(target, false)[0];
  return h || null;
}
const gizmoGroup = new THREE.Group(); gizmoGroup.renderOrder = 20; scene.add(gizmoGroup);
const gizmoMats = {
  node: new THREE.MeshBasicMaterial({ color: 0xe74c3c, depthTest: false, transparent: true, opacity: 0.95 }),
  sel: new THREE.MeshBasicMaterial({ color: 0xf5c518, depthTest: false, transparent: true, opacity: 0.98 }),
  bulge: new THREE.MeshBasicMaterial({ color: 0xcfd4da, depthTest: false, transparent: true, opacity: 0.95 }),
  handle: new THREE.MeshBasicMaterial({ color: 0x1f8a4c, depthTest: false, transparent: true, opacity: 0.96 }),
  spoutRoot: new THREE.MeshBasicMaterial({ color: 0x1b82f7, depthTest: false, transparent: true, opacity: 0.97 }),
  spoutTip: new THREE.MeshBasicMaterial({ color: 0xffbd2e, depthTest: false, transparent: true, opacity: 0.98 }),
  hit: new THREE.MeshBasicMaterial({ visible: false, depthTest: false }),
};
const profileLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x333333, depthTest: false, transparent: true, opacity: 0.7 }));
profileLine.renderOrder = 19; gizmoGroup.add(profileLine);
const handleLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x0b6e4f, depthTest: false, transparent: true, opacity: 0.85 }));
handleLine.renderOrder = 19; handleLine.visible = false; gizmoGroup.add(handleLine);

function gizmoAz() {
  // Keep the profile gizmos on the screen-right silhouette (lathe profile).
  return Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z) + Math.PI / 2;
}
function clearGizmoMeshes() {
  const keep = new Set([profileLine, handleLine]);
  for (let i = gizmoGroup.children.length - 1; i >= 0; i--) {
    const ch = gizmoGroup.children[i];
    if (keep.has(ch)) continue;
    gizmoGroup.remove(ch);
    if (ch.geometry) ch.geometry.dispose();
  }
}
function rebuildGizmos() {
  clearGizmoMeshes();
  if (!showingGizmos() || !customSpec) { gizmoGroup.visible = false; return; }
  gizmoGroup.visible = true;
  const n = customSpec.nodes.length;
  const H = Math.max(0.2, customSpec.nodes[n - 1].y - customSpec.nodes[0].y);
  const spacing = H / Math.max(1, n - 1);
  const mobile = isMobileLayout();
  const visR = Math.min(mobile ? 0.085 : 0.055, Math.max(mobile ? 0.052 : 0.036, spacing * 0.30));
  const hitR = Math.min(mobile ? 0.16 : 0.09, Math.max(mobile ? 0.11 : 0.07, spacing * 0.48));
  const bulgeR = visR * 0.72;
  const addBall = (kind, index, r, y, world) => {
    const selected = (kind === 'node' && index === selectedNode) || (kind === 'handle' && index === selectedHandle);
    const mat = selected ? gizmoMats.sel : gizmoMats[kind] || gizmoMats.node;
    const size = kind === 'spoutTip' ? visR * 1.12 : kind === 'spoutRoot' ? visR * 1.05 : kind === 'handle' ? visR * 1.04 : kind === 'node' ? visR : bulgeR;
    const vis = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), mat);
    vis.userData = { kind, index, r, y, vis: true };
    if (world) { vis.userData.world = true; vis.userData.x = world.x; vis.userData.y = world.y; vis.userData.z = world.z; }
    vis.renderOrder = 21;
    if (selected) vis.scale.setScalar(1.28);
    const hit = new THREE.Mesh(new THREE.SphereGeometry((kind.startsWith('spout') || kind === 'handle') ? hitR * 1.15 : hitR, 10, 8), gizmoMats.hit);
    hit.userData = { kind, index, r, y };
    if (world) { hit.userData.world = true; hit.userData.x = world.x; hit.userData.y = world.y; hit.userData.z = world.z; }
    hit.renderOrder = 21;
    gizmoGroup.add(vis); gizmoGroup.add(hit);
  };
  customSpec.nodes.forEach((nd, i) => addBall('node', i, nd.r, nd.y));
  customSpec.bulges.forEach((b, i) => addBall('bulge', i, b.r, b.y));
  if (customSpec.handle === 'c' || customSpec.handle === 'side') {
    handleWorldNodes(customSpec).forEach(hn => addBall('handle', hn.index, hn.r, hn.y, hn.world));
  }
  if (customSpec.spout === 'teapot') {
    const sw = spoutWorld(customSpec);
    addBall('spoutRoot', 0, sw.r0, sw.y0, sw.root);
    addBall('spoutTip', 0, sw.r0 + sw.out, sw.y0 + sw.lift, sw.tip);
  }
  const segs = sampleProfilePts();
  profileLine.geometry.dispose();
  profileLine.geometry = new THREE.BufferGeometry().setFromPoints(segs.map(p => new THREE.Vector3(p.r, p.y, 0)));
  profileLine.userData.pts = segs;
  const hSegs = sampleHandleWorld(customSpec, 40);
  handleLine.visible = hSegs.length > 1;
  handleLine.geometry.dispose();
  handleLine.geometry = new THREE.BufferGeometry().setFromPoints(hSegs.length ? hSegs : [new THREE.Vector3()]);
  handleLine.userData.pts = hSegs;
  placeGizmos();
}
function sampleProfilePts() {
  const segs = [];
  if (!customSpec) return segs;
  const Nsamp = 20;
  for (let i = 0; i < customSpec.nodes.length - 1; i++) {
    const p0 = customSpec.nodes[i], c = customSpec.bulges[i], p1 = customSpec.nodes[i + 1];
    for (let k = 0; k <= Nsamp; k++) {
      const t = k / Nsamp, u = 1 - t;
      segs.push({ r: u * u * p0.r + 2 * u * t * c.r + t * t * p1.r, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y });
    }
  }
  return segs;
}
function updateGizmoDataFromSpec() {
  if (!customSpec || !gizmoGroup.visible) return;
  const sw = customSpec.spout === 'teapot' ? spoutWorld(customSpec) : null;
  const hns = (customSpec.handle === 'c' || customSpec.handle === 'side') ? handleWorldNodes(customSpec) : [];
  gizmoGroup.children.forEach(obj => {
    const d = obj.userData;
    if (!d || d.kind == null) return;
    if (d.kind === 'spoutRoot' && sw) {
      d.r = sw.r0; d.y = sw.y0; d.x = sw.root.x; d.z = sw.root.z; d.world = true;
    } else if (d.kind === 'spoutTip' && sw) {
      d.r = sw.r0 + sw.out; d.y = sw.y0 + sw.lift; d.x = sw.tip.x; d.z = sw.tip.z; d.world = true;
    } else if (d.kind === 'handle') {
      const p = hns[d.index];
      if (p) { d.r = p.r; d.y = p.y; d.x = p.x; d.z = p.z; d.world = true; }
    } else if (d.kind === 'bulge' || d.kind === 'node') {
      const list = d.kind === 'bulge' ? customSpec.bulges : customSpec.nodes;
      const p = list[d.index];
      if (p) { d.r = p.r; d.y = p.y; }
    }
  });
  const segs = sampleProfilePts();
  const pos = profileLine.geometry.attributes.position;
  if (pos && pos.count === segs.length) {
    profileLine.userData.pts = segs;
  } else {
    profileLine.geometry.dispose();
    profileLine.geometry = new THREE.BufferGeometry().setFromPoints(segs.map(p => new THREE.Vector3(p.r, p.y, 0)));
    profileLine.userData.pts = segs;
  }
  const hSegs = sampleHandleWorld(customSpec, 40);
  handleLine.visible = hSegs.length > 1;
  handleLine.userData.pts = hSegs;
  if (hSegs.length) {
    if (!handleLine.geometry.attributes.position || handleLine.geometry.attributes.position.count !== hSegs.length) {
      handleLine.geometry.dispose();
      handleLine.geometry = new THREE.BufferGeometry().setFromPoints(hSegs);
    }
  }
}
function clampMeshToView(obj, padPx) {
  const rect = renderer.domElement.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return;
  camera.updateMatrixWorld();
  const v = obj.position.clone().project(camera);
  if (v.z > 1) return;
  const sx = (v.x + 1) / 2 * rect.width, sy = (1 - v.y) / 2 * rect.height;
  const cx = Math.min(rect.width - padPx, Math.max(padPx, sx));
  const cy = Math.min(rect.height - padPx, Math.max(padPx, sy));
  if (Math.abs(cx - sx) < 0.5 && Math.abs(cy - sy) < 0.5) return;
  const ndc = new THREE.Vector3((cx / rect.width) * 2 - 1, -(cy / rect.height) * 2 + 1, v.z);
  ndc.unproject(camera);
  obj.position.copy(ndc);
}
function gripWorldPoints() {
  const pts = [];
  if (!customSpec) return pts;
  if (customSpec.spout === 'teapot') {
    const sw = spoutWorld(customSpec);
    pts.push(sw.root, sw.tip);
  }
  if (customSpec.handle === 'c' || customSpec.handle === 'side') {
    for (const hn of handleWorldNodes(customSpec)) pts.push(hn.world);
  }
  return pts;
}
function ensureGripsInView() {
  if (!showingGizmos() || !customSpec || !controls) return;
  const rect = renderer.domElement.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return;
  const pad = Math.min(isMobileLayout() ? 48 : 32, rect.height * 0.12);
  for (let iter = 0; iter < 8; iter++) {
    camera.updateMatrixWorld();
    const worlds = gripWorldPoints();
    if (!worlds.length) return;
    let need = false, topHeavy = false;
    for (const p of worlds) {
      const v = p.clone().project(camera);
      const sx = rect.left + (v.x + 1) / 2 * rect.width;
      const sy = rect.top + (1 - v.y) / 2 * rect.height;
      if (v.z > 1 || sx < rect.left + pad || sx > rect.right - pad || sy < rect.top + pad || sy > rect.bottom - pad) {
        need = true;
        if (sy < rect.top + pad) topHeavy = true;
      }
    }
    if (!need) return;
    const t = controls.target;
    const off = camera.position.clone().sub(t);
    off.multiplyScalar(1.09);
    if (topHeavy) {
      t.y -= 0.04;
      off.y = Math.max(off.y - 0.05, -Math.abs(off.x) * 0.2);
    }
    camera.position.copy(t).add(off);
    controls.update();
  }
}
function placeGizmos() {
  if (!gizmoGroup.visible) return;
  const az = gizmoAz(), s = Math.sin(az), c = Math.cos(az);
  gizmoGroup.children.forEach(obj => {
    const d = obj.userData;
    if (!d) return;
    if (d.world) obj.position.set(d.x, d.y, d.z);
    else if (d.r != null) obj.position.set(d.r * s, d.y, d.r * c);
  });
  const pts = profileLine.userData.pts;
  if (pts) {
    const arr = profileLine.geometry.attributes.position.array;
    for (let i = 0; i < pts.length; i++) {
      arr[i * 3] = pts[i].r * s; arr[i * 3 + 1] = pts[i].y; arr[i * 3 + 2] = pts[i].r * c;
    }
    profileLine.geometry.attributes.position.needsUpdate = true;
  }
  const hPts = handleLine.userData.pts;
  if (hPts && hPts.length && handleLine.geometry.attributes.position) {
    const arr = handleLine.geometry.attributes.position.array;
    for (let i = 0; i < hPts.length; i++) {
      arr[i * 3] = hPts[i].x; arr[i * 3 + 1] = hPts[i].y; arr[i * 3 + 2] = hPts[i].z;
    }
    handleLine.geometry.attributes.position.needsUpdate = true;
  }
  const pad = isMobileLayout() ? 40 : 26;
  gizmoGroup.children.forEach(obj => {
    const d = obj.userData;
    if (!d || (d.kind !== 'spoutTip' && d.kind !== 'spoutRoot' && d.kind !== 'handle')) return;
    clampMeshToView(obj, pad);
  });
}
function gizmoScreenOf(kind, index) {
  if (!customSpec) return null;
  camera.updateMatrixWorld();
  const rect = renderer.domElement.getBoundingClientRect();
  const toScreen = (p) => {
    const v = p.clone().project(camera);
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
  };
  // Prefer the placed (possibly view-clamped) mesh so tests and taps hit the visible grip.
  for (const obj of gizmoGroup.children) {
    const d = obj.userData;
    if (!d || d.vis || d.kind !== kind) continue;
    if (index != null && index >= 0 && d.index !== index) continue;
    if (index < 0 && kind === 'node') {
      const last = customSpec.nodes.length + index;
      if (d.index !== last) continue;
    }
    return toScreen(obj.position);
  }
  if (kind === 'spoutRoot' || kind === 'spoutTip') {
    if (customSpec.spout !== 'teapot') return null;
    const sw = spoutWorld(customSpec);
    return toScreen(kind === 'spoutRoot' ? sw.root : sw.tip);
  }
  if (kind === 'handle') {
    const hns = handleWorldNodes(customSpec);
    if (index < 0) index = hns.length + index;
    const p = hns[index];
    return p ? toScreen(p.world) : null;
  }
  const list = kind === 'bulge' ? customSpec.bulges : customSpec.nodes;
  if (index < 0) index = list.length + index;
  const p = list[index]; if (!p) return null;
  const az = gizmoAz();
  return toScreen(new THREE.Vector3(p.r * Math.sin(az), p.y, p.r * Math.cos(az)));
}
function nearestGizmoScreen(clientX, clientY) {
  if (!showingGizmos()) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  camera.updateMatrixWorld();
  let best = null, bd = 1e9;
  for (const obj of gizmoGroup.children) {
    const d = obj.userData; if (!d || !d.kind || d.vis) continue;
    const sp = obj.position.clone().project(camera);
    const sx = rect.left + (sp.x + 1) / 2 * rect.width, sy = rect.top + (1 - sp.y) / 2 * rect.height;
    const dist = Math.hypot(sx - clientX, sy - clientY);
    const prefer = (d.kind === 'spoutRoot' || d.kind === 'spoutTip' || d.kind === 'handle') ? dist - 7 : dist;
    if (prefer < bd) { bd = prefer; best = { kind: d.kind, index: d.index, dist }; }
  }
  return best;
}
function hitGizmo(clientX, clientY) {
  const g = nearestGizmoScreen(clientX, clientY);
  const lim = isMobileLayout() ? 40 : 18;
  if (g && g.dist <= lim) return g;
  return null;
}
function hitOutline(clientX, clientY) {
  if (!showingGizmos() || !customSpec) return null;
  const pts = profileLine.userData.pts;
  if (!pts || !pts.length) return null;
  const az = gizmoAz();
  const rect = renderer.domElement.getBoundingClientRect();
  camera.updateMatrixWorld();
  const s = Math.sin(az), c = Math.cos(az);
  const lim = isMobileLayout() ? 34 : 16;
  let best = null, bd = lim;
  const v = new THREE.Vector3();
  for (const p of pts) {
    v.set(p.r * s, p.y, p.r * c).project(camera);
    const sx = rect.left + (v.x + 1) / 2 * rect.width, sy = rect.top + (1 - v.y) / 2 * rect.height;
    const dist = Math.hypot(sx - clientX, sy - clientY);
    if (dist < bd) { bd = dist; best = { kind: 'profile', r: p.r, y: p.y, dist }; }
  }
  return best;
}
function hitHandleOutline(clientX, clientY) {
  if (!showingGizmos() || !customSpec) return null;
  if (customSpec.handle !== 'c' && customSpec.handle !== 'side') return null;
  const pts = handleLine.userData.pts;
  if (!pts || !pts.length) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  camera.updateMatrixWorld();
  const lim = isMobileLayout() ? 36 : 18;
  let best = null, bd = lim;
  const v = new THREE.Vector3();
  for (const p of pts) {
    v.copy(p).project(camera);
    const sx = rect.left + (v.x + 1) / 2 * rect.width, sy = rect.top + (1 - v.y) / 2 * rect.height;
    const dist = Math.hypot(sx - clientX, sy - clientY);
    if (dist < bd) {
      const az = handleAzimuth(customSpec);
      const r = p.x * Math.cos(az) + p.z * Math.sin(az);
      bd = dist; best = { kind: 'handle', r, y: p.y, dist };
    }
  }
  return best;
}
function handleDragHit(clientX, clientY, index) {
  if (!customSpec) return null;
  const hns = handleWorldNodes(customSpec);
  const through = hns[index] ? hns[index].world : hns[0]?.world;
  if (!through) return null;
  const pt = facingHit(clientX, clientY, through);
  if (!pt) return null;
  const az = handleAzimuth(customSpec);
  const radial = pt.x * Math.cos(az) + pt.z * Math.sin(az);
  return { r: radial, y: pt.y };
}
function profilePlaneHit(clientX, clientY, az) {
  if (az == null) az = gizmoAz();
  const dir = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
  const n = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3());
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  camera.updateMatrixWorld(); raycaster.setFromCamera(ndc, camera);
  const pt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, pt)) return null;
  const r = pt.x * Math.sin(az) + pt.z * Math.cos(az);
  return { r: Math.max(0.08, r), y: pt.y };
}
function facingHit(clientX, clientY, through) {
  const n = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, through);
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  camera.updateMatrixWorld(); raycaster.setFromCamera(ndc, camera);
  const pt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, pt)) return null;
  return pt;
}
function spoutDragHit(clientX, clientY, kind) {
  if (!customSpec) return null;
  const sw = spoutWorld(customSpec);
  const through = kind === 'spoutTip' ? sw.tip : sw.root;
  const pt = facingHit(clientX, clientY, through);
  if (!pt) return null;
  const radial = pt.x * Math.cos(sw.az) + pt.z * Math.sin(sw.az);
  return { r: radial, y: pt.y };
}
const cursor = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.55, depthTest: false }));
cursor.renderOrder = 10; cursor.visible = false; scene.add(cursor);
const pourRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * Math.PI * 2), 0, Math.sin(i / 96 * Math.PI * 2)))), new THREE.LineBasicMaterial({ color: 0xc0391b }));
pourRing.visible = false; scene.add(pourRing);
function showPourRing(hFrac) {
  const y = hFrac * pot.height, r = pot.outerRadiusAt(y) || 0.5;
  pourRing.position.set(0, y, 0); pourRing.scale.set(r * 1.01, 1, r * 1.01); pourRing.visible = ui.tool === 'pour' && ui.simState === 'raw';
}

let painting = false, lastScreen = null, paintPointer = null;
let shaping = false, shapePointer = null, shapeTarget = null;
let pendingOutline = null, lastAddMs = 0, previewRaf = 0;
const touchPointers = new Set();
function dabFromHit(h) { state.dab(h.uv.x, h.uv.y, ui.size, GLAZE_INDEX[ui.glaze], thickness[ui.glaze]); }
function liveCustomStatus() {
  if (!customSpec || shapeLocked()) return;
  const d = dimsCm(customSpec);
  const w = customSpec.wallTaper
    ? `wall ${d.wallBase.toFixed(2)}→${d.wallRim.toFixed(2)} cm`
    : `wall ${d.wall.toFixed(2)} cm`;
  setStatus(`Custom shape · ${Math.round(d.ml)} ml · ${w}.`);
}
function queueShapePreview() {
  if (previewRaf) return;
  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0;
    if (!customSpec || shapeLocked()) return;
    rebuildCustom({ preview: true, skipUi: true });
  });
}
function livePreview() {
  if (!customSpec || shapeLocked()) return;
  syncCustomSliders();
  liveCustomStatus();
  queueShapePreview();
}
function flushShapePreview() {
  if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = 0; }
}
function tryAddAtHeight(y, kind, r) {
  if (!customSpec || shapeLocked()) return false;
  if (performance.now() - lastAddMs < 350) return false;
  if (kind === 'handle') return insertHandleAt(r, y);
  return insertNodeAt(y);
}
function insertNodeAt(y) {
  if (!customSpec || shapeLocked()) return false;
  const idx = addNodeAt(customSpec, y);
  if (idx < 0) return false;
  selectedNode = idx;
  lastAddMs = performance.now();
  onCustomChange();
  return true;
}
function insertHandleAt(r, y) {
  if (!customSpec || shapeLocked()) return false;
  const idx = addHandleNodeAtPoint(customSpec, r, y);
  if (idx < 0) return false;
  selectedHandle = idx;
  selectedNode = -1;
  lastAddMs = performance.now();
  onCustomChange();
  return true;
}
function selectNode(i) {
  selectedNode = i;
  selectedHandle = -1;
  rebuildGizmos();
  refreshUI();
}
function selectHandle(i) {
  selectedHandle = i;
  selectedNode = -1;
  rebuildGizmos();
  refreshUI();
}
function syncOrbitTouches() {
  // Paint: one-finger ignored by OrbitControls (we paint). Two-finger dolly+rotate.
  // Shape: one-finger ignored (we drag nodes). Two-finger dolly+rotate.
  // Orbit: one-finger rotate, two-finger dolly+rotate.
  controls.touches.ONE = ui.touchMode === 'orbit' ? THREE.TOUCH.ROTATE : -1;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
}
function canPaintTouch() {
  return ui.touchMode === 'paint' && touchPointers.size < 2;
}
function canShapeTouch() {
  return ui.touchMode === 'shape' && touchPointers.size < 2;
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 2; controls.maxDistance = 20;
controls.minPolarAngle = 0.08;
controls.maxPolarAngle = Math.PI * 0.92;
syncOrbitTouches();
controls.addEventListener('change', requestDraw);
controls.addEventListener('start', requestDraw);

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') touchPointers.add(e.pointerId);
  if (e.pointerType === 'touch' && touchPointers.size >= 2) {
    painting = false; lastScreen = null; paintPointer = null;
    pendingOutline = null;
    if (shaping) { shaping = false; shapePointer = null; flushShapePreview(); rebuildCustom(); }
    controls.enabled = true;
    return;
  }
  if (e.button !== 0 || ui.simState !== 'raw' || !mesh) return;
  if (showingGizmos() && (e.pointerType !== 'touch' || canShapeTouch())) {
    const g = hitGizmo(e.clientX, e.clientY);
    const outline = hitOutline(e.clientX, e.clientY);
    const hOutline = hitHandleOutline(e.clientX, e.clientY);
    const bestOutline = (!outline || (hOutline && hOutline.dist < outline.dist)) ? hOutline : outline;
    const preferOutline = bestOutline && (!g || bestOutline.dist + 8 < g.dist);
    if (g && !preferOutline) {
      e.preventDefault();
      if (e.pointerType !== 'touch') controls.enabled = false;
      shaping = true; shapePointer = e.pointerId; shapeTarget = { kind: g.kind, index: g.index };
      if (g.kind === 'node') { selectedNode = g.index; selectedHandle = -1; rebuildGizmos(); refreshUI(); }
      if (g.kind === 'handle') { selectedHandle = g.index; selectedNode = -1; rebuildGizmos(); refreshUI(); }
      renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
    if (bestOutline) {
      e.preventDefault();
      if (e.pointerType !== 'touch') controls.enabled = false;
      pendingOutline = { pointer: e.pointerId, x: e.clientX, y: e.clientY, height: bestOutline.y, r: bestOutline.r, kind: bestOutline.kind };
      renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
  }
  if (e.pointerType === 'touch' && !canPaintTouch()) return;
  const h = hitAt(e.clientX, e.clientY);
  if (!h) return;
  e.preventDefault();
  if (ui.tool === 'brush') {
    if (e.pointerType !== 'touch') controls.enabled = false;
    painting = true; lastScreen = [e.clientX, e.clientY]; paintPointer = e.pointerId;
    renderer.domElement.setPointerCapture(e.pointerId);
    coatMark = state.ops.length;
    state.deferCompose = true;
    state.beginStroke(); dabFromHit(h);
    requestDraw();
  } else {
    if (e.pointerType !== 'touch') controls.enabled = false;
    ui.pourH = Math.min(1, Math.max(0, h.point.y / pot.height));
    doPour(); refreshUI();
  }
}, { capture: true });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!mesh) return;
  if (pendingOutline && pendingOutline.pointer === e.pointerId) {
    if (Math.hypot(e.clientX - pendingOutline.x, e.clientY - pendingOutline.y) > (isMobileLayout() ? 18 : 10)) pendingOutline = null;
  }
  if (shaping && shapePointer === e.pointerId) {
    if (e.pointerType === 'touch' && touchPointers.size >= 2) { shaping = false; pendingOutline = null; return; }
    if (shapeTarget && customSpec) {
      if (shapeTarget.kind === 'spoutRoot' || shapeTarget.kind === 'spoutTip') {
        const sh = spoutDragHit(e.clientX, e.clientY, shapeTarget.kind);
        if (sh) {
          if (shapeTarget.kind === 'spoutRoot') setSpoutHeight(customSpec, sh.y);
          else setSpoutTip(customSpec, sh.r, sh.y);
        }
      } else if (shapeTarget.kind === 'handle') {
        const hh = handleDragHit(e.clientX, e.clientY, shapeTarget.index);
        if (hh) constrainHandleNode(customSpec, shapeTarget.index, hh.r, hh.y);
      } else {
        const hit = profilePlaneHit(e.clientX, e.clientY);
        if (hit) {
          if (shapeTarget.kind === 'node') constrainNode(customSpec, shapeTarget.index, hit.r, hit.y);
          else constrainBulge(customSpec, shapeTarget.index, hit.r, hit.y);
        }
      }
      liveCustomStatus();
      syncCustomSliders();
      updateGizmoDataFromSpec();
      placeGizmos();
      queueShapePreview();
      requestDraw();
    }
    return;
  }
  const h = hitAt(e.clientX, e.clientY);
  if (e.pointerType !== 'touch' && h && ui.tool === 'brush' && ui.simState === 'raw' && !showingGizmos()) {
    cursor.visible = true; cursor.position.copy(h.point);
    const n = h.face.normal.clone().transformDirection(mesh.matrixWorld);
    cursor.lookAt(h.point.clone().add(n)); cursor.scale.setScalar(ui.size);
    requestDraw();
  } else if (e.pointerType === 'touch' || showingGizmos()) cursor.visible = false;
  else if (!h) cursor.visible = false;
  if (ui.tool === 'pour' && h && ui.simState === 'raw') showPourRing(h.point.y / pot.height);
  if (!painting || (paintPointer !== null && e.pointerId !== paintPointer)) return;
  if (e.pointerType === 'touch' && touchPointers.size >= 2) { painting = false; return; }
  const [lx, ly] = lastScreen, dx = e.clientX - lx, dy = e.clientY - ly;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
  for (let s = 1; s <= steps; s++) {
    const hh = hitAt(lx + dx * s / steps, ly + dy * s / steps);
    if (hh) dabFromHit(hh);
  }
  lastScreen = [e.clientX, e.clientY];
  requestDraw();
});
const endStroke = (e) => {
  if (e && e.pointerType === 'touch') touchPointers.delete(e.pointerId);
  if (pendingOutline && (!e || e.pointerId === pendingOutline.pointer || !touchPointers.size)) {
    const addY = pendingOutline.height, addKind = pendingOutline.kind, addR = pendingOutline.r;
    pendingOutline = null;
    if (e && e.pointerType === 'touch' && touchPointers.size >= 1) { /* second finger: keep orbit */ }
    else tryAddAtHeight(addY, addKind, addR);
    controls.enabled = true;
  }
  if (shaping && (!e || e.pointerId === shapePointer || !touchPointers.size)) {
    shaping = false; shapePointer = null; shapeTarget = null;
    flushShapePreview();
    scheduleFullCustom();
    liveCustomStatus();
  }
  if (e && paintPointer !== null && e.pointerId !== paintPointer && touchPointers.size) return;
  painting = false; paintPointer = null; controls.enabled = true;
  if (state.deferCompose) {
    state.deferCompose = false;
    state.flushCompose();
  }
  uploadTextures({ full: true });
  requestDraw();
  if (coatMark >= 0) {
    const mark = coatMark;
    coatMark = -1;
    commitCoat(mark);
  }
};
renderer.domElement.addEventListener('pointerup', endStroke);
renderer.domElement.addEventListener('pointercancel', endStroke);
renderer.domElement.addEventListener('pointerleave', () => { cursor.visible = false; });
renderer.domElement.addEventListener('dblclick', (e) => {
  if (!showingGizmos() || shapeLocked()) return;
  if (hitGizmo(e.clientX, e.clientY)) return;
  const outline = hitOutline(e.clientX, e.clientY);
  const hOutline = hitHandleOutline(e.clientX, e.clientY);
  const best = (!outline || (hOutline && hOutline.dist < outline.dist)) ? hOutline : outline;
  if (best) { e.preventDefault(); tryAddAtHeight(best.y, best.kind, best.r); }
});

view.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

function doPour() {
  const mark = state.ops.length;
  state.pour(GLAZE_INDEX[ui.glaze], ui.pourH, ui.pourMode, thickness[ui.glaze]);
  commitCoat(mark);
  showPourRing(ui.pourH);
  const where = ui.pourMode === 'above' ? 'above' : 'below';
  setStatus(`Poured ${GLAZES[GLAZE_INDEX[ui.glaze]].name} ${where} the line (${Math.round(ui.pourH * 100)}%).`);
}

// ---------- firing ----------
const glow = { v: 0 };
function animateTo(obj, key, to, ms) {
  return new Promise(res => { const from = obj[key], t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); obj[key] = from + (to - from) * (k * k * (3 - 2 * k)); k < 1 ? requestAnimationFrame(step) : res(); }; step(); });
}
function setFireProgress(p, label) {
  document.querySelectorAll('.kiln-progress').forEach(wrap => {
    if (p == null) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const lab = wrap.querySelector('.kiln-progress-label');
    if (lab && label) lab.textContent = label;
    const bar = wrap.querySelector('.kiln-bar > i');
    if (bar) bar.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
  });
}
async function fire(seed) {
  if (ui.simState === 'firing') return;
  if (ui.simState !== 'raw' && ui.simState !== 'fired') return;
  ui.simState = 'firing';
  if (isMobileLayout()) document.body.classList.add('sheet-collapsed');
  refreshUI(); cursor.visible = false; pourRing.visible = false;
  requestDraw();
  const temp = ui.cone === 10 ? 1285 : 1222;
  setStatus(`Firing… heating to cone ${ui.cone} (~${temp}°C, Orton 60°C/h)`);
  setFireProgress(0.04, `Heating to cone ${ui.cone}`);
  const t0 = performance.now();
  const simP = state.fire(p => {
    setFireProgress(0.08 + 0.82 * p, `Melt & flow ${Math.round(p * 100)}%`);
    setStatus(`Firing… melt & flow ${Math.round(p * 100)}%`);
  }, typeof seed === 'number' ? seed : undefined);
  await Promise.all([animateTo(glow, 'v', 1, 420), simP]);
  setStatus('Cooling…');
  setFireProgress(0.96, 'Cooling…');
  await animateTo(glow, 'v', 0, 720);
  setFireProgress(null);
  ui.simState = 'fired'; refreshUI();
  fireWallMs = performance.now() - t0;
  const ds = state.dripStats || {};
  setStatus(`Painting is locked. Unfire to paint again. Seed ${state.seed}, ${ds.drips ?? 0} runs.`);
}
function unfire() { if (ui.simState !== 'fired') return; state.unfire(); ui.simState = 'raw'; refreshUI(); setStatus('Painting is open. Brush or pour, then fire.'); }
function clearAll() {
  if (ui.simState === 'firing') return;
  state.clear();
  ui.simState = 'raw';
  if (historyArmed && !historyLock) steps.push({ kind: 'clear' });
  refreshUI();
  setStatus('Cleared. Paint some glaze, then fire.');
}

// Each coat, pour, shape edit, wax toggle, and clear is one step. Undo drops the
// last step and rebuilds the pot from the baseline plus whatever steps remain.
let historyArmed = false;
let historyLock = false;
let steps = [];
let baseline = null;
let lastShapeKey = '';
let coatMark = -1;

function shapeKey() {
  const custom = ui.shape === 'custom' && customSpec ? cloneSpec(customSpec) : null;
  return JSON.stringify({ shape: ui.shape, custom });
}
function noteShape() {
  const key = shapeKey();
  if (!historyArmed || historyLock) { lastShapeKey = key; return; }
  if (key === lastShapeKey) return;
  steps.push({
    kind: 'form',
    shape: ui.shape,
    custom: ui.shape === 'custom' && customSpec ? cloneSpec(customSpec) : null,
  });
  lastShapeKey = key;
  refreshUI();
}
function commitCoat(mark) {
  if (!historyArmed || historyLock || mark < 0) return;
  if (state.ops.length <= mark) return;
  steps.push({ kind: 'coat', ops: state.ops.slice(mark).map(op => ({ ...op })) });
  refreshUI();
}
function captureBaseline() {
  baseline = {
    shape: ui.shape,
    custom: ui.shape === 'custom' && customSpec ? cloneSpec(customSpec) : null,
    wax: state.waxFoot !== false,
    ops: state.ops.map(op => ({ ...op })),
  };
  steps = [];
  lastShapeKey = shapeKey();
}
function applyLoggedOp(op) {
  const gi = GLAZE_INDEX[op.glaze];
  if (op.op === 'stroke') state.beginStroke();
  else if (op.op === 'dab' && Number.isInteger(gi)) state.dab(op.u, op.v, op.r, gi, op.t);
  else if (op.op === 'pour' && Number.isInteger(gi)) state.pour(gi, op.h, op.mode, op.t);
}
function restoreForm(step, fresh) {
  if (step.shape === 'custom' && step.custom) {
    customSpec = cloneSpec(step.custom);
    if (selectedNode >= customSpec.nodes.length) selectedNode = customSpec.nodes.length - 1;
    ui.shape = 'custom';
    applyBuiltPot(buildCustomPot(customSpec), { remap: !fresh, noFrame: true });
  } else {
    customSpec = null;
    selectedNode = -1;
    selectedHandle = -1;
    ui.shape = step.shape || 'vase';
    applyBuiltPot(buildPot(ui.shape), { noFrame: true });
  }
}
function replayHistory() {
  if (!baseline) return;
  historyLock = true;
  state._recording = false;
  restoreForm(baseline, true);
  state.waxFoot = baseline.wax !== false;
  const ops = baseline.ops.map(op => ({ ...op }));
  for (const op of ops) applyLoggedOp(op);
  let stale = false;
  for (const step of steps) {
    if (step.kind === 'form') {
      const clearing = step.shape !== 'custom';
      restoreForm(step, false);
      if (clearing) { ops.length = 0; stale = false; }
      else if (ops.length) stale = true;
    } else if (step.kind === 'clear') {
      state.clear();
      ops.length = 0;
      stale = false;
    } else if (step.kind === 'wax') {
      state.waxFoot = !!step.on;
    } else if (step.kind === 'coat') {
      for (const op of step.ops) applyLoggedOp(op);
      for (const op of step.ops) ops.push({ ...op });
    }
  }
  state.ops = ops;
  state.opsStale = stale;
  state._recording = true;
  historyLock = false;
  lastShapeKey = shapeKey();
  ui.simState = 'raw';
  if (isMobileLayout() && ui.shape !== 'custom' && ui.touchMode === 'shape') {
    ui.touchMode = 'paint';
    ui.touchOrbit = false;
    syncOrbitTouches();
  }
  $('wax').checked = state.waxFoot;
  refreshUI();
}
function undoLast() {
  if (ui.simState === 'firing') return;
  if (!steps.length) { setStatus('Nothing to undo.'); return; }
  if (ui.simState === 'fired') unfire();
  const step = steps.pop();
  replayHistory();
  const word = { coat: 'coat', form: 'shape change', wax: 'wax change', clear: 'clear' }[step.kind] || 'step';
  setStatus(step.kind === 'coat' && !state.ops.length ? `Undid the last coat. The pot is bare.` : `Undid the last ${word}.`);
}

let record = null;

function currentRecipe() {
  return {
    v: 1,
    shape: ui.shape,
    custom: ui.shape === 'custom' && customSpec ? cloneSpec(customSpec) : null,
    cone: ui.cone,
    wax: state.waxFoot,
    seed: state.seed ?? null,
    fired: ui.simState === 'fired',
    stale: !!state.opsStale,
    ops: state.ops.slice(),
  };
}

function potTitle() {
  const g = GLAZES[GLAZE_INDEX[ui.glaze]];
  return `${ui.shape} · ${g ? g.name : 'glaze'}`.slice(0, 80);
}

function remember(row) {
  const me = peekUser();
  record = me && row.owner === me.id ? { id: row.id, share_id: row.share_id } : null;
}

async function applyRecipe(recipe) {
  if (!recipe || recipe.v !== 1) throw new Error('This link is not a pot record.');
  if (ui.simState === 'firing') return;
  if (ui.simState === 'fired') unfire();
  historyLock = true;
  try {
  state._recording = false;
  ui.cone = recipe.cone === 10 ? 10 : 6;
  setFireCone(ui.cone);
  state.waxFoot = recipe.wax !== false;
  $('wax').checked = state.waxFoot;
  if (recipe.shape === 'custom' && recipe.custom) {
    if (ui.shape !== 'custom') setShape('custom');
    customSpec = recipe.custom;
    rebuildCustom();
  } else {
    setShape(recipe.shape || 'vase');
  }
  state._recording = false;
  state.clear();
  for (const op of recipe.ops || []) {
    const gi = GLAZE_INDEX[op.glaze];
    if (op.op === 'stroke') state.beginStroke();
    else if (op.op === 'dab' && Number.isInteger(gi)) state.dab(op.u, op.v, op.r, gi, op.t);
    else if (op.op === 'pour' && Number.isInteger(gi)) state.pour(gi, op.h, op.mode, op.t);
  }
  state.ops = (recipe.ops || []).map(op => ({ ...op }));
  state.opsStale = !!recipe.stale;
  state._recording = true;
  ui.simState = 'raw';
  refreshUI();
  if (recipe.fired && typeof recipe.seed === 'number') await fire(recipe.seed);
  } finally {
    historyLock = false;
    if (ui.simState !== 'firing') {
      captureBaseline();
      refreshUI();
    }
  }
}

let socialList = null;

function paintSocial() {
  const row = $('socialRow');
  if (!row) return;
  if (peekUser() || !socialList?.length) { row.hidden = true; row.innerHTML = ''; return; }
  row.hidden = false;
  row.innerHTML = '';
  for (const id of socialList) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = socialLabel(id);
    b.title = `Sign in with ${socialLabel(id)}`;
    b.onclick = () => { setStatus(`Opening ${socialLabel(id)}…`); socialSignIn(id); };
    row.appendChild(b);
  }
}

function paintCloud() {
  const user = peekUser();
  $('cloudWho').textContent = user ? (user.email || 'Signed in') : 'Sign in to save or share this pot.';
  $('signBtn').textContent = user ? 'Sign out' : 'Sign in';
  if (user) $('cloudForm').hidden = true;
  paintSocial();
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function fillPots() {
  const sel = $('potList');
  if (!peekUser()) { sel.hidden = true; sel.innerHTML = ''; return; }
  const rows = await listMine();
  if (!rows.length) { sel.hidden = true; sel.innerHTML = ''; return; }
  sel.hidden = false;
  sel.innerHTML = `<option value="">My pots</option>${rows.map(r => `<option value="${esc(r.id)}">${esc(r.title || 'Untitled')}</option>`).join('')}`;
  if (record?.id) sel.value = record.id;
}

async function keepPot(share) {
  if (ui.simState === 'firing') return;
  if (!peekUser()) {
    $('cloudForm').hidden = false;
    $('cloudEmail').focus();
    setStatus('Sign in first. A link comes to your email.');
    return;
  }
  $('saveBtn').disabled = true;
  $('shareBtn').disabled = true;
  try {
    setStatus(share ? 'Saving a share link…' : 'Saving…');
    const row = await saveRecipe({ id: record?.id, title: potTitle(), recipe: currentRecipe() });
    record = { id: row.id, share_id: row.share_id };
    if (share) {
      await publishRecipe(row.id);
      const url = `${location.origin}${location.pathname}?pot=${row.share_id}`;
      try { await navigator.clipboard.writeText(url); } catch { /* status still shows the link */ }
      setStatus(`Share link copied. ${url}`);
    } else if (state.opsStale) {
      setStatus('Saved. A shape edit after painting may not match this picture exactly.');
    } else {
      setStatus('Saved.');
    }
    try { await fillPots(); } catch { /* the pot is saved even if the list fails */ }
  } catch (err) {
    setStatus(err.message || 'Could not save.');
  } finally {
    $('saveBtn').disabled = false;
    $('shareBtn').disabled = false;
  }
}

async function bootCloud() {
  try { await restoreSession(); } catch (err) { setStatus(err.message || 'Sign-in link failed.'); }
  try { socialList = await enabledSocial(); } catch { socialList = []; }
  paintCloud();
  if (peekUser()) { try { await fillPots(); } catch (err) { setStatus(err.message); } }
  const pot = new URLSearchParams(location.search).get('pot');
  if (!pot) return;
  try {
    setStatus('Opening shared pot…');
    const row = await loadShared(pot);
    remember(row);
    await applyRecipe(row.recipe);
    if (ui.simState === 'raw') setStatus(row.title ? `Opened ${row.title}.` : 'Opened a shared pot.');
    if (record) { try { await fillPots(); } catch { /* list is optional */ } }
  } catch (err) {
    setStatus(err.message || 'Could not open that pot.');
  }
}

// ---------- UI wiring ----------
const $ = (id) => document.getElementById(id);
const FAM_SHORT = { neutral: 'Whites', blues: 'Blues', greens: 'Greens', purples: 'Reds', warm: 'Ambers', dark: 'Dark' };
ui.glazeFam = GLAZES[GLAZE_INDEX[ui.glaze]].family;
ui.glazeQuery = '';
const famRow = $('glazeFams');
for (const [fam, label] of FAMILIES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.fam = fam;
  b.textContent = FAM_SHORT[fam] || label;
  b.title = label;
  b.setAttribute('role', 'tab');
  b.onclick = () => { ui.glazeFam = fam; refreshUI(); };
  famRow.appendChild(b);
}
const gl = $('glazes');
for (const [fam, label] of FAMILIES) {
  const famWrap = document.createElement('details');
  famWrap.className = 'fam-group';
  famWrap.dataset.fam = fam;
  famWrap.open = true;
  const hd = document.createElement('summary'); hd.className = 'fam'; hd.dataset.fam = fam; hd.textContent = label;
  famWrap.appendChild(hd);
  const grid = document.createElement('div'); grid.className = 'fam-grid';
  for (const g of GLAZES.filter(x => x.family === fam)) {
    const b = document.createElement('button'); b.className = 'glaze'; b.dataset.glaze = g.id; b.dataset.fam = fam;
    const mid = g.fired[Math.min(g.fired.length - 1, 3)][1];
    b.innerHTML = `<span class="sw" style="background:linear-gradient(135deg, ${g.raw} 50%, ${mid} 50%)"></span><span class="nm">${g.name.replace(/ ([A-Z]{1,3}-\d+)$/, '')}${/ [A-Z]{1,3}-\d+$/.test(g.name) ? `<small>${g.name.match(/[A-Z]{1,3}-\d+$/)[0]}</small>` : ''}</span>`;
    b.title = `${g.name}${g.src ? ' (colours approximated from ' + g.src + ')' : g.like ? ' (' + g.like + ')' : ''}. Swatch: raw colour | fired colour`;
    b.onclick = () => { ui.glaze = g.id; ui.glazeFam = g.family; refreshUI(); uploadTextures({ full: true }); requestDraw(); };
    grid.appendChild(b);
  }
  famWrap.appendChild(grid);
  gl.appendChild(famWrap);
}
const glazeSearch = $('glazeSearch');
if (glazeSearch) {
  glazeSearch.addEventListener('input', () => { ui.glazeQuery = glazeSearch.value; refreshUI(); });
}
document.querySelectorAll('#shapes button').forEach(b => b.onclick = () => ui.simState !== 'firing' && setShape(b.dataset.shape));
document.querySelectorAll('#tools button').forEach(b => b.onclick = () => {
  ui.tool = b.dataset.tool;
  refreshUI();
  if (ui.simState === 'firing') return;
  if (ui.simState !== 'raw') { setStatus('Painting is locked. Unfire to paint again.'); return; }
  setStatus(ui.tool === 'pour'
    ? 'Pour stops at the dip line. Cover below or above, then Pour.'
    : 'Brush is on. Drag on the pot, then fire.');
});
document.querySelectorAll('#pourMode button').forEach(b => b.onclick = () => {
  ui.pourMode = b.dataset.mode;
  refreshUI();
  if (ui.simState !== 'raw') return;
  setStatus(ui.pourMode === 'above' ? 'Pour will cover above the dip line.' : 'Pour will cover below the dip line.');
});
function setBrushLayers(layers) {
  const n = clampLayers(layers);
  thickness[ui.glaze] = amountOf(n);
  return n;
}
$('thick').oninput = $('thick').onchange = (e) => {
  const layers = setBrushLayers(+e.target.value);
  refreshUI();
  const name = GLAZES[GLAZE_INDEX[ui.glaze]].name;
  setStatus(layers === 1 ? `Next stroke lays 1 layer of ${name}.` : `Next stroke lays ${layers} layers of ${name}.`);
};
$('size').oninput = (e) => { ui.size = +e.target.value; refreshUI(); };
$('pourH').oninput = (e) => { ui.pourH = +e.target.value; showPourRing(ui.pourH); refreshUI(); };
$('pourBtn').onclick = () => ui.simState === 'raw' && doPour();
$('wax').onchange = (e) => {
  state.waxFoot = e.target.checked;
  if (historyArmed && !historyLock) steps.push({ kind: 'wax', on: state.waxFoot });
  refreshUI();
  setStatus(e.target.checked ? 'Foot is waxed, so it stays bare clay.' : 'Wax is off. Glaze can cover the foot.');
};
$('signBtn').onclick = async () => {
  if (peekUser()) {
    await signOut();
    record = null;
    paintCloud();
    await fillPots();
    setStatus('Signed out.');
    return;
  }
  const form = $('cloudForm');
  form.hidden = !form.hidden;
  if (!form.hidden) {
    $('cloudEmail').focus();
    setStatus('Enter your email. A sign-in link comes back to this browser.');
  }
};
$('cloudForm').onsubmit = async (e) => {
  e.preventDefault();
  const email = $('cloudEmail').value.trim();
  if (!email) return;
  $('cloudSend').disabled = true;
  setStatus('Sending a sign-in link…');
  try {
    await sendLink(email);
    setStatus('Link sent. Open it in this browser.');
  } catch (err) {
    setStatus(err.message || 'Could not send the link.');
  } finally {
    $('cloudSend').disabled = false;
  }
};
$('saveBtn').onclick = () => keepPot(false);
$('shareBtn').onclick = () => keepPot(true);
$('potList').onchange = async (e) => {
  const id = e.target.value;
  if (!id || ui.simState === 'firing') return;
  try {
    setStatus('Opening your pot…');
    const row = await loadOwned(id);
    remember(row);
    await applyRecipe(row.recipe);
    if (ui.simState === 'raw') setStatus(row.title ? `Opened ${row.title}.` : 'Opened your pot.');
  } catch (err) {
    setStatus(err.message || 'Could not open that pot.');
  }
};
$('fireBtn').onclick = () => fire(); $('unfireBtn').onclick = unfire; $('undoBtn').onclick = undoLast; $('clearBtn').onclick = clearAll;
document.querySelectorAll('#quality button').forEach(b => {
  b.onclick = () => setQualityPref(b.dataset.quality);
});
window.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key !== 'z' || e.shiftKey) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  e.preventDefault();
  undoLast();
});
document.querySelectorAll('#cone button').forEach(b => b.onclick = () => {
  if (ui.simState === 'firing') return;
  ui.cone = +b.dataset.cone;
  setFireCone(ui.cone);
  refreshUI();
  const temp = ui.cone === 10 ? 1285 : 1222;
  const next = ui.simState === 'fired' ? 'Unfire, then fire again to use it.' : 'Paint, then fire.';
  setStatus(`Cone ${ui.cone}, about ${temp}°C. ${next}`);
});

document.querySelectorAll('#mobileBar [data-sheet]').forEach(b => b.onclick = () => {
  if (ui.sheet === b.dataset.sheet && !document.body.classList.contains('sheet-collapsed')) {
    document.body.classList.add('sheet-collapsed');
  } else {
    ui.sheet = b.dataset.sheet;
    document.body.dataset.sheet = ui.sheet;
    document.body.classList.remove('sheet-collapsed');
  }
  refreshUI();
  resize({ fit: true });
});
$('foldBtn').onclick = () => {
  document.body.classList.toggle('sheet-collapsed');
  refreshUI();
  resize({ fit: true });
};
document.querySelectorAll('#touchMode button').forEach(b => b.onclick = () => {
  ui.touchMode = b.dataset.mode;
  ui.touchOrbit = ui.touchMode === 'orbit';
  if (isMobileLayout() && ui.touchMode === 'shape') document.body.classList.add('sheet-collapsed');
  syncOrbitTouches();
  refreshUI();
  rebuildGizmos();
  resize({ fit: true });
});

function fmtCm(v) { return v.toFixed(1) + ' cm'; }
function syncCustomSliders() {
  if (!customSpec) return;
  const d = dimsCm(customSpec);
  $('customH').value = d.height; $('customHOut').textContent = fmtCm(d.height);
  $('customRim').value = d.rim; $('customRimOut').textContent = fmtCm(d.rim);
  $('customFoot').value = d.foot; $('customFootOut').textContent = fmtCm(d.foot);
  $('customWall').value = d.wall; $('customWallOut').textContent = d.wall.toFixed(2) + ' cm';
  ensureWall(customSpec);
  if ($('wallRim')) {
    $('wallRim').value = d.wallRim; $('wallRimOut').textContent = d.wallRim.toFixed(2) + ' cm';
    $('wallMid').value = d.wallMid; $('wallMidOut').textContent = d.wallMid.toFixed(2) + ' cm';
    $('wallBase').value = d.wallBase; $('wallBaseOut').textContent = d.wallBase.toFixed(2) + ' cm';
    $('wallTaper').checked = !!customSpec.wallTaper;
  }
  ensureFoot(customSpec);
  const fg = footGeom(customSpec);
  if ($('footH')) {
    $('footH').value = fg.Y * UNIT_CM; $('footHOut').textContent = fmtCm(fg.Y * UNIT_CM);
    $('footOuter').value = d.foot; $('footOuterOut').textContent = fmtCm(d.foot);
    $('footThick').value = fg.thick * UNIT_CM; $('footThickOut').textContent = fmtCm(fg.thick * UNIT_CM);
    $('footCarve').value = fg.carve * UNIT_CM; $('footCarveOut').textContent = fmtCm(fg.carve * UNIT_CM);
    $('footStem').value = fg.stemR * 2 * UNIT_CM; $('footStemOut').textContent = fmtCm(fg.stemR * 2 * UNIT_CM);
    $('footFlare').value = fg.flare; $('footFlareOut').textContent = fg.flare.toFixed(2) + '×';
  }
  $('capOut').textContent = Math.round(d.ml);
  const mid = Math.max(0, customSpec.nodes.length - 2);
  const nc = $('nodeCount'); if (nc) nc.textContent = `${mid}/${MAX_MID}`;
  const hn = ensureHandleNodes(customSpec);
  const hc = $('hNodeCount'); if (hc) hc.textContent = hn ? `${hn.length}/${HANDLE_MAX}` : `0/${HANDLE_MAX}`;
  $('hPos').value = customSpec.handlePos; $('hPosOut').textContent = fmtCm(customSpec.handlePos * UNIT_CM);
  $('hH').value = customSpec.handleHeight; $('hHOut').textContent = fmtCm(customSpec.handleHeight * UNIT_CM);
  $('hW').value = customSpec.handleWidth; $('hWOut').textContent = fmtCm(customSpec.handleWidth * UNIT_CM);
  $('hT').value = customSpec.handleThick; $('hTOut').textContent = fmtCm(customSpec.handleThick * UNIT_CM);
  const sp = customSpec.spout !== 'none' ? spoutParams(customSpec) : null;
  if (sp) {
    $('sH').value = sp.yFrac;
    $('sHOut').textContent = fmtCm((sp.y0 - sp.yFoot) * UNIT_CM);
    let azDeg = (sp.az * 180 / Math.PI) % 360; if (azDeg < 0) azDeg += 360;
    $('sAz').value = Math.round(azDeg);
    $('sAzOut').textContent = Math.round(azDeg) + '°';
    $('sTilt').value = Math.round(sp.tilt * 180 / Math.PI);
    $('sTiltOut').textContent = Math.round(sp.tilt * 180 / Math.PI) + '°';
    $('sLen').value = sp.len * UNIT_CM;
    $('sLenOut').textContent = fmtCm(sp.len * UNIT_CM);
    $('sMouth').value = sp.mouth;
    $('sMouthOut').textContent = (sp.mouth).toFixed(2) + '×';
  }
  const hud = $('dimHud');
  hud.hidden = false;
  if (customSpec.wallTaper) {
    hud.textContent = `${fmtCm(d.height)} · rim Ø ${fmtCm(d.rim)} · wall ${d.wallBase.toFixed(1)}→${d.wallRim.toFixed(1)} cm · ${Math.round(d.ml)} ml`;
  } else {
    hud.textContent = `${fmtCm(d.height)} · rim Ø ${fmtCm(d.rim)} · wall ${d.wall.toFixed(2)} cm · ${Math.round(d.ml)} ml`;
  }
}
function onCustomChange() {
  if (shapeLocked()) { setStatus('Unfire first to edit the shape.'); refreshUI(); return; }
  scheduleFullCustom();
  const d = dimsCm(customSpec);
  setStatus(`Custom shape · ${Math.round(d.ml)} ml.`);
}
$('nodeAdd').onclick = () => {
  if (!customSpec || shapeLocked()) return;
  if (customSpec.nodes.length >= 2 + MAX_MID) return;
  addNode(customSpec);
  selectedNode = Math.min(customSpec.nodes.length - 2, Math.max(1, selectedNode));
  onCustomChange();
};
$('nodeSub').onclick = () => {
  if (!customSpec || shapeLocked()) return;
  const idx = selectedNode > 0 && selectedNode < customSpec.nodes.length - 1 ? selectedNode : undefined;
  const removed = removeNode(customSpec, idx);
  if (removed >= 0) selectedNode = Math.min(removed, customSpec.nodes.length - 2);
  onCustomChange();
};
$('nodeDel').onclick = () => { deleteSelectedNode(); };
$('nodeDelHud').onclick = () => { if (!deleteSelectedHandleNode()) deleteSelectedNode(); };
function deleteSelectedNode() {
  if (!customSpec || shapeLocked()) return false;
  if (selectedHandle >= 0) return deleteSelectedHandleNode();
  const removed = removeNode(customSpec, selectedNode);
  if (removed < 0) return false;
  selectedNode = customSpec.nodes.length > 2 ? Math.min(removed, customSpec.nodes.length - 2) : -1;
  onCustomChange();
  return true;
}
function deleteSelectedHandleNode() {
  if (!customSpec || shapeLocked()) return false;
  const nodes = customSpec.handleNodes;
  if (!nodes || selectedHandle <= 0 || selectedHandle >= nodes.length - 1) return false;
  const removed = removeHandleNodeSpec(customSpec, selectedHandle);
  if (removed < 0) return false;
  selectedHandle = nodes.length > HANDLE_MIN ? Math.min(removed, nodes.length - 2) : -1;
  onCustomChange();
  return true;
}
if ($('hNodeAdd')) $('hNodeAdd').onclick = () => {
  if (!customSpec || shapeLocked()) return;
  const idx = addHandleNodeSpec(customSpec);
  if (idx < 0) return;
  selectedHandle = idx; selectedNode = -1;
  onCustomChange();
};
if ($('hNodeSub')) $('hNodeSub').onclick = () => {
  if (!customSpec || shapeLocked()) return;
  const removed = removeHandleNodeSpec(customSpec, selectedHandle);
  if (removed < 0) return;
  selectedHandle = customSpec.handleNodes && customSpec.handleNodes.length > HANDLE_MIN
    ? Math.min(removed, customSpec.handleNodes.length - 2) : -1;
  onCustomChange();
};
if ($('hNodeDel')) $('hNodeDel').onclick = () => { deleteSelectedHandleNode(); };
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (!showingGizmos()) return;
  if (selectedHandle > 0 && customSpec && customSpec.handleNodes && selectedHandle < customSpec.handleNodes.length - 1) {
    e.preventDefault();
    deleteSelectedHandleNode();
    return;
  }
  if (selectedNode > 0 && customSpec && selectedNode < customSpec.nodes.length - 1) {
    e.preventDefault();
    deleteSelectedNode();
  }
});
$('customH').oninput = (e) => { if (!customSpec) return; setHeight(customSpec, +e.target.value / UNIT_CM); livePreview(); };
$('customH').onchange = () => onCustomChange();
$('customRim').oninput = (e) => { if (!customSpec) return; setRimR(customSpec, +e.target.value / UNIT_CM / 2); livePreview(); };
$('customRim').onchange = () => onCustomChange();
$('customFoot').oninput = (e) => { if (!customSpec) return; setFootR(customSpec, +e.target.value / UNIT_CM / 2); livePreview(); };
$('customFoot').onchange = () => onCustomChange();
if ($('footOuter')) {
  $('footOuter').oninput = (e) => { if (!customSpec) return; setFootR(customSpec, +e.target.value / UNIT_CM / 2); livePreview(); };
  $('footOuter').onchange = () => onCustomChange();
}
if ($('footH')) {
  $('footH').oninput = (e) => { if (!customSpec) return; setFootH(customSpec, +e.target.value / UNIT_CM); livePreview(); };
  $('footH').onchange = () => onCustomChange();
}
if ($('footThick')) {
  $('footThick').oninput = (e) => {
    if (!customSpec) return;
    ensureFoot(customSpec);
    customSpec.footThick = Math.min(FOOT_LIMITS.thick[1], Math.max(FOOT_LIMITS.thick[0], +e.target.value / UNIT_CM));
    livePreview();
  };
  $('footThick').onchange = () => onCustomChange();
}
if ($('footCarve')) {
  $('footCarve').oninput = (e) => {
    if (!customSpec) return;
    ensureFoot(customSpec);
    customSpec.footCarve = Math.min(FOOT_LIMITS.carve[1], Math.max(FOOT_LIMITS.carve[0], +e.target.value / UNIT_CM));
    livePreview();
  };
  $('footCarve').onchange = () => onCustomChange();
}
if ($('footStem')) {
  $('footStem').oninput = (e) => {
    if (!customSpec) return;
    ensureFoot(customSpec);
    const r = Math.max(0.12, customSpec.nodes[0].r);
    customSpec.footStem = Math.min(FOOT_LIMITS.stem[1], Math.max(FOOT_LIMITS.stem[0], (+e.target.value / UNIT_CM / 2) / r));
    livePreview();
  };
  $('footStem').onchange = () => onCustomChange();
}
if ($('footFlare')) {
  $('footFlare').oninput = (e) => {
    if (!customSpec) return;
    ensureFoot(customSpec);
    customSpec.footFlare = Math.min(FOOT_LIMITS.flare[1], Math.max(FOOT_LIMITS.flare[0], +e.target.value));
    livePreview();
  };
  $('footFlare').onchange = () => onCustomChange();
}
$('customWall').oninput = (e) => {
  if (!customSpec) return;
  setWall(customSpec, Math.min(LIMITS.wall[1], Math.max(LIMITS.wall[0], +e.target.value / UNIT_CM)));
  livePreview();
};
$('customWall').onchange = () => onCustomChange();
if ($('wallTaper')) {
  $('wallTaper').onchange = (e) => {
    if (!customSpec) return;
    ensureWall(customSpec);
    customSpec.wallTaper = !!e.target.checked;
    if (!customSpec.wallTaper) setWall(customSpec, customSpec.wall);
    livePreview();
    onCustomChange();
  };
}
function bindWallZone(id, zone) {
  const el = $(id);
  if (!el) return;
  el.oninput = (e) => {
    if (!customSpec) return;
    setWallZone(customSpec, zone, Math.min(LIMITS.wall[1], Math.max(LIMITS.wall[0], +e.target.value / UNIT_CM)));
    livePreview();
  };
  el.onchange = () => onCustomChange();
}
bindWallZone('wallRim', 'rim');
bindWallZone('wallMid', 'mid');
bindWallZone('wallBase', 'base');
['hPos', 'hH', 'hW', 'hT'].forEach(id => {
  $(id).oninput = () => {
    if (!customSpec) return;
    if (id === 'hW') setHandleWidth(customSpec, +$('hW').value);
    else if (id === 'hT') customSpec.handleThick = +$('hT').value;
    else setHandlePlacement(customSpec, +$('hPos').value, +$('hH').value);
    livePreview();
  };
  $(id).onchange = () => onCustomChange();
});
function readSpoutSliders() {
  if (!customSpec) return;
  customSpec.spoutY = +$('sH').value;
  customSpec.spoutAz = +$('sAz').value * Math.PI / 180;
  customSpec.spoutTilt = +$('sTilt').value * Math.PI / 180;
  customSpec.spoutLen = +$('sLen').value / UNIT_CM;
  customSpec.spoutMouth = +$('sMouth').value;
}
['sH', 'sAz', 'sTilt', 'sLen', 'sMouth'].forEach(id => {
  $(id).oninput = () => {
    if (!customSpec) return;
    readSpoutSliders();
    livePreview();
    if (customSpec.spout === 'teapot') { updateGizmoDataFromSpec(); placeGizmos(); };
  };
  $(id).onchange = () => onCustomChange();
});
document.querySelectorAll('#handleType button').forEach(b => b.onclick = () => {
  if (!customSpec || shapeLocked()) return;
  customSpec.handle = b.dataset.handle;
  resetHandleNodes(customSpec);
  selectedHandle = -1;
  onCustomChange();
});
document.querySelectorAll('#shapeSubtabs button').forEach(b => b.onclick = () => {
  ui.shapeGroup = b.dataset.group;
  refreshUI();
  const sheet = $('sheet');
  if (sheet) sheet.scrollTop = 0;
});
document.querySelectorAll('#spoutType button').forEach(b => b.onclick = () => {
  if (!customSpec || shapeLocked()) return;
  customSpec.spout = b.dataset.spout;
  onCustomChange();
});
document.querySelectorAll('#footVisible button, #footHidden button').forEach(b => b.onclick = () => {
  if (!customSpec || shapeLocked()) return;
  setFootStyle(customSpec, b.dataset.foot);
  onCustomChange();
});
$('sectionView').onchange = (e) => { ui.section = e.target.checked; refreshUI(); drawSection(); };
$('sectionClose').onclick = () => { ui.section = false; refreshUI(); };

function drawSection() {
  const ov = $('sectionOverlay'), cv = $('sectionCanvas');
  ov.hidden = !ui.section || !pot;
  if (ov.hidden) return;
  const w = ov.clientWidth, h = ov.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(2, Math.floor(w * dpr)); cv.height = Math.max(2, Math.floor(h * dpr));
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#F5F1E8'; ctx.fillRect(0, 0, w, h);
  const R = pot.rows, pts = [];
  for (let k = 0; k < R.potRows; k++) pts.push([R.r[k], R.y[k]]);
  let maxR = 0.2, maxY = 0.2;
  for (const p of pts) { if (p[0] > maxR) maxR = p[0]; if (p[1] > maxY) maxY = p[1]; }
  const pad = 48, scale = Math.min((w - pad * 2) / (maxR * 2.35), (h - pad * 2 - 36) / (maxY * 1.18));
  const cx = w / 2, by = h - pad - 18;
  const X = r => cx + r * scale, Y = y => by - y * scale;
  ctx.beginPath(); ctx.moveTo(X(0), Y(pts[0][1]));
  for (const p of pts) ctx.lineTo(X(p[0]), Y(p[1]));
  ctx.lineTo(X(0), Y(pts[pts.length - 1][1])); ctx.closePath();
  ctx.fillStyle = '#D9C4A8'; ctx.fill(); ctx.strokeStyle = '#2148B8'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(0), Y(pts[0][1]));
  for (const p of pts) ctx.lineTo(X(-p[0]), Y(p[1]));
  ctx.lineTo(X(0), Y(pts[pts.length - 1][1])); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cx, Y(0)); ctx.lineTo(cx, Y(maxY)); ctx.strokeStyle = '#999'; ctx.stroke(); ctx.setLineDash([]);
  const d = customSpec ? dimsCm(customSpec) : { height: pot.height * UNIT_CM, rim: 0, foot: 0, wall: 0, ml: 0 };
  ctx.fillStyle = '#2148B8'; ctx.font = '600 13px ui-monospace, monospace';
  ctx.fillText('SECTION', pad, 22);
  ctx.fillStyle = '#2148B8'; ctx.font = '12px ui-monospace, monospace';
  const wallNote = customSpec && customSpec.wallTaper
    ? `wall ${d.wallBase.toFixed(2)}→${d.wallRim.toFixed(2)} cm`
    : `wall ${(d.wall || 0).toFixed(2)} cm`;
  ctx.fillText(`H ${d.height.toFixed(1)} cm   rim Ø ${d.rim.toFixed(1)} cm   ${wallNote}   ${Math.round(d.ml)} ml`, pad, 40);
  if (customSpec) {
    ctx.strokeStyle = '#c0391b'; ctx.lineWidth = 1;
    const dim = (x0, y0, x1, y1, label, side = 1) => {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif';
      ctx.fillText(label, (x0 + x1) / 2 + 4 * side, (y0 + y1) / 2 - 4);
    };
    const rim = customSpec.nodes[customSpec.nodes.length - 1];
    dim(X(-rim.r), Y(rim.y) - 12, X(rim.r), Y(rim.y) - 12, `Ø ${d.rim.toFixed(1)} cm`);
    dim(X(maxR) + 36, Y(0), X(maxR) + 36, Y(customSpec.nodes[customSpec.nodes.length - 1].y), `${d.height.toFixed(1)} cm`);
    const band = (y, label) => {
      const ro = radiusAt(customSpec, y);
      const t = wallAt(customSpec, y);
      const ri = Math.max(0.02, ro - t);
      ctx.strokeStyle = '#C65F38'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(X(ri), Y(y)); ctx.lineTo(X(ro), Y(y)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(-ri), Y(y)); ctx.lineTo(X(-ro), Y(y)); ctx.stroke();
      ctx.fillStyle = '#C65F38'; ctx.font = '600 11px ui-monospace, monospace';
      ctx.fillText(`${label} ${(t * UNIT_CM).toFixed(2)} cm`, X(ro) + 8, Y(y) + 4);
    };
    const y0 = customSpec.nodes[0].y, y1 = rim.y;
    band(y1 - 0.02, 'rim');
    band((y0 + y1) * 0.5, 'mid');
    band(innerFloorY(customSpec) + 0.03, 'floor');
  }
}

const DESK3_MQ = '(min-width: 1100px)';
function deskMode() {
  if (isMobileLayout()) return 'phone';
  if (window.matchMedia(DESK3_MQ).matches) return '3';
  return '2';
}
function syncQualitySlot() {
  const q = $('quality'), slot = $('qualitySlot'), mast = document.querySelector('#makeCol .mast, .mast');
  const mode = deskMode();
  if (!q) return;
  if ((mode === '2' || mode === '3') && slot && q.parentElement !== slot) slot.appendChild(q);
  else if (mode === 'phone' && mast && q.parentElement !== mast) mast.appendChild(q);
}
function applyLayout() {
  const mobile = isMobileLayout();
  const mode = deskMode();
  document.body.classList.toggle('is-mobile', mobile);
  document.body.classList.toggle('desk-2', mode === '2');
  document.body.classList.toggle('desk-3', mode === '3');
  document.body.dataset.sheet = ui.sheet;
  document.body.dataset.shapeGroup = ui.shapeGroup;
  document.body.dataset.layout = mode;
  syncQualitySlot();
  const rec = document.querySelector('.record-fold');
  if (rec) rec.open = mode === 'phone' || (mode === '3' && window.innerHeight >= 880);
  const chips = document.querySelector('.glaze-chips');
  if (chips) chips.open = mode !== '2';
  if (!mobile) document.body.classList.remove('sheet-collapsed');
  else if (window.innerHeight <= 520) document.body.classList.add('sheet-collapsed');
  else if (!document.body.dataset.mobileInit) {
    document.body.classList.add('sheet-collapsed');
    document.body.dataset.mobileInit = '1';
  }
  syncOrbitTouches();
  resize({ fit: true });
}
window.matchMedia(MOBILE_MQ).addEventListener('change', applyLayout);
window.matchMedia(DESK3_MQ).addEventListener('change', applyLayout);
window.matchMedia('(min-height: 880px)').addEventListener('change', applyLayout);
window.addEventListener('orientationchange', () => { setTimeout(applyLayout, 80); });

function brushWord(v) {
  if (v < 0.08) return 'fine';
  if (v < 0.16) return 'medium';
  if (v < 0.28) return 'broad';
  return 'wide';
}
function refreshUI() {
  document.querySelectorAll('#shapes button').forEach(b => {
    const on = b.dataset.shape === ui.shape;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.querySelectorAll('#tools button').forEach(b => {
    const on = b.dataset.tool === ui.tool;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.querySelectorAll('#pourMode button').forEach(b => {
    const on = b.dataset.mode === ui.pourMode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.querySelectorAll('#glazeFams button').forEach(b => {
    const on = b.dataset.fam === ui.glazeFam;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const q = (ui.glazeQuery || '').trim().toLowerCase();
  const searching = q.length > 0;
  document.querySelectorAll('#glazes .fam-group').forEach(el => {
    if (searching) { el.hidden = false; el.open = true; }
    else { el.hidden = el.dataset.fam !== ui.glazeFam; el.open = true; }
  });
  document.querySelectorAll('.glaze').forEach(b => {
    const g = GLAZES[GLAZE_INDEX[b.dataset.glaze]];
    const hay = g ? `${g.name} ${g.id} ${g.src || ''} ${g.like || ''}`.toLowerCase() : '';
    const match = !g ? false : (searching ? hay.includes(q) : g.family === ui.glazeFam);
    b.hidden = !match;
    b.classList.toggle('active', b.dataset.glaze === ui.glaze);
  });
  document.querySelectorAll('#glazes .fam-group').forEach(el => {
    if (searching) el.hidden = !el.querySelector('.glaze:not([hidden])');
  });
  { const g = GLAZES[GLAZE_INDEX[ui.glaze]]; $('glazeNow').innerHTML = `<b>${g.name}</b>${g.src ? ' &middot; source: ' + g.src : g.like ? ' &middot; ' + g.like : ''} &middot; ${cone10Note(g.id)}`; }
  const layers = layersOf(thickness[ui.glaze]);
  $('thick').value = layers; $('thickOut').textContent = layers === 1 ? '1 layer' : `${layers} layers`;
  $('size').value = ui.size; $('sizeOut').textContent = brushWord(ui.size);
  $('pourH').value = ui.pourH; $('pourHOut').textContent = Math.round(ui.pourH * 100) + '%';
  $('brushOpts').hidden = ui.tool !== 'brush'; $('pourOpts').hidden = ui.tool !== 'pour';
  const lockNote = $('toolLock');
  if (lockNote) {
    lockNote.hidden = ui.simState === 'raw';
    lockNote.textContent = ui.simState === 'firing' ? 'Kiln is firing. Painting waits.' : 'Painting is locked. Unfire to paint again.';
  }
  $('fireBtn').disabled = ui.simState === 'firing'; $('unfireBtn').disabled = ui.simState !== 'fired'; $('undoBtn').disabled = ui.simState === 'firing' || !steps.length; $('clearBtn').disabled = ui.simState === 'firing';
  $('wax').checked = state.waxFoot;
  $('pourBtn').disabled = ui.simState !== 'raw';
  document.querySelectorAll('#cone button').forEach(b => {
    const on = +b.dataset.cone === ui.cone;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.querySelectorAll('.glaze').forEach(b => {
    const id = b.dataset.glaze, g = GLAZES[GLAZE_INDEX[id]], pal = ui.cone === 10 ? CONE10[id] : null;
    const mid = (pal?.fired || g.fired)[Math.min((pal?.fired || g.fired).length - 1, 3)];
    const hex = Array.isArray(mid) ? mid[1] : mid;
    const sw = b.querySelector('.sw'); if (sw) sw.style.background = `linear-gradient(135deg, ${g.raw} 50%, ${hex} 50%)`;
  });
  document.querySelectorAll('#mobileBar [data-sheet]').forEach(b => {
    const on = b.dataset.sheet === ui.sheet && !document.body.classList.contains('sheet-collapsed');
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const fold = $('foldBtn');
  if (fold) {
    const open = !document.body.classList.contains('sheet-collapsed');
    fold.textContent = open ? 'Fold' : 'Menu';
    fold.title = open ? 'Hide the menu so the pot fills the screen.' : 'Show the menu.';
    fold.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  document.querySelectorAll('#touchMode button').forEach(b => b.classList.toggle('active', b.dataset.mode === ui.touchMode));
  const customOn = ui.shape === 'custom' && customSpec;
  $('customOpts').hidden = !customOn;
  $('dimHud').hidden = !customOn;
  const lock = shapeLocked();
  ['nodeAdd', 'nodeSub', 'nodeDel', 'nodeDelHud', 'hNodeAdd', 'hNodeSub', 'hNodeDel', 'customH', 'customRim', 'customFoot', 'customWall', 'wallRim', 'wallMid', 'wallBase', 'wallTaper', 'hPos', 'hH', 'hW', 'hT', 'sH', 'sAz', 'sTilt', 'sLen', 'sMouth', 'footH', 'footOuter', 'footThick', 'footCarve', 'footStem', 'footFlare'].forEach(id => { const el = $(id); if (el) el.disabled = lock || !customOn; });
  const hNodes = customOn && customSpec ? ensureHandleNodes(customSpec) : null;
  const canDelPot = customOn && !lock && selectedNode > 0 && customSpec && selectedNode < customSpec.nodes.length - 1;
  const canDelHandle = customOn && !lock && hNodes && selectedHandle > 0 && selectedHandle < hNodes.length - 1;
  const canDel = canDelPot || canDelHandle;
  if ($('nodeDel')) $('nodeDel').disabled = !canDelPot;
  if ($('hNodeDel')) $('hNodeDel').disabled = !canDelHandle;
  if ($('nodeDelHud')) $('nodeDelHud').disabled = !canDel;
  if ($('shapeTools')) $('shapeTools').hidden = !showingGizmos() || !canDel;
  if ($('nodeAdd') && customOn && customSpec) $('nodeAdd').disabled = lock || customSpec.nodes.length >= 2 + MAX_MID;
  if ($('hNodeAdd')) $('hNodeAdd').disabled = lock || !customOn || !hNodes || hNodes.length >= HANDLE_MAX;
  if ($('hNodeSub')) $('hNodeSub').disabled = lock || !customOn || !hNodes || hNodes.length <= HANDLE_MIN;
  document.body.dataset.shapeGroup = ui.shapeGroup;
  document.querySelectorAll('#shapeSubtabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.group === ui.shapeGroup);
  });
  document.querySelectorAll('#customOpts .shape-group').forEach(el => {
    el.classList.toggle('active', el.dataset.group === ui.shapeGroup);
  });
  document.querySelectorAll('#handleType button').forEach(b => {
    b.classList.toggle('active', customOn && customSpec.handle === b.dataset.handle);
    b.disabled = lock || !customOn;
  });
  document.querySelectorAll('#spoutType button').forEach(b => {
    b.classList.toggle('active', customOn && customSpec.spout === b.dataset.spout);
    b.disabled = lock || !customOn;
  });
  document.querySelectorAll('#footVisible button, #footHidden button').forEach(b => {
    b.classList.toggle('active', customOn && customSpec.footStyle === b.dataset.foot);
    b.disabled = lock || !customOn;
  });
  const pedestal = customOn && customSpec.footStyle === 'pedestal';
  const flatFoot = customOn && customSpec.footStyle === 'flat';
  if ($('footStemRow')) $('footStemRow').hidden = !pedestal;
  if ($('footFlareRow')) $('footFlareRow').hidden = !pedestal;
  if ($('footThickRow')) $('footThickRow').hidden = !!flatFoot;
  if ($('footCarveRow')) $('footCarveRow').hidden = !!flatFoot;
  $('handleOpts').hidden = !customOn || customSpec.handle === 'none';
  const hasSpout = customOn && customSpec.spout !== 'none';
  const teapot = customOn && customSpec.spout === 'teapot';
  if ($('spoutOpts')) $('spoutOpts').hidden = !hasSpout;
  ['sHRow', 'sTiltRow', 'sLenRow'].forEach(id => { const el = $(id); if (el) el.hidden = !teapot; });
  $('sectionView').checked = ui.section;
  $('sectionOverlay').hidden = !ui.section;
  if (customOn) syncCustomSliders();
  else $('dimHud').hidden = true;
  if (ui.section) drawSection();
  if (gizmoGroup) {
    const want = showingGizmos();
    const haveSpout = gizmoGroup.children.some(c => c.userData && c.userData.kind === 'spoutRoot');
    const handleCount = gizmoGroup.children.filter(c => c.userData && c.userData.kind === 'handle' && !c.userData.vis).length;
    const wantHandleN = customOn && customSpec && (customSpec.handle === 'c' || customSpec.handle === 'side')
      ? (ensureHandleNodes(customSpec) || []).length : 0;
    if (gizmoGroup.visible !== want || !!haveSpout !== teapot || handleCount !== wantHandleN) rebuildGizmos();
    else placeGizmos();
  }
  if (pot) showPourRing(ui.pourH);
}

// ---------- loop ----------
let viewWH = [0, 0];
function resize(opts = {}) {
  syncAppSize();
  const w = view.clientWidth, h = view.clientHeight;
  if (w < 1 || h < 1) return;
  renderer.setPixelRatio(pixelRatioFor(lite));
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  const sizeChanged = Math.abs(w - viewWH[0]) > 2 || Math.abs(h - viewWH[1]) > 2;
  viewWH = [w, h];
  if ((opts.fit || sizeChanged) && pot) frameCamera();
  requestDraw();
}
window.addEventListener('resize', resize);
if (window.visualViewport) {
  visualViewport.addEventListener('resize', resize);
  visualViewport.addEventListener('scroll', resize);
}
if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(view);
const glowCol = new THREE.Color(), BG = new THREE.Color('#F5F1E8'), BG_KILN = new THREE.Color('#101A3A');
function loop() {
  rafId = 0;
  drawStats.rafs++;
  if (painting) state.flushCompose();
  if (dirty) uploadTextures({ full: !regionUpload });
  const g = glow.v;
  glowCol.setRGB(1.0, 0.16 + 0.28 * g, 0.03 + 0.06 * g * g);
  if (material.userData.uniforms) {
    material.userData.uniforms.uGlowColor.value.copy(glowCol);
    material.userData.uniforms.uGlow.value = g * 0.9;
  } else {
    material.emissive.copy(glowCol).multiplyScalar(g * 0.35);
  }
  const key0 = lite ? 1.15 : 1.8;
  key.intensity = key0 * (1 - 0.75 * g);
  if (!lite) scene.environmentIntensity = 0.85 * (1 - 0.75 * g);
  scene.background.copy(BG).lerp(BG_KILN, g);
  const damping = controls.update();
  const live = damping || g > 0.002 || ui.simState === 'firing' || shaping || painting || measuring;
  if (drawRequested || live) {
    if (!shaping && showingGizmos()) placeGizmos();
    renderer.render(scene, camera);
    drawStats.drawn++;
    drawRequested = false;
  }
  if (live || drawRequested) rafId = requestAnimationFrame(loop);
}
resize();
applyLayout();
{ const q = new URLSearchParams(location.search).get('seed'); if (q !== null && q !== '') state.fixedSeed = (+q) >>> 0; }
function prewarmPrograms() {
  if (!mesh || !renderer) return;
  try {
    const prev = mesh.material;
    mesh.material = fancyMat;
    renderer.compile(scene, camera);
    mesh.material = simpleMat;
    renderer.compile(scene, camera);
    mesh.material = prev;
    if (typeof renderer.compileAsync === 'function') {
      renderer.compileAsync(scene, camera).catch(() => {});
    }
  } catch (err) {
    console.warn('shader prewarm failed', err);
  }
}
setShape('vase');
prewarmPrograms();
captureBaseline();
historyArmed = true;
refreshUI();
requestDraw();
probeFrameTime();
state.warm();
bootCloud();

// ---------- test / automation hook ----------
window.__sim = {
  get state() { return ui.simState; },
  setShape, fire, unfire, clear: clearAll,
  setGlaze(id) { ui.glaze = id; const g = GLAZES[GLAZE_INDEX[id]]; if (g) ui.glazeFam = g.family; refreshUI(); uploadTextures({ full: true }); requestDraw(); },
  setTool(t) { ui.tool = t; refreshUI(); },
  setThickness(v) { thickness[ui.glaze] = v; refreshUI(); },
  setLayers(n) { setBrushLayers(n); refreshUI(); return layersOf(thickness[ui.glaze]); },
  get layers() { return layersOf(thickness[ui.glaze]); },
  get brushThickness() { return thickness[ui.glaze]; },
  undo: undoLast,
  setBrushSize(v) { ui.size = v; refreshUI(); },
  pour(id, h, mode = 'below', t) { if (id) { ui.glaze = id; const g = GLAZES[GLAZE_INDEX[id]]; if (g) ui.glazeFam = g.family; } ui.pourH = h; ui.pourMode = mode; if (t) thickness[ui.glaze] = t; doPour(); refreshUI(); },
  // brush dabs in UV space along a horizontal band at a height fraction (outer wall)
  brushBand(id, hFrac, t, size = 0.12, angle0 = 0, angle1 = 360) {
    ui.glaze = id; const g = GLAZES[GLAZE_INDEX[id]]; if (g) ui.glazeFam = g.family; if (t) thickness[id] = t; ui.size = size;
    const mark = state.ops.length;
    state.beginStroke();
    const k = outerRow(hFrac); const v = (k + 0.5) / TEX_H;
    for (let a = angle0; a <= angle1; a += 1.5) state.dab(((a / 360) % 1 + 1) % 1, v, size, GLAZE_INDEX[id], thickness[id]);
    commitCoat(mark);
    refreshUI();
  },
  setView(azDeg, elevDeg, distScale = 1) {
    const t = controls.target, d = camera.position.distanceTo(t) * distScale, az = azDeg * Math.PI / 180, el = elevDeg * Math.PI / 180;
    const damp = controls.enableDamping;
    controls.enableDamping = false;
    camera.position.set(t.x + Math.sin(az) * Math.cos(el) * d, t.y + Math.sin(el) * d, t.z + Math.cos(az) * Math.cos(el) * d);
    camera.lookAt(t);
    controls.update();
    controls.enableDamping = damp;
    camera.updateMatrixWorld();
    requestDraw();
  },
  getView() {
    const t = controls.target, d = camera.position.distanceTo(t);
    const az = Math.atan2(camera.position.x - t.x, camera.position.z - t.z);
    const el = Math.asin(Math.max(-1, Math.min(1, (camera.position.y - t.y) / d)));
    return { az, el, d, x: camera.position.x, y: camera.position.y, z: camera.position.z };
  },
  setSheet(name, collapsed) {
    if (name) { ui.sheet = name; document.body.dataset.sheet = name; }
    if (collapsed === true) document.body.classList.add('sheet-collapsed');
    else if (collapsed === false) document.body.classList.remove('sheet-collapsed');
    refreshUI();
    resize({ fit: true });
  },
  setCone(n) { ui.cone = n === 10 ? 10 : 6; setFireCone(ui.cone); refreshUI(); },
  recipe() { return currentRecipe(); },
  loadRecipe(r) { return applyRecipe(r); },
  get cone() { return ui.cone; },
  get touchOrbit() { return ui.touchOrbit; },
  get touchMode() { return ui.touchMode; },
  setTouchOrbit(on) { ui.touchMode = on ? 'orbit' : 'paint'; ui.touchOrbit = !!on; syncOrbitTouches(); refreshUI(); rebuildGizmos(); },
  setTouchMode(m) { ui.touchMode = m === 'orbit' ? 'orbit' : m === 'shape' ? 'shape' : 'paint'; ui.touchOrbit = ui.touchMode === 'orbit'; syncOrbitTouches(); refreshUI(); rebuildGizmos(); },
  get sheet() { return ui.sheet; },
  get mobile() { return isMobileLayout(); },
  get layout() { return deskMode(); },
  get pixelRatio() { return renderer.getPixelRatio(); },
  // screen (client) coordinates of the outer surface at a height fraction, on the side facing the camera, offset by angle
  screenAt(hFrac, dAngleDeg = 0) {
    const k = outerRow(hFrac), r = pot.rows.r[k], y = pot.rows.y[k];
    const camAz = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z) + dAngleDeg * Math.PI / 180;
    camera.updateMatrixWorld();
    const p = new THREE.Vector3(Math.sin(camAz) * r, y, Math.cos(camAz) * r).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
  },
  // screen coordinates of the handle surface (mug) at curve fraction t, on the side facing the camera; null if no handle
  handleScreenAt(t) {
    const R = pot.rows, F = R.frame; if (!F || R.handleFrom >= TEX_H) return null;
    const from = R.handleFrom, to = R.handleTo ?? TEX_H;
    const k = Math.min(to - 1, from + Math.floor(Math.min(1, Math.max(0, t)) * Math.max(1, to - from))), r = pot.rows.r[k];
    const c = new THREE.Vector3(F.cx[k], F.cy[k], F.cz[k]), toCam = camera.position.clone().sub(c).normalize();
    const n = new THREE.Vector3(F.nx[k], F.ny[k], F.nz[k]), b = new THREE.Vector3(F.bx[k], F.by[k], F.bz[k]);
    const dir = n.multiplyScalar(n.dot(toCam)).add(b.multiplyScalar(b.dot(toCam))).normalize();
    camera.updateMatrixWorld();
    const p = c.add(dir.multiplyScalar(r * 0.8)).project(camera), rect = renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
  },
  handleStats() {
    const R = pot.rows; if (R.handleFrom >= TEX_H) return null;
    const W = TEX_W, from = R.handleFrom * W, to = (R.handleTo ?? TEX_H) * W, n = Math.max(1, to - from);
    return Object.fromEntries(GLAZES.map((g, gi) => { let s = 0; const a = (state.fired || state.thick)[gi]; if (a) for (let i = from; i < to; i++) s += a[i]; return [g.id, +(s / n).toFixed(4)]; }));
  },
  getCustom() { return customSpec ? cloneSpec(customSpec) : null; },
  setCustom(partial = {}, opts = {}) {
    if (ui.shape !== 'custom') setShape('custom');
    if (shapeLocked()) { setStatus('Unfire first to edit the shape.'); return false; }
    if (partial.nodes) customSpec.nodes = partial.nodes.map(p => ({ r: p.r, y: p.y }));
    if (partial.bulges) customSpec.bulges = partial.bulges.map(p => ({ r: p.r, y: p.y }));
    for (const k of ['wall', 'handle', 'handlePos', 'handleHeight', 'handleWidth', 'handleThick', 'handleAz', 'spout', 'spoutSize', 'spoutY', 'spoutLen', 'spoutTilt', 'spoutMouth', 'spoutAz', 'source', 'footThick', 'footCarve', 'footStem', 'footFlare', 'wallRim', 'wallMid', 'wallBase']) {
      if (partial[k] !== undefined) customSpec[k] = partial[k];
    }
    if (partial.wallTaper !== undefined) customSpec.wallTaper = !!partial.wallTaper;
    if (partial.wall !== undefined && partial.wallRim === undefined && partial.wallMid === undefined && partial.wallBase === undefined) {
      setWall(customSpec, partial.wall);
    } else {
      ensureWall(customSpec);
      if (partial.wallTaper === undefined && (partial.wallRim != null || partial.wallMid != null || partial.wallBase != null)) {
        const a = customSpec.wallRim, b = customSpec.wallMid, c = customSpec.wallBase;
        if (Math.abs(a - b) > 0.003 || Math.abs(b - c) > 0.003) customSpec.wallTaper = true;
      }
    }
    if (partial.footStyle !== undefined) {
      if (partial.footH === undefined) setFootStyle(customSpec, partial.footStyle);
      else customSpec.footStyle = FOOT_STYLES[partial.footStyle] ? partial.footStyle : 'ring';
    }
    if (partial.footH !== undefined) setFootH(customSpec, partial.footH);
    ensureFoot(customSpec);
    if (partial.handleNodes) customSpec.handleNodes = partial.handleNodes.map(p => ({ r: p.r, y: p.y }));
    else if (partial.handle !== undefined && partial.handleNodes === undefined) resetHandleNodes(customSpec);
    rebuildCustom({ preview: !!opts.preview, skipUi: !!opts.preview });
    liveCustomStatus();
    return true;
  },
  previewCustom(partial = {}) { return this.setCustom(partial, { preview: true }); },
  addNode() {
    if (!customSpec || shapeLocked()) return false;
    if (customSpec.nodes.length >= 2 + MAX_MID) return false;
    addNode(customSpec);
    selectedNode = Math.min(customSpec.nodes.length - 2, Math.max(1, selectedNode));
    rebuildCustom();
    return true;
  },
  addNodeAt(y) { return insertNodeAt(y); },
  removeNode(i) {
    if (!customSpec || shapeLocked()) return false;
    const removed = removeNode(customSpec, i);
    if (removed < 0) return false;
    selectedNode = customSpec.nodes.length > 2 ? Math.min(removed, customSpec.nodes.length - 2) : -1;
    rebuildCustom();
    return true;
  },
  selectNode(i) { if (!customSpec) return false; selectNode(i); return true; },
  selectHandle(i) { if (!customSpec) return false; selectHandle(i); return true; },
  get selectedNode() { return selectedNode; },
  get selectedHandle() { return selectedHandle; },
  get maxMid() { return MAX_MID; },
  get maxHandle() { return HANDLE_MAX; },
  get minHandle() { return HANDLE_MIN; },
  addHandleNode() {
    if (!customSpec || shapeLocked()) return false;
    const idx = addHandleNodeSpec(customSpec);
    if (idx < 0) return false;
    selectedHandle = idx; selectedNode = -1;
    rebuildCustom();
    return true;
  },
  addHandleNodeAt(r, y) { return insertHandleAt(r, y); },
  removeHandleNode(i) {
    if (!customSpec || shapeLocked()) return false;
    const removed = removeHandleNodeSpec(customSpec, i != null ? i : selectedHandle);
    if (removed < 0) return false;
    selectedHandle = customSpec.handleNodes && customSpec.handleNodes.length > HANDLE_MIN
      ? Math.min(removed, customSpec.handleNodes.length - 2) : -1;
    rebuildCustom();
    return true;
  },
  setShapeGroup(name) { ui.shapeGroup = (name === 'handle' || name === 'spout' || name === 'foot') ? name : 'pot'; refreshUI(); },
  get shapeGroup() { return ui.shapeGroup; },
  getLimits() { return { ...LIMITS, maxMid: MAX_MID, foot: FOOT_LIMITS }; },
  footInfo() {
    if (!customSpec || !pot) return null;
    const g = footGeom(customSpec);
    let minY = 1e9, maxY = -1e9, underY = 0, underR = 1e9;
    const R = pot.rows, n0 = Math.max(8, Math.floor(R.potRows * 0.2));
    for (let k = 0; k < R.potRows; k++) {
      if (R.y[k] < minY) minY = R.y[k];
      if (R.y[k] > maxY) maxY = R.y[k];
    }
    for (let k = 0; k < n0; k++) {
      if (R.r[k] < underR) { underR = R.r[k]; underY = R.y[k]; }
    }
    let midFootR = g.R;
    const midY = g.Y * 0.5;
    let bestD = 1e9;
    for (let k = 0; k < R.potRows; k++) {
      if (R.nr[k] <= 0.05) continue;
      const d = Math.abs(R.y[k] - midY);
      if (d < bestD) { bestD = d; midFootR = R.r[k]; }
    }
    return {
      style: g.style, joinY: g.Y, joinR: g.R, footOut: g.footOut, footIn: g.footIn,
      stemR: g.stemR, baseR: g.baseR, carve: g.carve, recessY: g.recessY, thick: g.thick,
      floorY: innerFloorY(customSpec), waxY: pot.waxY, minY, maxY, underY, underR, midFootR,
      height: pot.height,
    };
  },
  wallInfo() {
    if (!customSpec || !pot) return null;
    ensureWall(customSpec);
    const R = pot.rows;
    const rimY = customSpec.nodes[customSpec.nodes.length - 1].y;
    const footY = customSpec.nodes[0].y;
    const floorY = innerFloorY(customSpec);
    const band = (yTarget, yWin = 0.04) => {
      const specT = wallAt(customSpec, yTarget);
      let outer = 0;
      for (let k = 0; k < R.potRows; k++) {
        if (Math.abs(R.y[k] - yTarget) > yWin) continue;
        if (R.r[k] > outer) outer = R.r[k];
      }
      const minKeep = Math.max(0.05, outer - specT * 2.5);
      let inner = 1e9;
      for (let k = 0; k < R.potRows; k++) {
        if (Math.abs(R.y[k] - yTarget) > yWin) continue;
        if (R.r[k] >= minKeep && R.r[k] < inner) inner = R.r[k];
      }
      if (inner > 1e8) inner = Math.max(0.03, outer - specT);
      return { y: yTarget, outer, inner, thick: Math.max(0, outer - inner), spec: specT };
    };
    const d = dimsCm(customSpec);
    return {
      wall: customSpec.wall, wallRim: customSpec.wallRim, wallMid: customSpec.wallMid, wallBase: customSpec.wallBase,
      taper: !!customSpec.wallTaper, floorY,
      rim: band(rimY - 0.018, 0.045),
      mid: band((footY + rimY) * 0.5, 0.05),
      floor: band(floorY + 0.035, 0.05),
      ml: d.ml, wallCm: d.wall, wallRimCm: d.wallRim, wallMidCm: d.wallMid, wallBaseCm: d.wallBase,
      slider: {
        min: +$('customWall').min, max: +$('customWall').max,
        rimMin: +$('wallRim').min, rimMax: +$('wallRim').max,
      },
    };
  },
  getDims() { return customSpec ? dimsCm(customSpec) : null; },
  gizmoScreen(kind, index) { return gizmoScreenOf(kind, index); },
  profileScreen(y) {
    if (!customSpec) return null;
    const r = radiusAt(customSpec, y);
    const az = gizmoAz();
    camera.updateMatrixWorld();
    const v = new THREE.Vector3(r * Math.sin(az), y, r * Math.cos(az)).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height, r };
  },
  outlineHit(x, y) { return hitOutline(x, y); },
  handleOutlineHit(x, y) { return hitHandleOutline(x, y); },
  handleOutlineTapTarget() {
    if (!customSpec || (customSpec.handle !== 'c' && customSpec.handle !== 'side')) return null;
    const pts = handleLine.userData.pts;
    if (!pts || !pts.length) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    camera.updateMatrixWorld();
    const az = handleAzimuth(customSpec);
    let best = null, bestClear = -1;
    const v = new THREE.Vector3();
    for (const p of pts) {
      v.copy(p).project(camera);
      const sx = rect.left + (v.x + 1) / 2 * rect.width, sy = rect.top + (1 - v.y) / 2 * rect.height;
      if (sx < rect.left + 8 || sx > rect.right - 8 || sy < rect.top + 8 || sy > rect.bottom - 8) continue;
      const g = nearestGizmoScreen(sx, sy);
      const clear = g ? g.dist : 80;
      if (clear > bestClear) {
        bestClear = clear;
        best = { x: sx, y: sy, r: p.x * Math.cos(az) + p.z * Math.sin(az), height: p.y, clear };
      }
    }
    return best;
  },
  gripInView(kind, index, pad = 24) {
    const pt = gizmoScreenOf(kind, index);
    if (!pt) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: pt.x, y: pt.y,
      inside: pt.x >= rect.left + pad && pt.x <= rect.right - pad && pt.y >= rect.top + pad && pt.y <= rect.bottom - pad,
      view: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, w: rect.width, h: rect.height },
    };
  },
  outlineTapTarget() {
    if (!customSpec) return null;
    const pts = profileLine.userData.pts;
    if (!pts || !pts.length) return null;
    const az = gizmoAz(), s = Math.sin(az), c = Math.cos(az);
    const rect = renderer.domElement.getBoundingClientRect();
    camera.updateMatrixWorld();
    const v = new THREE.Vector3();
    let best = null, bestClear = -1;
    for (const p of pts) {
      if (p.y <= customSpec.nodes[0].y + 0.06 || p.y >= customSpec.nodes[customSpec.nodes.length - 1].y - 0.06) continue;
      v.set(p.r * s, p.y, p.r * c).project(camera);
      const sx = rect.left + (v.x + 1) / 2 * rect.width, sy = rect.top + (1 - v.y) / 2 * rect.height;
      if (sx < rect.left + 8 || sx > rect.right - 8 || sy < rect.top + 8 || sy > rect.bottom - 8) continue;
      const g = nearestGizmoScreen(sx, sy);
      const clear = g ? g.dist : 80;
      if (clear > bestClear) { bestClear = clear; best = { x: sx, y: sy, r: p.r, height: p.y, clear }; }
    }
    return best;
  },
  spoutRadii() {
    const R = pot.rows; if (R.spoutFrom >= TEX_H) return null;
    return { root: R.r[R.spoutFrom], tip: R.r[Math.max(R.spoutFrom, R.spoutTo - 1)], n: Math.max(0, R.spoutTo - R.spoutFrom) };
  },
  spoutPose() {
    if (!customSpec || customSpec.spout !== 'teapot') return null;
    const p = spoutParams(customSpec);
    const w = spoutWorld(customSpec);
    return {
      yFrac: p.yFrac, y0: p.y0, r0: p.r0, az: p.az, len: p.len, tilt: p.tilt, mouth: p.mouth, out: p.out, lift: p.lift,
      root: { x: w.root.x, y: w.root.y, z: w.root.z },
      tip: { x: w.tip.x, y: w.tip.y, z: w.tip.z },
    };
  },
  setSection(on) { ui.section = !!on; refreshUI(); drawSection(); },
  get section() { return ui.section; },
  stats: () => state.stats(),
  paintMask: (opts) => state.paintMask(opts || {}),
  setRegionUpload(on) { regionUpload = !!on; return { regionUpload, mode: regionUpload ? 'region' : 'full' }; },
  get regionUpload() { return regionUpload; },
  get uploadMode() { return regionUpload ? 'region' : 'full'; },
  get build() { return BUILD; },
  get buildTime() { return BUILD_TIME; },
  setSeed(n) { state.fixedSeed = (n === null || n === undefined) ? undefined : n >>> 0; },   // stable seed for tests; null = random per firing
  get seed() { return state.seed; },
  get fireMs() { return state.fireMs; },
  get fireWallMs() { return fireWallMs; },
  get lastBuildMs() { return lastBuildMs; },
  get timings() { return snapshotTimings(); },
  get previewing() { return previewing; },
  flushBuild, whenBuilt,
  get gpu() { return infoOf(gpuProbe, true, { pref: qualityPref, lite, reason: qualityInfo.reason, antialias: gpuProbe.antialias }); },
  classifyGpu(vendor, renderer) { return classifyRenderer(vendor, renderer); },
  decideQuality(pref, gpu, frame) { return decideLite(pref, gpu, frame); },
  setQuality(pref) { setQualityPref(pref); return { quality: qualityPref, lite, reason: qualityInfo.reason }; },
  get quality() { return qualityPref; },
  get lite() { return lite; },
  get framesDrawn() { return drawStats.drawn; },
  get uploads() { return drawStats.uploads; },
  get uploadBytes() { return drawStats.uploadBytes; },
  get shadowUpdates() { return drawStats.shadows; },
  get drawStats() { return { drawn: drawStats.drawn, rafs: drawStats.rafs, uploads: drawStats.uploads, uploadBytes: drawStats.uploadBytes, shadows: drawStats.shadows, probe: lastFrameProbe }; },
  get lastFrameProbe() { return lastFrameProbe; },
  get rafs() { return drawStats.rafs; },
  measureFps(ms = 2000) {
    return new Promise((resolve) => {
      measuring = true;
      const t0 = performance.now();
      const drawn0 = drawStats.drawn;
      const wrap = (t) => {
        requestDraw();
        if (t - t0 >= ms) {
          measuring = false;
          const dt = Math.max(1, t - t0);
          const frames = drawStats.drawn - drawn0;
          requestDraw();
          resolve({ ms: dt, frames, fps: 1000 * frames / dt });
        } else requestAnimationFrame(wrap);
      };
      requestAnimationFrame(wrap);
    });
  },
  loseContext() { ctxLost.lose(); },
  restoreContext() { ctxLost.restore(); },
  get contextLost() { return ctxLost.lost; },
  frame() { frameCamera(); requestDraw(); },
  potInView(pad = 8) {
    if (!pot) return null;
    pot.geometry.computeBoundingBox();
    const bb = pot.geometry.boundingBox;
    const rect = renderer.domElement.getBoundingClientRect();
    camera.updateMatrixWorld();
    const xs = [], ys = [];
    const v = new THREE.Vector3();
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
      v.set(x, y, z).project(camera);
      xs.push(rect.left + (v.x + 1) / 2 * rect.width);
      ys.push(rect.top + (1 - v.y) / 2 * rect.height);
    }
    const box = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    const viewBox = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, w: rect.width, h: rect.height };
    const rim = this.screenAt(0.98, 0);
    const foot = this.screenAt(0.02, 0);
    return {
      view: viewBox, box,
      rim, foot,
      inside: box.left >= viewBox.left - pad && box.right <= viewBox.right + pad
        && box.top >= viewBox.top - pad && box.bottom <= viewBox.bottom + pad
        && rim.y >= viewBox.top - pad && rim.y <= viewBox.bottom + pad
        && foot.y >= viewBox.top - pad && foot.y <= viewBox.bottom + pad,
    };
  },
  get composeMs() { return state.composeMs; },
  get dripStats() { return state.dripStats; },
  get engine() { return state.engine; },
  smokeGlazes,
  glazeIds() { return GLAZES.map(g => g.id); },
  glazeIri(id) {
    const g = GLAZES[GLAZE_INDEX[id]];
    return (g && g.iri) ? { s: g.iri.s, nm: g.iri.nm, hue: g.iri.hue, spot: g.iri.spot || 0 } : null;
  },
  previewFiredAll() { return state.previewFiredAll(); },
  get programs() { return (renderer.info && renderer.info.programs && renderer.info.programs.length) || 0; },
  atlas() {
    const n = TEX_W * TEX_H;
    const gpu = 4 * n * 4;
    const ms = state.mapStats();
    const cpuThick = ms.thickBytes, cpuStamp = ms.stampBytes;
    return {
      glazes: GLAZES.length, liveMaps: ms.live, mapCap: MAP_CAP,
      texW: TEX_W, texH: TEX_H,
      gpuAtlasBytes: gpu, gpuAtlasMB: +(gpu / 1e6).toFixed(2),
      cpuThickBytes: cpuThick, cpuStampBytes: cpuStamp,
      cpuMapsMB: +((cpuThick + cpuStamp) / 1e6).toFixed(1),
      cpuTexMB: ms.cpuTexMB,
      totalTexMB: +((gpu + cpuThick + cpuStamp) / 1e6).toFixed(1),
      firstMapMs: ms.firstMapMs,
      heap: this.heap(),
    };
  },
  heap() {
    const m = (typeof performance !== 'undefined' && performance.memory) ? performance.memory : null;
    return m ? {
      usedMB: +(m.usedJSHeapSize / 1e6).toFixed(1),
      totalMB: +(m.totalJSHeapSize / 1e6).toFixed(1),
      limitMB: +(m.jsHeapSizeLimit / 1e6).toFixed(1),
    } : null;
  },
  mapStats() { return state.mapStats(); },
  dabOnce(id, u = 0.5, v = 0.55, r = 0.08, t) {
    const gi = GLAZE_INDEX[id];
    if (gi == null) return null;
    if (id) { ui.glaze = id; const g = GLAZES[gi]; if (g) ui.glazeFam = g.family; }
    const amt = t != null ? t : thickness[id];
    const t0 = performance.now();
    state.beginStroke();
    state.dab(u, v, r, gi, amt);
    return { ms: +(performance.now() - t0).toFixed(2), firstMapMs: state._firstMapMs, liveMaps: state.mapStats().live };
  },
  strokeUV(hFrac, angleDeg, r) {
    const k = outerRow(hFrac);
    return { u: ((angleDeg / 360) % 1 + 1) % 1, v: (k + 0.5) / TEX_H, r: r == null ? ui.size : r };
  },
  // Mesh UV under a client-pixel hit — same coordinates dabFromHit uses.
  hitUV(clientX, clientY) {
    const h = hitAt(clientX, clientY);
    if (!h || !h.uv) return null;
    return { u: h.uv.x, v: h.uv.y, x: clientX, y: clientY };
  },
  // Bytes the pot will draw. `bound` is false when a firing swapped in new maps and the textures stayed on the old ones.
  shown() {
    const sum = (arr) => {
      let s = 2166136261;
      for (let i = 0; i < arr.length; i += 97) s = Math.imul(s ^ arr[i], 16777619);
      return s >>> 0;
    };
    const maps = {};
    for (const k of ['color', 'props', 'fx', 'height']) {
      const data = tex[k].image.data;
      maps[k] = { bound: data === state[k], sum: sum(data) };
    }
    return { engine: state.engine, mode: state.mode, maps, sim: { color: sum(state.color), props: sum(state.props), fx: sum(state.fx), height: sum(state.height) } };
  },
  debugDrips(on) { state.debugDrips = on; },
  debugThickness(on) { state.debugThickness = on; if (state.mode === 'fired') state.composeFired(); },
  get glow() { return glow.v; },
  iriAt(u = 0.5, v = 0.55) {
    const j = Math.max(0, Math.min(TEX_W - 1, Math.floor((((u % 1) + 1) % 1) * TEX_W)));
    const k = Math.max(0, Math.min(TEX_H - 1, Math.floor(Math.min(1, Math.max(0, v)) * TEX_H)));
    const o = (k * TEX_W + j) * 4, Hh = state.height;
    return { bump: Hh[o], amt: Hh[o + 1], nm: Hh[o + 2], hue: Hh[o + 3], u, v, j, k, mode: state.mode };
  },
  iriAtHeight(hFrac = 0.55, angleDeg = 20) {
    const uv = this.strokeUV(hFrac, angleDeg);
    return Object.assign(this.iriAt(uv.u, uv.v), { hFrac, angleDeg });
  },
  renderInfo() {
    const inf = renderer.info;
    return {
      programs: (inf.programs && inf.programs.length) || 0,
      calls: inf.render.calls,
      triangles: inf.render.triangles,
      textures: inf.memory.textures,
      geometries: inf.memory.geometries,
    };
  },
  forceRender() { renderer.render(scene, camera); drawStats.drawn++; },
  sampleScreen(hFrac = 0.5, dAngle = 0, radius = 2) {
    renderer.render(scene, camera);
    drawStats.drawn++;
    const p = this.screenAt(hFrac, dAngle);
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const sx = (p.x - rect.left) * (canvas.width / Math.max(1, rect.width));
    const sy = (p.y - rect.top) * (canvas.height / Math.max(1, rect.height));
    const gl = renderer.getContext();
    const r = Math.max(0, radius | 0), side = 2 * r + 1;
    const x0 = Math.max(0, Math.min(canvas.width - side, Math.round(sx) - r));
    const yCss = Math.round(sy);
    const y0 = Math.max(0, Math.min(canvas.height - side, canvas.height - 1 - yCss - r));
    const buf = new Uint8Array(side * side * 4);
    gl.readPixels(x0, y0, side, side, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let rs = 0, gs = 0, bs = 0, n = side * side;
    for (let i = 0; i < buf.length; i += 4) { rs += buf[i]; gs += buf[i + 1]; bs += buf[i + 2]; }
    return {
      r: rs / n, g: gs / n, b: bs / n, n,
      x: p.x, y: p.y, px: x0, py: y0,
    };
  },
  orbitBench(frames = 24) {
    const t = controls.target.clone();
    const pos0 = camera.position.clone();
    const d0 = camera.position.distanceTo(t);
    const damp = controls.enableDamping;
    controls.enableDamping = false;
    const uploads0 = drawStats.uploads;
    const bytes0 = drawStats.uploadBytes;
    const gl = renderer.getContext();
    const pix = new Uint8Array(4);
    const dts = [];
    let calls = 0;
    const sync = () => { renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pix); };
    for (let w = 0; w < 3; w++) sync();
    for (let i = 0; i < frames; i++) {
      const az = (i / frames) * Math.PI * 2;
      camera.position.set(t.x + Math.sin(az) * d0, t.y + 0.12 * d0, t.z + Math.cos(az) * d0);
      camera.lookAt(t);
      camera.updateMatrixWorld();
      const t0 = performance.now();
      sync();
      dts.push(performance.now() - t0);
      drawStats.drawn++;
      calls = renderer.info.render.calls;
    }
    camera.position.copy(pos0);
    camera.lookAt(t);
    camera.updateMatrixWorld();
    controls.enableDamping = damp;
    controls.update();
    dts.sort((a, b) => a - b);
    const mean = dts.reduce((a, b) => a + b, 0) / dts.length;
    const median = dts[dts.length >> 1];
    return {
      frames,
      median: +median.toFixed(3),
      mean: +mean.toFixed(3),
      min: +dts[0].toFixed(3),
      max: +dts[dts.length - 1].toFixed(3),
      uploads: drawStats.uploads - uploads0,
      uploadBytes: drawStats.uploadBytes - bytes0,
      programs: (renderer.info.programs && renderer.info.programs.length) || 0,
      calls,
    };
  },
};
function outerRow(hFrac) {
  const y = hFrac * pot.height; let best = 0, bd = 1e9;
  for (let k = 0; k < pot.rows.potRows; k++) { if (pot.rows.nr[k] <= 0.2) continue; const d = Math.abs(pot.rows.y[k] - y) - pot.rows.r[k] * 0.001; if (d < bd) { bd = d; best = k; } }
  return best;
}
}
