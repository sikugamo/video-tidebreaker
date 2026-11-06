// The cast: a red tugboat, a humpback whale (one bendable lathe body), and a chrome giant with a posable skeleton.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {toon, inked} from './toon.js';

const INK = '#18203a';

// ---------------------------------------------------------------- tugboat (length along +x, ~9 units)
export function makeBoat() {
  const g = new THREE.Group();
  const hullGeo = new THREE.BoxGeometry(9, 2.6, 3.8, 12, 3, 6);
  const p = hullGeo.getAttribute('position');
  const colors = [];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (x > 1.5) z *= 1 - Math.pow((x - 1.5) / 3.2, 2) * 0.9;
    if (x < -3.6) z *= 0.92;
    if (y < 0) {
      z *= 0.78;
      if (x > 2.5) y += (x - 2.5) * 0.35;
    }
    if (y > 0) y += Math.max(0, x - 2) * 0.25;
    p.setXYZ(i, x, y, z);
    const c = new THREE.Color(y < -0.35 ? '#1e2a50' : '#ffffff');
    colors.push(c.r, c.g, c.b);
  }
  hullGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  hullGeo.computeVertexNormals();
  const hull = inked(hullGeo, toon({color: '#e2352f', shade: '#8e1f3a', vcol: true}), {ink: INK, width: 1.8});
  hull.position.y = 0.6;
  g.add(hull);
  const deck = inked(new THREE.BoxGeometry(7.2, 0.3, 3.0), toon({color: '#f4efe2', shade: '#a9a6c9'}), {outline: false});
  deck.position.set(-0.4, 1.95, 0);
  g.add(deck);
  const cabin = inked(new RoundedBoxGeometry(3.2, 2.2, 2.5, 2, 0.25), toon({color: '#f6f6f2', shade: '#9fa6d4'}), {ink: INK, width: 1.6});
  cabin.position.set(-0.2, 3.1, 0);
  g.add(cabin);
  const win = inked(new THREE.BoxGeometry(3.26, 0.7, 2.56), toon({color: '#23335e', shade: '#141d3a', rim: 0.6, rimColor: '#9fe0ff'}), {outline: false});
  win.position.set(-0.2, 3.45, 0);
  g.add(win);
  const roof = inked(new THREE.BoxGeometry(3.6, 0.35, 2.9), toon({color: '#2f62c4', shade: '#1b3577'}), {ink: INK, width: 1.4});
  roof.position.set(-0.2, 4.35, 0);
  g.add(roof);
  const stack = inked(new THREE.CylinderGeometry(0.45, 0.5, 1.8, 14), toon({color: '#f3c13a', shade: '#b0702d'}), {ink: INK, width: 1.4});
  stack.position.set(-2.4, 3.4, 0);
  g.add(stack);
  const cap = inked(new THREE.CylinderGeometry(0.47, 0.47, 0.4, 14), toon({color: '#1c1f2c', shade: '#0d0f18'}), {outline: false});
  cap.position.set(-2.4, 4.4, 0);
  g.add(cap);
  const tire = new THREE.TorusGeometry(0.42, 0.18, 8, 16);
  const tmat = toon({color: '#2a2d38', shade: '#14161f'});
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const t = inked(tire, tmat, {outline: false});
    t.position.set(-2.6 + i * 2.2, 1.0, s * 1.75);
    g.add(t);
  }
  const mast = inked(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), toon({color: '#ffffff'}), {outline: false});
  mast.position.set(0.6, 5.2, 0);
  g.add(mast);
  return g;
}

// ---------------------------------------------------------------- whale (head toward +x, ~70 units)
export function makeWhale() {
  const g = new THREE.Group();
  const bend = {uBend: {value: 0}, uBendX0: {value: 6}, uBendLen: {value: 40}, uBendAmp: {value: 12}};
  const L = 70;
  const pts = [];
  const N = 48;
  const rProf = (u) => (u >= 1 ? 0.01 : 1.3 + 9.2 * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.25)), 0.75));
  const topAt = (x) => rProf((x + L / 2) / L) * 0.86;
  for (let i = 0; i <= N; i++) {
    const u = i / N; // 0 tail stock -> 1 snout
    pts.push(new THREE.Vector2(rProf(u), u * L - L / 2));
  }
  pts[N].x = 0.001;
  const body = new THREE.LatheGeometry(pts, 40);
  body.rotateZ(-Math.PI / 2);
  // flatten belly, colour: dark back, pale belly with throat grooves
  const p = body.getAttribute('position');
  const cols = [];
  const back = new THREE.Color('#355074');
  const belly = new THREE.Color('#e8eef6');
  const groove = new THREE.Color('#aab8cd');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let y = p.getY(i) * 0.86;
    const z = p.getZ(i);
    if (y < 0) y *= 0.85;
    p.setY(i, y);
    const r = Math.hypot(y, z) + 1e-6;
    const ny = y / r;
    let c = ny < -0.35 + Math.sin(x * 0.4) * 0.06 ? belly : back;
    if (c === belly && x > 4 && x < 33 && Math.abs(Math.sin(Math.atan2(z, -y) * 9)) < 0.25) c = groove;
    cols.push(c.r, c.g, c.b);
  }
  body.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  body.computeVertexNormals();
  const skin = toon({color: '#ffffff', shade: '#7f8fc4', vcol: true, rim: 0.5, rimColor: '#cfefff', bend});
  const bodyM = inked(body, skin, {ink: INK, width: 2.0, bend});
  g.add(bodyM);
  // eyes + head tubercles
  const eyeM = toon({color: '#0d1222', shade: '#0d1222', rim: 0});
  for (const s of [-1, 1]) {
    const e = inked(new THREE.SphereGeometry(0.7, 10, 8), eyeM, {outline: false});
    e.position.set(24, -1.4, s * (rProf((24 + L / 2) / L) - 0.25));
    g.add(e);
  }
  const bumpM = toon({color: '#2d4566', shade: '#1b2b48', rim: 0.3});
  for (let i = 0; i < 14; i++) {
    const b = inked(new THREE.SphereGeometry(0.55, 8, 6), bumpM, {outline: false});
    const x = 26 + (i % 7) * 1.3;
    const z = ((i / 7) | 0 ? 1 : -1) * (1.2 + (i % 3) * 0.9);
    b.position.set(x, Math.sqrt(Math.max(topAt(x) ** 2 - z * z, 0)) - 0.1, z);
    g.add(b);
  }
  // pectoral fins: long and pale
  const finShape = new THREE.Shape();
  finShape.moveTo(0, -1.8);
  finShape.bezierCurveTo(6, -2.6, 16, -2.0, 23, -0.4);
  finShape.bezierCurveTo(16, 1.2, 6, 2.2, 0, 2.0);
  finShape.lineTo(0, -1.8);
  const finGeo = new THREE.ExtrudeGeometry(finShape, {depth: 0.8, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 2, curveSegments: 16});
  finGeo.translate(0, 0, -0.4);
  const finMat = toon({color: '#dfe7f2', shade: '#8696c4', rim: 0.4});
  const fins = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(13, -4.5, s * 7.2);
    pivot.rotation.order = 'YZX';
    const f = inked(finGeo, finMat, {ink: INK, width: 1.8});
    f.rotation.x = Math.PI / 2;
    f.scale.z = s; // mirror
    pivot.add(f);
    g.add(pivot);
    fins.push({pivot, s});
  }
  // flukes
  const fl = new THREE.Shape();
  fl.moveTo(0, 0);
  fl.bezierCurveTo(-3, 3, -6, 8, -9, 12);
  fl.bezierCurveTo(-6.5, 11, -5.5, 6, -6, 2.5);
  fl.quadraticCurveTo(-7.5, 0, -6, -2.5);
  fl.bezierCurveTo(-5.5, -6, -6.5, -11, -9, -12);
  fl.bezierCurveTo(-6, -8, -3, -3, 0, 0);
  const flGeo = new THREE.ExtrudeGeometry(fl, {depth: 0.6, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2, curveSegments: 14});
  flGeo.translate(0, 0, -0.3);
  flGeo.rotateX(Math.PI / 2);
  const tail = new THREE.Group();
  const tailM = inked(flGeo, toon({color: '#3a557a', shade: '#1e2f52', rim: 0.4, rimColor: '#cfefff'}), {ink: INK, width: 1.8});
  tailM.position.x = 1;
  tail.add(tailM);
  g.add(tail);
  const dorsal = inked(new THREE.ConeGeometry(1.6, 3.2, 8), toon({color: '#355074', shade: '#1e2f52'}), {ink: INK, width: 1.6});
  dorsal.position.set(-14, topAt(-14), 0);
  dorsal.rotation.z = 0.7;
  g.add(dorsal);
  const tailX = -L / 2;
  return {
    group: g,
    blowhole: new THREE.Vector3(18, topAt(18) + 0.3, 0),
    topAt,
    pose({bendAmt = 0, fin = 0, finSpread = 0}) {
      bend.uBend.value = bendAmt;
      const b = Math.max(bend.uBendX0.value - tailX, 0) / bend.uBendLen.value;
      tail.position.set(tailX, bendAmt * b * b * bend.uBendAmp.value, 0);
      const slope = (-2 * bendAmt * bend.uBendAmp.value * b) / bend.uBendLen.value;
      tail.rotation.z = Math.atan(slope);
      const yb = (x) => { const k = Math.max(bend.uBendX0.value - x, 0) / bend.uBendLen.value; return bendAmt * k * k * bend.uBendAmp.value; };
      dorsal.position.y = topAt(-14) + yb(-14);
      for (const {pivot, s} of fins) {
        pivot.rotation.set(s * 0.3, -s * (2.1 - finSpread * 0.55), -0.4 + fin * 0.55);
      }
    },
  };
}

// ---------------------------------------------------------------- chrome giant (~57 units tall, faces +z)
export const JOINTS = ['waist', 'chest', 'head', 'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'hipL', 'hipR', 'knL', 'knR', 'anL', 'anR'];
export const STAND_H = 32.5; // pelvis height above the soles when standing straight

export function makeRobot() {
  const chrome = toon({color: '#ffffff', mode: 1, rim: 0.5, rimColor: '#ffffff'});
  const dark = toon({color: '#525c7a', shade: '#2a3049', rim: 0.35, rimColor: '#8fb7ff'});
  const orange = toon({color: '#ff8a2a', shade: '#c0461f', rim: 0.3});
  const glow = toon({color: '#aaf6ff', mode: 2});
  const visorM = toon({color: '#7ff0ff', mode: 2});
  const W = 2.3;
  const rb = (w, h, d, r = 0.8) => new RoundedBoxGeometry(w, h, d, 3, r);
  const put = (parent, geo, mat, x, y, z, opt = {}) => {
    const m = inked(geo, mat, {ink: INK, width: opt.width ?? W, outline: opt.outline ?? true});
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const grp = (parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const J = {};
  // pelvis
  put(root, rb(11, 5, 7.5, 1.2), dark, 0, 0, 0);
  put(root, rb(6, 4, 8.2, 1), chrome, 0, -0.5, 0);
  // legs
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const hip = (J['hip' + k] = grp(root, s * 4.6, -2, 0));
    put(hip, new THREE.SphereGeometry(2.6, 16, 12), dark, 0, 0, 0, {outline: false});
    put(hip, rb(5.6, 12.5, 6.4, 1.4), chrome, 0, -6.6, 0);
    put(hip, rb(6.0, 2.0, 6.8, 0.6), orange, 0, -2.6, 0, {width: 1.6});
    const kn = (J['kn' + k] = grp(hip, 0, -13, 0));
    put(kn, new THREE.SphereGeometry(2.5, 14, 10), dark, 0, 0, 0, {outline: false});
    put(kn, rb(4.2, 4.2, 2.6, 0.9), orange, 0, 0.2, 3.0, {width: 1.6});
    put(kn, rb(6.6, 13.5, 7.4, 1.6), chrome, 0, -7, -0.3);
    put(kn, rb(7.2, 3, 8, 1), dark, 0, -11.6, -0.3);
    const an = (J['an' + k] = grp(kn, 0, -14, 0));
    put(an, rb(7, 3.4, 12, 1.2), chrome, 0, -1.8, 1.8);
    put(an, rb(7.2, 1.2, 12.4, 0.5), dark, 0, -3.2, 1.8, {width: 1.5});
  }
  // torso
  const waist = (J.waist = grp(root, 0, 2.5, 0));
  put(waist, rb(8.5, 6, 6.2, 1.5), dark, 0, 2.5, 0);
  const chest = (J.chest = grp(waist, 0, 5, 0));
  put(chest, rb(21, 11.5, 11.5, 2.6), chrome, 0, 5.8, 0);
  put(chest, rb(15, 5, 12.2, 1.5), chrome, 0, 1.4, 0);
  const hexR = new THREE.CylinderGeometry(3.2, 3.2, 1.2, 6);
  hexR.rotateX(Math.PI / 2);
  put(chest, hexR, orange, 0, 6.2, 5.6, {width: 1.8});
  const hexC = new THREE.CylinderGeometry(2.2, 2.2, 1.3, 6);
  hexC.rotateX(Math.PI / 2);
  put(chest, hexC, glow, 0, 6.2, 5.9, {outline: false});
  put(chest, rb(4, 1.2, 1.2, 0.4), orange, -6.5, 9.4, 5.5, {width: 1.4});
  put(chest, rb(4, 1.2, 1.2, 0.4), orange, 6.5, 9.4, 5.5, {width: 1.4});
  put(chest, rb(10, 3, 4, 1), chrome, 0, 10.8, -4.5); // back pack
  for (const s of [-1, 1]) put(chest, new THREE.CylinderGeometry(1.4, 1.8, 6, 10), dark, s * 3.6, 6, -7.5);
  // head
  const head = (J.head = grp(chest, 0, 11.6, 0.6));
  put(head, new THREE.CylinderGeometry(2, 2.4, 2.4, 12), dark, 0, 0.6, 0, {outline: false});
  put(head, rb(6.4, 6, 6.8, 1.8), chrome, 0, 3.6, 0);
  put(head, rb(5.6, 1.5, 1, 0.45), visorM, 0, 4.1, 3.2, {width: 1.6});
  put(head, rb(0.9, 4.2, 5, 0.4), orange, 0, 7.0, -0.4, {width: 1.6});
  for (const s of [-1, 1]) {
    const ear = new THREE.CylinderGeometry(1.3, 1.3, 1.2, 12);
    ear.rotateZ(Math.PI / 2);
    put(head, ear, dark, s * 3.5, 3.6, 0, {width: 1.6});
  }
  // arms
  const fingers = {L: [], R: []};
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const sh = (J['sh' + k] = grp(chest, s * 13.2, 8.6, 0));
    put(sh, rb(8.6, 7, 9, 2.2), chrome, s * 0.6, 1.6, 0);
    put(sh, rb(8.8, 1.6, 9.2, 0.6), orange, s * 0.6, 0.0, 0, {width: 1.5});
    put(sh, rb(4.8, 11, 5, 1.3), dark, 0, -6.4, 0);
    const el = (J['el' + k] = grp(sh, 0, -12, 0));
    put(el, new THREE.SphereGeometry(2.3, 12, 10), dark, 0, 0, 0, {outline: false});
    put(el, rb(6.4, 11.5, 6.8, 1.7), chrome, 0, -6.2, 0);
    put(el, rb(6.8, 1.4, 7.2, 0.5), orange, 0, -2.0, 0, {width: 1.4});
    const wr = (J['wr' + k] = grp(el, 0, -12.2, 0));
    put(wr, rb(6.4, 4.2, 3.2, 1), dark, 0, -2.3, 0);
    for (let i = 0; i < 4; i++) {
      const f = grp(wr, -2.4 + i * 1.6, -4.2, -0.4);
      put(f, rb(1.35, 4.2, 1.6, 0.5), chrome, 0, -2.0, 0, {width: 1.4});
      fingers[k].push(f);
    }
    const th = grp(wr, -s * 3.2, -2.0, 0.8);
    th.rotation.z = -s * 0.6;
    put(th, rb(1.5, 3.6, 1.7, 0.5), chrome, 0, -1.6, 0, {width: 1.4});
    fingers[k].push(th);
  }
  const palm = {L: J.wrL, R: J.wrR};
  return {
    root,
    J,
    palm,
    glow,
    visorM,
    /** pose: {joint: [x, y, z]}, curlL / curlR in radians (fingers close toward +z / palm side) */
    pose(P) {
      for (const j of JOINTS) {
        const r = P[j] || [0, 0, 0];
        J[j].rotation.set(r[0], r[1], r[2]);
      }
      for (const k of ['L', 'R']) {
        const c = P['curl' + k] ?? 0.15;
        fingers[k].forEach((f, i) => {
          if (i < 4) f.rotation.x = -c;
          else f.rotation.x = -c * 0.7;
        });
      }
    },
  };
}
