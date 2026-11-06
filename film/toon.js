// Cel-shading kit: a two-tone toon material (with a stylised chrome mode), an inverted-hull outline that keeps a
// constant pixel width, and the shared uniforms (fog, light, resolution) every material reads.
import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

export const LIGHT = new THREE.Vector3(-0.42, 0.78, 0.46).normalize();

// One object shared by reference: changing a value here changes every material.
export const SHARED = {
  uLightDir: {value: LIGHT},
  uFogColor: {value: new THREE.Color('#cfe6ff')},
  uFogNear: {value: 400},
  uFogFar: {value: 5200},
  uRes: {value: new THREE.Vector2(1920, 1080)},
  uTime: {value: 0},
  uUnder: {value: 0},
};

const COMMON_V = /* glsl */ `
  uniform float uBend; uniform float uBendX0; uniform float uBendLen; uniform float uBendAmp;
  vec3 bendPos(vec3 p) {
  #ifdef BEND
    float b = max(uBendX0 - p.x, 0.0) / uBendLen;
    p.y += uBend * b * b * uBendAmp;
  #endif
    return p;
  }
  mat4 instM() {
  #ifdef USE_INSTANCING
    return instanceMatrix;
  #else
    return mat4(1.0);
  #endif
  }
`;

const TOON_V = /* glsl */ `
  ${COMMON_V}
  varying vec3 vN; varying vec3 vW; varying vec3 vCol;
  void main() {
    vec3 p = bendPos(position);
    mat4 m = modelMatrix * instM();
    vec4 wp = m * vec4(p, 1.0);
    vN = normalize(mat3(m) * normal);
    vW = wp.xyz;
    vCol = vec3(1.0);
  #ifdef USE_COLOR
    vCol = color;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vCol *= instanceColor;
  #endif
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const TOON_F = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uShade; uniform vec3 uRimColor; uniform vec3 uLightDir; uniform vec3 uFogColor;
  uniform float uMode; uniform float uRim; uniform float uEmit; uniform float uFogNear; uniform float uFogFar;
  uniform float uOpacity; uniform float uUnder;
  varying vec3 vN; varying vec3 vW; varying vec3 vCol;
  void main() {
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vW);
    float d = dot(N, uLightDir);
    float lit = smoothstep(-0.02, 0.05, d);
    vec3 base = uColor * vCol;
    vec3 sh = uShade * vCol;
    vec3 c = mix(sh, base, lit);
    if (uMode > 0.5 && uMode < 1.5) {
      // Stylised chrome: the reflected ray picks a flat band (sky, hot horizon line, sea) like a painted matcap.
      vec3 R = reflect(-V, N);
      float y = R.y;
      vec3 sky = mix(vec3(0.86, 0.93, 1.0), vec3(0.42, 0.62, 0.95), smoothstep(0.2, 0.8, y));
      vec3 sea = mix(vec3(0.20, 0.27, 0.42), vec3(0.55, 0.62, 0.74), smoothstep(-0.7, -0.08, y));
      vec3 env = mix(sea, vec3(0.98), smoothstep(-0.07, -0.05, y));
      env = mix(env, sky, smoothstep(0.10, 0.13, y));
      c = env * base * mix(0.62, 1.0, lit);
      float spec = max(dot(reflect(-uLightDir, N), V), 0.0);
      c += smoothstep(0.93, 0.95, spec) * 0.7;
    }
    float fr = 1.0 - max(dot(N, V), 0.0);
    c += uRimColor * smoothstep(0.66, 0.72, fr) * uRim * (0.35 + 0.65 * lit);
    c += base * uEmit;
    if (uMode > 1.5) c = uColor;
    float dist = length(vW - cameraPosition);
    c = mix(c, uFogColor, smoothstep(uFogNear, uFogFar, dist));
    gl_FragColor = vec4(c, uOpacity);
  }
`;

const OUT_V = /* glsl */ `
  ${COMMON_V}
  uniform float uWidth; uniform vec2 uRes;
  varying vec3 vW;
  void main() {
    vec3 p = bendPos(position);
    mat4 m = modelMatrix * instM();
    vec4 wp = m * vec4(p, 1.0);
    vW = wp.xyz;
    vec4 clip = projectionMatrix * viewMatrix * wp;
    vec3 nw = normalize(mat3(m) * normal);
    vec4 nc = projectionMatrix * viewMatrix * vec4(nw, 0.0);
    vec2 dir = nc.xy;
    float l = length(dir);
    dir = l > 1e-5 ? dir / l : vec2(0.0);
    clip.xy += dir * uWidth * clip.w * 2.0 / uRes * (uRes.y / 1080.0);
    gl_Position = clip;
  }
`;

const OUT_F = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
  varying vec3 vW;
  void main() {
    float dist = length(vW - cameraPosition);
    gl_FragColor = vec4(mix(uColor, uFogColor, smoothstep(uFogNear, uFogFar, dist)), 1.0);
  }
`;

const col = (c) => new THREE.Color(c);

/** Toon material. mode 0 = two-tone, 1 = chrome, 2 = flat emissive. bend = shared {uBend...} uniforms object. */
export function toon({color = '#ffffff', shade, rim = 0.35, rimColor = '#ffffff', mode = 0, emit = 0, vcol = false, bend = null, opacity = 1} = {}) {
  const c = col(color);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...SHARED,
      uColor: {value: c},
      uShade: {value: shade ? col(shade) : c.clone().multiply(col('#8a93d6'))},
      uRimColor: {value: col(rimColor)},
      uMode: {value: mode},
      uRim: {value: rim},
      uEmit: {value: emit},
      uOpacity: {value: opacity},
      ...(bend || {uBend: {value: 0}, uBendX0: {value: 0}, uBendLen: {value: 1}, uBendAmp: {value: 0}}),
    },
    vertexShader: TOON_V,
    fragmentShader: TOON_F,
    vertexColors: vcol,
    transparent: opacity < 1,
    defines: bend ? {BEND: 1} : {},
  });
  return m;
}

export function outlineMat({color = '#1a2340', width = 2.2, bend = null} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...SHARED,
      uColor: {value: col(color)},
      uWidth: {value: width},
      ...(bend || {uBend: {value: 0}, uBendX0: {value: 0}, uBendLen: {value: 1}, uBendAmp: {value: 0}}),
    },
    vertexShader: OUT_V,
    fragmentShader: OUT_F,
    side: THREE.BackSide,
    defines: bend ? {BEND: 1} : {},
  });
}

const smoothCache = new WeakMap();
/** Geometry with averaged normals so the hull has no cracks at hard edges. */
export function smoothNormals(geo) {
  if (smoothCache.has(geo)) return smoothCache.get(geo);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.getAttribute('position').clone());
  if (geo.index) g.setIndex(geo.index.clone());
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  smoothCache.set(geo, m);
  return m;
}

/** Mesh + outline child. */
export function inked(geo, mat, {ink = '#1a2340', width = 2.2, bend = null, outline = true} = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  if (outline) {
    const o = new THREE.Mesh(smoothNormals(geo), outlineMat({color: ink, width, bend}));
    o.frustumCulled = false;
    mesh.add(o);
  }
  mesh.frustumCulled = false;
  return mesh;
}
