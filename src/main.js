import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import '@fontsource/vazirmatn/arabic-400.css';
import '@fontsource/vazirmatn/arabic-600.css';
import '@fontsource/vazirmatn/arabic-700.css';

import bodyUrl from './assets/body.mhb?url';
import { TESTS, SEGMENTS } from './data.js';
import { loadBodyData, BodyModel } from './body/model.js';
import { solveTest, emphasize, lerpInfo, fatColor, changeColor, SKIN_TONE, HEAD_NEUTRAL, CHANGE_STOPS } from './shape.js';
import { skinMaterial, fatMaterial, muscleMaterial, capMaterial, stencilPair, fresnelMaterial } from './materials.js';
import * as UI from './ui.js';
import { t, setLang, lang, applyDocLang, num } from './i18n.js';

// ------------------------------------------------------------------------------------
const MOBILE = matchMedia('(max-width: 820px)').matches || matchMedia('(pointer: coarse)').matches;
const state = {
  testIdx: TESTS.length - 1,
  baseIdx: 0,
  view: 'body',
  emph: 1,
  labels: true,
  rotate: false,
  changeMap: true,
  playing: false,
  shorts: true,
  tmode: 'xray',
  layers: { fat: true, muscle: true, visc: true },
  cutDepth: 0,
  sliceY: 1.0,
  mtab: 'right',
};

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('gl');
applyDocLang();

// ---- renderer / scene ------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, stencil: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(256, 210, 20, 256, 256, 400);
  gr.addColorStop(0, '#1b2638');
  gr.addColorStop(0.55, '#101722');
  gr.addColorStop(1, '#070a10');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 512);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
})();

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.42;

const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
const BODY_Y = 0.93;
camera.position.set(0, 1.15, 5.3);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, BODY_Y, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.2;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.56;
controls.autoRotateSpeed = 1.4;
controls.update();

// lights
const key = new THREE.DirectionalLight(0xfff0e0, 2.1);
key.position.set(2.6, 4.2, 3.6);
key.castShadow = true;
key.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.2, bottom: -1, near: 0.5, far: 14 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 5;
const rim = new THREE.DirectionalLight(0x78b0ff, 2.2);
rim.position.set(-3.2, 2.6, -3.6);
const rim2 = new THREE.DirectionalLight(0x4fd1c5, 0.9);
rim2.position.set(3.4, 1.8, -3);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55);
fill.position.set(-3, 1.4, 3);
scene.add(key, rim, rim2, fill);

// stage floor
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(1.35, 96),
  new THREE.MeshStandardMaterial({ color: 0x0b1019, roughness: 0.78, metalness: 0.05 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.002;
floor.receiveShadow = true;
scene.add(floor);
const ringMat = (op) => new THREE.MeshBasicMaterial({ color: 0x4fd1c5, transparent: true, opacity: op, side: THREE.DoubleSide });
for (const [r0, r1, op] of [[1.33, 1.345, 0.5], [0.95, 0.955, 0.16], [0.55, 0.555, 0.12]]) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 128), ringMat(op));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.0005;
  scene.add(m);
}

// scan ring (plays when the data changes)
const scan = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.0045, 8, 160), new THREE.MeshBasicMaterial({ color: 0x7ff5ea, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
scan.rotation.x = Math.PI / 2;
scan.visible = false;
scene.add(scan);
let scanT = -1;

// slice indicator ring (slice mode)
const sliceRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.556, 128), new THREE.MeshBasicMaterial({ color: 0x4fd1c5, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
sliceRing.rotation.x = -Math.PI / 2;
sliceRing.visible = false;
scene.add(sliceRing);

// ---- materials --------------------------------------------------------------------------
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
const clip = (m) => { m.clippingPlanes = [clipPlane]; m.clipShadows = true; return m; };

const skinMat = skinMaterial();
const skinCutMat = clip(skinMaterial());
skinCutMat.userData.uniforms.uShorts.value = 0;
const fatXrayMat = fatMaterial({ xray: true });
const muscleMat = muscleMaterial({ opacity: 0.78 }); // X-ray: lets the visceral fat show through
const muscleCutMat = clip(muscleMaterial());
const VISC = { color: '#ffa424', septa: '#c8561a', freq: 150, emissive: 0.1 };
const viscMat = fatMaterial(VISC);
const viscCutMat = clip(fatMaterial(VISC));
const ghostMat = fresnelMaterial({ color: '#58a6ff', base: 0.08, rim: 0.95, power: 1.8 });

// ---- post processing --------------------------------------------------------------------
const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: MOBILE ? 2 : 4, stencilBuffer: true });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
if (!MOBILE) {
  try {
    gtao = new GTAOPass(scene, camera, 4, 4);
    gtao.updateGtaoMaterial({ radius: 0.22, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: 16 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
    gtao.blendIntensity = 0.75;
    composer.addPass(gtao);
  } catch (err) {
    console.warn('GTAO unavailable', err);
  }
}
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.2, 0.6, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function fitDistance() {
  const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const needH = 2.45, needW = state.labels ? (MOBILE ? 1.6 : 1.95) : 1.15;
  return Math.max(needH / 2 / tv, needW / 2 / (tv * (w / h)));
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// ---- body ---------------------------------------------------------------------------------
let model = null;
let skinGeo, leanGeo, ghostGeo;
let skinMesh, leanMesh, ghostMesh, blob;
const cut = {};
const disp = {}; // arrays currently shown (bound to the geometry attributes)
let info = null; // segment numbers currently shown (interpolated while animating)
let ghostInfo = null;
let tween = null;
let navelIdx = 0, backIdx = 0;
const shapes = new Map();

function shapeAt(i, emph = state.emph) {
  const k = i + '|' + emph;
  if (!shapes.has(k)) {
    const p = emphasize(model, i, emph);
    const sh = model.shape(p);
    sh.info = p;
    sh.visc = viscPlacement(sh, p);
    shapes.set(k, sh);
  }
  return shapes.get(k);
}

const FIELDS = ['skinP', 'skinN', 'leanP', 'leanN', 'coarse', 'leanCoarse'];

function makeGeometry(withColor) {
  const n = model.nFine;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  if (withColor) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('fiber', fiberAttr);
  g.setAttribute('shorts', shortsAttr);
  g.setIndex(indexAttr);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.3);
  return g;
}
let indexAttr, fiberAttr, shortsAttr;

function showShape(sh) {
  for (const f of FIELDS) disp[f].set(sh[f]);
  info = { ...sh.info };
  disp.visc = { ...sh.visc };
  touchGeometry();
}

function touchGeometry() {
  skinGeo.attributes.position.needsUpdate = true;
  skinGeo.attributes.normal.needsUpdate = true;
  leanGeo.attributes.position.needsUpdate = true;
  leanGeo.attributes.normal.needsUpdate = true;
}

function snapshot() {
  const s = { info: { ...info }, visc: { ...disp.visc } };
  for (const f of FIELDS) s[f] = disp[f].slice();
  return s;
}

function animateTo(sh, dur) {
  tween = { from: snapshot(), to: sh, t0: performance.now(), dur };
}

function setGhost() {
  const sh = shapeAt(state.baseIdx);
  ghostGeo.attributes.position.array.set(sh.skinP);
  ghostGeo.attributes.normal.array.set(sh.skinN);
  ghostGeo.attributes.position.needsUpdate = true;
  ghostGeo.attributes.normal.needsUpdate = true;
  ghostInfo = sh.info;
}

// ---- colours -----------------------------------------------------------------------------------
function groupColors() {
  if (state.view === 'fat') return [...info.fatShare.map(fatColor), HEAD_NEUTRAL];
  if (state.view === 'compare' && state.changeMap && ghostInfo) {
    return [...info.fatKg.map((f, i) => changeColor(((f - ghostInfo.fatKg[i]) / ghostInfo.fatKg[i]) * 100)), SKIN_TONE];
  }
  return null;
}

function updateColors() {
  const col = skinGeo.attributes.color.array;
  const cs = groupColors();
  if (!cs) {
    for (let i = 0; i < col.length; i += 3) { col[i] = SKIN_TONE.r; col[i + 1] = SKIN_TONE.g; col[i + 2] = SKIN_TONE.b; }
  } else {
    const w = model.fineSeg;
    const n = model.nFine;
    for (let i = 0; i < n; i++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < 6; k++) { const a = w[i * 6 + k]; r += a * cs[k].r; g += a * cs[k].g; b += a * cs[k].b; }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
    }
  }
  skinGeo.attributes.color.needsUpdate = true;
}

// ---- visceral fat ---------------------------------------------------------------------------------
function viscGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 5);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = 0.55 * Math.sin(5.1 * v.x + 2.3 * v.y) * Math.cos(4.2 * v.z + 1.3 * v.y)
      + 0.35 * Math.sin(9.3 * v.y + 3.1 * v.z) * Math.cos(7.7 * v.x)
      + 0.2 * Math.sin(14 * v.x + 11 * v.z);
    v.multiplyScalar(1 + 0.09 * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// visceral fat sits inside the abdominal cavity: an ellipsoid whose navel-level cross-section
// equals the measured area (a = 1.5 b), centred in the lean (muscle-wall) contour at that height
function viscPlacement(sh, inf) {
  const y = sh.coarse[navelIdx * 3 + 1];
  const loops = model.section(sh.leanCoarse, y);
  const loop = (loops.find((l) => Math.abs(l.cx) < 0.06) || loops[0])?.loop;
  let x0 = -0.15, x1 = 0.15, z0 = -0.1, z1 = 0.1;
  if (loop) {
    x0 = z0 = Infinity; x1 = z1 = -Infinity;
    for (const [x, z] of loop) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  }
  let b = Math.sqrt(Math.max(1, inf.vfa) / (1.5 * Math.PI)) / 100;
  let a = 1.5 * b;
  const k = Math.min(1, ((z1 - z0) / 2 - 0.026) / b, ((x1 - x0) / 2 - 0.035) / a);
  a *= k; b *= k;
  const room = (z1 - z0) / 2 - 0.026 - b;
  const c = Math.min(0.1, Math.max(0.06, (inf.viscL / 1000) / ((4 / 3) * Math.PI * a * b)));
  return { a, b, c, y: y + 0.01, z: (z0 + z1) / 2 + room * 0.35 };
}

function placeBlob() {
  const p = disp.visc;
  const k = Math.max(0.0001, info.vfaKnown);
  blob.position.set(0, p.y, p.z);
  blob.scale.set(p.a * k, p.c * k, p.b * k);
}

// ---- cutaway (stencil-capped cross-sections) ----------------------------------------------------
function buildCut() {
  const capGeo = new THREE.PlaneGeometry(4, 4);
  const layer = (geo, parent, order, capMat) => {
    const [bm, fm] = stencilPair(clipPlane);
    const b = new THREE.Mesh(geo, bm), f = new THREE.Mesh(geo, fm);
    b.renderOrder = f.renderOrder = order;
    b.frustumCulled = f.frustumCulled = false;
    parent.add(b, f);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.renderOrder = order + 0.5;
    cap.frustumCulled = false;
    scene.add(cap);
    return { b, f, cap };
  };
  cut.group = new THREE.Group();
  scene.add(cut.group);
  cut.caps = { fat: capMaterial('fat', 0), muscle: capMaterial('muscle', 1), hollow: capMaterial('hollow', 1), visc: capMaterial('visc', 2) };
  cut.skin = layer(skinGeo, cut.group, 1, cut.caps.fat);
  cut.lean = layer(leanGeo, cut.group, 3, cut.caps.muscle);
  cut.visc = layer(blob.geometry, blob, 5, cut.caps.visc);
}

const tmpV = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);
function updateClip() {
  if (state.tmode === 'cut') {
    tmpV.copy(camera.position).sub(controls.target).setY(0);
    if (tmpV.lengthSq() < 1e-6) tmpV.set(0, 0, 1);
    tmpV.normalize();
    clipPlane.normal.set(-tmpV.x, 0, -tmpV.z);
    clipPlane.constant = tmpV.x * controls.target.x + tmpV.z * controls.target.z + state.cutDepth;
  } else {
    clipPlane.normal.set(0, -1, 0);
    clipPlane.constant = state.sliceY;
  }
  const p = clipPlane.projectPoint(controls.target, tmpV);
  for (const k of ['skin', 'lean', 'visc']) {
    cut[k].cap.position.copy(p);
    cut[k].cap.quaternion.setFromUnitVectors(Z, clipPlane.normal);
  }
  sliceRing.position.y = state.sliceY;
}

// ---- view state -----------------------------------------------------------------------------------
const isCut = () => state.view === 'tissue' && state.tmode !== 'xray';

function applyView() {
  const v = state.view;
  const tissue = v === 'tissue';
  const cutOn = isCut();
  const L = state.layers;

  skinMesh.visible = !tissue || L.fat;
  skinMesh.material = tissue ? (cutOn ? skinCutMat : fatXrayMat) : skinMat;
  skinMesh.renderOrder = tissue ? (cutOn ? 8 : 10) : 0;
  skinMesh.castShadow = !tissue;
  skinMat.userData.uniforms.uShorts.value = (v === 'body' || v === 'compare') && state.shorts ? 1 : 0;

  leanMesh.visible = tissue && L.muscle;
  leanMesh.material = cutOn ? muscleCutMat : muscleMat;
  leanMesh.renderOrder = cutOn ? 8 : 2;
  leanMesh.castShadow = tissue && !cutOn;

  const viscOn = tissue && L.visc && info.vfaKnown > 0.02;
  blob.visible = viscOn;
  blob.material = cutOn ? viscCutMat : viscMat;
  blob.renderOrder = cutOn ? 8 : 3;

  cut.group.visible = cutOn;
  const showFatCap = cutOn && L.fat;
  cut.skin.b.visible = cut.skin.f.visible = cut.skin.cap.visible = showFatCap;
  const showLeanCap = cutOn && (L.muscle || L.fat);
  cut.lean.b.visible = cut.lean.f.visible = cut.lean.cap.visible = showLeanCap;
  cut.lean.cap.material = L.muscle ? cut.caps.muscle : cut.caps.hollow;
  cut.visc.b.visible = cut.visc.f.visible = cut.visc.cap.visible = cutOn && viscOn;
  sliceRing.visible = tissue && state.tmode === 'slice';

  ghostMesh.visible = v === 'compare';
  if (gtao) gtao.enabled = v === 'body' || v === 'fat';
  bloom.strength = tissue ? 0.28 : 0.2;
  updateColors();
  updateCallouts();
}

function startScan() {
  scanT = 0;
  scan.visible = true;
}

// ---- state transitions --------------------------------------------------------------------
function setTest(i, dur = 950) {
  if (i === state.testIdx) return;
  state.testIdx = i;
  if (state.baseIdx === i) state.baseIdx = i === 0 ? TESTS.length - 1 : 0;
  setGhost();
  animateTo(shapeAt(i), dur);
  startScan();
  renderPanels();
}

function setView(v) {
  if (v === state.view) return;
  const prev = state.view;
  state.view = v;
  if (v === 'compare' && state.baseIdx === state.testIdx) state.baseIdx = state.testIdx === 0 ? TESTS.length - 1 : 0;
  setGhost();
  renderPanels();
  applyView();
  startScan();
  if (v === 'tissue' && state.tmode === 'slice') flySlice();
  else if (prev === 'tissue' && state.tmode === 'slice') flyTo('front');
}

function setBase(i) {
  state.baseIdx = i;
  setGhost();
  renderPanels();
  applyView();
}

function setTissueMode(m) {
  const prev = state.tmode;
  state.tmode = m;
  renderPanels();
  applyView();
  if (m === 'slice') flySlice();
  else if (prev === 'slice') flyTo('front');
}

// ---- callouts -----------------------------------------------------------------------------------
const calloutRoot = $('callouts');
const leaders = $('leaders');
const callouts = SEGMENTS.map(() => {
  const el = document.createElement('div');
  el.className = 'callout';
  calloutRoot.appendChild(el);
  return el;
});

function updateCallouts() {
  if (!info) return;
  const L = t();
  const kg = L.units.kg;
  SEGMENTS.forEach((g, i) => {
    const el = callouts[i];
    if (state.view === 'compare' && ghostInfo) {
      const df = info.fatKg[i] - ghostInfo.fatKg[i];
      const dl = info.leanKg[i] - ghostInfo.leanKg[i];
      const pct = (df / ghostInfo.fatKg[i]) * 100;
      const cls = (x) => (x < -0.005 ? 'neg' : x > 0.005 ? 'pos' : '');
      const sgn = (x, d = 1, suf = '') => `<bdi dir="ltr">${x > 0 ? '+' : x < 0 ? '−' : ''}${num(Math.abs(x), d)}${suf}</bdi>`;
      el.innerHTML = `<div class="cn">${L.seg[g.id]}</div>
        <div class="cv ${cls(df)}">${L.fat} <b>${sgn(df)} ${kg}</b><span class="share">${sgn(pct, 0, L.units['%'])}</span></div>
        <div class="cv ${cls(dl)} xl">${L.lean} <b>${sgn(dl)} ${kg}</b></div>`;
    } else {
      const f = info.fatKg[i], l = info.leanKg[i];
      el.innerHTML = `<div class="cn">${L.seg[g.id]}</div>
        <div class="cv fat">${L.fat} <b>${num(f)} ${kg}</b><span class="share">${num((f / (f + l)) * 100, 0)}${L.units['%']}</span></div>
        <div class="cv lean xl">${L.lean} <b>${num(l)} ${kg}</b></div>`;
    }
  });
}

const tmp = new THREE.Vector3();
function placeCallouts() {
  const show = state.labels && !(state.view === 'tissue' && state.tmode === 'slice') && !!model;
  calloutRoot.style.display = show ? '' : 'none';
  leaders.style.display = show ? '' : 'none';
  if (!show) return;
  const W = stage.clientWidth, H = stage.clientHeight;
  const dist = camera.position.distanceTo(controls.target);
  const pxPerM = H / (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const cx = W / 2;
  const A = model.h.anchors;
  const items = A.map((vi, i) => {
    tmp.set(disp.coarse[vi * 3], disp.coarse[vi * 3 + 1], disp.coarse[vi * 3 + 2]).project(camera);
    const sx = (tmp.x * 0.5 + 0.5) * W, sy = (-tmp.y * 0.5 + 0.5) * H;
    return { i, sx, sy, side: sx >= cx ? 1 : -1, ly: sy };
  });
  const rowH = MOBILE ? 58 : 78;
  for (const side of [-1, 1]) {
    const col = items.filter((it) => it.side === side).sort((a, b) => a.ly - b.ly);
    for (let k = 1; k < col.length; k++) col[k].ly = Math.max(col[k].ly, col[k - 1].ly + rowH);
  }
  let svg = '';
  for (const it of items) {
    const el = callouts[it.i];
    const w = el.offsetWidth || 120;
    const gap = Math.max(10, 0.5 * pxPerM + (MOBILE ? 6 : 18));
    let lx = it.side > 0 ? cx + gap : cx - gap - w;
    lx = Math.min(Math.max(6, lx), W - w - 6);
    el.style.left = lx + 'px';
    el.style.top = it.ly + 'px';
    const ex = it.side > 0 ? lx : lx + w;
    svg += `<path d="M${ex},${it.ly} L${it.sx},${it.sy}" stroke="rgba(255,255,255,.38)" stroke-width="1" fill="none"/>
            <circle cx="${it.sx}" cy="${it.sy}" r="3" fill="#4fd1c5" stroke="#06201d" stroke-width="1"/>`;
  }
  leaders.innerHTML = svg;
}

// ---- panels / events ------------------------------------------------------------------------------
const sections = new Map();
function sectionFor(i) {
  if (!model) return null;
  if (sections.has(i)) return sections.get(i);
  const sh = shapeAt(i, 1);
  const y = sh.coarse[navelIdx * 3 + 1];
  const pick = (loops) => (loops.find((l) => Math.abs(l.cx) < 0.06) || loops[0])?.loop;
  const skin = pick(model.section(sh.coarse, y));
  const lean = pick(model.section(sh.leanCoarse, y));
  if (!skin) return null;
  let z0 = Infinity, z1 = -Infinity, x0 = Infinity, x1 = -Infinity;
  for (const p of skin) { z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
  const r = { skin, lean, zc: (z0 + z1) / 2, viscZ: sh.visc.z, width: x1 - x0, depth: z1 - z0 };
  sections.set(i, r);
  return r;
}

function renderPanels() {
  $('left').innerHTML = UI.leftHTML(state);
  $('right').innerHTML = UI.rightHTML(state, { section: sectionFor(state.testIdx) });
  $('viewchips').innerHTML = UI.chipsHTML(state);
  $('timeline').innerHTML = UI.timelineHTML(state);
  $('mbar').innerHTML = UI.brandHTML();
  $('mtabs').innerHTML = UI.mobileTabsHTML(state);
  $('app').dataset.mtab = state.mtab;
  const lg = UI.legendHTML(state, CHANGE_STOPS);
  $('legend').innerHTML = lg;
  $('legend').style.display = lg ? 'block' : 'none';
  controls.autoRotate = state.rotate;
  updateCutLabel();
  updateCallouts();
}

function updateCutLabel() {
  const el = $('cut-val');
  if (!el) return;
  const L = t();
  if (state.tmode === 'slice') {
    const ny = disp.coarse ? disp.coarse[navelIdx * 3 + 1] : 1;
    el.textContent = Math.abs(state.sliceY - ny) < 0.012 ? L.atNavel : `${num(state.sliceY * 100, 0)} ${L.cm}`;
  } else {
    el.innerHTML = `<bdi dir="ltr">${state.cutDepth >= 0 ? '+' : '−'}${num(Math.abs(state.cutDepth * 100), 1)}</bdi> ${L.cm}`;
  }
}

let camTween = null;
function flyTo(name, opts = {}) {
  const az = { front: 0, side: Math.PI / 2, back: Math.PI, three: Math.PI / 5 }[name];
  const off = camera.position.clone().sub(controls.target);
  const sph = new THREE.Spherical().setFromVector3(off);
  let d = (az ?? sph.theta) - sph.theta;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  camTween = {
    t0: performance.now(), dur: 800, th0: sph.theta, d, ph0: sph.phi, ph1: opts.phi ?? 1.42,
    r0: sph.radius, r1: opts.r ?? fitDistance(), ty0: controls.target.y, ty1: opts.ty ?? BODY_Y,
  };
}
function flySlice() {
  flyTo(null, { phi: 0.72, r: MOBILE ? 3.2 : 2.9, ty: state.sliceY - 0.1 });
}

let playTimer = null;
function stopPlay() {
  state.playing = false;
  clearTimeout(playTimer);
  $('timeline').innerHTML = UI.timelineHTML(state);
}
function playStep() {
  if (!state.playing) return;
  const next = state.testIdx + 1;
  if (next >= TESTS.length) { stopPlay(); return; }
  setTest(next, 1700);
  playTimer = setTimeout(playStep, 2900);
}
function togglePlay() {
  if (state.playing) { stopPlay(); return; }
  state.playing = true;
  if (state.testIdx >= TESTS.length - 1) setTest(0, 600);
  $('timeline').innerHTML = UI.timelineHTML(state);
  playTimer = setTimeout(playStep, 1700);
}

function screenshot() {
  composer.render();
  canvas.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `body-${TESTS[state.testIdx].id}-${state.view}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}

let emphTimer = null;
function onEmph() {
  clearTimeout(emphTimer);
  emphTimer = setTimeout(() => {
    for (const k of [...shapes.keys()]) if (!k.endsWith('|1')) shapes.delete(k);
    animateTo(shapeAt(state.testIdx), 260);
    setGhost();
    applyView();
  }, 120);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-test],[data-view],[data-base],[data-toggle],[data-cam],[data-act],[data-tmode],[data-layer],[data-mtab]');
  if (!el) return;
  const d = el.dataset;
  if (d.test != null) { if (state.playing) stopPlay(); setTest(+d.test); }
  else if (d.view) setView(d.view);
  else if (d.base != null) setBase(+d.base);
  else if (d.tmode) setTissueMode(d.tmode);
  else if (d.layer) { state.layers[d.layer] = !state.layers[d.layer]; renderPanels(); applyView(); }
  else if (d.mtab) { state.mtab = d.mtab; renderPanels(); }
  else if (d.toggle) {
    state[d.toggle] = !state[d.toggle];
    renderPanels();
    applyView();
    if (d.toggle === 'labels') flyTo(null, { phi: new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)).phi });
  }
  else if (d.cam) flyTo(d.cam);
  else if (d.act === 'shot') screenshot();
  else if (d.act === 'play') togglePlay();
  else if (d.act === 'lang') { setLang(lang === 'fa' ? 'en' : 'fa'); $('loading-text').textContent = t().loading; renderPanels(); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'emph') {
    state.emph = +e.target.value;
    $('emph-val').textContent = num(state.emph) + '×';
    onEmph();
  } else if (e.target.id === 'cut') {
    if (state.tmode === 'slice') {
      state.sliceY = +e.target.value;
      controls.target.y = state.sliceY - 0.1;
    } else state.cutDepth = +e.target.value;
    updateCutLabel();
  }
});
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key >= '1' && e.key <= '4') setView(UI.VIEWS[+e.key - 1]);
  if (e.key === 'ArrowRight') setTest(Math.min(TESTS.length - 1, state.testIdx + 1));
  if (e.key === 'ArrowLeft') setTest(Math.max(0, state.testIdx - 1));
});

// ---- loop -------------------------------------------------------------------------------------------
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (tween) {
    const k = Math.min(1, (now - tween.t0) / tween.dur);
    const e = ease(k);
    const { from, to } = tween;
    for (const f of FIELDS) {
      const a = from[f], b = to[f], o = disp[f];
      for (let i = 0; i < o.length; i++) o[i] = a[i] + (b[i] - a[i]) * e;
    }
    info = { ...to.info, ...lerpInfo(from.info, to.info, e) };
    for (const q of ['a', 'b', 'c', 'y', 'z']) disp.visc[q] = from.visc[q] + (to.visc[q] - from.visc[q]) * e;
    touchGeometry();
    if (state.view === 'fat' || state.view === 'compare') updateColors();
    updateCallouts();
    if (k >= 1) { tween = null; applyView(); }
  }
  if (camTween) {
    const k = Math.min(1, (now - camTween.t0) / camTween.dur);
    const e = ease(k);
    controls.target.y = camTween.ty0 + (camTween.ty1 - camTween.ty0) * e;
    const sph = new THREE.Spherical(camTween.r0 + (camTween.r1 - camTween.r0) * e, camTween.ph0 + (camTween.ph1 - camTween.ph0) * e, camTween.th0 + camTween.d * e);
    camera.position.setFromSpherical(sph).add(controls.target);
    if (k >= 1) camTween = null;
  }
  if (model) {
    placeBlob();
    if (isCut()) updateClip();
  }

  if (scanT >= 0) {
    scanT += dt / 1.15;
    const e = ease(Math.min(1, scanT));
    scan.position.y = 0.01 + e * 1.85;
    scan.material.opacity = 0.9 * Math.sin(Math.min(1, scanT) * Math.PI);
    if (scanT >= 1) { scanT = -1; scan.visible = false; }
  }

  controls.update();
  composer.render();
  placeCallouts();
}

// ---- boot -------------------------------------------------------------------------------------------
async function boot() {
  $('loading-text').textContent = t().loading;
  renderPanels();
  resize();
  camera.position.set(0, 1.15, fitDistance());
  try {
    const data = await loadBodyData(bodyUrl);
    await new Promise((r) => setTimeout(r, 30));
    model = new BodyModel(data, { heightM: 1.83 });
  } catch (err) {
    $('loading-text').textContent = 'Could not load the body model: ' + err.message;
    throw err;
  }

  // landmarks
  navelIdx = model.h.navel;
  {
    const B = model.base, ny = B[navelIdx * 3 + 1];
    let bz = Infinity;
    for (let i = 0; i < model.NB; i++) {
      if (Math.abs(B[i * 3]) < 0.012 && Math.abs(B[i * 3 + 1] - ny) < 0.02 && B[i * 3 + 2] < bz) { bz = B[i * 3 + 2]; backIdx = i; }
    }
  }

  indexAttr = new THREE.BufferAttribute(model.sub.index, 1);
  fiberAttr = new THREE.BufferAttribute(model.fineFiber, 3);
  shortsAttr = new THREE.BufferAttribute(model.fineShorts, 1);
  skinGeo = makeGeometry(true);
  leanGeo = makeGeometry(false);
  ghostGeo = makeGeometry(false);
  disp.skinP = skinGeo.attributes.position.array;
  disp.skinN = skinGeo.attributes.normal.array;
  disp.leanP = leanGeo.attributes.position.array;
  disp.leanN = leanGeo.attributes.normal.array;
  disp.coarse = new Float32Array(model.NV * 3);
  disp.leanCoarse = new Float32Array(model.NV * 3);

  skinMesh = new THREE.Mesh(skinGeo, skinMat);
  skinMesh.castShadow = skinMesh.receiveShadow = true;
  leanMesh = new THREE.Mesh(leanGeo, muscleMat);
  ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
  ghostMesh.renderOrder = 12;
  blob = new THREE.Mesh(viscGeometry(), viscMat);
  for (const m of [skinMesh, leanMesh, ghostMesh, blob]) m.frustumCulled = false;
  scene.add(skinMesh, leanMesh, ghostMesh, blob);
  buildCut();

  TESTS.forEach((_, i) => solveTest(model, i));
  showShape(shapeAt(state.testIdx));
  state.sliceY = +(disp.coarse[navelIdx * 3 + 1]).toFixed(3);
  state.cutDepth = Math.round(disp.visc.z * 200) / 200; // cut through the visceral fat by default
  setGhost();
  applyView();
  renderPanels();
  startScan();
  requestAnimationFrame(frame);
  $('loading').classList.add('done');
}
boot();

// handy hooks for automated checks / the console
window.__app = {
  state, setTest, setView, setBase, setTissueMode, flyTo, camera, controls, scene, renderer,
  get model() { return model; },
  setLang: (l) => { setLang(l); renderPanels(); },
  set: (patch) => { Object.assign(state, patch); renderPanels(); applyView(); },
};
