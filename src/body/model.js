// Runtime body model built on the MakeHuman (CC0) base mesh baked by tools/bake-body.mjs.
//
// Shape pipeline (all on the 13k-vertex coarse cage, then one Catmull–Clark level):
//   base + Σ macro targets(weight, muscle per segment) + belly  → scale to height → pose arms
// The lean (fat-free) shell is the same surface pushed inward by a fat-thickness field whose
// distribution comes from MakeHuman's own weight targets and whose amount per segment is
// solved so the removed volume equals the measured segment fat.

const G = 6; // 0 L arm, 1 R arm, 2 trunk, 3 L leg, 4 R leg, 5 head & neck
const MU = ['minmuscle', 'averagemuscle', 'maxmuscle'];
const WE = ['minweight', 'averageweight', 'maxweight'];

// ---- loading -----------------------------------------------------------------------------
export async function loadBodyData(url) {
  const res = await fetch(url);
  let buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const ds = new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')));
    buf = new Uint8Array(await ds.arrayBuffer());
  }
  return parseBodyData(buf);
}

export function parseBodyData(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const hl = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + hl)));
  const start = Math.ceil((hl + 4) / 4) * 4;
  const T = { Float32Array, Int16Array, Uint16Array, Uint8Array, Int8Array };
  const sec = {};
  for (const s of header.sections) {
    const C = T[s.type];
    const bytes = buf.slice(start + s.offset, start + s.offset + s.length * C.BYTES_PER_ELEMENT);
    sec[s.name] = new C(bytes.buffer);
  }
  return { header, sec };
}

// ---- Catmull–Clark (one level) as a sparse stencil matrix ----------------------------------
function buildSubdivision(quads, nv) {
  const nf = quads.length / 4;
  const edgeMap = new Map();
  const ev = []; // edge -> [a, b]
  const ef = []; // edge -> [f0, f1]
  const faceEdges = new Int32Array(nf * 4);
  for (let f = 0; f < nf; f++) {
    for (let k = 0; k < 4; k++) {
      const a = quads[f * 4 + k], b = quads[f * 4 + ((k + 1) & 3)];
      const key = a < b ? a * nv + b : b * nv + a;
      let e = edgeMap.get(key);
      if (e === undefined) { e = ev.length; edgeMap.set(key, e); ev.push([a, b]); ef.push([f, -1]); }
      else ef[e][1] = f;
      faceEdges[f * 4 + k] = e;
    }
  }
  const ne = ev.length;
  const vFaces = Array.from({ length: nv }, () => []);
  const vEdges = Array.from({ length: nv }, () => []);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 4; k++) vFaces[quads[f * 4 + k]].push(f);
  for (let e = 0; e < ne; e++) { vEdges[ev[e][0]].push(e); vEdges[ev[e][1]].push(e); }

  const rows = [];
  const acc = new Map();
  const put = (i, w) => acc.set(i, (acc.get(i) || 0) + w);
  const flush = () => { rows.push([...acc]); acc.clear(); };
  const putFace = (f, w) => { for (let k = 0; k < 4; k++) put(quads[f * 4 + k], w * 0.25); };

  // vertex points
  for (let v = 0; v < nv; v++) {
    const n = vFaces[v].length;
    if (!n) { put(v, 1); flush(); continue; }
    for (const f of vFaces[v]) putFace(f, 1 / (n * n)); // F / n
    for (const e of vEdges[v]) { put(ev[e][0], 1 / (n * n)); put(ev[e][1], 1 / (n * n)); } // 2R / n
    put(v, (n - 3) / n);
    flush();
  }
  // edge points
  for (let e = 0; e < ne; e++) {
    const [a, b] = ev[e];
    const [f0, f1] = ef[e];
    if (f1 < 0) { put(a, 0.5); put(b, 0.5); }
    else { put(a, 0.25); put(b, 0.25); putFace(f0, 0.25); putFace(f1, 0.25); }
    flush();
  }
  // face points
  for (let f = 0; f < nf; f++) { putFace(f, 1); flush(); }

  let nnz = 0;
  for (const r of rows) nnz += r.length;
  const off = new Uint32Array(rows.length + 1);
  const idx = new Uint32Array(nnz);
  const wt = new Float32Array(nnz);
  let p = 0;
  rows.forEach((r, i) => {
    off[i] = p;
    for (const [j, w] of r) { idx[p] = j; wt[p] = w; p++; }
  });
  off[rows.length] = p;

  // fine quads -> triangles
  const tri = new Uint32Array(nf * 4 * 6);
  let t = 0;
  for (let f = 0; f < nf; f++) {
    const fp = nv + ne + f;
    for (let k = 0; k < 4; k++) {
      const v = quads[f * 4 + k];
      const eNext = nv + faceEdges[f * 4 + k];
      const ePrev = nv + faceEdges[f * 4 + ((k + 3) & 3)];
      tri[t++] = v; tri[t++] = eNext; tri[t++] = fp;
      tri[t++] = v; tri[t++] = fp; tri[t++] = ePrev;
    }
  }
  return { off, idx, wt, count: rows.length, index: tri };
}

function applyStencil(S, src, dim, dst) {
  const { off, idx, wt, count } = S;
  for (let i = 0; i < count; i++) {
    const a = off[i], b = off[i + 1];
    for (let d = 0; d < dim; d++) {
      let s = 0;
      for (let k = a; k < b; k++) s += wt[k] * src[idx[k] * dim + d];
      dst[i * dim + d] = s;
    }
  }
  return dst;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function rotMatrix([x, y, z], a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}

// ---- model -----------------------------------------------------------------------------------
export class BodyModel {
  constructor({ header, sec }, opts = {}) {
    this.h = header;
    this.heightM = opts.heightM ?? 1.83;
    this.armDrop = opts.armDrop ?? 0.36; // radians the A-pose arms are lowered by
    this.elbowFlex = opts.elbowFlex ?? 0.2; // remaining elbow flexion (radians)
    const NB = (this.NB = header.NB);
    const NV = (this.NV = header.NV);
    this.base = sec.base;
    this.targets = header.targets.map((t, k) => {
      const q = sec['t' + k];
      const f = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) f[i] = q[i] * t.scale;
      return { name: t.name, d: f };
    });
    this.tIdx = {};
    this.targets.forEach((t, k) => (this.tIdx[t.name] = k));
    this.quads = sec.quads;

    this.segW = new Float32Array(NV * G);
    for (let i = 0; i < NB * G; i++) this.segW[i] = sec.segW[i] / 255;
    this.armFollow = new Float32Array(NV);
    this.foreFollow = new Float32Array(NV);
    for (let i = 0; i < NB; i++) { this.armFollow[i] = sec.armFollow[i] / 255; this.foreFollow[i] = sec.foreFollow[i] / 255; }
    // helper joint vertices inherit the weights of their nearest body vertex
    for (let i = NB; i < NV; i++) {
      let bj = 0, bd = Infinity;
      for (let j = 0; j < NB; j++) {
        const d = (this.base[i * 3] - this.base[j * 3]) ** 2 + (this.base[i * 3 + 1] - this.base[j * 3 + 1]) ** 2 + (this.base[i * 3 + 2] - this.base[j * 3 + 2]) ** 2;
        if (d < bd) { bd = d; bj = j; }
      }
      for (let g = 0; g < G; g++) this.segW[i * G + g] = this.segW[bj * G + g];
    }
    for (const k of ['elbowL', 'elbowR', 'wristL', 'wristR']) for (const i of header.joints[k]) this.armFollow[i] = 1;
    for (const k of ['elbowL', 'elbowR']) for (const i of header.joints[k]) this.foreFollow[i] = 0;
    for (const k of ['wristL', 'wristR']) for (const i of header.joints[k]) this.foreFollow[i] = 1;

    this.fiber = new Float32Array(NB * 3);
    for (let i = 0; i < NB * 3; i++) this.fiber[i] = sec.fiber[i] / 127;
    this.shorts = new Float32Array(NB);
    for (let i = 0; i < NB; i++) this.shorts[i] = sec.shorts[i] / 255;

    // triangles of the coarse cage (for volumes / normals)
    const nq = this.quads.length / 4;
    this.ctri = new Uint32Array(nq * 6);
    for (let f = 0; f < nq; f++) {
      const a = this.quads[f * 4], b = this.quads[f * 4 + 1], c = this.quads[f * 4 + 2], d = this.quads[f * 4 + 3];
      this.ctri.set([a, b, c, a, c, d], f * 6);
    }
    this.triSeg = new Float32Array(nq * 2 * G);
    for (let t = 0; t < nq * 2; t++) for (let g = 0; g < G; g++) {
      const i0 = this.ctri[t * 3], i1 = this.ctri[t * 3 + 1], i2 = this.ctri[t * 3 + 2];
      this.triSeg[t * G + g] = (this.segW[i0 * G + g] + this.segW[i1 * G + g] + this.segW[i2 * G + g]) / 3;
    }

    this.sub = buildSubdivision(this.quads, NB);
    this.nFine = this.sub.count;

    // fat distribution field: how far MakeHuman's weight targets push each vertex outwards
    const n0 = this.normals(this.base);
    const tMax = this.targets[this.tIdx['averagemuscle-maxweight']].d;
    const tMin = this.targets[this.tIdx['averagemuscle-minweight']].d;
    const prop = new Float32Array(NB);
    for (let i = 0; i < NB; i++) {
      const dx = tMax[i * 3] - tMin[i * 3], dy = tMax[i * 3 + 1] - tMin[i * 3 + 1], dz = tMax[i * 3 + 2] - tMin[i * 3 + 2];
      prop[i] = Math.max(0, dx * n0[i * 3] + dy * n0[i * 3 + 1] + dz * n0[i * 3 + 2]);
    }
    this.smoothScalar(prop, 4);
    let mean = 0;
    for (let i = 0; i < NB; i++) mean += prop[i];
    mean /= NB;
    for (let i = 0; i < NB; i++) prop[i] = prop[i] / mean + 0.18; // some fat everywhere
    this.fatProp = prop;

    // pre-subdivided static attributes
    const segFine = applyStencil(this.sub, this.segW, G, new Float32Array(this.nFine * G));
    this.fineSeg = segFine;
    this.fineFiber = applyStencil(this.sub, this.rotatedFibers(), 3, new Float32Array(this.nFine * 3));
    this.fineShorts = applyStencil(this.sub, this.shorts, 1, new Float32Array(this.nFine));

    this.work = new Float32Array(NV * 3);
    this.cache = new Map();
  }

  smoothScalar(f, iters) {
    const NB = this.NB;
    if (!this.adj) {
      const s = Array.from({ length: NB }, () => new Set());
      const q = this.quads;
      for (let k = 0; k < q.length; k += 4) for (let j = 0; j < 4; j++) { s[q[k + j]].add(q[k + ((j + 1) & 3)]); s[q[k + j]].add(q[k + ((j + 3) & 3)]); }
      this.adj = s.map((x) => Int32Array.from(x));
    }
    const tmp = new Float32Array(NB);
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < NB; i++) {
        const a = this.adj[i];
        let s = 0;
        for (let j = 0; j < a.length; j++) s += f[a[j]];
        tmp[i] = 0.5 * f[i] + (0.5 * s) / a.length;
      }
      f.set(tmp);
    }
  }

  // area-weighted vertex normals of the coarse cage
  normals(P, out = new Float32Array(this.NB * 3)) {
    out.fill(0);
    const t = this.ctri;
    for (let k = 0; k < t.length; k += 3) {
      const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const i of [a, b, c]) { out[i] += nx; out[i + 1] += ny; out[i + 2] += nz; }
    }
    for (let i = 0; i < this.NB; i++) {
      const l = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]) || 1;
      out[i * 3] /= l; out[i * 3 + 1] /= l; out[i * 3 + 2] /= l;
    }
    return out;
  }

  joint(P, name) {
    const ids = this.h.joints[name];
    const c = [0, 0, 0];
    for (const i of ids) { c[0] += P[i * 3]; c[1] += P[i * 3 + 1]; c[2] += P[i * 3 + 2]; }
    return c.map((x) => x / ids.length);
  }

  // ---- shape --------------------------------------------------------------------------------
  // S = { w: [6] MakeHuman weight value per group, m: [6] muscle value, belly }
  morph(S, out = new Float32Array(this.NV * 3), pose = true) {
    const NV = this.NV, sw = this.segW, B = this.base;
    out.set(B);
    const T = this.targets;
    const tk = [];
    for (let mi = 0; mi < 3; mi++) for (let wi = 0; wi < 3; wi++) tk.push(mi === 1 && wi === 1 ? null : T[this.tIdx[`${MU[mi]}-${WE[wi]}`]].d);
    const fac = (x) => { const lo = Math.max(0, 1 - 2 * x), hi = Math.max(0, 2 * x - 1); return [lo, 1 - lo - hi, hi]; };
    for (let i = 0; i < NV; i++) {
      let w = 0, m = 0;
      for (let g = 0; g < G; g++) { w += sw[i * G + g] * S.w[g]; m += sw[i * G + g] * S.m[g]; }
      const fw = fac(w), fm = fac(m);
      let dx = 0, dy = 0, dz = 0;
      for (let mi = 0; mi < 3; mi++) {
        if (!fm[mi]) continue;
        for (let wi = 0; wi < 3; wi++) {
          const d = tk[mi * 3 + wi];
          const k = fm[mi] * fw[wi];
          if (!d || !k) continue;
          dx += d[i * 3] * k; dy += d[i * 3 + 1] * k; dz += d[i * 3 + 2] * k;
        }
      }
      out[i * 3] += dx; out[i * 3 + 1] += dy; out[i * 3 + 2] += dz;
    }
    if (S.belly) {
      const d = T[this.tIdx.belly].d;
      for (let i = 0; i < NV * 3; i++) out[i] += d[i] * S.belly;
    }
    // stand on the floor at the subject's height
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < this.NB; i++) { const y = out[i * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const s = this.heightM / (y1 - y0);
    for (let i = 0; i < NV; i++) { out[i * 3] *= s; out[i * 3 + 1] = (out[i * 3 + 1] - y0) * s; out[i * 3 + 2] *= s; }
    if (pose) this.poseArms(out);
    return out;
  }

  // MakeHuman's rest pose has the arms 41° out with the elbows flexed ~45° forward. Re-pose to
  // a relaxed anatomical stance: straighten the elbow, then lower the whole arm.
  armRotations(P) {
    const out = [];
    for (const [side, sh, el, wr] of [[1, 'shoulderL', 'elbowL', 'wristL'], [-1, 'shoulderR', 'elbowR', 'wristR']]) {
      const s = this.joint(P, sh), e = this.joint(P, el), w = this.joint(P, wr);
      const u = norm(sub(e, s)), d = norm(sub(w, e));
      const flex = Math.acos(Math.min(1, Math.max(-1, dot(u, d))));
      out.push({
        side,
        elbow: { c: e, axis: norm(cross(u, d)), ang: -(flex - this.elbowFlex) },
        shoulder: { c: s, axis: [0, 0, 1], ang: -side * this.armDrop },
      });
    }
    return out;
  }

  poseArms(P, R = this.armRotations(P)) {
    if (!this.armDrop && !this.elbowFlex) return;
    for (const r of R) {
      for (const [rot, follow] of [[r.elbow, this.foreFollow], [r.shoulder, this.armFollow]]) {
        const m = rotMatrix(rot.axis, rot.ang);
        const [cx, cy, cz] = rot.c;
        for (let i = 0; i < this.NV; i++) {
          const f = follow[i];
          if (!f || Math.sign(P[i * 3]) !== r.side) continue;
          const x = P[i * 3] - cx, y = P[i * 3 + 1] - cy, z = P[i * 3 + 2] - cz;
          P[i * 3] += (m[0] * x + m[1] * y + m[2] * z - x) * f;
          P[i * 3 + 1] += (m[3] * x + m[4] * y + m[5] * z - y) * f;
          P[i * 3 + 2] += (m[6] * x + m[7] * y + m[8] * z - z) * f;
        }
      }
    }
  }

  rotatedFibers() {
    const f = new Float32Array(this.fiber);
    const R = this.armRotations(this.base);
    for (const r of R) {
      for (const [rot, follow] of [[r.elbow, this.foreFollow], [r.shoulder, this.armFollow]]) {
        const m = rotMatrix(rot.axis, rot.ang);
        for (let i = 0; i < this.NB; i++) {
          const k = follow[i];
          if (!k || Math.sign(this.base[i * 3]) !== r.side) continue;
          const x = f[i * 3], y = f[i * 3 + 1], z = f[i * 3 + 2];
          f[i * 3] += (m[0] * x + m[1] * y + m[2] * z - x) * k;
          f[i * 3 + 1] += (m[3] * x + m[4] * y + m[5] * z - y) * k;
          f[i * 3 + 2] += (m[6] * x + m[7] * y + m[8] * z - z) * k;
        }
      }
    }
    return f;
  }

  // segment volumes (litres): limbs and head measured from their joint, trunk = total − rest
  volumes(P) {
    const origins = [this.joint(P, 'shoulderL'), this.joint(P, 'shoulderR'), [0, 0, 0], this.joint(P, 'hipL'), this.joint(P, 'hipR'), this.joint(P, 'neck')];
    const V = new Float64Array(G);
    let total = 0;
    const t = this.ctri, ts = this.triSeg;
    for (let k = 0, tri = 0; k < t.length; k += 3, tri++) {
      const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
      const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[b], by = P[b + 1], bz = P[b + 2], cx = P[c], cy = P[c + 1], cz = P[c + 2];
      total += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      for (const g of [0, 1, 3, 4, 5]) {
        const w = ts[tri * G + g];
        if (w < 1e-4) continue;
        const o = origins[g];
        const px = ax - o[0], py = ay - o[1], pz = az - o[2];
        const qx = bx - o[0], qy = by - o[1], qz = bz - o[2];
        const rx = cx - o[0], ry = cy - o[1], rz = cz - o[2];
        V[g] += (w * (px * (qy * rz - qz * ry) - py * (qx * rz - qz * rx) + pz * (qx * ry - qy * rx))) / 6;
      }
    }
    V[2] = total - V[0] - V[1] - V[3] - V[4] - V[5];
    return Array.from(V, (v) => v * 1000);
  }

  // push the surface inwards by the fat thickness field: t = tMin + α_g · fatProp
  leanShell(P, alpha, out = new Float32Array(this.NV * 3)) {
    const n = this.normals(P);
    out.set(P);
    const sw = this.segW, prop = this.fatProp;
    for (let i = 0; i < this.NB; i++) {
      let a = 0;
      for (let g = 0; g < G; g++) a += sw[i * G + g] * alpha[g];
      const t = 0.0015 + a * prop[i];
      out[i * 3] -= n[i * 3] * t; out[i * 3 + 1] -= n[i * 3 + 1] * t; out[i * 3 + 2] -= n[i * 3 + 2] * t;
    }
    return out;
  }

  // ---- calibration: find shape values whose segment volumes match the measured masses ----------
  // seg: [{lean, fat}] × 5 (already scaled to account for the head), m: muscle value,
  // belly: belly target amount, viscL: visceral fat volume in litres
  solve({ seg, m, belly, viscL = 0, airL = 2.0 }) {
    const D_FAT = 0.9007, D_FFM = 1.1;
    const tgt = seg.map((s) => s.lean / D_FFM + s.fat / D_FAT);
    tgt[2] += airL;
    const S = { w: [0.8, 0.8, 0.8, 0.8, 0.8, 0.6], m: Array(G).fill(m), belly };
    const P = this.work;
    const ids = [0, 1, 2, 3, 4];
    let V = this.volumes(this.morph(S, P, false));
    for (let it = 0; it < 7; it++) {
      const h = 0.04;
      const S2 = { ...S, w: S.w.map((x, g) => (g < 5 ? x + h : x)) };
      const V2 = this.volumes(this.morph(S2, P, false));
      let err = 0;
      for (const g of ids) {
        const dv = (V2[g] - V[g]) / h;
        const step = (tgt[g] - V[g]) / (Math.abs(dv) > 1e-6 ? dv : 1e-6);
        S.w[g] = Math.min(2.2, Math.max(-0.6, S.w[g] + step * 0.95));
        err = Math.max(err, Math.abs(tgt[g] - V[g]) / tgt[g]);
      }
      S.w[5] = 0.5 + 0.45 * (S.w[2] - 0.5); // face / neck fullness follows the trunk
      V = this.volumes(this.morph(S, P, false));
      if (err < 0.002) break;
    }
    // lean shell: remove the (subcutaneous) fat volume of each segment
    const fatV = seg.map((s, g) => s.fat / D_FAT - (g === 2 ? viscL : 0));
    const skin = new Float32Array(this.morph(S, new Float32Array(this.NV * 3), false));
    const Vs = this.volumes(skin);
    const alpha = [0.01, 0.01, 0.01, 0.01, 0.01, 0.004];
    const L = new Float32Array(this.NV * 3);
    for (let it = 0; it < 4; it++) {
      const Vl = this.volumes(this.leanShell(skin, alpha, L));
      for (const g of ids) {
        const removed = Vs[g] - Vl[g];
        const need = Math.max(0.05, fatV[g]);
        alpha[g] = Math.min(0.09, Math.max(0.0005, alpha[g] * (need / Math.max(1e-3, removed))));
      }
      alpha[5] = alpha[2] * 0.25;
    }
    const Vl = this.volumes(this.leanShell(skin, alpha, L));
    return { w: S.w, m: S.m, belly, alpha, volumes: Vs, leanVolumes: Vl, target: tgt };
  }

  // closed contour loops of the coarse surface at height y, as [[x, z], ...], largest first
  section(P, y) {
    y += 1e-7;
    const t = this.ctri, NB = this.NB;
    const pts = new Map();
    const link = new Map();
    const key = (a, b) => (a < b ? a * NB + b : b * NB + a);
    const cross = (a, b) => {
      const k = key(a, b);
      if (!pts.has(k)) {
        const ya = P[a * 3 + 1] - y, yb = P[b * 3 + 1] - y;
        const u = ya / (ya - yb);
        pts.set(k, [P[a * 3] + (P[b * 3] - P[a * 3]) * u, P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * u]);
      }
      return k;
    };
    const join = (k1, k2) => {
      (link.get(k1) || link.set(k1, []).get(k1)).push(k2);
      (link.get(k2) || link.set(k2, []).get(k2)).push(k1);
    };
    for (let k = 0; k < t.length; k += 3) {
      const v = [t[k], t[k + 1], t[k + 2]];
      const s = v.map((i) => P[i * 3 + 1] > y);
      if (s[0] === s[1] && s[1] === s[2]) continue;
      const ks = [];
      for (let e = 0; e < 3; e++) if (s[e] !== s[(e + 1) % 3]) ks.push(cross(v[e], v[(e + 1) % 3]));
      if (ks.length === 2) join(ks[0], ks[1]);
    }
    const seen = new Set();
    const loops = [];
    for (const start of link.keys()) {
      if (seen.has(start)) continue;
      const loop = [];
      let prev = -1, cur = start;
      while (cur !== undefined && !seen.has(cur)) {
        seen.add(cur);
        loop.push(pts.get(cur));
        const nx = (link.get(cur) || []).find((k) => k !== prev && !seen.has(k));
        prev = cur;
        cur = nx;
      }
      if (loop.length > 8) {
        let a = 0;
        for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length]; a += p[0] * q[1] - q[0] * p[1]; }
        loops.push({ loop, area: Math.abs(a / 2), cx: loop.reduce((s, p) => s + p[0], 0) / loop.length });
      }
    }
    return loops.sort((a, b) => b.area - a.area);
  }

  subdivide(C, out = new Float32Array(this.nFine * 3)) {
    return applyStencil(this.sub, C, 3, out);
  }

  // everything needed to display one body state: coarse + fine skin / lean, with normals
  shape(S) {
    const C = this.morph(S, new Float32Array(this.NV * 3), true);
    const Lc = this.leanShell(C, S.alpha);
    const skinP = this.subdivide(C), leanP = this.subdivide(Lc);
    return {
      coarse: C, leanCoarse: Lc,
      skinP, skinN: fineNormals(skinP, this.sub.index),
      leanP, leanN: fineNormals(leanP, this.sub.index),
    };
  }
}

export function fineNormals(P, index, out = new Float32Array(P.length)) {
  out.fill(0);
  for (let k = 0; k < index.length; k += 3) {
    const a = index[k] * 3, b = index[k + 1] * 3, c = index[k + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    out[a] += nx; out[a + 1] += ny; out[a + 2] += nz;
    out[b] += nx; out[b + 1] += ny; out[b + 2] += nz;
    out[c] += nx; out[c + 1] += ny; out[c + 2] += nz;
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l; out[i + 1] /= l; out[i + 2] /= l;
  }
  return out;
}
