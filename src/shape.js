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

// One muscle setting for every test (from the average fat-free mass index): if it varied per
// test, the volume solver would compensate with the fat drive and shapes could move the wrong way.
function sharedMuscle() {
  const h = SUBJECT.heightCm / 100;
  const ffmi = TESTS.reduce((a, t) => a + t.ffm, 0) / TESTS.length / (h * h);
  return Math.min(1, Math.max(0.3, 0.5 + (ffmi - 19) / 14));
}

function solveFor(model, t) {
  if (solved.size === 0 && !solveFor.init) {
    const V = model.volumes(model.morph({ w: Array(6).fill(0.5), m: Array(6).fill(0.5), belly: 0 }, undefined, false));
    headMass = V[5] * 1.05;
    solveFor.init = true;
  }
  const segs = SEGMENTS.map((s) => t.segments[s.id]);
  const k = (t.weight - headMass) / segs.reduce((a, s) => a + s.lean + s.fat, 0);
  const trunkFat = segs[2].fat * k;
  const belly = Math.min(0.8, Math.max(0, (trunkFat - 8) / 25));
  const visc = viscFromTest(t);
  const r = model.solve({ seg: segs.map((s) => ({ lean: s.lean * k, fat: s.fat * k })), m: sharedMuscle(), belly, viscL: visc.litres });
  return { w: r.w, m: r.m, belly: r.belly, alpha: r.alpha, visc, volumes: r.volumes };
}

// the numbers shown on screen always come from the real report
function infoFor(t, visc) {
  const segs = SEGMENTS.map((s) => t.segments[s.id]);
  return {
    fatKg: segs.map((s) => s.fat), leanKg: segs.map((s) => s.lean),
    fatShare: segs.map((s) => s.fat / (s.fat + s.lean)),
    vfa: visc.area ?? 0, vfaKnown: visc.known ? 1 : 0, viscL: visc.litres,
  };
}

export function solveTest(model, i) {
  return emphasize(model, i, 1);
}

// "Exaggerate differences": each report's measurements are pushed away from the average of all
// reports (weight, every segment's fat and lean, visceral area), then the body is solved from
// those exaggerated numbers — so a lighter test always gets lighter and a heavier one heavier.
export function emphasize(model, i, emph) {
  const key = i + '|' + emph;
  if (solved.has(key)) return solved.get(key);
  const t = TESTS[i];
  let src = t;
  if (emph !== 1) {
    const avg = (get) => { const v = TESTS.map(get).filter((x) => x != null); return v.reduce((a, b) => a + b, 0) / v.length; };
    const ex = (get, min = 0.1) => (get(t) == null ? null : Math.max(min, avg(get) + (get(t) - avg(get)) * emph));
    src = {
      ...t,
      weight: ex((x) => x.weight, 40),
      ffm: ex((x) => x.ffm, 20),
      vfa: ex((x) => x.vfa, 5),
      segments: Object.fromEntries(SEGMENTS.map(({ id }) => [id, {
        lean: ex((x) => x.segments[id].lean, 0.5),
        fat: ex((x) => x.segments[id].fat, 0.2),
      }])),
    };
  }
  const r = solveFor(model, src);
  const out = { w: r.w, m: r.m, belly: r.belly, alpha: r.alpha, volumes: r.volumes, ...infoFor(t, viscFromTest(t)), vfa: r.visc.area ?? 0, viscL: r.visc.litres };
  solved.set(key, out);
  return out;
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

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
