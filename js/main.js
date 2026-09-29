import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildPot, buildCustomPot, extractCustom, TEX_W, TEX_H, UNIT_CM, dimsCm, cloneSpec, addNode, addNodeAt, removeNode, setHeight, setRimR, setFootR, constrainNode, constrainBulge, LIMITS, MAX_MID, radiusAt, spoutParams, spoutWorld, setSpoutHeight, setSpoutTip } from './pot.js';
import { GLAZES, FAMILIES, cone10Note, CONE10 } from './glazes.js';
import { GlazeState, GLAZE_INDEX, setFireCone } from './sim.js';
import { makePotMaterial } from './material.js';

const view = document.getElementById('view');
const statusEl = document.getElementById('status');
const setStatus = (t) => { statusEl.textContent = t; };
const MOBILE_MQ = '(max-width: 700px), (max-height: 520px) and (max-width: 960px)';
const isMobileLayout = () => window.matchMedia(MOBILE_MQ).matches;

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

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
key.shadow.mapSize.set(isMobileLayout() ? 1024 : 2048, isMobileLayout() ? 1024 : 2048);
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
const ui = { shape: 'vase', glaze: 'tenmoku', tool: 'brush', size: 0.12, pourH: 0.66, pourMode: 'below', simState: 'raw', sheet: 'glaze', touchOrbit: false, touchMode: 'paint', cone: 6, section: false };
let customSpec = null;
let selectedNode = -1;
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
function applyBuiltPot(built, opts = {}) {
  pot = built;
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
  mesh = new THREE.Mesh(pot.geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (pickMesh) pickMesh.geometry.dispose();
  pickMesh = new THREE.Mesh(pot.pickGeometry, new THREE.MeshBasicMaterial());
  pickMesh.updateMatrixWorld();
  scene.add(mesh);
  state.setPot(pot, opts);
  if (!opts.preview) ui.simState = 'raw';
  if (!opts.preview && !opts.noFrame) frameCamera();
  if (opts.skipUi) {
    updateGizmoDataFromSpec();
    placeGizmos();
    return;
  }
  refreshUI();
  rebuildGizmos();
}
function setShape(kind) {
  if (ui.simState === 'firing') return;
  if (kind === 'custom') {
    if (ui.shape === 'custom' && customSpec) { refreshUI(); return; }
    const src = ui.shape === 'custom' ? (customSpec?.source || 'vase') : ui.shape;
    customSpec = extractCustom(src);
    customSpec.source = src;
    selectedNode = customSpec.nodes.length - 1;
    ui.shape = 'custom';
    applyBuiltPot(buildCustomPot(customSpec), { remap: true });
    if (isMobileLayout()) {
      ui.touchMode = 'shape'; ui.touchOrbit = false; syncOrbitTouches();
      document.body.classList.add('sheet-collapsed');
      refreshUI();
    }
    const d = dimsCm(customSpec);
    setStatus(`Custom ${src} — drag the red nodes. ${Math.round(d.ml)} ml.`);
    return;
  }
  customSpec = null;
  selectedNode = -1;
  ui.shape = kind;
  applyBuiltPot(buildPot(kind));
  setStatus(`${kind[0].toUpperCase() + kind.slice(1)} ready. Paint some glaze, then fire.`);
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
  applyBuiltPot(buildCustomPot(customSpec, { preview: !!opts.preview }), {
    preview: !!opts.preview,
    skipNoise: !!opts.preview,
    keepGlaze: !!opts.preview,
    skipCompose: !!opts.preview,
    remap: !opts.preview,
    noFrame: true,
    skipUi: !!opts.skipUi,
  });
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
const gizmoGroup = new THREE.Group(); gizmoGroup.renderOrder = 20; scene.add(gizmoGroup);
const gizmoMats = {
  node: new THREE.MeshBasicMaterial({ color: 0xe74c3c, depthTest: false, transparent: true, opacity: 0.95 }),
  sel: new THREE.MeshBasicMaterial({ color: 0xf5c518, depthTest: false, transparent: true, opacity: 0.98 }),
  bulge: new THREE.MeshBasicMaterial({ color: 0xcfd4da, depthTest: false, transparent: true, opacity: 0.95 }),
  spoutRoot: new THREE.MeshBasicMaterial({ color: 0x1b82f7, depthTest: false, transparent: true, opacity: 0.97 }),
  spoutTip: new THREE.MeshBasicMaterial({ color: 0xffbd2e, depthTest: false, transparent: true, opacity: 0.98 }),
  hit: new THREE.MeshBasicMaterial({ visible: false, depthTest: false }),
};
const profileLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x333333, depthTest: false, transparent: true, opacity: 0.7 }));
profileLine.renderOrder = 19; gizmoGroup.add(profileLine);

function gizmoAz() {
  // Keep the profile gizmos on the screen-right silhouette (lathe profile).
  return Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z) + Math.PI / 2;
}
function clearGizmoMeshes() {
  const keep = new Set([profileLine]);
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
    const selected = kind === 'node' && index === selectedNode;
    const mat = selected ? gizmoMats.sel : gizmoMats[kind] || gizmoMats.node;
    const size = kind === 'spoutTip' ? visR * 1.12 : kind === 'spoutRoot' ? visR * 1.05 : kind === 'node' ? visR : bulgeR;
    const vis = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), mat);
    vis.userData = { kind, index, r, y, vis: true };
    if (world) { vis.userData.world = true; vis.userData.x = world.x; vis.userData.y = world.y; vis.userData.z = world.z; }
    vis.renderOrder = 21;
    if (selected) vis.scale.setScalar(1.28);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(kind.startsWith('spout') ? hitR * 1.15 : hitR, 10, 8), gizmoMats.hit);
    hit.userData = { kind, index, r, y };
    if (world) { hit.userData.world = true; hit.userData.x = world.x; hit.userData.y = world.y; hit.userData.z = world.z; }
    hit.renderOrder = 21;
    gizmoGroup.add(vis); gizmoGroup.add(hit);
  };
  customSpec.nodes.forEach((nd, i) => addBall('node', i, nd.r, nd.y));
  customSpec.bulges.forEach((b, i) => addBall('bulge', i, b.r, b.y));
  if (customSpec.spout === 'teapot') {
    const sw = spoutWorld(customSpec);
    addBall('spoutRoot', 0, sw.r0, sw.y0, sw.root);
    addBall('spoutTip', 0, sw.r0 + sw.out, sw.y0 + sw.lift, sw.tip);
  }
  const segs = sampleProfilePts();
  profileLine.geometry.dispose();
  profileLine.geometry = new THREE.BufferGeometry().setFromPoints(segs.map(p => new THREE.Vector3(p.r, p.y, 0)));
  profileLine.userData.pts = segs;
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
  gizmoGroup.children.forEach(obj => {
    const d = obj.userData;
    if (!d || d.kind == null) return;
    if (d.kind === 'spoutRoot' && sw) {
      d.r = sw.r0; d.y = sw.y0; d.x = sw.root.x; d.z = sw.root.z; d.world = true;
    } else if (d.kind === 'spoutTip' && sw) {
      d.r = sw.r0 + sw.out; d.y = sw.y0 + sw.lift; d.x = sw.tip.x; d.z = sw.tip.z; d.world = true;
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
}
function gizmoScreenOf(kind, index) {
  if (!customSpec) return null;
  if (kind === 'spoutRoot' || kind === 'spoutTip') {
    if (customSpec.spout !== 'teapot') return null;
    const sw = spoutWorld(customSpec);
    const p = kind === 'spoutRoot' ? sw.root : sw.tip;
    camera.updateMatrixWorld();
    const v = p.clone().project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
  }
  const list = kind === 'bulge' ? customSpec.bulges : customSpec.nodes;
  if (index < 0) index = list.length + index;
  const p = list[index]; if (!p) return null;
  const az = gizmoAz();
  camera.updateMatrixWorld();
  const v = new THREE.Vector3(p.r * Math.sin(az), p.y, p.r * Math.cos(az)).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
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
    const prefer = d.kind === 'spoutRoot' || d.kind === 'spoutTip' ? dist - 7 : dist;
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
    if (dist < bd) { bd = dist; best = { r: p.r, y: p.y, dist }; }
  }
  return best;
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
  setStatus(`Custom shape · ${Math.round(d.ml)} ml.`);
}
function queueShapePreview() {
  if (previewRaf) return;
  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0;
    if (!customSpec || shapeLocked()) return;
    rebuildCustom({ preview: true, skipUi: true });
  });
}
function flushShapePreview() {
  if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = 0; }
}
function tryAddAtHeight(y) {
  if (!customSpec || shapeLocked()) return false;
  if (performance.now() - lastAddMs < 350) return false;
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
function selectNode(i) {
  selectedNode = i;
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
controls.minDistance = 2; controls.maxDistance = 20; controls.maxPolarAngle = Math.PI * 0.62;
syncOrbitTouches();

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
    const preferOutline = outline && (!g || outline.dist + 8 < g.dist);
    if (g && !preferOutline) {
      e.preventDefault();
      if (e.pointerType !== 'touch') controls.enabled = false;
      shaping = true; shapePointer = e.pointerId; shapeTarget = { kind: g.kind, index: g.index };
      if (g.kind === 'node') { selectedNode = g.index; rebuildGizmos(); refreshUI(); }
      renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
    if (outline) {
      e.preventDefault();
      if (e.pointerType !== 'touch') controls.enabled = false;
      pendingOutline = { pointer: e.pointerId, x: e.clientX, y: e.clientY, height: outline.y };
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
    state.beginStroke(); dabFromHit(h);
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
    }
    return;
  }
  const h = hitAt(e.clientX, e.clientY);
  if (e.pointerType !== 'touch' && h && ui.tool === 'brush' && ui.simState === 'raw' && !showingGizmos()) {
    cursor.visible = true; cursor.position.copy(h.point);
    const n = h.face.normal.clone().transformDirection(mesh.matrixWorld);
    cursor.lookAt(h.point.clone().add(n)); cursor.scale.setScalar(ui.size);
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
});
const endStroke = (e) => {
  if (e && e.pointerType === 'touch') touchPointers.delete(e.pointerId);
  if (pendingOutline && (!e || e.pointerId === pendingOutline.pointer || !touchPointers.size)) {
    const addY = pendingOutline.height;
    pendingOutline = null;
    if (e && e.pointerType === 'touch' && touchPointers.size >= 1) { /* second finger: keep orbit */ }
    else tryAddAtHeight(addY);
    controls.enabled = true;
  }
  if (shaping && (!e || e.pointerId === shapePointer || !touchPointers.size)) {
    shaping = false; shapePointer = null; shapeTarget = null;
    flushShapePreview();
    rebuildCustom();
    liveCustomStatus();
  }
  if (e && paintPointer !== null && e.pointerId !== paintPointer && touchPointers.size) return;
  painting = false; paintPointer = null; controls.enabled = true;
};
renderer.domElement.addEventListener('pointerup', endStroke);
renderer.domElement.addEventListener('pointercancel', endStroke);
renderer.domElement.addEventListener('pointerleave', () => { cursor.visible = false; });
renderer.domElement.addEventListener('dblclick', (e) => {
  if (!showingGizmos() || shapeLocked()) return;
  if (hitGizmo(e.clientX, e.clientY)) return;
  const outline = hitOutline(e.clientX, e.clientY);
  if (outline) { e.preventDefault(); tryAddAtHeight(outline.y); }
});

view.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

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
  if (ui.simState === 'firing') return;
  if (ui.simState !== 'raw' && ui.simState !== 'fired') return;
  ui.simState = 'firing'; document.body.classList.add('sheet-collapsed'); refreshUI(); cursor.visible = false; pourRing.visible = false;
  const temp = ui.cone === 10 ? 1285 : 1222;
  setStatus(`Firing… heating to cone ${ui.cone} (~${temp}°C, Orton 60°C/h)`);
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
document.querySelectorAll('#cone button').forEach(b => b.onclick = () => {
  if (ui.simState === 'firing') return;
  ui.cone = +b.dataset.cone;
  setFireCone(ui.cone);
  refreshUI();
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
});
document.querySelectorAll('#touchMode button').forEach(b => b.onclick = () => {
  ui.touchMode = b.dataset.mode;
  ui.touchOrbit = ui.touchMode === 'orbit';
  if (isMobileLayout() && ui.touchMode === 'shape') document.body.classList.add('sheet-collapsed');
  syncOrbitTouches();
  refreshUI();
  rebuildGizmos();
});

function fmtCm(v) { return v.toFixed(1) + ' cm'; }
function syncCustomSliders() {
  if (!customSpec) return;
  const d = dimsCm(customSpec);
  $('customH').value = d.height; $('customHOut').textContent = fmtCm(d.height);
  $('customRim').value = d.rim; $('customRimOut').textContent = fmtCm(d.rim);
  $('customFoot').value = d.foot; $('customFootOut').textContent = fmtCm(d.foot);
  $('customWall').value = d.wall; $('customWallOut').textContent = d.wall.toFixed(2) + ' cm';
  $('capOut').textContent = Math.round(d.ml);
  const mid = Math.max(0, customSpec.nodes.length - 2);
  const nc = $('nodeCount'); if (nc) nc.textContent = `${mid}/${MAX_MID}`;
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
  hud.textContent = `${fmtCm(d.height)} · rim Ø ${fmtCm(d.rim)} · ${Math.round(d.ml)} ml`;
}
function onCustomChange() {
  if (shapeLocked()) { setStatus('Unfire first to edit the shape.'); refreshUI(); return; }
  rebuildCustom();
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
$('nodeDelHud').onclick = () => $('nodeDel').onclick();
function deleteSelectedNode() {
  if (!customSpec || shapeLocked()) return false;
  const removed = removeNode(customSpec, selectedNode);
  if (removed < 0) return false;
  selectedNode = customSpec.nodes.length > 2 ? Math.min(removed, customSpec.nodes.length - 2) : -1;
  onCustomChange();
  return true;
}
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (!showingGizmos()) return;
  if (selectedNode > 0 && customSpec && selectedNode < customSpec.nodes.length - 1) {
    e.preventDefault();
    deleteSelectedNode();
  }
});
$('customH').oninput = (e) => { if (!customSpec) return; setHeight(customSpec, +e.target.value / UNIT_CM); rebuildCustom({ preview: true, skipUi: true }); syncCustomSliders(); liveCustomStatus(); };
$('customH').onchange = () => onCustomChange();
$('customRim').oninput = (e) => { if (!customSpec) return; setRimR(customSpec, +e.target.value / UNIT_CM / 2); rebuildCustom({ preview: true, skipUi: true }); syncCustomSliders(); liveCustomStatus(); };
$('customRim').onchange = () => onCustomChange();
$('customFoot').oninput = (e) => { if (!customSpec) return; setFootR(customSpec, +e.target.value / UNIT_CM / 2); rebuildCustom({ preview: true, skipUi: true }); syncCustomSliders(); liveCustomStatus(); };
$('customFoot').onchange = () => onCustomChange();
$('customWall').oninput = (e) => { if (!customSpec) return; customSpec.wall = Math.min(LIMITS.wall[1], Math.max(LIMITS.wall[0], +e.target.value / UNIT_CM)); rebuildCustom({ preview: true, skipUi: true }); syncCustomSliders(); liveCustomStatus(); };
$('customWall').onchange = () => onCustomChange();
['hPos', 'hH', 'hW', 'hT'].forEach(id => {
  $(id).oninput = () => {
    if (!customSpec) return;
    customSpec.handlePos = +$('hPos').value;
    customSpec.handleHeight = +$('hH').value;
    customSpec.handleWidth = +$('hW').value;
    customSpec.handleThick = +$('hT').value;
    rebuildCustom({ preview: true, skipUi: true }); syncCustomSliders(); liveCustomStatus();
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
    rebuildCustom({ preview: true, skipUi: true });
    if (customSpec.spout === 'teapot') { updateGizmoDataFromSpec(); placeGizmos(); }
    syncCustomSliders(); liveCustomStatus();
  };
  $(id).onchange = () => onCustomChange();
});
document.querySelectorAll('#handleType button').forEach(b => b.onclick = () => {
  if (!customSpec || shapeLocked()) return;
  customSpec.handle = b.dataset.handle;
  onCustomChange();
});
document.querySelectorAll('#spoutType button').forEach(b => b.onclick = () => {
  if (!customSpec || shapeLocked()) return;
  customSpec.spout = b.dataset.spout;
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
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
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
  ctx.fillStyle = '#eef1f4'; ctx.fill(); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(0), Y(pts[0][1]));
  for (const p of pts) ctx.lineTo(X(-p[0]), Y(p[1]));
  ctx.lineTo(X(0), Y(pts[pts.length - 1][1])); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cx, Y(0)); ctx.lineTo(cx, Y(maxY)); ctx.strokeStyle = '#999'; ctx.stroke(); ctx.setLineDash([]);
  const d = customSpec ? dimsCm(customSpec) : { height: pot.height * UNIT_CM, rim: 0, foot: 0, wall: 0, ml: 0 };
  ctx.fillStyle = '#074684'; ctx.font = '600 13px sans-serif';
  ctx.fillText('POT SECTION', pad, 22);
  ctx.fillStyle = '#525d7d'; ctx.font = '12px sans-serif';
  ctx.fillText(`H ${d.height.toFixed(1)} cm   rim Ø ${d.rim.toFixed(1)} cm   foot Ø ${d.foot.toFixed(1)} cm   ${Math.round(d.ml)} ml`, pad, 40);
  if (customSpec) {
    ctx.strokeStyle = '#c0391b'; ctx.lineWidth = 1;
    const dim = (x0, y0, x1, y1, label) => {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.fillText(label, (x0 + x1) / 2 + 4, (y0 + y1) / 2 - 4);
    };
    const rim = customSpec.nodes[customSpec.nodes.length - 1];
    dim(X(-rim.r), Y(rim.y) - 12, X(rim.r), Y(rim.y) - 12, `Ø ${d.rim.toFixed(1)} cm`);
    dim(X(maxR) + 16, Y(0), X(maxR) + 16, Y(customSpec.nodes[customSpec.nodes.length - 1].y), `${d.height.toFixed(1)} cm`);
  }
}

function applyLayout() {
  const mobile = isMobileLayout();
  document.body.classList.toggle('is-mobile', mobile);
  document.body.dataset.sheet = ui.sheet;
  if (!mobile) document.body.classList.remove('sheet-collapsed');
  else if (window.innerHeight <= 520) document.body.classList.add('sheet-collapsed');
  else if (!document.body.dataset.mobileInit) {
    document.body.classList.add('sheet-collapsed');
    document.body.dataset.mobileInit = '1';
  }
  syncOrbitTouches();
}
window.matchMedia(MOBILE_MQ).addEventListener('change', applyLayout);
window.addEventListener('orientationchange', () => { setTimeout(applyLayout, 80); });

function refreshUI() {
  document.querySelectorAll('#shapes button').forEach(b => b.classList.toggle('active', b.dataset.shape === ui.shape));
  document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('active', b.dataset.tool === ui.tool));
  document.querySelectorAll('#pourMode button').forEach(b => b.classList.toggle('active', b.dataset.mode === ui.pourMode));
  document.querySelectorAll('.glaze').forEach(b => b.classList.toggle('active', b.dataset.glaze === ui.glaze));
  { const g = GLAZES[GLAZE_INDEX[ui.glaze]]; $('glazeNow').innerHTML = `<b>${g.name}</b>${g.src ? ' &middot; source: ' + g.src : g.like ? ' &middot; ' + g.like : ''} &middot; ${cone10Note(g.id)}`; }
  $('thick').value = thickness[ui.glaze]; $('thickOut').textContent = thickness[ui.glaze].toFixed(2);
  $('size').value = ui.size; $('sizeOut').textContent = ui.size.toFixed(2);
  $('pourH').value = ui.pourH; $('pourHOut').textContent = Math.round(ui.pourH * 100) + '%';
  $('brushOpts').hidden = ui.tool !== 'brush'; $('pourOpts').hidden = ui.tool !== 'pour';
  $('fireBtn').disabled = ui.simState === 'firing'; $('unfireBtn').disabled = ui.simState !== 'fired'; $('clearBtn').disabled = ui.simState === 'firing';
  $('pourBtn').disabled = ui.simState !== 'raw';
  document.querySelectorAll('#cone button').forEach(b => b.classList.toggle('active', +b.dataset.cone === ui.cone));
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
  document.querySelectorAll('#touchMode button').forEach(b => b.classList.toggle('active', b.dataset.mode === ui.touchMode));
  const customOn = ui.shape === 'custom' && customSpec;
  $('customOpts').hidden = !customOn;
  $('dimHud').hidden = !customOn;
  const lock = shapeLocked();
  ['nodeAdd', 'nodeSub', 'nodeDel', 'nodeDelHud', 'customH', 'customRim', 'customFoot', 'customWall', 'hPos', 'hH', 'hW', 'hT', 'sH', 'sAz', 'sTilt', 'sLen', 'sMouth'].forEach(id => { const el = $(id); if (el) el.disabled = lock || !customOn; });
  const canDel = customOn && !lock && selectedNode > 0 && customSpec && selectedNode < customSpec.nodes.length - 1;
  if ($('nodeDel')) $('nodeDel').disabled = !canDel;
  if ($('nodeDelHud')) $('nodeDelHud').disabled = !canDel;
  if ($('shapeTools')) $('shapeTools').hidden = !showingGizmos() || !canDel;
  if ($('nodeAdd') && customOn && customSpec) $('nodeAdd').disabled = lock || customSpec.nodes.length >= 2 + MAX_MID;
  document.querySelectorAll('#handleType button').forEach(b => {
    b.classList.toggle('active', customOn && customSpec.handle === b.dataset.handle);
    b.disabled = lock || !customOn;
  });
  document.querySelectorAll('#spoutType button').forEach(b => {
    b.classList.toggle('active', customOn && customSpec.spout === b.dataset.spout);
    b.disabled = lock || !customOn;
  });
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
    if (gizmoGroup.visible !== want || !!haveSpout !== teapot) rebuildGizmos();
    else placeGizmos();
  }
  if (pot) showPourRing(ui.pourH);
}

// ---------- loop ----------
function resize() {
  syncAppSize();
  const w = view.clientWidth, h = view.clientHeight;
  if (w < 1 || h < 1) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
if (window.visualViewport) {
  visualViewport.addEventListener('resize', resize);
  visualViewport.addEventListener('scroll', resize);
}
if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(view);
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
  placeGizmos();
  renderer.render(scene, camera);
}
resize();
applyLayout();
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
  },
  setCone(n) { ui.cone = n === 10 ? 10 : 6; setFireCone(ui.cone); refreshUI(); },
  get cone() { return ui.cone; },
  get touchOrbit() { return ui.touchOrbit; },
  get touchMode() { return ui.touchMode; },
  setTouchOrbit(on) { ui.touchMode = on ? 'orbit' : 'paint'; ui.touchOrbit = !!on; syncOrbitTouches(); refreshUI(); rebuildGizmos(); },
  setTouchMode(m) { ui.touchMode = m === 'orbit' ? 'orbit' : m === 'shape' ? 'shape' : 'paint'; ui.touchOrbit = ui.touchMode === 'orbit'; syncOrbitTouches(); refreshUI(); rebuildGizmos(); },
  get sheet() { return ui.sheet; },
  get mobile() { return isMobileLayout(); },
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
  setCustom(partial = {}) {
    if (ui.shape !== 'custom') setShape('custom');
    if (shapeLocked()) { setStatus('Unfire first to edit the shape.'); return false; }
    if (partial.nodes) customSpec.nodes = partial.nodes.map(p => ({ r: p.r, y: p.y }));
    if (partial.bulges) customSpec.bulges = partial.bulges.map(p => ({ r: p.r, y: p.y }));
    for (const k of ['wall', 'handle', 'handlePos', 'handleHeight', 'handleWidth', 'handleThick', 'handleAz', 'spout', 'spoutSize', 'spoutY', 'spoutLen', 'spoutTilt', 'spoutMouth', 'spoutAz', 'source']) {
      if (partial[k] !== undefined) customSpec[k] = partial[k];
    }
    rebuildCustom();
    liveCustomStatus();
    return true;
  },
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
  get selectedNode() { return selectedNode; },
  get maxMid() { return MAX_MID; },
  getLimits() { return { ...LIMITS, maxMid: MAX_MID }; },
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
