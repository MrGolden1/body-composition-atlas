import * as THREE from 'three';
import { SEGMENTS, TESTS, SUBJECT } from './data.js';

// ---- turning a report into body-shape parameters ------------------------------------------
// Segment masses are scaled so that segments + head add up to the printed weight; each
// segment's volume (fat at 0.90 kg/L, fat-free mass at 1.10 kg/L) is then matched by the
// body model's solver. Visceral fat volume ≈ VFA × 0.022 L/cm² (≈ 22 cm effective height).
const VISC_L_PER_CM2 = 0.022;

let headMass = 5.0;
const solved = new Map();

export function viscFromTest(t) {
  if (t.vfa != null) return { area: t.vfa, litres: t.vfa * VISC_L_PER_CM2, known: true };
  // not measured: keep the geometry plausible using the other tests' visceral ÷ trunk-fat ratio
  const ratios = TESTS.filter((x) => x.vfa != null).map((x) => (x.vfa * VISC_L_PER_CM2) / x.segments.tr.fat);
  const r = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0.17;
  return { area: null, litres: r * t.segments.tr.fat, known: false };
}

export function solveTest(model, i) {
  if (solved.has(i)) return solved.get(i);
  const t = TESTS[i];
  if (solved.size === 0) {
    const V = model.volumes(model.morph({ w: Array(6).fill(0.5), m: Array(6).fill(0.5), belly: 0 }, undefined, false));
    headMass = V[5] * 1.05;
  }
  const segs = SEGMENTS.map((s) => t.segments[s.id]);
  const k = (t.weight - headMass) / segs.reduce((a, s) => a + s.lean + s.fat, 0);
  const h = SUBJECT.heightCm / 100;
  const ffmi = t.ffm / (h * h);
  const m = Math.min(1, Math.max(0.3, 0.5 + (ffmi - 19) / 14));
  const trunkFat = segs[2].fat * k;
  const belly = Math.min(0.8, Math.max(0, (trunkFat - 8) / 25));
  const visc = viscFromTest(t);
  const r = model.solve({ seg: segs.map((s) => ({ lean: s.lean * k, fat: s.fat * k })), m, belly, viscL: visc.litres });
  const out = {
    w: r.w, m: r.m, belly: r.belly, alpha: r.alpha,
    fatKg: segs.map((s) => s.fat), leanKg: segs.map((s) => s.lean),
    fatShare: segs.map((s) => s.fat / (s.fat + s.lean)),
    vfa: visc.area ?? 0, vfaKnown: visc.known ? 1 : 0, viscL: visc.litres,
    volumes: r.volumes,
  };
  solved.set(i, out);
  return out;
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

// "Exaggerate differences": push each test's shape away from the mean of all tests
export function emphasize(model, i, emph) {
  const p = solveTest(model, i);
  if (emph === 1) return p;
  const all = TESTS.map((_, j) => solveTest(model, j));
  const mean = (get) => {
    const arrs = all.map(get);
    return Array.isArray(arrs[0]) ? arrs[0].map((_, k) => arrs.reduce((s, a) => s + a[k], 0) / arrs.length) : arrs.reduce((s, a) => s + a, 0) / arrs.length;
  };
  const ex = (v, mu) => (Array.isArray(v) ? v.map((x, k) => mu[k] + (x - mu[k]) * emph) : mu + (v - mu) * emph);
  return {
    ...p,
    w: ex(p.w, mean((q) => q.w)),
    m: ex(p.m, mean((q) => q.m)),
    belly: Math.max(0, ex(p.belly, mean((q) => q.belly))),
    alpha: ex(p.alpha, mean((q) => q.alpha)).map((a) => Math.max(0.0004, a)),
  };
}

export function lerpInfo(a, b, t) {
  return {
    fatKg: lerpArr(a.fatKg, b.fatKg, t), leanKg: lerpArr(a.leanKg, b.leanKg, t), fatShare: lerpArr(a.fatShare, b.fatShare, t),
    vfa: lerp(a.vfa, b.vfa, t), vfaKnown: lerp(a.vfaKnown, b.vfaKnown, t), viscL: lerp(a.viscL, b.viscL, t),
  };
}

// ---- colour ramps -------------------------------------------------------------------------
function ramp(stops, t) {
  if (t <= stops[0][0]) return stops[0][1].clone();
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      return c0.clone().lerp(c1, (t - t0) / (t1 - t0));
    }
  }
  return stops[stops.length - 1][1].clone();
}
const C = (h) => new THREE.Color(h);

export const FAT_STOPS = [
  [0.15, C('#2bb37a')], [0.24, C('#9fd65c')], [0.3, C('#f2d03c')], [0.36, C('#f39a3a')], [0.45, C('#e0453a')],
];
export const fatColor = (share) => ramp(FAT_STOPS, share);

// change in segment fat mass, in % of the baseline segment fat (negative = fat lost)
export const CHANGE_STOPS = [
  [-30, C('#1fb57a')], [-12, C('#8fd68f')], [0, C('#d8d2c8')], [8, C('#f0a24a')], [15, C('#e0453a')],
];
export const changeColor = (pct) => ramp(CHANGE_STOPS, pct);

export const SKIN_TONE = C('#c9a28c');
export const HEAD_NEUTRAL = C('#8d97a8');
