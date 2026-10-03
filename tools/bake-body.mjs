// Bakes the MakeHuman (CC0) base mesh + the morph targets we drive at runtime into one
// compact, gzipped binary: src/assets/body.mhb
//
//   node tools/bake-body.mjs          (downloads missing assets into tools/mh-cache first)
//
// Contents: coarse quad mesh (body only), base shape (young male, ethnic mix, height and
// proportions pre-applied), 8 muscle×weight macro targets + belly target, per-vertex
// segment weights from the MakeHuman rig, muscle fibre directions, a shorts mask and a
// few joint centres. Units are metres; y up; the figure faces +z; person's LEFT is +x.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, 'mh-cache');
const OUT = path.join(here, '..', 'src', 'assets', 'body.mhb');
const RAW = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/';

const MACRO = 'targets/macrodetails/';
const FILES = {
  'base.obj': '3dobjs/base.obj',
  'default.mhskel': 'rigs/default.mhskel',
  'default_weights.mhw': 'rigs/default_weights.mhw',
  'caucasian-male-young.target': MACRO + 'caucasian-male-young.target',
  'asian-male-young.target': MACRO + 'asian-male-young.target',
  'african-male-young.target': MACRO + 'african-male-young.target',
  'male-young-averagemuscle-averageweight-maxheight.target': MACRO + 'height/male-young-averagemuscle-averageweight-maxheight.target',
  'male-young-averagemuscle-averageweight-idealproportions.target': MACRO + 'proportions/male-young-averagemuscle-averageweight-idealproportions.target',
  'stomach-pregnant-incr.target': 'targets/stomach/stomach-pregnant-incr.target',
  'stomach-navel-in.target': 'targets/stomach/stomach-navel-in.target',
};
const MU = ['minmuscle', 'averagemuscle', 'maxmuscle'];
const WE = ['minweight', 'averageweight', 'maxweight'];
const UNIVERSAL = [];
for (const m of MU) for (const w of WE) {
  if (m === 'averagemuscle' && w === 'averageweight') continue;
  const f = `universal-male-young-${m}-${w}.target`;
  FILES[f] = MACRO + f;
  UNIVERSAL.push({ m, w, f });
}

async function ensure() {
  fs.mkdirSync(CACHE, { recursive: true });
  for (const [name, rel] of Object.entries(FILES)) {
    const p = path.join(CACHE, name);
    if (fs.existsSync(p)) continue;
    process.stdout.write(`download ${name}\n`);
    const r = await fetch(RAW + rel);
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  }
}

const read = (n) => fs.readFileSync(path.join(CACHE, n), 'utf8');
const DM = 0.1; // MakeHuman units are decimetres

function parseTarget(name) {
  const out = new Map();
  for (const l of read(name).split('\n')) {
    if (!l || l[0] === '#') continue;
    const [i, x, y, z] = l.trim().split(/\s+/).map(Number);
    if (Number.isFinite(i)) out.set(i, [x * DM, y * DM, z * DM]);
  }
  return out;
}

await ensure();

// ---- mesh -----------------------------------------------------------------------------
const V = [];
const quads = [];
{
  let g = '';
  for (const l of read('base.obj').split('\n')) {
    if (l.startsWith('v ')) { const a = l.split(/\s+/); V.push([+a[1] * DM, +a[2] * DM, +a[3] * DM]); }
    else if (l.startsWith('g ')) g = l.slice(2).trim();
    else if (l.startsWith('f ') && g === 'body') quads.push(l.split(/\s+/).slice(1).filter(Boolean).map((s) => parseInt(s, 10) - 1));
  }
}
const NB = 13380; // body vertices are 0..13379 in hm08
if (Math.max(...quads.flat()) !== NB - 1) throw new Error('unexpected body vertex range');

const skel = JSON.parse(read('default.mhskel'));
const rigW = JSON.parse(read('default_weights.mhw')).weights;

// joints we need at runtime (helper vertices that follow the targets)
const JOINTS = {
  shoulderL: 'upperarm01.L____head', shoulderR: 'upperarm01.R____head',
  elbowL: 'lowerarm01.L____head', elbowR: 'lowerarm01.R____head',
  wristL: 'wrist.L____head', wristR: 'wrist.R____head',
  hipL: 'upperleg01.L____head', hipR: 'upperleg01.R____head',
  kneeL: 'lowerleg01.L____head', kneeR: 'lowerleg01.R____head',
  neck: 'neck01____head', spine: 'spine03____head', pelvis: 'spine05____head',
};
const extra = [];
const jointIdx = {};
for (const [k, j] of Object.entries(JOINTS)) {
  const list = skel.joints[j];
  if (!list) throw new Error('joint missing ' + j);
  jointIdx[k] = list.map((vi) => { extra.push(vi); return NB + extra.length - 1; });
}
const NV = NB + extra.length;
const srcIndex = (i) => (i < NB ? i : extra[i - NB]);

// ---- base shape: young male, ethnic mix, height, proportions ---------------------------
const base = new Float32Array(NV * 3);
for (let i = 0; i < NV; i++) { const v = V[srcIndex(i)]; base[i * 3] = v[0]; base[i * 3 + 1] = v[1]; base[i * 3 + 2] = v[2]; }
function addTarget(arr, t, k) {
  for (let i = 0; i < NV; i++) {
    const d = t.get(srcIndex(i));
    if (!d) continue;
    arr[i * 3] += d[0] * k; arr[i * 3 + 1] += d[1] * k; arr[i * 3 + 2] += d[2] * k;
  }
}
addTarget(base, parseTarget('caucasian-male-young.target'), 0.7);
addTarget(base, parseTarget('asian-male-young.target'), 0.15);
addTarget(base, parseTarget('african-male-young.target'), 0.15);
addTarget(base, parseTarget('male-young-averagemuscle-averageweight-maxheight.target'), 0.12); // ~175 → ~183 cm
addTarget(base, parseTarget('male-young-averagemuscle-averageweight-idealproportions.target'), 0.5);

const targets = [...UNIVERSAL.map((u) => ({ name: `${u.m}-${u.w}`, file: u.f })), { name: 'belly', file: 'stomach-pregnant-incr.target' }];
const tData = targets.map((t) => {
  const arr = new Float32Array(NV * 3);
  addTarget(arr, parseTarget(t.file), 1);
  return arr;
});

const P = (i) => [base[i * 3], base[i * 3 + 1], base[i * 3 + 2]];
const centroid = (list) => {
  const c = [0, 0, 0];
  for (const i of list) { const p = P(i); c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return c.map((x) => x / list.length);
};
const jointPos = (name) => centroid(skel.joints[name].map((vi) => (vi < NB ? vi : NB + extra.indexOf(vi))));

// ---- segment weights from the rig ------------------------------------------------------
// groups: 0 L arm, 1 R arm, 2 trunk, 3 L leg, 4 R leg, 5 head & neck (not driven by data)
const groupOf = (bone) => {
  const side = bone.endsWith('.L') ? 'L' : bone.endsWith('.R') ? 'R' : '';
  const b = bone.replace(/\.(L|R)$/, '');
  if (/^(upperarm|lowerarm|wrist|metacarpal|finger)/.test(b)) return side === 'L' ? [[0, 1]] : [[1, 1]];
  if (b === 'shoulder01') return side === 'L' ? [[0, 0.45], [2, 0.55]] : [[1, 0.45], [2, 0.55]];
  if (/^(upperleg|lowerleg|foot|toe)/.test(b)) return side === 'L' ? [[3, 1]] : [[4, 1]];
  if (/^(root|spine|pelvis|clavicle|breast)/.test(b)) return [[2, 1]];
  return [[5, 1]]; // head, neck, face
};
const G = 6;
const segW = new Float32Array(NB * G);
for (const [bone, list] of Object.entries(rigW)) {
  for (const [vi, w] of list) {
    if (vi >= NB) continue;
    for (const [g, k] of groupOf(bone)) segW[vi * G + g] += w * k;
  }
}
// arm "follow" factor for posing: everything from the upper arm down
const armFollow = new Float32Array(NB);
const foreFollow = new Float32Array(NB);
for (const [bone, list] of Object.entries(rigW)) {
  if (!/^(upperarm|lowerarm|wrist|metacarpal|finger)/.test(bone)) continue;
  const fore = !/^upperarm/.test(bone);
  for (const [vi, w] of list) if (vi < NB) { armFollow[vi] += w; if (fore) foreFollow[vi] += w; }
}
// neighbours for smoothing
const nbr = Array.from({ length: NB }, () => new Set());
for (const q of quads) for (let k = 0; k < 4; k++) { nbr[q[k]].add(q[(k + 1) % 4]); nbr[q[k]].add(q[(k + 3) % 4]); }
function smoothField(f, dim, iters, lam = 0.5) {
  const tmp = new Float32Array(f.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < NB; i++) {
      const n = nbr[i];
      for (let d = 0; d < dim; d++) {
        let s = 0;
        for (const j of n) s += f[j * dim + d];
        tmp[i * dim + d] = f[i * dim + d] * (1 - lam) + (s / n.size) * lam;
      }
    }
    f.set(tmp);
  }
}
for (let i = 0; i < NB; i++) {
  let s = 0;
  for (let g = 0; g < G; g++) s += segW[i * G + g];
  if (s < 1e-6) { segW[i * G + 2] = 1; s = 1; }
  for (let g = 0; g < G; g++) segW[i * G + g] /= s;
  armFollow[i] = Math.min(1, armFollow[i]);
  foreFollow[i] = Math.min(1, foreFollow[i]);
}
smoothField(segW, G, 6);
smoothField(armFollow, 1, 3);
smoothField(foreFollow, 1, 3);

// ---- fibre directions (for the muscle shader) ------------------------------------------
const boneDir = {};
for (const [name, b] of Object.entries(skel.bones)) {
  const h = jointPos(b.head), t = jointPos(b.tail);
  const d = [t[0] - h[0], t[1] - h[1], t[2] - h[2]];
  const l = Math.hypot(...d) || 1;
  boneDir[name] = d.map((x) => x / l);
}
const fiber = new Float32Array(NB * 3);
const shL = jointPos('upperarm01.L____head'), shR = jointPos('upperarm01.R____head');
for (const [bone, list] of Object.entries(rigW)) {
  const d = boneDir[bone];
  if (!d) continue;
  // make every direction point "down the chain" (towards -y, or outwards for the arms)
  const s = d[1] > 0 ? -1 : 1;
  for (const [vi, w] of list) {
    if (vi >= NB) continue;
    fiber[vi * 3] += d[0] * w * s; fiber[vi * 3 + 1] += d[1] * w * s; fiber[vi * 3 + 2] += d[2] * w * s;
  }
}
for (let i = 0; i < NB; i++) {
  const p = P(i);
  const trunk = segW[i * G + 2];
  if (trunk > 0.5) {
    // trunk: vertical (abdominals, back) except the pectorals, which run towards the shoulder
    let f = [0, -1, 0];
    const sh = p[0] >= 0 ? shL : shR;
    const chest = p[2] > 0.02 && p[1] > sh[1] - 0.2 && p[1] < sh[1] + 0.02 && Math.abs(p[0]) > 0.03;
    if (chest) { f = [sh[0] - p[0], (sh[1] - p[1]) * 0.6, 0]; }
    else if (Math.abs(p[0]) > 0.09) { f = [p[0] > 0 ? 0.45 : -0.45, -1, 0.25]; } // obliques / lats
    const l = Math.hypot(...f);
    const k = Math.min(1, (trunk - 0.5) * 3);
    for (let d = 0; d < 3; d++) fiber[i * 3 + d] = fiber[i * 3 + d] * (1 - k) + (f[d] / l) * k;
  }
}
smoothField(fiber, 3, 2);
for (let i = 0; i < NB; i++) {
  const l = Math.hypot(fiber[i * 3], fiber[i * 3 + 1], fiber[i * 3 + 2]) || 1;
  for (let d = 0; d < 3; d++) fiber[i * 3 + d] /= l;
}

// ---- landmarks --------------------------------------------------------------------------
const navelT = parseTarget('stomach-navel-in.target');
let navel = -1, best = -1;
for (const [i, d] of navelT) { if (i < NB) { const m = Math.hypot(...d); if (m > best) { best = m; navel = i; } } }
const navelP = P(navel);
let crotchY = 1e9;
for (let i = 0; i < NB; i++) {
  const p = P(i);
  if (Math.abs(p[0]) < 0.012 && segW[i * G + 2] > 0.3 && p[1] < navelP[1]) crotchY = Math.min(crotchY, p[1]);
}

// shorts mask: low-rise fitted shorts, mid-thigh length
const shorts = new Float32Array(NB);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (let i = 0; i < NB; i++) {
  const p = P(i);
  const body = segW[i * G + 2] + segW[i * G + 3] + segW[i * G + 4];
  const top = navelP[1] - 0.075 + (p[2] < 0 ? 0.03 : 0);
  const bottom = crotchY - 0.13;
  shorts[i] = ss(0.4, 0.6, body) * (1 - ss(top - 0.004, top + 0.004, p[1])) * ss(bottom - 0.004, bottom + 0.004, p[1]);
}

// callout anchors: a front-facing vertex on each segment
function pickFront(seg, y, xSign, minW = 0.9) {
  let bi = -1, bz = -1e9;
  for (let i = 0; i < NB; i++) {
    const p = P(i);
    if (segW[i * G + seg] < minW || Math.abs(p[1] - y) > 0.012 || Math.sign(p[0]) !== xSign) continue;
    if (p[2] > bz) { bz = p[2]; bi = i; }
  }
  return bi;
}
const el = jointPos('lowerarm01.L____head'), wr = jointPos('wrist.L____head');
const kn = jointPos('lowerleg01.L____head'), hp = jointPos('upperleg01.L____head');
const anchors = [
  pickFront(0, el[1] + (wr[1] - el[1]) * 0.35, 1),
  pickFront(1, el[1] + (wr[1] - el[1]) * 0.35, -1),
  pickFront(2, navelP[1] + 0.13, 1, 0.95),
  pickFront(3, hp[1] + (kn[1] - hp[1]) * 0.55, 1),
  pickFront(4, hp[1] + (kn[1] - hp[1]) * 0.55, -1),
];

// ---- pack ---------------------------------------------------------------------------------
const sections = [];
const add = (name, arr) => sections.push({ name, arr });
add('base', base);
const tScales = [];
tData.forEach((arr, k) => {
  let mx = 0;
  for (const v of arr) mx = Math.max(mx, Math.abs(v));
  const sc = mx / 32767 || 1;
  tScales.push(sc);
  const q = new Int16Array(arr.length);
  for (let i = 0; i < arr.length; i++) q[i] = Math.round(arr[i] / sc);
  add('t' + k, q);
});
add('quads', new Uint16Array(quads.flat()));
add('segW', Uint8Array.from(segW, (x) => Math.round(x * 255)));
add('armFollow', Uint8Array.from(armFollow, (x) => Math.round(x * 255)));
add('foreFollow', Uint8Array.from(foreFollow, (x) => Math.round(x * 255)));
add('fiber', Int8Array.from(fiber, (x) => Math.round(x * 127)));
add('shorts', Uint8Array.from(shorts, (x) => Math.round(x * 255)));

const header = {
  version: 1,
  source: 'MakeHuman hm08 base mesh and targets (CC0 1.0), makehumancommunity.org',
  NB, NV, G, nQuads: quads.length,
  targets: targets.map((t, k) => ({ name: t.name, scale: tScales[k] })),
  joints: jointIdx,
  navel, crotchY, anchors,
  sections: [],
};
let off = 0;
for (const s of sections) {
  off = Math.ceil(off / 4) * 4;
  header.sections.push({ name: s.name, type: s.arr.constructor.name, offset: off, length: s.arr.length });
  off += s.arr.byteLength;
}
const hjson = Buffer.from(JSON.stringify(header));
const hlen = Math.ceil((hjson.length + 4) / 4) * 4;
const buf = Buffer.alloc(hlen + off);
buf.writeUInt32LE(hjson.length, 0);
hjson.copy(buf, 4);
for (let k = 0; k < sections.length; k++) {
  const s = sections[k];
  Buffer.from(s.arr.buffer, s.arr.byteOffset, s.arr.byteLength).copy(buf, hlen + header.sections[k].offset);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const gz = zlib.gzipSync(buf, { level: 9 });
fs.writeFileSync(OUT, gz);
console.log(`body.mhb: ${(buf.length / 1024).toFixed(0)} KB raw, ${(gz.length / 1024).toFixed(0)} KB gzipped`);
console.log('navel', navel, navelP.map((x) => x.toFixed(3)), 'crotchY', crotchY.toFixed(3), 'anchors', anchors);
let ymin = 1e9, ymax = -1e9;
for (let i = 0; i < NB; i++) { ymin = Math.min(ymin, base[i * 3 + 1]); ymax = Math.max(ymax, base[i * 3 + 1]); }
console.log('base height', (ymax - ymin).toFixed(3), 'm');
