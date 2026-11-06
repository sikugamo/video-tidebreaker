// Effects: ballistic splash/debris bursts (all particles precomputed, posed as a pure function of t) and a 2D overlay
// pass with anime focus lines, a white flash and the title card.
import * as THREE from 'three';
import {toon, smoothNormals, outlineMat} from './toon.js';

/**
 * A pool of chunky toon particles. Each burst: {t0, pos:[x,y,z], n, speed:[a,b], cone (rad from up), ring (0..1 outward bias),
 * size:[a,b], life:[a,b], g, drag, spread (emitter radius), delay, seed, followY}
 */
export function makeBursts(rand, {color = '#ffffff', shade = '#9fb0e6', ink = '#5d74b3', width = 1.4, cap = 4000, detail = 1} = {}) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const mat = toon({color, shade, rim: 0.0});
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.frustumCulled = false;
  const out = new THREE.InstancedMesh(smoothNormals(geo), outlineMat({color: ink, width}), cap);
  out.instanceMatrix = mesh.instanceMatrix;
  out.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh, out);
  const P = []; // particles
  const add = (b) => {
    const r = b.seed != null ? mulberry(b.seed) : rand;
    for (let i = 0; i < b.n && P.length < cap; i++) {
      const az = r() * Math.PI * 2;
      const el = b.cone * Math.sqrt(r());
      const sp = b.speed[0] + (b.speed[1] - b.speed[0]) * Math.pow(r(), 0.8);
      const rad = (b.spread || 0) * Math.sqrt(r());
      let vx = Math.sin(el) * Math.cos(az), vy = Math.cos(el), vz = Math.sin(el) * Math.sin(az);
      if (b.ring) {
        vx = Math.cos(az) * (b.ring) + vx * (1 - b.ring);
        vz = Math.sin(az) * (b.ring) + vz * (1 - b.ring);
      }
      const d = b.dir || [0, 1, 0];
      if (b.dir) { vx += d[0] * 0.8; vy = vy * 0.4 + d[1]; vz += d[2] * 0.8; }
      const L = Math.hypot(vx, vy, vz);
      P.push({
        t0: b.t0 + (b.delay || 0) * r(),
        p: [b.pos[0] + Math.cos(az) * rad, b.pos[1], b.pos[2] + Math.sin(az) * rad],
        v: [(vx / L) * sp, (vy / L) * sp, (vz / L) * sp],
        s: b.size[0] + (b.size[1] - b.size[0]) * Math.pow(r(), 1.5),
        life: b.life[0] + (b.life[1] - b.life[0]) * r(),
        g: b.g ?? -30,
        k: b.drag ?? 0.6,
        rot: [r() * 6, r() * 6, r() * 6],
        floor: b.floor ?? -1.5,
        stretch: b.stretch ?? 0.035,
      });
    }
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const yAx = new THREE.Vector3(0, 1, 0);
  return {
    group,
    add,
    render(t) {
      let n = 0;
      for (const a of P) {
        const age = t - a.t0;
        if (age < 0 || age > a.life) continue;
        const ek = (1 - Math.exp(-a.k * age)) / a.k;
        const x = a.p[0] + a.v[0] * ek;
        const z = a.p[2] + a.v[2] * ek;
        const y = a.p[1] + a.v[1] * ek + 0.5 * a.g * age * age;
        const u = age / a.life;
        let s = a.s * Math.min(1, age / 0.12 + 0.25) * (1 - Math.pow(u, 3));
        if (y < a.floor) s *= Math.max(0, 1 - (a.floor - y) / (a.s * 2 + 1));
        if (s <= 0.01) continue;
        v.set(x, y, z);
        const ex = Math.exp(-a.k * age);
        vel.set(a.v[0] * ex, a.v[1] * ex + a.g * age, a.v[2] * ex);
        const spd = vel.length();
        if (spd > 1e-3) q.setFromUnitVectors(yAx, vel.divideScalar(spd));
        else q.identity();
        const st = 1 + Math.min(spd * a.stretch, 2.2);
        sc.set(s / Math.sqrt(st), s * st, s / Math.sqrt(st));
        m4.compose(v, q, sc);
        mesh.setMatrixAt(n++, m4);
      }
      mesh.count = n;
      out.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rainbow arc through the spout mist. */
export function makeRainbow() {
  const geo = new THREE.RingGeometry(44, 54, 64, 1, 0, Math.PI);
  const mat = new THREE.ShaderMaterial({
    uniforms: {uOp: {value: 0}},
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uOp; varying vec2 vP;
      vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0); }
      void main(){ float r = (length(vP) - 44.0) / 10.0; vec3 c = hue(0.8 - r * 0.8);
        float a = smoothstep(0.0, 0.15, r) * smoothstep(1.0, 0.85, r) * uOp * 0.6 * smoothstep(0.0, 0.4, vP.y / 54.0);
        gl_FragColor = vec4(c, a); }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return {mesh: m, mat};
}

/** Fullscreen 2D pass: focus lines, flash, title. */
export function makeOverlay() {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uLines: {value: 0},
      uFlash: {value: 0},
      uTime: {value: 0},
      uAspect: {value: 16 / 9},
      uCenter: {value: new THREE.Vector2(0, 0)},
      uVig: {value: 0.25},
      uTint: {value: new THREE.Vector4(0, 0, 0, 0)},
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uLines, uFlash, uTime, uAspect, uVig; uniform vec2 uCenter; uniform vec4 uTint;
      varying vec2 vUv;
      float h(float n){ return fract(sin(n * 127.1) * 43758.5453); }
      void main(){
        vec2 p = (vUv * 2.0 - 1.0); p.x *= uAspect;
        vec2 d = p - uCenter * vec2(uAspect, 1.0);
        float r = length(d);
        float a = atan(d.y, d.x) / 6.28318 + 0.5;
        float N = 140.0;
        float id = floor(a * N);
        float fr = fract(a * N);
        float tick = floor(uTime * 16.0);
        float rnd = h(id + tick * 13.7);
        float on = step(0.45, rnd);
        float r0 = 0.55 + h(id * 3.1 + tick) * 0.6;
        float w = 0.12 + 0.35 * h(id * 7.7 + tick);
        float line = on * step(r0, r) * (1.0 - smoothstep(w * 0.5, w, abs(fr - 0.5) * 2.0 / max(r, 0.2)));
        float A = line * uLines;
        vec3 c = vec3(1.0);
        float vig = smoothstep(0.7, 1.9, length(p / vec2(uAspect, 1.0) * vec2(1.2, 1.0))) * uVig;
        vec4 col = vec4(vec3(0.02, 0.06, 0.25), vig);
        col = mix(col, vec4(uTint.rgb, 1.0), uTint.a);
        col = mix(col, vec4(1.0), A);
        col = mix(col, vec4(1.0, 1.0, 1.0, 1.0), uFlash);
        gl_FragColor = col;
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  scene.add(quad);

  // title card on a canvas texture
  const cv = document.createElement('canvas');
  cv.width = 2048;
  cv.height = 512;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  const tmat = new THREE.MeshBasicMaterial({map: tex, transparent: true, depthTest: false, opacity: 0});
  const title = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.25), tmat);
  scene.add(title);
  const drawTitle = () => {
    ctx.clearRect(0, 0, 2048, 512);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 210px Inter, Arial Black, sans-serif';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 26;
    ctx.strokeStyle = '#13235a';
    ctx.strokeText('TIDEBREAKER', 1024, 230);
    const gr = ctx.createLinearGradient(0, 120, 0, 340);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.55, '#dff6ff');
    gr.addColorStop(0.56, '#9fd9ff');
    gr.addColorStop(1, '#e8fbff');
    ctx.fillStyle = gr;
    ctx.fillText('TIDEBREAKER', 1024, 230);
    ctx.font = '800 68px Inter, Arial, sans-serif';
    ctx.lineWidth = 14;
    ctx.strokeText('GUARDIAN OF THE OPEN SEA', 1024, 410);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('GUARDIAN OF THE OPEN SEA', 1024, 410);
    tex.needsUpdate = true;
  };
  drawTitle();
  return {
    scene,
    cam,
    u: mat.uniforms,
    redraw: drawTitle,
    setTitle(op, k, aspect) {
      tmat.opacity = op;
      const w = 2.0 * (1 + 0.04 * (1 - k));
      title.scale.set(w / aspect * 1.0, w, 1);
      title.position.set(0, 0.5, 0);
      title.visible = op > 0.001;
    },
  };
}
