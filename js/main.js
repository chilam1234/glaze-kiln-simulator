import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildPot, TEX_W, TEX_H } from './pot.js';
import { GLAZES, FAMILIES } from './glazes.js';
import { GlazeState, GLAZE_INDEX } from './sim.js';
import { makePotMaterial } from './material.js';

const view = document.getElementById('view');
const statusEl = document.getElementById('status');
const setStatus = (t) => { statusEl.textContent = t; };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dcdfe2');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
const key = new THREE.DirectionalLight(0xfff6ee, 1.8);
key.position.set(3.5, 6, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -2.5; key.shadow.camera.right = 2.5; key.shadow.camera.top = 3.5; key.shadow.camera.bottom = -1.5;
key.shadow.camera.near = 1; key.shadow.camera.far = 20;
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 6;
scene.add(key);
const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.ShadowMaterial({ opacity: 0.28 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// ---------- textures + glaze state ----------
function dataTex(arr, srgb) {
  const t = new THREE.DataTexture(arr, TEX_W, TEX_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true; return t;
}
const state = new GlazeState();
const tex = { color: dataTex(state.color, true), props: dataTex(state.props), fx: dataTex(state.fx), height: dataTex(state.height) };
let dirty = false;
state.onUpload = () => { dirty = true; };
const material = makePotMaterial(tex);
let pot = null, mesh = null, pickMesh = null;

// ---------- UI state ----------
const ui = { shape: 'vase', glaze: 'tenmoku', tool: 'brush', size: 0.12, pourH: 0.66, pourMode: 'below', simState: 'raw' };
const thickness = Object.fromEntries(GLAZES.map(g => [g.id, g.defaultThickness]));

function frameCamera() {
  pot.geometry.computeBoundingBox();
  const bb = pot.geometry.boundingBox, h = pot.height, rMax = Math.max(bb.max.x, -bb.min.x, bb.max.z, -bb.min.z);
  const target = new THREE.Vector3(0, h * 0.46, 0);
  const dist = Math.max(h, rMax * 2.1) * 2.5;
  const el = pot.elev ?? (pot.kind === 'bowl' ? 0.62 : 0.3);
  camera.position.set(0, target.y + Math.sin(el) * dist, Math.cos(el) * dist);
  controls.target.copy(target); controls.update();
}
function setShape(kind) {
  ui.shape = kind;
  pot = buildPot(kind);
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
  mesh = new THREE.Mesh(pot.geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (pickMesh) pickMesh.geometry.dispose();
  pickMesh = new THREE.Mesh(pot.pickGeometry, new THREE.MeshBasicMaterial());
  pickMesh.updateMatrixWorld();
  scene.add(mesh);
  state.setPot(pot);
  ui.simState = 'raw';
  frameCamera(); refreshUI();
  setStatus(`${kind[0].toUpperCase() + kind.slice(1)} ready. Paint some glaze, then fire.`);
}

// ---------- input: brush + pour on the mesh ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function hitAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  camera.updateMatrixWorld(); raycaster.setFromCamera(ndc, camera);
  const h = raycaster.intersectObject(pickMesh, false)[0];
  return h || null;
}
const cursor = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.55, depthTest: false }));
cursor.renderOrder = 10; cursor.visible = false; scene.add(cursor);
const pourRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * Math.PI * 2), 0, Math.sin(i / 96 * Math.PI * 2)))), new THREE.LineBasicMaterial({ color: 0xc0391b }));
pourRing.visible = false; scene.add(pourRing);
function showPourRing(hFrac) {
  const y = hFrac * pot.height, r = pot.outerRadiusAt(y) || 0.5;
  pourRing.position.set(0, y, 0); pourRing.scale.set(r * 1.01, 1, r * 1.01); pourRing.visible = ui.tool === 'pour' && ui.simState === 'raw';
}

let painting = false, lastScreen = null;
function dabFromHit(h) { state.dab(h.uv.x, h.uv.y, ui.size, GLAZE_INDEX[ui.glaze], thickness[ui.glaze]); }
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || ui.simState !== 'raw' || !mesh) return;
  const h = hitAt(e.clientX, e.clientY);
  if (!h) return;
  e.preventDefault();
  if (ui.tool === 'brush') {
    controls.enabled = false; painting = true; lastScreen = [e.clientX, e.clientY];
    renderer.domElement.setPointerCapture(e.pointerId);
    state.beginStroke(); dabFromHit(h);
  } else {
    controls.enabled = false;
    ui.pourH = Math.min(1, Math.max(0, h.point.y / pot.height));
    doPour(); refreshUI();
  }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!mesh) return;
  const h = hitAt(e.clientX, e.clientY);
  if (h && ui.tool === 'brush' && ui.simState === 'raw') {
    cursor.visible = true; cursor.position.copy(h.point);
    const n = h.face.normal.clone().transformDirection(mesh.matrixWorld);
    cursor.lookAt(h.point.clone().add(n)); cursor.scale.setScalar(ui.size);
  } else cursor.visible = false;
  if (ui.tool === 'pour' && h && ui.simState === 'raw') showPourRing(h.point.y / pot.height);
  if (!painting) return;
  // interpolate in screen space so fast drags still produce continuous strokes
  const [lx, ly] = lastScreen, dx = e.clientX - lx, dy = e.clientY - ly;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
  for (let s = 1; s <= steps; s++) {
    const hh = hitAt(lx + dx * s / steps, ly + dy * s / steps);
    if (hh) dabFromHit(hh);
  }
  lastScreen = [e.clientX, e.clientY];
});
const endStroke = () => { painting = false; controls.enabled = true; };
renderer.domElement.addEventListener('pointerup', endStroke);
renderer.domElement.addEventListener('pointercancel', endStroke);
renderer.domElement.addEventListener('pointerleave', () => { cursor.visible = false; });

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 2; controls.maxDistance = 20; controls.maxPolarAngle = Math.PI * 0.62;

function doPour() {
  state.pour(GLAZE_INDEX[ui.glaze], ui.pourH, ui.pourMode, thickness[ui.glaze]);
  showPourRing(ui.pourH);
  setStatus(`Poured ${GLAZES[GLAZE_INDEX[ui.glaze]].name} ${ui.pourMode} ${Math.round(ui.pourH * 100)}% height.`);
}

// ---------- firing ----------
const glow = { v: 0 };
function animateTo(obj, key, to, ms) {
  return new Promise(res => { const from = obj[key], t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); obj[key] = from + (to - from) * (k * k * (3 - 2 * k)); k < 1 ? requestAnimationFrame(step) : res(); }; step(); });
}
async function fire(seed) {
  if (ui.simState !== 'raw') return;
  ui.simState = 'firing'; refreshUI(); cursor.visible = false; pourRing.visible = false;
  setStatus('Firing… heating to cone 10');
  const t0 = performance.now();
  await animateTo(glow, 'v', 1, 1000);
  await state.fire(p => setStatus(`Firing… melt & flow ${Math.round(p * 100)}%`), typeof seed === 'number' ? seed : undefined);
  setStatus('Cooling…');
  await animateTo(glow, 'v', 0, 1600);
  ui.simState = 'fired'; refreshUI();
  const ds = state.dripStats || {};
  setStatus(`Fired in ${((performance.now() - t0) / 1000).toFixed(1)} s (seed ${state.seed}, ${ds.drips ?? 0} runs). Orbit to inspect; "Unfire" to keep painting.`);
}
function unfire() { if (ui.simState !== 'fired') return; state.unfire(); ui.simState = 'raw'; refreshUI(); setStatus('Back to raw glaze. Keep painting.'); }
function clearAll() { if (ui.simState === 'firing') return; state.clear(); ui.simState = 'raw'; refreshUI(); setStatus('Cleared.'); }

// ---------- UI wiring ----------
const $ = (id) => document.getElementById(id);
const gl = $('glazes');
for (const [fam, label] of FAMILIES) {
  const hd = document.createElement('div'); hd.className = 'fam'; hd.textContent = label; gl.appendChild(hd);
  for (const g of GLAZES.filter(x => x.family === fam)) {
    const b = document.createElement('button'); b.className = 'glaze'; b.dataset.glaze = g.id;
    const mid = g.fired[Math.min(g.fired.length - 1, 3)][1];
    b.innerHTML = `<span class="sw" style="background:linear-gradient(135deg, ${g.raw} 50%, ${mid} 50%)"></span><span class="nm">${g.name.replace(/ ([A-Z]{1,3}-\d+)$/, '')}${/ [A-Z]{1,3}-\d+$/.test(g.name) ? `<small>${g.name.match(/[A-Z]{1,3}-\d+$/)[0]}</small>` : ''}</span>`;
    b.title = `${g.name}${g.src ? ' (colours approximated from ' + g.src + ')' : g.like ? ' (' + g.like + ')' : ''}. Swatch: raw colour | fired colour`;
    b.onclick = () => { ui.glaze = g.id; refreshUI(); };
    gl.appendChild(b);
  }
}
document.querySelectorAll('#shapes button').forEach(b => b.onclick = () => ui.simState !== 'firing' && setShape(b.dataset.shape));
document.querySelectorAll('#tools button').forEach(b => b.onclick = () => { ui.tool = b.dataset.tool; refreshUI(); });
document.querySelectorAll('#pourMode button').forEach(b => b.onclick = () => { ui.pourMode = b.dataset.mode; refreshUI(); });
$('thick').oninput = (e) => { thickness[ui.glaze] = +e.target.value; refreshUI(); };
$('size').oninput = (e) => { ui.size = +e.target.value; refreshUI(); };
$('pourH').oninput = (e) => { ui.pourH = +e.target.value; showPourRing(ui.pourH); refreshUI(); };
$('pourBtn').onclick = () => ui.simState === 'raw' && doPour();
$('wax').onchange = (e) => { state.waxFoot = e.target.checked; };
$('fireBtn').onclick = () => fire(); $('unfireBtn').onclick = unfire; $('clearBtn').onclick = clearAll;

function refreshUI() {
  document.querySelectorAll('#shapes button').forEach(b => b.classList.toggle('active', b.dataset.shape === ui.shape));
  document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('active', b.dataset.tool === ui.tool));
  document.querySelectorAll('#pourMode button').forEach(b => b.classList.toggle('active', b.dataset.mode === ui.pourMode));
  document.querySelectorAll('.glaze').forEach(b => b.classList.toggle('active', b.dataset.glaze === ui.glaze));
  { const g = GLAZES[GLAZE_INDEX[ui.glaze]]; $('glazeNow').innerHTML = `<b>${g.name}</b>${g.src ? ' &middot; source: ' + g.src : g.like ? ' &middot; ' + g.like : ''}`; }
  $('thick').value = thickness[ui.glaze]; $('thickOut').textContent = thickness[ui.glaze].toFixed(2);
  $('size').value = ui.size; $('sizeOut').textContent = ui.size.toFixed(2);
  $('pourH').value = ui.pourH; $('pourHOut').textContent = Math.round(ui.pourH * 100) + '%';
  $('brushOpts').hidden = ui.tool !== 'brush'; $('pourOpts').hidden = ui.tool !== 'pour';
  const raw = ui.simState === 'raw';
  $('fireBtn').disabled = !raw; $('unfireBtn').disabled = ui.simState !== 'fired'; $('clearBtn').disabled = ui.simState === 'firing';
  $('pourBtn').disabled = !raw;
  if (pot) showPourRing(ui.pourH);
}

// ---------- loop ----------
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
const glowCol = new THREE.Color(), BG = new THREE.Color('#dcdfe2'), BG_KILN = new THREE.Color('#2e2521');
function loop() {
  requestAnimationFrame(loop);
  if (dirty) { for (const t of Object.values(tex)) t.needsUpdate = true; dirty = false; }
  const g = glow.v;
  // kiln glow: lights dim, the pot glows red-orange -> yellow-orange at peak, then cools back
  glowCol.setRGB(1.0, 0.16 + 0.28 * g, 0.03 + 0.06 * g * g);
  material.userData.uniforms.uGlowColor.value.copy(glowCol);
  material.userData.uniforms.uGlow.value = g * 0.9;
  key.intensity = 1.8 * (1 - 0.75 * g);
  scene.environmentIntensity = 0.85 * (1 - 0.75 * g);
  scene.background.copy(BG).lerp(BG_KILN, g);
  controls.update();
  renderer.render(scene, camera);
}
resize();
{ const q = new URLSearchParams(location.search).get('seed'); if (q !== null && q !== '') state.fixedSeed = (+q) >>> 0; }
setShape('vase');
refreshUI();
loop();

// ---------- test / automation hook ----------
window.__sim = {
  get state() { return ui.simState; },
  setShape, fire, unfire, clear: clearAll,
  setGlaze(id) { ui.glaze = id; refreshUI(); },
  setTool(t) { ui.tool = t; refreshUI(); },
  setThickness(v) { thickness[ui.glaze] = v; refreshUI(); },
  setBrushSize(v) { ui.size = v; refreshUI(); },
  pour(id, h, mode = 'below', t) { if (id) ui.glaze = id; ui.pourH = h; ui.pourMode = mode; if (t) thickness[ui.glaze] = t; doPour(); refreshUI(); },
  // brush dabs in UV space along a horizontal band at a height fraction (outer wall)
  brushBand(id, hFrac, t, size = 0.12, angle0 = 0, angle1 = 360) {
    ui.glaze = id; if (t) thickness[id] = t; ui.size = size; state.beginStroke();
    const k = outerRow(hFrac); const v = (k + 0.5) / TEX_H;
    for (let a = angle0; a <= angle1; a += 1.5) state.dab(((a / 360) % 1 + 1) % 1, v, size, GLAZE_INDEX[id], thickness[id]);
    refreshUI();
  },
  setView(azDeg, elevDeg, distScale = 1) {
    const t = controls.target, d = camera.position.distanceTo(t) * distScale, az = azDeg * Math.PI / 180, el = elevDeg * Math.PI / 180;
    camera.position.set(t.x + Math.sin(az) * Math.cos(el) * d, t.y + Math.sin(el) * d, t.z + Math.cos(az) * Math.cos(el) * d);
    controls.update(); camera.updateMatrixWorld();
  },
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
    const F = pot.rows.frame; if (!F) return null;
    const k = Math.min(TEX_H - 1, F.from + Math.floor(t * (TEX_H - F.from))), r = pot.rows.r[k];
    const c = new THREE.Vector3(F.cx[k], F.cy[k], F.cz[k]), toCam = camera.position.clone().sub(c).normalize();
    const n = new THREE.Vector3(F.nx[k], F.ny[k], F.nz[k]), b = new THREE.Vector3(F.bx[k], F.by[k], F.bz[k]);
    const dir = n.multiplyScalar(n.dot(toCam)).add(b.multiplyScalar(b.dot(toCam))).normalize();
    camera.updateMatrixWorld();
    const p = c.add(dir.multiplyScalar(r * 0.8)).project(camera), rect = renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
  },
  // mean thickness per glaze on the handle rows only (mug); null if no handle
  handleStats() {
    const F = pot.rows.frame; if (!F) return null; const W = TEX_W, from = F.from * W, n = TEX_H * W - from;
    return Object.fromEntries(GLAZES.map((g, gi) => { let s = 0; const a = (state.fired || state.thick)[gi]; if (a) for (let i = from; i < TEX_H * W; i++) s += a[i]; return [g.id, +(s / n).toFixed(4)]; }));
  },
  stats: () => state.stats(),
  setSeed(n) { state.fixedSeed = (n === null || n === undefined) ? undefined : n >>> 0; },   // stable seed for tests; null = random per firing
  get seed() { return state.seed; },
  get fireMs() { return state.fireMs; },
  frame() { frameCamera(); },
  get composeMs() { return state.composeMs; },
  get dripStats() { return state.dripStats; },
  debugDrips(on) { state.debugDrips = on; },
  debugThickness(on) { state.debugThickness = on; if (state.mode === 'fired') state.composeFired(); },
  get glow() { return glow.v; },
};
function outerRow(hFrac) {
  const y = hFrac * pot.height; let best = 0, bd = 1e9;
  for (let k = 0; k < pot.rows.potRows; k++) { if (pot.rows.nr[k] <= 0.2) continue; const d = Math.abs(pot.rows.y[k] - y) - pot.rows.r[k] * 0.001; if (d < bd) { bd = d; best = k; } }
  return best;
}
