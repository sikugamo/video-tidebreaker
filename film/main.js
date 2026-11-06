// TIDEBREAKER — a 15 s cel-shaded short. A tug is thrown skyward by a breaching humpback; a chrome giant leaps from a
// headland, catches it mid-air, lands in the sea, and the whale surfaces beside them under a rainbow spout.
// render(t) is a pure function of time: every track below is evaluated from t, nothing is carried between frames.
import * as THREE from 'three';
import {runSim} from 'teardown-kit/runtime.js';
import {SHARED} from './toon.js';
import {makeSky, makeOcean, makeClouds, makeHeadland, makeShip, makeRays} from './world.js';
import {makeBoat, makeWhale, makeRobot, JOINTS} from './actors.js';
import {makeBursts, makeOverlay, makeRainbow, mulberry} from './fx.js';
import {T, SHOTS, CRASH} from './timeline.js';

THREE.ColorManagement.enabled = false;

const DEFAULTS = {duration: T.end, fps: 24, hud: {enabled: false, title: 'TIDEBREAKER', subtitle: ''}, director: {enabled: false}};

// ---------------------------------------------------------------- easing + tracks
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const io = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outC = (x) => 1 - Math.pow(1 - x, 3);
const inC = (x) => x * x * x;
const lin = (x) => x;
const EASE = {io, out: outC, in: inC, lin};
const lerp = (a, b, k) => a + (b - a) * k;
const lerpA = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
const prog = (t, a, b, e = io) => e(clamp01((t - a) / (b - a)));

/** keyframes [[t, value[], ease?]] — eased per segment (ease of the key you arrive at). */
const kf = (keys) => (t) => {
  if (t <= keys[0][0]) return keys[0][1].slice();
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i];
    const [t1, b, e] = keys[i + 1];
    if (t <= t1) return lerpA(a, b, (EASE[e] || io)((t - t0) / (t1 - t0)));
  }
  return keys[keys.length - 1][1].slice();
};
/** Catmull-Rom through [[t, value[]]] (time-parameterised, non-uniform). */
const cr = (keys) => (t) => {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1].slice();
  if (t >= keys[n - 1][0]) return keys[n - 1][1].slice();
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(i - 1, 0)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(i + 2, n - 1)];
  const dt = k2[0] - k1[0];
  const u = (t - k1[0]) / dt;
  const tan = (a, b, c, ta, tc) => (tc - ta > 0 ? (c - a) / (tc - ta) : (c - b) / Math.max(1e-6, tc - k1[0])) * dt;
  return k1[1].map((p1, j) => {
    const p0 = k0[1][j], p2 = k2[1][j], p3 = k3[1][j];
    const m1 = i === 0 ? p2 - p1 : tan(p0, p1, p2, k0[0], k2[0]);
    const m2 = i + 2 >= n ? p2 - p1 : tan(p1, p2, p3, k1[0], k3[0]);
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
  });
};
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const WAVES = [[1.0, 0.3, 0.020, 1.1], [0.4, 1.0, 0.034, 0.55], [-0.7, 0.6, 0.051, 0.35], [0.9, -0.5, 0.083, 0.2]].map(([x, z, k, a]) => {
  const l = Math.hypot(x, z);
  return [x / l, z / l, k, a];
});
const swellAt = (x, z, t) => {
  let h = 0, gx = 0, gz = 0;
  for (const [dx, dz, k, a] of WAVES) {
    const ph = (dx * x + dz * z) * k + t * Math.sqrt(9.8 * k) * 1.3;
    h += a * Math.sin(ph);
    gx += a * k * Math.cos(ph) * dx;
    gz += a * k * Math.cos(ph) * dz;
  }
  return [h, gx, gz];
};

// ---------------------------------------------------------------- robot poses
const Z = [0, 0, 0];
const P = {
  STAND: {shL: [0.05, 0, -0.2], shR: [0.05, 0, 0.2], elL: [-0.3, 0, 0], elR: [-0.3, 0, 0], hipL: [0, 0, -0.05], hipR: [0, 0, 0.05], curlL: 0.5, curlR: 0.5, head: [0.12, 0.65, 0], chest: [0, 0.12, 0]},
  ALERT: {shL: [-0.1, 0, -0.35], shR: [-0.1, 0, 0.35], elL: [-0.6, 0, 0], elR: [-0.6, 0, 0], hipL: [0, 0, -0.08], hipR: [0, 0, 0.08], curlL: 1.1, curlR: 1.1, head: [-0.12, 0, 0], chest: [-0.05, 0, 0]},
  CROUCH: {waist: [0.45, 0, 0], chest: [0.2, 0, 0], head: [-0.55, 0, 0], shL: [0.9, 0, -0.35], shR: [0.9, 0, 0.35], elL: [-0.5, 0, 0], elR: [-0.5, 0, 0], hipL: [-1.2, 0, -0.12], hipR: [-1.2, 0, 0.12], knL: [2.0, 0, 0], knR: [2.0, 0, 0], anL: [-0.8, 0, 0], anR: [-0.8, 0, 0], curlL: 1.2, curlR: 1.2},
  LEAP: {waist: [-0.25, 0, 0], chest: [-0.1, 0, 0], head: [-0.3, 0, 0], shL: [-2.7, 0, -0.25], shR: [-2.7, 0, 0.25], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], hipL: [0.15, 0, -0.05], hipR: [0.35, 0, 0.05], knL: [0.25, 0, 0], knR: [0.5, 0, 0], anL: [0.6, 0, 0], anR: [0.6, 0, 0], curlL: 0.6, curlR: 0.6},
  FLY: {waist: [-0.1, 0, 0], head: [-0.75, 0, 0], shL: [0.35, 0, -0.25], shR: [-2.95, 0.1, 0.12], elL: [-0.3, 0, 0], elR: [-0.1, 0, 0], wrR: [0.0, 0, 0], hipL: [0.15, 0, -0.08], hipR: [0.05, 0, 0.08], knL: [0.7, 0, 0], knR: [0.25, 0, 0], anL: [0.7, 0, 0], anR: [0.6, 0, 0], curlL: 0.9, curlR: 0.15},
  CATCH: {waist: [0.1, 0, 0], head: [-0.6, 0, 0], shL: [0.2, 0, -0.5], shR: [-2.8, 0.1, 0.12], elR: [-0.25, 0, 0], wrR: [0.0, 0, 0], hipL: [-0.2, 0, -0.08], hipR: [-0.1, 0, 0.08], knL: [0.9, 0, 0], knR: [0.5, 0, 0], anL: [0.5, 0, 0], anR: [0.5, 0, 0], curlL: 0.9, curlR: 1.05},
  TUCK: {waist: [0.3, 0, 0], chest: [0.15, 0, 0], head: [0.1, 0, 0], shL: [-0.6, 0, -0.9], shR: [-0.9, 0, 0.35], elL: [-0.5, 0, 0], elR: [-1.5, 0, 0], hipL: [-1.3, 0, -0.1], hipR: [-0.9, 0, 0.1], knL: [1.6, 0, 0], knR: [1.4, 0, 0], anL: [-0.2, 0, 0], anR: [-0.2, 0, 0], curlL: 0.8, curlR: 0.7},
  LAND: {waist: [0.55, 0, 0], chest: [0.15, 0, 0], head: [-0.35, 0, 0], shL: [-0.2, 0, -1.25], shR: [-1.0, 0, 0.35], elL: [-0.3, 0, 0], elR: [-1.45, 0, 0], hipL: [-1.35, 0, -0.18], hipR: [-0.7, 0, 0.12], knL: [2.05, 0, 0], knR: [1.45, 0, 0], anL: [-0.7, 0, 0], anR: [-0.75, 0, 0], curlL: 0.9, curlR: 0.7},
  RISE: {waist: [0.2, 0, 0], head: [0.1, 0, 0], shL: [0.0, 0, -0.5], shR: [-1.1, -0.1, 0.25], elL: [-0.4, 0, 0], elR: [-0.9, 0, 0], hipL: [-0.5, 0, -0.1], hipR: [-0.3, 0, 0.1], knL: [0.8, 0, 0], knR: [0.6, 0, 0], anL: [-0.3, 0, 0], anR: [-0.3, 0, 0], curlL: 0.6, curlR: 0.4},
  HOLD: {waist: [0.05, 0, 0], chest: [0.02, 0.0, 0], head: [0.42, 0, 0], shL: [0.08, 0, -0.22], shR: [-1.2, -0.12, 0.08], elL: [-0.35, 0, 0], elR: [-0.42, 0, 0], wrR: [0.02, 0, 0], hipL: [0, 0, -0.07], hipR: [0, 0, 0.07], knL: [0.08, 0, 0], knR: [0.08, 0, 0], curlL: 0.55, curlR: 0.22},
};
const poseVal = (p, j) => p[j] ?? (j.startsWith('curl') ? 0.3 : Z);
const KEYS_ALL = [...JOINTS, 'curlL', 'curlR'];
const mixPose = (A, B, k) => {
  const o = {};
  for (const j of KEYS_ALL) {
    const a = poseVal(A, j), b = poseVal(B, j);
    o[j] = Array.isArray(a) ? lerpA(a, b, k) : lerp(a, b, k);
  }
  return o;
};
const POSE_KEYS = [
  [0, P.STAND], [T.alert - 0.05, P.STAND], [T.alert + 0.2, P.ALERT, 'out'], [T.crouch, P.ALERT], [T.leap - 0.08, P.CROUCH, 'out'],
  [T.leap + 0.1, P.LEAP, 'out'], [T.leap + 0.6, P.FLY], [T.catch - 0.12, P.FLY], [T.catch, P.CATCH, 'out'], [T.catch + 0.4, P.TUCK],
  [T.land, P.LAND, 'out'], [T.land + 0.6, P.LAND], [T.calm - 0.1, P.RISE], [T.calm + 0.9, P.HOLD], [T.end, P.HOLD],
];
const poseAt = (t) => {
  if (t <= POSE_KEYS[0][0]) return mixPose(POSE_KEYS[0][1], POSE_KEYS[0][1], 0);
  for (let i = 0; i < POSE_KEYS.length - 1; i++) {
    const [t0, A] = POSE_KEYS[i];
    const [t1, B, e] = POSE_KEYS[i + 1];
    if (t <= t1) return mixPose(A, B, (EASE[e] || io)((t - t0) / (t1 - t0)));
  }
  const L = POSE_KEYS[POSE_KEYS.length - 1][1];
  return mixPose(L, L, 0);
};
// pelvis height above the soles from the leg angles (feet assumed flat)
const pelvisH = (p) => {
  const leg = (h, k) => 2 + 13 * Math.cos(h) + 14 * Math.cos(h + k) + 3.5;
  return Math.max(leg(p.hipL[0], p.knL[0]), leg(p.hipR[0], p.knR[0]));
};

runSim(DEFAULTS, async ({canvas}) => {
  const rand = mulberry(20261105);
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true});
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 20000);

  const sky = makeSky();
  scene.add(sky);
  const ocean = makeOcean();
  scene.add(ocean.group);
  scene.add(makeClouds(rand));
  const HC = new THREE.Vector3(-30, 0, -190);
  const head = makeHeadland(rand);
  head.position.copy(HC);
  scene.add(head);
  const ship = makeShip(rand);
  scene.add(ship);
  const ship2 = makeShip(rand);
  ship2.scale.setScalar(0.9);
  scene.add(ship2);
  const rays = makeRays(rand);
  scene.add(rays);
  const boat = makeBoat();
  scene.add(boat);
  const whale = makeWhale();
  whale.group.rotation.order = 'YZX';
  scene.add(whale.group);
  const robot = makeRobot();
  scene.add(robot.root);
  const water = makeBursts(rand, {cap: 4200});
  const mist = makeBursts(rand, {cap: 1400, shade: '#c9d6f5', ink: '#9fb2e0', width: 0.8, detail: 0});
  const rocks = makeBursts(rand, {color: '#e9a54a', shade: '#9b5a34', ink: '#4a2a1e', width: 1.4, cap: 500, detail: 0});
  scene.add(water.group, mist.group, rocks.group);
  const rainbow = makeRainbow();
  scene.add(rainbow.mesh);
  const overlay = makeOverlay();

  // headland top height under the robot
  head.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(HC.x, 200, HC.z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObjects(head.children, false).filter((h) => h.object.material.type === 'ShaderMaterial' && h.object.material.side !== THREE.BackSide);
  const TOP = hit.length ? hit[0].point.y - 0.6 : 24;

  // ------------------------------------------------------------ boat: cruising, then thrown
  const boatCruise = (t) => [4 * (t - T.breach), 0, 0];
  const boatThrow = cr([
    [T.breach, [0, 0, 0]], [T.breach + 0.55, [1.4, 13, 0.4]], [T.breach + 1.5, [4.8, 32, 1.2]], [T.breach + 2.6, [8.8, 45, 2]],
    [T.breach + 3.7, [13, 47, 2.4]], [T.catch, [16, 41, 2.6]],
  ]);
  const boatRotThrow = (t) => {
    const a = t - T.breach;
    return [a * 1.3 + 0.25 * Math.sin(a * 2), 0.15 * a, -0.6 * a - 0.3 * Math.sin(a * 1.5)];
  };

  // ------------------------------------------------------------ robot flight path
  const yaw0 = Math.atan2(40, 190);
  const yawF = Math.atan2(16 - HC.x, 2.6 - HC.z);
  const fdir = new THREE.Vector3(Math.sin(yawF), 0, Math.cos(yawF));
  const ROT = kf([
    [0, [0, yaw0, 0]], [T.leap - 0.05, [0, yaw0, 0]], [T.leap + 0.15, [0.35, yawF, 0], 'out'], [T.leap + 0.7, [1.25, yawF, 0.08]],
    [T.catch, [1.15, yawF, -0.12]], [T.catch + 0.45, [0.45, yawF, 0]], [T.land, [0.08, yawF, 0], 'out'], [T.land + 1, [0, yawF, 0]],
    [T.calm, [0, yawF - 0.1, 0]], [T.end, [0, yawF - 0.14, 0]],
  ]);
  const attachLocal = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));
  attachLocal.setPosition(0, -5.0, 2.1);
  // where the palm is, relative to the root, in the catch pose
  const placeRobot = (t, rootPos) => {
    const p = poseAt(t);
    robot.pose(p);
    const r = ROT(t);
    robot.root.rotation.set(r[0], r[1], r[2]);
    robot.root.position.copy(rootPos);
    robot.root.updateMatrixWorld(true);
    return p;
  };
  placeRobot(T.catch, new THREE.Vector3());
  const palmOff = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(robot.J.wrR.matrixWorld, attachLocal));
  const C_ROOT = V3(boatThrow(T.catch)).sub(palmOff);
  const R0 = new THREE.Vector3(HC.x, TOP, HC.z);
  const SEA_FLOOR = -14;
  const L_XZ = new THREE.Vector3(C_ROOT.x, 0, C_ROOT.z).addScaledVector(fdir, 48);
  const landH = SEA_FLOOR + pelvisH(mixPose(P.LAND, P.LAND, 0));
  const crouchH = TOP + pelvisH(mixPose(P.CROUCH, P.CROUCH, 0));
  const FLIGHT = cr([
    [T.leap - 0.08, [R0.x, crouchH, R0.z]],
    [T.leap + 0.2, [R0.x + fdir.x * 6, crouchH + 16, R0.z + fdir.z * 6]],
    [lerp(T.leap, T.catch, 0.55), lerpA(R0.toArray(), C_ROOT.toArray(), 0.5).map((v, i) => (i === 1 ? Math.max(C_ROOT.y, R0.y) + 24 : v))],
    [T.catch, C_ROOT.toArray()],
    [lerp(T.catch, T.land, 0.5), [lerp(C_ROOT.x, L_XZ.x, 0.6), lerp(C_ROOT.y, landH, 0.35), lerp(C_ROOT.z, L_XZ.z, 0.6)]],
    [T.land, [L_XZ.x, landH, L_XZ.z]],
  ]);
  const rootAt = (t, p) => {
    if (t < T.leap - 0.08) return new THREE.Vector3(R0.x, TOP + pelvisH(p), R0.z);
    if (t < T.land) return V3(FLIGHT(t));
    return new THREE.Vector3(L_XZ.x, SEA_FLOOR + pelvisH(p), L_XZ.z);
  };

  // ------------------------------------------------------------ whale path: [x,y,z], [roll, yaw, pitch]
  const W_POS = cr([
    [0, [-70, -30, 4]], [T.under, [-34, -48, 6]], [T.breach - 0.2, [-6, -26, 0]], [T.breach, [-3, -20, 0]],
    [T.breach + 0.6, [0, 2, 0]], [T.breach + 1.3, [2, 17, -1]], [T.headland, [3, 25, -3]], [T.air, [22, 33, -14]], [T.catch, [42, 25, -24]],
    [T.wcrash - 0.6, [55, 14, -31]], [T.wcrash, CRASH], [T.wcrash + 0.6, [CRASH[0] + 3, -18, CRASH[2] - 2]],
  ]);
  const W_ROT = kf([
    [0, [0, 0, 0.0]], [T.under, [0, 0, 0.15]], [T.breach - 0.3, [0, 0, 1.0], 'in'], [T.breach + 0.5, [0.2, 0, 1.25]],
    [T.headland, [0.9, -0.3, 1.3]], [T.catch, [2.2, -0.5, 0.7]], [T.wcrash, [2.9, -0.6, -0.2]], [T.wcrash + 0.6, [3.0, -0.6, -0.4]],
  ]);
  const sRv = new THREE.Vector3(fdir.z, 0, -fdir.x);
  const WC = L_XZ.clone().addScaledVector(sRv, -44).addScaledVector(fdir, 22);
  const W_CALM_POS = (t) => [WC.x, lerp(-13, 0.2, prog(t, T.calm, T.calm + 1.4, outC)) + 0.35 * Math.sin(t * 1.3), WC.z];
  const W_CALM_ROT = [0.12, yawF, 0.16];
  const whaleAt = (t) => {
    if (t >= T.calm) return {p: W_CALM_POS(t), r: W_CALM_ROT, bend: 0.12 * Math.sin(t * 1.6), fin: 0.3 * Math.sin(t * 1.2), spread: 0.2};
    const bend = t < T.breach ? 0.25 * Math.sin(t * 2.4) : t < T.wcrash ? 0.35 * Math.sin((t - T.breach) * 1.4) : -0.3;
    return {p: W_POS(t), r: W_ROT(t), bend, fin: Math.sin(t * 1.8) * 0.5, spread: t > T.breach ? 0.8 : 0.1};
  };
  const poseWhale = (t) => {
    const w = whaleAt(t);
    whale.group.position.set(w.p[0], w.p[1], w.p[2]);
    whale.group.rotation.set(w.r[0], w.r[1], w.r[2]);
    whale.pose({bendAmt: w.bend, fin: w.fin, finSpread: w.spread});
    whale.group.updateMatrixWorld(true);
  };
  poseWhale(T.spout);
  const BLOW = whale.blowhole.clone().applyMatrix4(whale.group.matrixWorld);

  // ------------------------------------------------------------ bursts
  water.add({t0: T.breach - 0.05, pos: [0, -1, 0], n: 520, speed: [14, 46], cone: 0.32, size: [0.9, 3.4], life: [1.8, 3.2], g: -16, drag: 0.5, spread: 13, delay: 0.35, seed: 11});
  water.add({t0: T.breach, pos: [0, 0, 0], n: 380, speed: [14, 30], cone: 1.15, ring: 0.7, size: [0.9, 3.0], life: [1.4, 2.4], g: -18, drag: 0.8, spread: 14, delay: 0.2, seed: 12});
  water.add({t0: T.headland - 0.4, pos: [3, 2, -2], n: 300, speed: [1, 6], cone: 0.6, size: [0.8, 2.6], life: [2.0, 3.5], g: -14, drag: 0.6, spread: 7, delay: 2.0, seed: 13, floor: -50});
  mist.add({t0: T.breach, pos: [0, 0, 0], n: 500, speed: [10, 40], cone: 0.9, size: [0.4, 1.2], life: [1.5, 3.0], g: -8, drag: 1.2, spread: 14, delay: 0.6, seed: 14});
  rocks.add({t0: T.leap - 0.04, pos: [R0.x, TOP + 0.5, R0.z], n: 160, speed: [8, 34], cone: 1.25, ring: 0.3, size: [0.5, 2.6], life: [1.0, 2.2], g: -40, drag: 0.4, spread: 6, seed: 15, floor: -200});
  mist.add({t0: T.leap - 0.04, pos: [R0.x, TOP + 0.5, R0.z], n: 220, speed: [6, 22], cone: 1.4, ring: 0.7, size: [0.8, 2.4], life: [0.8, 1.8], g: -2, drag: 1.5, spread: 8, seed: 16, floor: -200});
  water.add({t0: T.land - 0.02, pos: [L_XZ.x, 0, L_XZ.z], n: 700, speed: [20, 46], cone: 0.55, ring: 0.65, size: [1.0, 4.2], life: [1.2, 1.75], g: -26, drag: 0.6, spread: 10, delay: 0.12, seed: 17});
  water.add({t0: T.land, pos: [L_XZ.x, 0, L_XZ.z], n: 250, speed: [24, 50], cone: 0.25, size: [1.0, 3.0], life: [1.1, 1.7], g: -26, drag: 0.6, spread: 8, delay: 0.15, seed: 18});
  mist.add({t0: T.land, pos: [L_XZ.x, 0, L_XZ.z], n: 300, speed: [8, 30], cone: 1.2, ring: 0.6, size: [0.5, 1.4], life: [1.0, 1.6], g: -6, drag: 1.4, spread: 16, delay: 0.3, seed: 19});
  water.add({t0: T.wcrash - 0.1, pos: CRASH, n: 1000, speed: [22, 66], cone: 0.55, ring: 0.4, size: [1.6, 5.6], life: [1.5, 2.4], g: -24, drag: 0.5, spread: 22, delay: 0.5, seed: 20});
  mist.add({t0: T.wcrash, pos: CRASH, n: 300, speed: [10, 40], cone: 1.0, size: [0.8, 2.0], life: [1.2, 2.2], g: -6, drag: 1.2, spread: 26, delay: 0.5, seed: 21});
  water.add({t0: T.spout, pos: BLOW.toArray(), n: 260, speed: [26, 44], cone: 0.16, size: [0.4, 1.4], life: [1.2, 2.2], g: -14, drag: 0.9, spread: 0.6, delay: 0.7, seed: 22});
  mist.add({t0: T.spout + 0.1, pos: BLOW.toArray(), n: 380, speed: [20, 36], cone: 0.3, size: [0.4, 1.3], life: [1.6, 2.8], g: -5, drag: 1.0, spread: 1, delay: 1.0, seed: 23});

  const RINGS = [
    [0, 0, T.breach, 1.3, 20, 1.2],
    [L_XZ.x, L_XZ.z, T.land, 1.0, 24, 1.0],
    [CRASH[0], CRASH[2], T.wcrash, 1.4, 22, 1.4],
    [WC.x, WC.z, T.calm, 0.45, 9, 0.5],
    [BLOW.x, BLOW.z, T.spout, 0.25, 8, 0.2],
    [0, 0, T.breach - 0.5, 0.5, 8, 0.6],
  ];
  RINGS.forEach((r, i) => {
    ocean.uniforms.uRings.value[i].set(r[0], r[1], r[2], r[3]);
    ocean.uniforms.uRingR.value[i].set(r[4], r[5]);
  });

  const IMPACTS = [[T.breach, 1.0], [T.leap, 0.6], [T.catch, 0.8], [T.land, 1.3], [T.wcrash, 1.0]];
  const shake = (t) => {
    let x = 0, y = 0;
    for (const [ti, a] of IMPACTS) {
      const d = t - ti;
      if (d < 0 || d > 1.2) continue;
      const k = a * Math.exp(-d * 5);
      x += k * Math.sin(d * 71) * 0.9;
      y += k * Math.cos(d * 53) * 0.9;
    }
    return [x, y];
  };

  const visorBase = new THREE.Color('#7ff0ff');
  const glowBase = new THREE.Color('#aaf6ff');
  const tmpM = new THREE.Matrix4();
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const resize = () => {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(devicePixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    SHARED.uRes.value.copy(db);
    overlay.u.uAspect.value = w / h;
  };
  resize();

  function render(t) {
    SHARED.uTime.value = t;
    ocean.uniforms.uTime.value = t;
    const shot = SHOTS.find((s) => t < s.t1) || SHOTS[SHOTS.length - 1];
    const under = shot.id === 'under';

    // --- robot
    const pose = placeRobot(t, new THREE.Vector3());
    const rp = rootAt(t, pose);
    robot.root.position.copy(rp);
    robot.root.updateMatrixWorld(true);
    const flash = Math.exp(-Math.max(0, t - T.alert) * 6) * (t >= T.alert ? 1 : 0);
    robot.visorM.uniforms.uColor.value.copy(visorBase).lerp(new THREE.Color(1, 1, 1), flash);
    robot.glow.uniforms.uColor.value.copy(glowBase).lerp(new THREE.Color(1, 1, 1), flash * 0.8 + (t > T.leap && t < T.land ? 0.3 : 0));

    // --- boat
    if (t < T.breach) {
      const b = boatCruise(t);
      const [h, gx, gz] = swellAt(b[0], b[2], t);
      const lift = 1.6 * prog(t, T.breach - 0.7, T.breach, inC);
      boat.position.set(b[0], h + 0.1 * Math.sin(t * 2.1) - 0.05 + lift, b[2]);
      boat.rotation.set(Math.atan(gz) + 0.04 * Math.sin(t * 1.7), 0, -Math.atan(gx) * -1 + 0.03 * Math.sin(t * 2.3 + 1) + lift * 0.08);
    } else {
      // attached pose
      tmpM.multiplyMatrices(robot.J.wrR.matrixWorld, attachLocal);
      tmpM.decompose(tmpV, tmpQ, tmpS);
      if (t >= T.catch) {
        boat.position.copy(tmpV);
        boat.quaternion.copy(tmpQ);
      } else {
        const b = boatThrow(t);
        const r = boatRotThrow(t);
        boat.position.set(b[0], b[1], b[2]);
        boat.rotation.set(r[0], r[1], r[2]);
        const k = prog(t, T.catch - 0.12, T.catch, io);
        if (k > 0) {
          boat.position.lerp(tmpV, k);
          boat.quaternion.slerp(tmpQ, k);
        }
      }
    }
    ocean.uniforms.uBoat.value.set(boat.position.x, boat.position.z, 1, 0);
    ocean.uniforms.uBoatOn.value = t < T.breach ? 1 : 0;

    // --- whale
    poseWhale(t);
    whale.group.visible = shot.id !== 'air';
    const sh = prog(t, 0.2, 1.6, io) * 0.7;
    const sk = prog(t, 0.0, T.under + 0.4, (x) => x);
    ocean.uniforms.uShadow.value.set(boat.position.x + lerp(-14, 0, sk), boat.position.z + lerp(-58, -4, sk), 30, t < T.breach ? sh : 0);
    ocean.uniforms.uShadowDir.value.set(0.25, 0.97);

    // --- ships
    ship.position.set(-420 + t * 5, 0, -900);
    ship2.position.set(520 - t * 4, 0, 420);
    ship2.rotation.y = Math.PI * 0.92;

    // --- fx
    water.render(t);
    mist.render(t);
    rocks.render(t);
    const sp = prog(t, T.spout + 0.4, T.spout + 1.3, io) * (1 - prog(t, T.end - 0.6, T.end + 2, io));
    rainbow.mat.uniforms.uOp.value = sp;
    rainbow.mesh.position.set(BLOW.x - fdir.x * 62 + sRv.x * 26, -4, BLOW.z - fdir.z * 62 + sRv.z * 26);
    rainbow.mesh.rotation.y = yawF;
    rays.visible = under;
    rays.children.forEach((m) => {
      m.material.uniforms.uOp.value = 1;
      m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
      m.scale.x = 1 + 0.25 * Math.sin(t * 1.3 + m.userData.phase);
    });

    // --- environment mode
    SHARED.uUnder.value = under ? 1 : 0;
    if (under) {
      SHARED.uFogColor.value.set('#1b9cc2');
      SHARED.uFogNear.value = 8;
      SHARED.uFogFar.value = 190;
    } else {
      SHARED.uFogColor.value.set('#cfe6ff');
      SHARED.uFogNear.value = 500;
      SHARED.uFogFar.value = 6500;
    }
    ocean.uniforms.uSwell.value = 1;

    // --- camera
    const c = shot.cam(t, {boat, robot, rp, whale: whale.group, L_XZ, R0, TOP, C_ROOT, fdir, yaw0, HC, BLOW, prog, lerp, lerpA});
    camera.position.set(...c.pos);
    const tgt = new THREE.Vector3(...c.look);
    const [sx, sy] = shake(t);
    const s = (c.shake ?? 1) * camera.position.distanceTo(tgt) * 0.006;
    tgt.x += sx * s;
    tgt.y += sy * s;
    camera.up.copy(up);
    camera.lookAt(tgt);
    if (c.roll) camera.rotateZ(c.roll);
    camera.fov = c.fov;
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position);
    ocean.follow(camera);

    // --- overlay
    const ov = overlay.u;
    ov.uTime.value = t;
    ov.uLines.value = c.lines ?? 0;
    let fl = 0;
    for (const [ti, a] of [[T.breach, 0.55], [T.alert, 0.0], [T.leap, 0.35], [T.catch, 0.32], [T.land, 0.4], [T.wcrash, 0.25]]) {
      const d = t - ti;
      if (d >= 0 && d < 0.5) fl = Math.max(fl, a * Math.exp(-d * 11));
    }
    ov.uFlash.value = fl;
    ov.uCenter.value.set(c.center?.[0] ?? 0, c.center?.[1] ?? 0);
    ov.uVig.value = under ? 0.55 : 0.22;
    const top = prog(t, T.title, T.title + 0.7, outC);
    overlay.setTitle(top, top, camera.aspect);

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(overlay.scene, overlay.cam);
    return {};
  }

  return {render, resize};
});
