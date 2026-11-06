// The world: gradient sky, cel ocean (wake, impact rings, whale shadow, underside with caustics), cumulus clouds,
// the headland, a container ship on the horizon and underwater god rays.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {SHARED, toon, inked} from './toon.js';

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {...SHARED},
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightDir; uniform float uUnder; varying vec3 vW;
      void main(){
        vec3 d = normalize(vW - cameraPosition);
        float y = d.y;
        vec3 hor = vec3(0.84, 0.92, 1.0);
        vec3 mid = vec3(0.36, 0.62, 0.98);
        vec3 zen = vec3(0.07, 0.26, 0.78);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.16, y));
        c = mix(c, zen, smoothstep(0.16, 0.75, y));
        c = mix(c, vec3(0.80, 0.90, 1.0), smoothstep(0.0, -0.05, y));
        float s = max(dot(d, uLightDir), 0.0);
        c += vec3(1.0, 0.97, 0.88) * (pow(s, 60.0) * 0.5 + pow(s, 6.0) * 0.08);
        if (uUnder > 0.5) {
          vec3 top = vec3(0.45, 0.93, 1.0);
          vec3 deep = vec3(0.02, 0.22, 0.42);
          c = mix(deep, top, smoothstep(-0.6, 0.6, y));
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

export const MAX_RINGS = 6;

export function makeOcean() {
  const rings = Array.from({length: MAX_RINGS}, () => new THREE.Vector4(0, 0, -100, 0));
  const ringR = Array.from({length: MAX_RINGS}, () => new THREE.Vector2(30, 1));
  const uniforms = {
    ...SHARED,
    uRings: {value: rings}, // x, z, t0, strength
    uRingR: {value: ringR}, // speed, maxRadius scale
    uBoat: {value: new THREE.Vector4(0, 0, 1, 0)}, // x, z, heading x, heading z
    uBoatOn: {value: 1},
    uShadow: {value: new THREE.Vector4(0, 0, 0, 0)}, // x, z, size, amount
    uShadowDir: {value: new THREE.Vector2(1, 0)},
    uSwell: {value: 1},
  };
  const NOISE = /* glsl */ `
    float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
    uniform vec4 uRings[${MAX_RINGS}]; uniform vec2 uRingR[${MAX_RINGS}]; uniform float uTime; uniform float uSwell;
    // big swell: sum of directional sines, returns height and gradient
    vec3 swell(vec2 p){
      vec3 r = vec3(0.0);
      vec4 W[4];
      W[0] = vec4(normalize(vec2(1.0, 0.3)), 0.020, 1.1);
      W[1] = vec4(normalize(vec2(0.4, 1.0)), 0.034, 0.55);
      W[2] = vec4(normalize(vec2(-0.7, 0.6)), 0.051, 0.35);
      W[3] = vec4(normalize(vec2(0.9, -0.5)), 0.083, 0.2);
      for (int i = 0; i < 4; i++){
        float k = W[i].z, a = W[i].w * uSwell;
        float ph = dot(W[i].xy, p) * k + uTime * sqrt(9.8 * k) * 1.3;
        r.x += a * sin(ph);
        r.yz += a * k * cos(ph) * W[i].xy;
      }
      return r;
    }
    // impact rings: returns height, foam
    vec2 rings(vec2 p){
      vec2 o = vec2(0.0);
      for (int i = 0; i < ${MAX_RINGS}; i++){
        vec4 R = uRings[i];
        float age = uTime - R.z;
        if (age < 0.0 || age > 6.0) continue;
        float r = length(p - R.xy);
        float front = uRingR[i].x * age;
        float fade = exp(-age * 0.55) * R.w;
        float band = exp(-pow((r - front) / (3.0 + age * 3.0), 2.0));
        o.x += band * fade * 2.5 * uRingR[i].y;
        float inner = (1.0 - smoothstep(front * 0.55, front * 0.9, r)) * smoothstep(0.0, 0.3, age) * exp(-age * 0.4);
        o.y += max(band * fade * 1.4, inner * R.w);
      }
      return o;
    }
  `;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      ${NOISE}
      varying vec3 vW;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += swell(w.xz).x + rings(w.xz).x;
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform vec3 uLightDir; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uUnder;
      uniform vec4 uBoat; uniform float uBoatOn; uniform vec4 uShadow; uniform vec2 uShadowDir;
      varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        float dist = length(vW - cameraPosition);
        vec3 sw = swell(p);
        // fine chop for the normal only, fades with distance
        float chopFade = 1.0 - smoothstep(80.0, 900.0, dist);
        vec2 q = p * 0.09 + vec2(uTime * 0.25, uTime * 0.12);
        float e = 0.6;
        float n0 = fbm(q), nx = fbm(q + vec2(e, 0.0)), nz = fbm(q + vec2(0.0, e));
        vec2 chop = vec2(nx - n0, nz - n0) / e * 1.6 * chopFade;
        vec3 N = normalize(vec3(-sw.y - chop.x, 1.0, -sw.z - chop.y));
        vec3 V = normalize(cameraPosition - vW);

        if (!gl_FrontFacing || uUnder > 0.5) {
          // seen from below: bright, mottled surface with caustic network
          vec2 cq = p * 0.06;
          float c1 = abs(sin(cq.x * 3.1 + fbm(cq * 2.0 + uTime * 0.4) * 6.0));
          float c2 = abs(sin(cq.y * 2.7 + fbm(cq * 2.3 - uTime * 0.35) * 6.0));
          float caus = smoothstep(0.86, 0.98, max(1.0 - c1, 1.0 - c2));
          vec3 c = mix(vec3(0.36, 0.84, 0.95), vec3(0.80, 1.0, 1.0), caus);
          c = mix(c, vec3(0.95, 1.0, 1.0), smoothstep(0.75, 0.95, -normalize(vW - cameraPosition).y) * 0.5);
          c = mix(c, vec3(0.10, 0.55, 0.72), smoothstep(40.0, 400.0, dist));
          gl_FragColor = vec4(c, 1.0);
          return;
        }

        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        float h = sw.x;
        vec3 deep = vec3(0.07, 0.30, 0.78);
        vec3 mid = vec3(0.13, 0.50, 0.90);
        vec3 tur = vec3(0.22, 0.74, 0.92);
        // cel bands from facing-to-sun + height
        float l = dot(N, normalize(uLightDir + vec3(0.0, 0.0, 0.0)));
        float band = smoothstep(0.80, 0.83, l + h * 0.08 + (n0 - 0.5) * 0.25);
        vec3 c = mix(deep, mid, band);
        c = mix(c, tur, smoothstep(0.93, 0.95, l + (n0 - 0.5) * 0.3) * 0.8);
        // horizon: sky reflection
        c = mix(c, vec3(0.62, 0.80, 1.0), smoothstep(0.35, 0.9, fres) * 0.8);
        // whale shadow
        if (uShadow.w > 0.0) {
          vec2 d = p - uShadow.xy;
          vec2 a = vec2(dot(d, uShadowDir), dot(d, vec2(-uShadowDir.y, uShadowDir.x)));
          float s = length(a / vec2(uShadow.z, uShadow.z * 0.36)) + (fbm(p * 0.08 + uTime * 0.3) - 0.5) * 0.5;
          c = mix(c, vec3(0.03, 0.12, 0.38), (1.0 - smoothstep(0.75, 1.0, s)) * uShadow.w);
        }
        // anime foam strokes: thin contour lines of a drifting noise field
        float fn = fbm(p * 0.035 + vec2(uTime * 0.05, -uTime * 0.03) + sw.yz * 2.0);
        float lineW = 0.012 * (1.0 + dist / 300.0);
        float gap = 0.5 - abs(fract(fn * 7.0) - 0.5);
        float stroke = 1.0 - smoothstep(lineW * 0.5, lineW, gap);
        stroke *= smoothstep(0.42, 0.62, fbm(p * 0.02 + 3.0)) * (1.0 - smoothstep(300.0, 1400.0, dist));
        float foam = stroke * 0.9;
        // crest sparkle
        foam = max(foam, smoothstep(0.985, 0.995, l + (fbm(p * 0.3 + uTime) - 0.5) * 0.1) * chopFade);
        // boat wake
        if (uBoatOn > 0.5) {
          vec2 d = p - uBoat.xy;
          vec2 f = uBoat.zw;
          float along = -dot(d, f);
          float lat = abs(dot(d, vec2(-f.y, f.x)));
          float br = fbm(p * 0.35 + uTime * 0.8);
          float arms = 1.0 - smoothstep(0.25 + along * 0.015, 0.6 + along * 0.03, abs(lat - along * 0.3));
          float center = (1.0 - smoothstep(1.0 + along * 0.05, 1.8 + along * 0.08, lat)) * (1.0 - smoothstep(10.0, 34.0, along));
          float bow = 1.0 - smoothstep(4.2, 6.0, length(d + f * 1.0));
          float w = max(arms * (1.0 - smoothstep(12.0, 40.0, along)), center) * step(-1.0, along);
          w = max(w * smoothstep(0.35, 0.55, br + 0.15), bow * smoothstep(0.3, 0.6, br + 0.2));
          foam = max(foam, w);
        }
        // impact rings + churned water
        vec2 rg = rings(p);
        float churn = smoothstep(0.35, 0.6, fbm(p * 0.15 - uTime * 0.6) * rg.y + rg.y * 0.35);
        foam = max(foam, churn);
        c = mix(c, vec3(0.97, 0.99, 1.0), clamp(foam, 0.0, 1.0));
        c = mix(c, uFogColor, smoothstep(uFogNear, uFogFar, dist));
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(1400, 1400, 280, 280);
  geo.rotateX(-Math.PI / 2);
  const near = new THREE.Mesh(geo, mat);
  near.frustumCulled = false;
  // far plane for the horizon (coarse; rings and swell are invisible out there)
  const fgeo = new THREE.RingGeometry(650, 12000, 96, 4);
  fgeo.rotateX(-Math.PI / 2);
  const far = new THREE.Mesh(fgeo, mat);
  far.position.y = -0.4;
  far.frustumCulled = false;
  const group = new THREE.Group();
  group.add(near, far);
  return {
    group,
    uniforms,
    follow(cam) {
      const s = 1400 / 280;
      near.position.set(Math.round(cam.position.x / s) * s, 0, Math.round(cam.position.z / s) * s);
      far.position.x = near.position.x;
      far.position.z = near.position.z;
    },
  };
}

/** Cumulus clusters with flat bottoms. */
export function makeClouds(rand) {
  const group = new THREE.Group();
  const mat = toon({color: '#ffffff', shade: '#a6b0ec', rim: 0.0});
  const make = (cx, cz, base, size, tall) => {
    const parts = [];
    const n = 14 + Math.floor(rand() * 10);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.pow(rand(), 0.7) * size;
      const x = Math.cos(a) * rr * 1.5;
      const z = Math.sin(a) * rr * 0.8;
      const up = (1 - rr / size) * tall * (0.5 + rand() * 0.7);
      const r = size * (0.32 + rand() * 0.32) * (0.7 + (1 - rr / size) * 0.5);
      const g = new THREE.IcosahedronGeometry(r, 3);
      g.translate(x, up + r * 0.25, z);
      parts.push(g);
    }
    const g = mergeGeometries(parts);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, 0);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.position.set(cx, base, cz);
    m.frustumCulled = false;
    group.add(m);
  };
  // a ring of horizon towers + some mid-distance puffs
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.2;
    const d = 2600 + rand() * 1600;
    make(Math.cos(a) * d, Math.sin(a) * d, 60 + rand() * 80, 260 + rand() * 260, 380 + rand() * 520);
  }
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const d = 900 + rand() * 1400;
    make(Math.cos(a) * d, Math.sin(a) * d, 260 + rand() * 300, 70 + rand() * 90, 60 + rand() * 80);
  }
  return group;
}

/** Rocky headland: noise-displaced lumps, golden rock with a grass cap. */
export function makeHeadland(rand, top = 22) {
  const group = new THREE.Group();
  const rock = toon({color: '#f0b450', shade: '#b4703c', rim: 0.25, rimColor: '#ffe7b0'});
  const grass = toon({color: '#5fc24a', shade: '#2f7d47', rim: 0.2});
  const lump = (x, z, r, h, mat, y0 = 0) => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const k = 0.82 + rand() * 0.3;
      v.multiplyScalar(k);
      p.setXYZ(i, v.x * r, Math.max(v.y, -0.2) * h, v.z * r);
    }
    g.computeVertexNormals();
    const m = inked(g.toNonIndexed(), mat, {ink: '#5a3324', width: 1.8});
    m.geometry.computeVertexNormals();
    m.position.set(x, y0, z);
    group.add(m);
    return m;
  };
  lump(0, 0, 34, top + 2, rock);
  lump(-26, 18, 22, top - 6, rock);
  lump(22, -20, 24, top - 2, rock);
  lump(-12, -30, 26, top + 6, rock);
  lump(30, 16, 14, 10, rock);
  lump(-8, -14, 30, 8, grass, top - 2);
  lump(-30, -26, 16, 6, grass, top);
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    lump(Math.cos(a) * (40 + rand() * 14), Math.sin(a) * (40 + rand() * 14), 4 + rand() * 6, 3 + rand() * 6, rock);
  }
  return group;
}

/** Container ship, simple and readable at a distance. */
export function makeShip(rand) {
  const g = new THREE.Group();
  const hull = inked(new RoundedBoxGeometry(160, 16, 26, 2, 3), toon({color: '#c92b2b', shade: '#7d1b2c'}), {width: 1.4});
  hull.position.y = 4;
  g.add(hull);
  const band = inked(new THREE.BoxGeometry(161, 5, 26.4), toon({color: '#1d2a4a', shade: '#121a33'}), {outline: false});
  band.position.y = -1.5;
  g.add(band);
  const cols = ['#e04a3a', '#2f6fd0', '#f2b33a', '#3aa55a', '#e8e8e8', '#7d4ac9', '#2fb8c8'];
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 3; j++) {
      const c = cols[Math.floor(rand() * cols.length)];
      const b = inked(new THREE.BoxGeometry(13, 5, 22), toon({color: c}), {width: 1.0});
      b.position.set(-58 + i * 14, 14.5 + j * 5, 0);
      g.add(b);
    }
  }
  const bridge = inked(new THREE.BoxGeometry(14, 22, 22), toon({color: '#f4f4f0', shade: '#9aa3d0'}), {width: 1.2});
  bridge.position.set(68, 23, 0);
  g.add(bridge);
  return g;
}

/** Additive god-ray sheets for the underwater shot. */
export function makeRays(rand) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {uOp: {value: 1}},
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uOp; varying vec2 vUv; void main(){ float a = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * pow(vUv.y, 1.6); gl_FragColor = vec4(vec3(0.75, 1.0, 1.0), a * 0.22 * uOp); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const w = 4 + rand() * 9;
    const geo = new THREE.PlaneGeometry(w, 120);
    geo.translate(0, -60, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(-40 + rand() * 90, 0, -40 + rand() * 80);
    m.rotation.z = 0.25 + rand() * 0.1;
    m.userData.phase = rand() * 6.28;
    group.add(m);
  }
  return group;
}
