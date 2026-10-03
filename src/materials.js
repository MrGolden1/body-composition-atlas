import * as THREE from 'three';

// Procedural tissue materials. Everything is generated in the shader from object-space
// position (no textures to ship): fat = lobules with septa (cellular noise), muscle =
// striations along a per-vertex fibre direction, skin = subtle mottling. Detail is faded
// out by screen-space derivatives so it never aliases on small screens.

const NOISE = /* glsl */ `
vec3 h33(vec3 p) {
  p = fract(p * vec3(.1031, .1030, .0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float gcorner(vec3 i, vec3 f, vec3 o) { return dot(h33(i + o) * 2.0 - 1.0, f - o); }
float gnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(gcorner(i, f, vec3(0., 0., 0.)), gcorner(i, f, vec3(1., 0., 0.)), u.x),
        mix(gcorner(i, f, vec3(0., 1., 0.)), gcorner(i, f, vec3(1., 1., 0.)), u.x), u.y),
    mix(mix(gcorner(i, f, vec3(0., 0., 1.)), gcorner(i, f, vec3(1., 0., 1.)), u.x),
        mix(gcorner(i, f, vec3(0., 1., 1.)), gcorner(i, f, vec3(1., 1., 1.)), u.x), u.y), u.z);
}
vec2 worley(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 r = g + h33(i + g) * 0.85 - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return vec2(sqrt(d1), sqrt(d2));
}
vec3 bumpNormal(vec3 pos, vec3 n, float h) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * n - grad);
}
// fat lobules: returns (lobule shade, septa mask, height)
vec3 fatLobules(vec3 p, float freq) {
  vec3 q = p * freq;
  vec2 w = worley(q + 0.35 * gnoise(q * 0.5));
  float e = w.y - w.x;
  float aa = clamp(fwidth(q.x) * 2.5, 0.0, 1.0);
  float sept = (1.0 - smoothstep(0.0, 0.11, e)) * (1.0 - aa);
  float shade = (0.5 + 0.5 * gnoise(floor(q + 0.5) * 1.7)) * (1.0 - aa);
  float h = smoothstep(0.0, 0.35, e) * (1.0 - aa);
  return vec3(shade, sept, h);
}
`;

const VERT_DECL = /* glsl */ `
attribute vec3 fiber;
attribute float shorts;
varying vec3 vObj;
varying vec3 vFib;
varying float vShorts;
`;
const VERT_MAIN = /* glsl */ `
vObj = (modelMatrix * vec4(position, 1.0)).xyz;
vFib = fiber;
vShorts = shorts;
`;
const FRAG_DECL = /* glsl */ `
varying vec3 vObj;
varying vec3 vFib;
varying float vShorts;
${NOISE}
`;

function patch(mat, { uniforms = {}, decl = '', color = '', rough = '', normal = '', alpha = '', lights = '' }) {
  mat.userData.uniforms = uniforms;
  // three.js caches programs by onBeforeCompile source, which is identical for every patched
  // material — key on the injected code instead so each variant gets its own program
  const key = decl + color + rough + normal + alpha + lights;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}\n${decl}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${color}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${rough}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${normal}\n${alpha}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${lights}`);
  };
  return mat;
}

// ---- skin -------------------------------------------------------------------------------------
export function skinMaterial() {
  const u = { uShorts: { value: 1 }, uShortsColor: { value: new THREE.Color('#23272f') } };
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.6, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.6,
    sheen: 0.55, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffcdb4'),
  });
  return patch(m, {
    uniforms: u,
    decl: 'uniform float uShorts; uniform vec3 uShortsColor; float gShorts;',
    color: /* glsl */ `
      float mott = gnoise(vObj * 34.0) * 0.5 + gnoise(vObj * 90.0) * 0.25;
      diffuseColor.rgb *= 1.0 + mott * 0.05;
      float sw = fwidth(vShorts) * 1.2 + 0.002;
      gShorts = uShorts * smoothstep(0.5 - sw, 0.5 + sw, vShorts);
      float hem = uShorts * (1.0 - smoothstep(0.0, 0.07, abs(vShorts - 0.56))) * gShorts;
      float knit = gnoise(vec3(vObj.x * 900.0, vObj.y * 140.0, vObj.z * 900.0)) * 0.5 + 0.5;
      vec3 sc = uShortsColor * (0.92 + 0.12 * knit) * (1.0 - 0.35 * hem);
      diffuseColor.rgb = mix(diffuseColor.rgb, sc, gShorts);`,
    rough: 'roughnessFactor = mix(roughnessFactor, 0.86, gShorts);',
    lights: /* glsl */ `
      #ifdef USE_SHEEN
        material.sheenColor *= 1.0 - gShorts * 0.9;
      #endif
      #ifdef USE_CLEARCOAT
        material.clearcoat *= 1.0 - gShorts;
      #endif`,
  });
}

// ---- fat --------------------------------------------------------------------------------------
// xray: translucent with fresnel rim; otherwise opaque (used for caps / visceral)
export function fatMaterial({ xray = false, color = '#f0c158', septa = '#c9774a', freq = xray ? 115 : 85, emissive = 0 } = {}) {
  const u = {
    uFat: { value: new THREE.Color(color) }, uSepta: { value: new THREE.Color(septa) },
    uFreq: { value: freq }, uBase: { value: 0.1 }, uRim: { value: 0.72 },
  };
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.28, sheen: 0.4, sheenColor: new THREE.Color('#fff0b0'),
    emissive: color, emissiveIntensity: emissive,
    transparent: xray, depthWrite: !xray, side: xray ? THREE.FrontSide : THREE.FrontSide,
  });
  return patch(m, {
    uniforms: u,
    decl: 'uniform vec3 uFat; uniform vec3 uSepta; uniform float uFreq; uniform float uBase; uniform float uRim; vec3 gLob;',
    color: /* glsl */ `
      gLob = fatLobules(vObj, uFreq);
      vec3 fc = uFat * (0.86 + 0.24 * gLob.x);
      fc = mix(fc, uSepta, gLob.y * 0.75);
      diffuseColor.rgb = fc;`,
    normal: `normal = bumpNormal(-vViewPosition, normal, gLob.z * ${xray ? '0.00035' : '0.0011'});`,
    alpha: xray ? /* glsl */ `
      float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
      diffuseColor.a = clamp(uBase + fres * uRim + gLob.y * 0.04, 0.0, 0.95);` : '',
  });
}

// ---- muscle ----------------------------------------------------------------------------------
export function muscleMaterial({ opacity = 1 } = {}) {
  const u = { uDark: { value: new THREE.Color('#7e1f1d') }, uLight: { value: new THREE.Color('#c4473c') } };
  const m = new THREE.MeshPhysicalMaterial({
    color: '#a83a32', roughness: 0.46, clearcoat: 0.45, clearcoatRoughness: 0.3, sheen: 0.3, sheenColor: new THREE.Color('#ff9a8a'),
    transparent: opacity < 1, opacity,
  });
  return patch(m, {
    uniforms: u,
    decl: 'uniform vec3 uDark; uniform vec3 uLight; float gStr;',
    color: /* glsl */ `
      vec3 f = normalize(vFib + 1e-5);
      float along = dot(vObj, f);
      vec3 across = vObj - f * along;
      vec3 q = across * 230.0 + f * along * 9.0;
      float aa = clamp(fwidth(q.x + q.y + q.z) * 0.6, 0.0, 1.0);
      float s1 = gnoise(q);
      float s2 = gnoise(across * 620.0 + f * along * 20.0);
      float aa2 = clamp(fwidth(across.x * 620.0) * 0.8, 0.0, 1.0);
      gStr = (s1 * 0.7 * (1.0 - aa) + s2 * 0.3 * (1.0 - aa2));
      float bund = gnoise(across * 60.0 + f * along * 3.0);
      diffuseColor.rgb = mix(uDark, uLight, clamp(0.5 + gStr * 0.9 + bund * 0.25, 0.0, 1.0));`,
    normal: 'normal = bumpNormal(-vViewPosition, normal, gStr * 0.0009);',
  });
}

// ---- cross-section caps --------------------------------------------------------------------------
// caps of nested layers lie on the same plane; later ones are pulled forward with a polygon
// offset (different shader programs are not guaranteed to produce identical depth)
export function capMaterial(kind, layer = 0) {
  const u = {};
  const m = new THREE.MeshStandardMaterial({
    roughness: 0.62, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6,
    polygonOffset: layer > 0, polygonOffsetFactor: -1.5 * layer, polygonOffsetUnits: -6 * layer,
  });
  let color = '';
  if (kind === 'fat' || kind === 'visc') {
    const c = kind === 'fat' ? 'vec3(0.50, 0.32, 0.075)' : 'vec3(0.62, 0.25, 0.02)';
    const sep = kind === 'fat' ? 'vec3(0.36, 0.15, 0.07)' : 'vec3(0.40, 0.11, 0.03)';
    color = /* glsl */ `
      vec3 L = fatLobules(vObj, ${kind === 'fat' ? '120.0' : '150.0'});
      vec3 fc = ${c} * (0.88 + 0.22 * L.x) * (0.94 + 0.12 * gnoise(vObj * 25.0));
      diffuseColor.rgb = mix(fc, ${sep}, L.y * 0.85);`;
  } else if (kind === 'muscle') {
    color = /* glsl */ `
      vec2 w = worley(vObj * 170.0);
      float e = w.y - w.x;
      float aa = clamp(fwidth(vObj.x * 170.0) * 2.5, 0.0, 1.0);
      float peri = (1.0 - smoothstep(0.0, 0.09, e)) * (1.0 - aa);
      float fine = gnoise(vObj * 900.0) * (1.0 - clamp(fwidth(vObj.x * 900.0), 0.0, 1.0));
      vec3 mc = mix(vec3(0.20, 0.025, 0.022), vec3(0.36, 0.06, 0.05), 0.5 + 0.35 * fine + 0.25 * gnoise(vObj * 40.0));
      diffuseColor.rgb = mix(mc, vec3(0.50, 0.24, 0.21), peri * 0.7);`;
  } else if (kind === 'hollow') {
    color = 'diffuseColor.rgb = vec3(0.035, 0.03, 0.035) + 0.015 * gnoise(vObj * 60.0);';
  }
  patch(m, { uniforms: u, color });
  m.stencilWrite = true;
  m.stencilRef = 0;
  m.stencilFunc = THREE.NotEqualStencilFunc;
  m.stencilFail = THREE.ReplaceStencilOp;
  m.stencilZFail = THREE.ReplaceStencilOp;
  m.stencilZPass = THREE.ReplaceStencilOp;
  return m;
}

// invisible passes that count how many times a view ray enters / leaves a clipped mesh
export function stencilPair(plane) {
  const base = {
    depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc, clippingPlanes: [plane],
  };
  const back = new THREE.MeshBasicMaterial({ ...base, side: THREE.BackSide });
  back.stencilFail = back.stencilZFail = back.stencilZPass = THREE.IncrementWrapStencilOp;
  const front = new THREE.MeshBasicMaterial({ ...base, side: THREE.FrontSide });
  front.stencilFail = front.stencilZFail = front.stencilZPass = THREE.DecrementWrapStencilOp;
  return [back, front];
}

// ---- ghost (comparison silhouette) --------------------------------------------------------------
export function fresnelMaterial({ color, base, rim, power = 2.4 }) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uBase: { value: base }, uRim: { value: rim }, uPow: { value: power } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uBase; uniform float uRim; uniform float uPow; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow); gl_FragColor = vec4(uColor, clamp(uBase + f * uRim, 0.0, 1.0)); }`,
    transparent: true,
    depthWrite: false,
  });
}
