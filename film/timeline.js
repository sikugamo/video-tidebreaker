// Beats (seconds) and the seven shots. Each shot's cam(t, ctx) returns {pos, look, fov, lines?, center?, shake?, roll?}.
export const T = {
  under: 2.4, // cut: underwater, the shape rises
  breach: 3.72, // the whale breaks the surface, the tug is thrown
  headland: 5.6, // cut: the giant on the headland
  alert: 5.95, // visor flash
  crouch: 6.2,
  leap: 6.65,
  air: 7.1, // cut: mid-air tracking
  catch: 8.45,
  landShot: 9.0, // cut: wide on the sea
  land: 9.35,
  wcrash: 10.3, // the whale falls back
  calm: 11.2, // cut: the tug safe on the palm
  horn: 11.85,
  spout: 12.6,
  title: 13.3,
  end: 15.0,
};

export const CRASH = [62, 0, -34];

const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const v = (o) => [o.x, o.y, o.z];

export const SHOTS = [
  {
    id: 'open',
    t1: T.under,
    cam: (t, c) => {
      const k = c.prog(t, 0, T.under, (x) => x);
      const b = v(c.boat.position);
      return {pos: add(b, c.lerpA([16, 4.2, 30], [10, 3.6, 24], k)), look: add(b, c.lerpA([3, 9, -40], [4, 8, -40], k)), fov: 40, shake: 0.4};
    },
  },
  {
    id: 'under',
    t1: T.breach - 0.02,
    cam: (t, c) => {
      const k = c.prog(t, T.under, T.breach, (x) => x);
      const w = v(c.whale.position);
      return {pos: c.lerpA([24, -36, 34], [18, -30, 26], k), look: c.lerpA(w, [0, -2, 0], 0.5), fov: 60, shake: 0.5};
    },
  },
  {
    id: 'breach',
    t1: T.headland,
    cam: (t, c) => {
      const k = c.prog(t, T.breach, T.headland, (x) => 1 - Math.pow(1 - x, 2));
      const lines = 0.8 * Math.max(0, 1 - (t - T.breach) / 0.6);
      return {pos: c.lerpA([60, 2.6, 56], [50, 3.4, 46], k), look: c.lerpA([2, 18, 0], [4, 26, 0], k), fov: 54, lines, center: [-0.1, 0.1]};
    },
  },
  {
    id: 'headland',
    t1: T.air,
    cam: (t, c) => {
      const f = [Math.sin(c.yaw0), 0, Math.cos(c.yaw0)];
      const s = [Math.cos(c.yaw0), 0, -Math.sin(c.yaw0)];
      const k = c.prog(t, T.headland, T.air, (x) => x);
      let pos = add(add([c.R0.x, c.TOP + 3, c.R0.z], f, 58 - 6 * k), s, -24);
      const follow = c.prog(t, T.leap - 0.1, T.leap + 0.45, (x) => 1 - Math.pow(1 - x, 3));
      const look = [c.R0.x + s[0] * -2, c.TOP + 38 + 30 * follow, c.R0.z + s[2] * -2];
      return {pos, look, fov: 50, lines: follow * 0.5 * (1 - c.prog(t, T.leap + 0.2, T.air, (x) => x)), center: [0.05, 0.3]};
    },
  },
  {
    id: 'air',
    t1: T.landShot,
    cam: (t, c) => {
      const side = [-c.fdir.z, 0, c.fdir.x];
      const rp = v(c.rp);
      const b = v(c.boat.position);
      const k = c.prog(t, T.air, T.landShot, (x) => x);
      const pos = add(add(add(rp, side, 118 - 18 * k), v(c.fdir), -16 + 12 * k), [0, 1, 0], -10);
      const look = add(c.lerpA(rp, b, 0.38), [0, 2, 0]);
      const near = Math.exp(-Math.pow((t - T.catch) / 0.25, 2));
      return {pos, look, fov: 42, lines: 0.45 + 0.55 * near, center: [0.0, 0.05], roll: -0.05};
    },
  },
  {
    id: 'land',
    t1: T.calm,
    cam: (t, c) => {
      const L = c.L_XZ;
      const crash = CRASH;
      let d = [L.x - crash[0], 0, L.z - crash[2]];
      const n = Math.hypot(d[0], d[2]);
      d = [d[0] / n, 0, d[2] / n];
      const s = [d[2], 0, -d[0]];
      const k = c.prog(t, T.landShot, T.calm, (x) => x);
      const pos = add(add([L.x, 6 + 2 * k, L.z], d, 80 - 8 * k), s, -70);
      const look = [c.lerp(L.x, crash[0], 0.42), 22, c.lerp(L.z, crash[2], 0.42)];
      return {pos, look, fov: 52};
    },
  },
  {
    id: 'calm',
    t1: T.end + 1,
    cam: (t, c) => {
      const f = v(c.fdir);
      const sR = [f[2], 0, -f[0]];
      const b = v(c.boat.position);
      const k = c.prog(t, T.calm + 0.75, T.end - 0.2, (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2));
      const start = add(add(add(b, f, 15), sR, -9), [0, 3.5, 0]);
      const L = c.L_XZ;
      const end = add(add([L.x, 32, L.z], f, 135), sR, 22);
      const lookEnd = add(add([L.x, 33, L.z], sR, -20), f, 10);
      return {pos: c.lerpA(start, end, k), look: c.lerpA(add(b, [0, 1, 0]), lookEnd, k), fov: c.lerp(38, 46, k), shake: 0};
    },
  },
];
