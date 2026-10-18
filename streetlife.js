// Everyday street life, in the way of the CEO's errands: motorbikes weaving through the traffic (a helmeted
// rider on each), rows of bikes parked across the sidewalks, street food on low plastic stools under umbrellas
// (a pot steaming on the cart, the dish on a raised sign), vendors with a shoulder pole and two baskets, vendor
// bicycles piled with flowers or fruit, a market on a square, motorbike-taxi drivers calling out at the corners.
//
// All of it is real geometry. The static things are batched per two-block square (hidden past the haze, small
// details past 90 m) and are walls (host.addWalls), so the CEO, the assistant and a driven car stop at them and
// bumping them gets a word. The people in it come from the model library, only near the CEO.
//
// createStreetLife(host, street) → { update(dt) }

import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { t } from '/i18n.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pickOf = (r, list) => list[Math.floor(r() * list.length)];
const SLAB = 0.1;   // the paving's top

// ---------------------------------------------------------------- shapes (built once; all parts carry vertex colours)

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
// a part: a fresh geometry placed and coloured, made non-indexed so any parts merge together
function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const merge = (parts) => { const g = mergeGeometries(parts); g.computeBoundingSphere(); return g; };
const extrude = (pts, width, bevel = 0.02) => {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], k) => (k ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  return g.translate(0, 0, -(width - 2 * bevel) / 2);
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 10, open = false) => new THREE.CylinderGeometry(r0, r1, h, n, 1, open);
// a closed lathed solid from a profile [[r, y], ...] that starts and ends on the axis (or loops back on itself):
// shells (bowls, glasses, baskets, canopies) get a wall with an inside, an outside and a rim between
// (wound counter-clockwise in r/y, so the faces look outwards whichever way round the profile was written)
const ccw = (pts) => (pts.reduce((a, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return a + x * y2 - x2 * y; }, 0) < 0 ? pts.slice().reverse() : pts);
const shell = (pts, n = 24) => new THREE.LatheGeometry(ccw(pts).map(([x, y]) => new THREE.Vector2(x, y)), n);
// a rod from a to b
const rod = (a, b, r, color, n = 6) => {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = cyl(r, r, len, n);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return part(g, color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
};

export const MAT = {
  vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 }),
  vc2: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide }),   // cloth, canopies
  paint: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.45 }),                          // bikes: colour per instance
  plastic: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 }),                            // stools, tables, tarps
  tarp: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide }),
  glass: new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false }),
  steam: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }),
  straw: new THREE.MeshStandardMaterial({ color: 0xd8c48c, roughness: 0.9 }),
};
export const BIKE_PAINT = [0xc81e1e, 0x151515, 0xf2f2f2, 0x1d4f9a, 0xa7acb3, 0x6e1420, 0x2f6b3c, 0xe0b81e, 0x4a2a6a];
const PLASTIC = [0xd32b2b, 0x2a6fd1, 0xd32b2b, 0x2fa44f, 0xe8d23a];
const TARPS = [0x2f6fd8, 0xd8402f, 0xf08a22, 0x2fa45a, 0x7a3fb0, 0x3fb6c9];
export const HELMETS = [0xf4f4f4, 0xc8241f, 0x151515, 0xf2c21b, 0x2457b8, 0xe86fa4, 0x3d8a3f];

// A motorbike, facing +x, wheels on the ground: the body panels (one paint, modelled white) and everything else.
// A step-through city scooter: a curved front apron with the headlight and the turn signals, a handlebar cover
// with the speedo, the mirrors on stems, a flat floorboard with a ribbed rubber mat, side panels swelling under a
// padded seat (piping along its edges), a grab rail, the tail light and the plate on its flap. Under it the swing-arm
// engine (finned cylinder, belt case), a shock with its coil spring, the exhaust with a heat shield, both stands
// folded, the passenger's pegs; telescopic forks with rubber boots, a disc and caliper in front, a drum at the back,
// alloy wheels with six spokes and tyres with a rounded, treaded section.
function makeBike(lo = 0) {   // lo: 1 the far version, the same shapes in far fewer triangles without the small parts; 2 the distant one
  const W = 0xffffff, PI = Math.PI, FX = 0.66, RX = -0.66, AY = 0.3;   // the axles
  const q = (a, b, c = b) => [a, b, c][lo], near = (list) => (lo ? [] : list), mid = (list) => (lo > 1 ? [] : list);
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]), len3 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const smoothstep = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  // shade smooth across gentle bends, keep the folds (toCreasedNormals hashes positions to 1 cm: work at 100x)
  const soft = (g, crease = 0.85) => {
    g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('normal'); g.scale(100, 100, 100);
    return toCreasedNormals(g, crease).scale(0.01, 0.01, 0.01);
  };
  // a solid with rolled edges: a smooth closed outline (x, y) extruded `width` across z, centred
  const slab = (pts, width, bev, n = 32, segs = 2, smooth = true) => {
    const ring = smooth ? new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal').getSpacedPoints(q(n, Math.max(8, Math.round(n * 0.45)), Math.max(6, Math.round(n * 0.25)))).slice(0, -1) : pts.map(([x, y]) => ({ x, y }));
    const sh = new THREE.Shape(ring.map((v) => new THREE.Vector2(v.x, v.y)));
    if (bev < q(0, 0.015, 0.03)) return new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, -width / 2);   // far: small edges unrounded
    return new THREE.ExtrudeGeometry(sh, { depth: width - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: lo ? 1 : segs, curveSegments: 8 })
      .translate(0, 0, -(width - 2 * bev) / 2);
  };
  // reshape vertex by vertex, then shade
  const warp = (g, fn, crease) => { const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { fn(v.fromBufferAttribute(p, i)); p.setXYZ(i, v.x, v.y, v.z); }
    return soft(g, crease); };
  // a closed ring profile [[r, y], ...] lathed round y
  const ring = (pts, n) => shell([...pts, pts[0]], n);
  // a geometry built up the y axis from 0, laid along a → b
  const lay = (g, a, b) => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    return g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)).translate(a[0], a[1], a[2]); };
  const cylUp = (rb, rt, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n).translate(0, h / 2, 0);
  const tube = (pts, r, color, n = 24, sides = 6) => part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V3), false, 'centripetal'), q(n, Math.ceil(n / 2), Math.ceil(n / 3)), r, q(sides, 4, 3), false), color);
  // an arc of a mudguard round an axle: angles a0..a1 (0 = forwards), radii r0..r1, width w
  const arc = (a0, a1, r0, r1, w) => {
    const sh = new THREE.Shape(); sh.absarc(0, 0, r1, a0, a1, false); sh.absarc(0, 0, r0, a1, a0, true);
    return soft(new THREE.ExtrudeGeometry(sh, { depth: w - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelOffset: -0.006, bevelSegments: q(2, 1), curveSegments: q(9, 5) }).translate(0, 0, -(w - 0.012) / 2));
  };
  // a lens or lamp face drawn in (z, y), its depth along x
  const lens = (pts, depth, bev, n = 12) => slab(pts, depth, bev, n, 1, n > 0).rotateY(PI / 2);

  // ---- wheels
  const TYRE = (() => {   // a rounded section with a groove round the crown, lathed; the tread blocks staggered either side
    const half = lo ? [[0.205, 0.042], [0.262, 0.057], [0.294, 0.04], [0.3, 0.012], [0.3, 0]] : [[0.205, 0.042], [0.25, 0.057], [0.28, 0.053], [0.294, 0.04], [0.3, 0.018], [0.295, 0.006], [0.295, 0]];
    const prof = [...half, ...half.slice(0, -1).reverse().map(([r, y]) => [r, -y])];
    const N = q(28, 12, 8), g = ring(prof, N), p = g.attributes.position, P = prof.length + 1;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z), col = Math.floor(i / P);
      if (lo || r < 0.2975 || (col + (y > 0 ? 1 : 0)) % 2) continue;
      const k = (r - 0.0065) / r; p.setX(i, x * k); p.setZ(i, z * k);
    }
    g.computeVertexNormals();
    return g.rotateX(PI / 2);
  })();
  const RIM = lo ? ring([[0.17, 0.038], [0.215, 0.05], [0.2, 0], [0.215, -0.05], [0.17, -0.038]], q(0, 10, 8)).rotateX(PI / 2) : ring([[0.172, 0.036], [0.198, 0.04], [0.212, 0.05], [0.217, 0.046], [0.207, 0.036], [0.2, 0], [0.207, -0.036], [0.217, -0.046], [0.212, -0.05], [0.198, -0.04], [0.172, -0.036], [0.166, 0]], q(20, 12)).rotateX(PI / 2);
  const HUB = shell([[0, 0.062], [0.03, 0.062], [0.046, 0.045], [0.05, 0], [0.046, -0.045], [0.03, -0.062], [0, -0.062]], q(14, 6, 5)).rotateX(PI / 2);
  const SPOKE = warp(slab([[0.035, -0.019], [0.1, -0.012], [0.168, -0.015], [0.176, -0.004], [0.176, 0.012], [0.168, 0.02], [0.1, 0.011], [0.035, 0.019]], 0.026, 0.007, 12, 1),
    (v) => { v.y += 0.028 * ((v.x - 0.035) / 0.14) ** 2; v.z *= 1 - 0.3 * (v.x - 0.035) / 0.14; });
  const NUT = cyl(0.016, 0.016, 0.022, 6);
  const wheel = (x, rimC) => [
    part(TYRE.clone(), 0x161617, x, AY, 0),
    part(RIM.clone(), rimC, x, AY, 0),
    part(HUB.clone(), 0x7d8288, x, AY, 0),
    ...Array.from({ length: q(6, 3, 0) }, (_, k) => part(SPOKE.clone(), rimC, x, AY, 0, 0, 0, k * PI / q(3, 1.5))),
    ...(lo > 1 ? [part(cyl(0.17, 0.17, 0.03, 8), rimC, x, AY, 0, PI / 2, 0, 0)] : []),   // distant: the wheel's face
    ...near([-1, 1].map((s) => part(NUT.clone(), 0xb6bbc1, x, AY, s * 0.115, PI / 2, 0, 0))),
  ];

  // ---- body panels (paint)
  const FRONT = warp(slab([[0.19, 0.33], [0.25, 0.62], [0.31, 0.86], [0.36, 0.975], [0.43, 1.0], [0.52, 0.985], [0.59, 0.92], [0.625, 0.82], [0.62, 0.72], [0.585, 0.665],
    [0.52, 0.655], [0.47, 0.605], [0.42, 0.53], [0.38, 0.45], [0.35, 0.33], [0.3, 0.25], [0.2, 0.25]], 0.44, 0.04, 36),
  (v) => { v.z *= 0.72 + 0.28 * Math.sin(clamp((v.y - 0.3) / 0.75, 0, 1) * PI); v.x -= 0.9 * v.z * v.z; });   // the apron wraps round the knees
  const FLOOR = soft(slab([[-0.32, 0.33], [0.27, 0.33], [0.31, 0.28], [0.27, 0.2], [-0.24, 0.2], [-0.33, 0.26]], 0.34, 0.035, 0, 2, false));
  const CORE = warp(slab([[-0.2, 0.33], [-0.24, 0.5], [-0.3, 0.68], [-0.345, 0.75], [-0.6, 0.758], [-0.85, 0.752], [-0.94, 0.732], [-0.966, 0.69], [-0.94, 0.655],
    [-0.8, 0.65], [-0.6, 0.655], [-0.45, 0.62], [-0.38, 0.55], [-0.33, 0.42], [-0.29, 0.3]], 0.26, 0.03, 36),
  (v) => { v.z *= 1 - 0.3 * smoothstep(-0.55, -0.97, v.x); });
  const SIDE_PTS = [[-0.24, 0.46], [-0.3, 0.62], [-0.36, 0.745], [-0.62, 0.755], [-0.86, 0.745], [-0.95, 0.715], [-0.958, 0.665], [-0.9, 0.625], [-0.75, 0.6], [-0.55, 0.535], [-0.4, 0.485], [-0.3, 0.455]];
  const SIDE = (s) => warp(slab(SIDE_PTS, 0.05, 0.018, 36), (v) => {   // a side panel, swelling out over the engine
    const bump = Math.exp(-(((v.x + 0.55) / 0.28) ** 2 + ((v.y - 0.62) / 0.13) ** 2));
    v.z += s * (0.145 + 0.024 * bump) * (1 - 0.22 * smoothstep(-0.6, -0.96, v.x));
  });
  const COVER = warp(slab([[0.33, 1.0], [0.345, 1.065], [0.41, 1.11], [0.51, 1.105], [0.575, 1.06], [0.565, 1.0], [0.47, 0.975], [0.38, 0.978]], 0.44, 0.035, 30),
    (v) => { v.z *= 1 - 0.35 * smoothstep(1.0, 1.11, v.y) - 0.15 * smoothstep(0.45, 0.58, v.x); });   // the handlebar cover
  const paint = merge([
    part(FRONT, W), part(FLOOR, W), part(CORE, W), part(SIDE(1), W), part(SIDE(-1), W), part(COVER, W),
    part(arc(0.26, 2.1, 0.318, 0.334, 0.11), W, FX, AY, 0),   // front mudguard
  ]);

  // ---- the seat: padded, narrow at the nose, a step up to the passenger; piping round its top edge
  const seatW = (x) => (0.62 + 0.38 * smoothstep(-0.28, -0.44, x)) * (1 - 0.15 * smoothstep(-0.8, -0.95, x));
  const SEAT_TOP = [[-0.29, 0.815], [-0.32, 0.846], [-0.4, 0.858], [-0.5, 0.856], [-0.62, 0.862], [-0.74, 0.878], [-0.86, 0.876], [-0.93, 0.852]];
  const SEAT = warp(slab([...SEAT_TOP, [-0.955, 0.81], [-0.942, 0.768], [-0.88, 0.745], [-0.6, 0.742], [-0.36, 0.745], [-0.285, 0.765]], 0.3, 0.04, 36), (v) => { v.z *= seatW(v.x); });
  const seatTop = new THREE.CatmullRomCurve3(SEAT_TOP.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal').getPoints(16);
  const piping = (s) => tube(seatTop.map((p) => [p.x, p.y - 0.011, s * 0.139 * seatW(p.x)]), 0.0055, 0x4a4b4e, 20, 4);

  // ---- engine and rear suspension
  const CASE = soft(slab([[-0.765, 0.3], [-0.735, 0.37], [-0.66, 0.4], [-0.45, 0.43], [-0.25, 0.465], [-0.12, 0.425], [-0.07, 0.33], [-0.12, 0.235], [-0.22, 0.2], [-0.45, 0.215], [-0.66, 0.2], [-0.735, 0.23]], 0.075, 0.022, 28));
  const boss = (r) => shell([[0, 0.012], [r * 0.85, 0.012], [r, 0], [r * 0.95, -0.01], [0, -0.01]], 14).rotateX(PI / 2);
  const fins = [[0, 0]];
  for (let k = 0; k < 5; k++) { const y = 0.02 + k * 0.028; fins.push([0.05, y], [0.064, y + 0.004], [0.064, y + 0.01], [0.05, y + 0.014]); }
  const CYL = lay(lo ? cylUp(0.06, 0.05, 0.19, 6) : shell([...fins, [0.052, 0.17], [0.04, 0.19], [0, 0.19]], 8), [-0.12, 0.13, 0], [0.08, 0.135, 0]);
  const shA = [-0.72, 0.39, 0.135], shB = [-0.62, 0.7, 0.135], shD = new THREE.Vector3(shB[0] - shA[0], shB[1] - shA[1], 0).normalize(), shL = len3(shA, shB);
  const shE2 = new THREE.Vector3().crossVectors(shD, new THREE.Vector3(0, 0, 1));
  const spring = Array.from({ length: 61 }, (_, k) => { const t = 0.12 + k / 60 * 0.56, a = k / 60 * PI * 2 * 7;
    return [shA[0] + shD.x * t * shL + shE2.x * Math.cos(a) * 0.03, shA[1] + shD.y * t * shL + shE2.y * Math.cos(a) * 0.03, shA[2] + Math.sin(a) * 0.03]; });
  const at = (a, t) => [shA[0] + shD.x * t * shL, shA[1] + shD.y * t * shL, shA[2]];
  // the exhaust: header round under the engine, the silencer rising to the back, a heat shield over it, a tip
  const mA = [-0.5, 0.29, -0.175], mB = [-0.94, 0.37, -0.175], mD = new THREE.Vector3(mB[0] - mA[0], mB[1] - mA[1], 0).normalize();
  const SHIELD = (() => { const sh = new THREE.Shape(); sh.absarc(0, 0, 0.081, 0.15, 2.1, false); sh.absarc(0, 0, 0.073, 2.1, 0.15, true);
    return soft(new THREE.ExtrudeGeometry(sh, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelOffset: -0.003, bevelSegments: 1, curveSegments: 8 }).rotateX(-PI / 2).translate(0, 0.08, 0)); })();
  const mTip = [mB[0] - mD.x * 0.02, mB[1] - mD.y * 0.02, mB[2]];

  // ---- lamps, mirrors, controls
  const HEAD = [[-0.1, -0.03], [0.1, -0.03], [0.115, 0.002], [0.095, 0.04], [-0.095, 0.04], [-0.115, 0.002]];
  const bendX = (g) => warp(g, (v) => { v.x -= 0.9 * v.z * v.z; });
  const SIGNAL = [[-0.035, -0.014], [0.035, -0.014], [0.042, 0.01], [-0.028, 0.017]];
  const MIRROR = shell([[0, 0.03], [0.035, 0.026], [0.053, 0.012], [0.057, 0], [0.05, -0.001], [0.04, 0.004], [0, 0.006]], q(14, 8));
  const GLASS = shell([[0, 0.001], [0.05, 0.001], [0.05, 0.0045], [0, 0.0045]], 14);
  const grip = [[0, 0], [0.027, 0], [0.027, 0.008], [0.021, 0.012]];
  for (let k = 0; k < 5; k++) grip.push([0.0225, 0.016 + k * 0.018], [0.0205, 0.025 + k * 0.018]);
  const GRIP = lo ? cylUp(0.024, 0.024, 0.12, 6) : shell([...grip, [0.0225, 0.108], [0.024, 0.114], [0.02, 0.12], [0, 0.12]], q(8, 6));
  const BAREND = shell([[0, 0], [0.019, 0], [0.022, 0.01], [0.018, 0.02], [0, 0.02]], 12);
  const SPEEDO = merge([   // in its own frame, the dial facing +y
    part(shell([[0, -0.02], [0.062, -0.02], [0.066, 0.004], [0.06, 0.012], [0.052, 0.007], [0, 0.007]], 12), 0x1b1c1e),
    part(shell([[0, 0.0065], [0.051, 0.0065], [0.051, 0.0085], [0, 0.0085]], 16), 0x23292f),
    part(new THREE.TorusGeometry(0.04, 0.0018, 3, 18, PI * 1.5), 0xdfe6ea, 0, 0.009, 0, PI / 2, 0, PI * 0.25),
    part(new THREE.CylinderGeometry(0.0025, 0.0025, 0.034, 5), 0xff6a1a, 0.012, 0.01, -0.008, 0, 0.6, PI / 2),
  ]);
  const frk = (s, t) => [FX - 0.262 * t, AY + 0.965 * t, s * 0.085];
  const bellows = [[0, 0], [0.03, 0]];
  for (let k = 0; k < 4; k++) bellows.push([0.035, 0.014 + k * 0.026], [0.027, 0.027 + k * 0.026]);

  const rest = merge([
    ...wheel(FX, 0xa9aeb5), ...wheel(RX, 0xa9aeb5),
    // front brake: the disc on the left, its bolts, the caliper behind the fork leg, its hose up the leg
    part(ring([[0.075, 0.0028], [0.122, 0.0028], [0.122, -0.0028], [0.075, -0.0028]], q(32, 14)).rotateX(PI / 2), 0xb4b8bd, FX, AY, -0.052),
    ...near(Array.from({ length: 5 }, (_, k) => part(cyl(0.007, 0.007, 0.012, 6), 0x55595e, FX + Math.cos(k * 1.2566) * 0.065, AY + Math.sin(k * 1.2566) * 0.065, -0.052, PI / 2, 0, 0))),
    part(soft(slab(Array.from({ length: 7 }, (_, k) => { const a = 2.05 + k * 0.12; return [Math.cos(a) * 0.088, Math.sin(a) * 0.088]; })
      .concat(Array.from({ length: 7 }, (_, k) => { const a = 2.77 - k * 0.12; return [Math.cos(a) * 0.137, Math.sin(a) * 0.137]; })), 0.046, 0.012, 0, 2, false)), 0x2b2d31, FX, AY, -0.068),
    ...near([tube([[FX - 0.11, AY + 0.07, -0.1], [FX - 0.12, 0.52, -0.112], [0.53, 0.68, -0.105]], 0.005, 0x111112, 14, 4),
    // the rear drum, behind the belt case
    part(shell([[0, 0.04], [0.09, 0.04], [0.095, 0.058], [0.085, 0.075], [0, 0.075]], 20).rotateX(PI / 2), 0x6f7378, RX, AY, 0)]),
    // telescopic fork: lower legs, rubber boots, chrome stanchions up into the apron, the axle lugs
    ...[-1, 1].flatMap((s) => [
      part(lay(cylUp(0.027, 0.025, 0.31, q(12, 6)), frk(s, -0.03), frk(s, 0.28)), 0xb8bcc1),
      ...mid([part(lay(lo ? cylUp(0.033, 0.033, 0.12, 6) : shell([...bellows, [0.022, 0.12], [0, 0.12]], 10), frk(s, 0.27), frk(s, 0.39)), 0x151516)]),
      ...mid([part(lay(cylUp(0.019, 0.019, 0.42, q(10, 6)), frk(s, 0.385), frk(s, 0.8)), 0xd9dde1)]),
      ...near([part(cyl(0.03, 0.03, 0.05, 10), 0xb8bcc1, FX, AY, s * 0.085, PI / 2, 0, 0)]),
    ]),
    // the seat, its piping, the grab rail round the back on three posts
    part(SEAT, 0x1a1a1c), ...near([piping(1), piping(-1)]),
    tube([[-0.58, 0.73, 0.165], [-0.64, 0.768, 0.18], [-0.78, 0.776, 0.184], [-0.92, 0.78, 0.16], [-0.985, 0.784, 0.08], [-0.995, 0.785, 0], [-0.985, 0.784, -0.08], [-0.92, 0.78, -0.16], [-0.78, 0.776, -0.184], [-0.64, 0.768, -0.18], [-0.58, 0.73, -0.165]], 0.013, 0x2c2e31, 30, 6),
    ...near([rod([-0.985, 0.785, 0], [-0.955, 0.71, 0], 0.012, 0x2c2e31, 8)]),
    // floor mat: rubber, ribbed
    ...mid([part(soft(slab([[-0.24, -0.15], [0.22, -0.15], [0.24, -0.13], [0.24, 0.13], [0.22, 0.15], [-0.24, 0.15]], 0.01, 0.003, 0, 1, false)).rotateX(PI / 2), 0x232427, 0, 0.335, 0)]),
    ...near(Array.from({ length: 7 }, (_, k) => rod([-0.22, 0.3405, -0.12 + k * 0.04], [0.2, 0.3405, -0.12 + k * 0.04], 0.0035, 0x2f3034, 5))),
    // tail light, rear signals, the plate on a flap under the tail, the hugger over the rear tyre
    part(soft(lens([[-0.1, -0.022], [0.1, -0.022], [0.112, 0], [0.09, 0.024], [-0.09, 0.024], [-0.112, 0]], 0.036, 0.011)), 0xa3121b, -0.958, 0.703, 0),
    ...near([part(soft(lens([[-0.07, -0.006], [0.07, -0.006], [0.07, 0.006], [-0.07, 0.006]], 0.02, 0.004)), 0xf0484f, -0.976, 0.708, 0)]),
    ...mid([-1, 1].map((s) => part(soft(lens(SIGNAL, 0.032, 0.009)), 0xe68a1a, -0.925, 0.672, s * 0.128, 0, s * -0.5, 0))),
    part(soft(slab([[-0.9, 0.655], [-0.95, 0.652], [-0.982, 0.6], [-0.99, 0.45], [-0.975, 0.425], [-0.958, 0.5], [-0.93, 0.6]], 0.16, 0.012, 0, 2, false)), 0x1e1f21),
    ...mid([part(soft(lens([[-0.1, -0.07], [0.1, -0.07], [0.1, 0.07], [-0.1, 0.07]], 0.008, 0.003, 0)), 0x202124, -0.992, 0.505, 0, 0, 0, -0.08)]),
    part(soft(lens([[-0.093, -0.064], [0.093, -0.064], [0.093, 0.064], [-0.093, 0.064]], 0.006, 0.002, 0)), 0xe9e9e4, -0.996, 0.505, 0, 0, 0, -0.08),
    part(arc(0.65, 2.65, 0.318, 0.333, 0.1), 0x1e1f21, RX, AY, 0),
    // belt case on the left (covers on the pulleys), air box over it, crankcase, the finned cylinder forward under the floor
    part(CASE, 0x8a8e93, 0, 0, 0.125),
    ...near([part(boss(0.065), 0x74787d, RX, AY, 0.162), part(boss(0.095), 0x74787d, -0.2, 0.33, 0.162)]),
    ...mid([part(soft(slab([[-0.5, 0.43], [-0.25, 0.47], [-0.2, 0.52], [-0.48, 0.5]], 0.1, 0.02, 14, 2)), 0x232427, 0, 0, 0.12)]),
    part(soft(slab([[-0.42, 0.42], [-0.12, 0.43], [-0.05, 0.33], [-0.1, 0.16], [-0.4, 0.16]], 0.17, 0.03, 16, 2)), 0x45484d),
    ...mid([part(CYL, 0x4f5358)]),
    // swing arm on the right, the shock with its spring on the left
    rod([RX, AY, -0.09], [-0.38, 0.27, -0.09], 0.022, 0x3d4044, 8),
    ...mid([part(lay(cylUp(0.014, 0.014, shL, 8), shA, shB), 0x2a2c2f), part(lay(cylUp(0.02, 0.02, shL * 0.25, 10), at(0, 0.72), shB), 0x2a2c2f)]),
    ...near([part(lay(cylUp(0.036, 0.036, 0.008, 12), at(0, 0.11), shB), 0x2a2c2f), part(lay(cylUp(0.036, 0.036, 0.008, 12), at(0, 0.68), shB), 0x2a2c2f),
      ...[shA, shB].map((p) => part(cyl(0.022, 0.022, 0.04, 10), 0x2a2c2f, p[0], p[1], p[2], PI / 2, 0, 0))]),
    ...mid([lo ? part(lay(cylUp(0.032, 0.032, shL * 0.56, 6), at(0, 0.12), shB), 0xb8231c) : tube(spring, 0.0055, 0xb8231c, 50, 4)]),
    // exhaust
    ...mid([tube([[0.06, 0.12, -0.02], [0.04, 0.08, -0.05], [-0.08, 0.08, -0.085], [-0.28, 0.14, -0.12], [-0.44, 0.26, -0.165], [-0.52, 0.294, -0.175]], 0.017, 0x4d4741, 20, 6)]),
    part(lay(shell([[0, 0], [0.03, 0], [0.052, 0.03], [0.066, 0.08], [0.068, 0.36], [0.06, 0.42], [0.042, 0.45], [0, 0.45]], q(16, 8)), mA, mB), 0x2f3134),
    ...mid([part(lay(SHIELD, mA, mB), 0xb9bdc2)]),
    ...near([part(lay(ring([[0.016, 0], [0.024, 0], [0.026, 0.05], [0.017, 0.05]], 12), mTip, mB.map((v, i) => v + [mD.x, mD.y, 0][i])), 0x9ea2a7),
    rod([-0.62, 0.32, -0.16], [-0.6, 0.29, -0.095], 0.01, 0x2a2c2f, 6)]),
    // stands, folded: the side stand on the left, the centre stand under the engine; the passenger's pegs
    ...near([rod([-0.12, 0.2, 0.13], [-0.4, 0.15, 0.17], 0.012, 0x222326, 6), part(cyl(0.02, 0.02, 0.01, 8), 0x222326, -0.405, 0.15, 0.17, PI / 2, 0, 0),
    ...[-1, 1].map((s) => rod([-0.2, 0.17, s * 0.1], [-0.4, 0.1, s * 0.12], 0.014, 0x222326, 6)),
    rod([-0.4, 0.1, -0.12], [-0.4, 0.1, 0.12], 0.012, 0x222326, 6), rod([-0.35, 0.11, 0.115], [-0.36, 0.12, 0.18], 0.01, 0x222326, 6),
    ...[-1, 1].flatMap((s) => [rod([-0.34, 0.47, s * 0.17], [-0.36, 0.39, s * 0.2], 0.01, 0x2a2c2f, 6), rod([-0.36, 0.39, s * 0.19], [-0.36, 0.39, s * 0.265], 0.016, 0x18181a, 8)])]),
    // headlight in its chrome bezel, front signals, the handlebar, its grips, levers and bar ends, the speedo, mirrors
    ...mid([part(bendX(lens(HEAD.map(([z, y]) => [z * 1.12, y * 1.15]), 0.03, 0.008)), 0xbfc4c9, 0.611, 0.8, 0)]),
    part(bendX(lens(HEAD, 0.04, 0.012)), 0xf3eedd, 0.622, 0.8, 0),
    ...mid([-1, 1].map((s) => part(soft(lens(SIGNAL, 0.03, 0.008)), 0xe68a1a, 0.58, 0.905, s * 0.16, 0, s * 0.45, 0))),
    rod([0.42, 1.07, -0.23], [0.42, 1.07, 0.23], 0.011, 0x2a2b2e, 8),
    ...[-1, 1].flatMap((s) => [
      part(GRIP.clone(), 0x141414, 0.42, 1.07, s * 0.215, s * PI / 2, 0, 0),
      ...near([part(BAREND.clone(), 0x8d9196, 0.42, 1.07, s * 0.335, s * PI / 2, 0, 0),
      rod([0.42, 1.07, s * 0.2], [0.45, 1.075, s * 0.205], 0.012, 0x2a2b2e, 8),
      tube([[0.45, 1.075, s * 0.205], [0.49, 1.07, s * 0.24], [0.5, 1.062, s * 0.3], [0.495, 1.058, s * 0.33]], 0.006, 0x9ea3a8, 10, 5)]),
      rod([0.41, 1.1, s * 0.15], [0.39, 1.255, s * 0.255], 0.0075, 0x1d1e20, 6),
      part(MIRROR.clone(), 0x1d1e20, 0.385, 1.275, s * 0.262, 0, 0, -PI / 2, 0.75, 1, 1),
      ...near([part(GLASS.clone(), 0x9fb4c2, 0.385, 1.275, s * 0.262, 0, 0, -PI / 2, 0.75, 1, 1)]),
    ]),
    ...near([SPEEDO.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.9).setPosition(0.385, 1.095, 0))]),
  ]);
  return { paint, rest };
}
export const BIKE = makeBike(0);
export const BIKE_FAR = makeBike(1);   // past BIKE_NEAR metres
export const BIKE_DIST = makeBike(2);  // past BIKE_MID
const BIKE_NEAR = 30, BIKE_MID = 90;
// on a bike, the rider's root: hips (0.6 above it) on the seat
export const RIDER_AT = new THREE.Vector3(-0.42, 0.23, 0);

export const HELMET = merge([
  // a shell 1.5 cm thick: the outside dome, a rounded edge, the lining inside
  part(shell([...Array.from({ length: 9 }, (_, k) => k / 8 * Math.PI * 0.56).map((a) => [Math.sin(a) * 0.135, Math.cos(a) * 0.135]),
    ...Array.from({ length: 9 }, (_, k) => (8 - k) / 8 * Math.PI * 0.56).map((a) => [Math.sin(a) * 0.12, Math.cos(a) * 0.12 - 0.004])], 18), 0xffffff),
  part((() => {   // the peak: a crescent 8 mm thick round the front, tipped up a little
    const sh = new THREE.Shape().absarc(0, 0, 0.2, -0.85, 0.85, false).absarc(0, 0, 0.122, 0.85, -0.85, true);
    return new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false, curveSegments: 10 }).rotateX(Math.PI / 2).rotateZ(0.12);
  })(), 0xffffff, 0, 0.004, 0),
  part(new THREE.TorusGeometry(0.129, 0.007, 6, 28), 0xffffff, 0, -0.022, 0, Math.PI / 2, 0, 0),   // a rolled edge round the rim
]);
const HAT = merge([part(shell([[0, 0.135], [0.01, 0.132], [0.25, -0.03], [0.244, -0.036], [0.006, 0.122], [0, 0.122]], 24), 0xd8c48c, 0, 0, 0),   // a conical straw hat: a woven shell
  part(new THREE.TorusGeometry(0.245, 0.008, 4, 24), 0xc4ad70, 0, -0.03, 0, Math.PI / 2, 0, 0),
  ...[0.04, 0.09].map((y) => part(new THREE.TorusGeometry(0.25 - (y + 0.03) * 1.48, 0.0035, 3, 24), 0xc4ad70, 0, y, 0, Math.PI / 2, 0, 0))]);   // rings of the weave

// A food stall's pieces (local: x along the sidewalk, +z towards the street)
// a low plastic stool or table: a top with a lip under it, four splayed legs and a ring of stretchers low down
const furniture = (top, h, leg, lr) => {
  const t = top / 2, i = t - 0.03, o = i + leg * 0.12, W = 0xffffff;
  return merge([
    part(extrude([[-t, 0], [t, 0], [t, 0.004], [-t, 0.004]], top, 0.012), W, 0, h - 0.016, 0),   // the top, its edges rounded
    ...[[0, i], [0, -i], [i, 0], [-i, 0]].map(([x, z]) => part(box(x ? 0.012 : 2 * i, 0.055, x ? 2 * i : 0.012), W, x, h - 0.05, z)),   // the lip
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => rod([a * i, h - 0.02, b * i], [a * o, 0, b * o], lr, W)),
    ...[[0, 1], [0, -1], [1, 0], [-1, 0]].map(([x, z]) => { const m = (i + o) / 2 + 0.005, y = h * 0.28;
      return x ? rod([x * m, y, -m], [x * m, y, m], lr * 0.6, W) : rod([-m, y, z * m], [m, y, z * m], lr * 0.6, W); }),
  ]);
};
const STOOL = furniture(0.25, 0.41, 0.4, 0.016);
const TABLE = furniture(0.64, 0.54, 0.5, 0.024);
const TABLE_TOP = merge([   // bowls, chopsticks, a condiment caddy on a table
  ...[[-0.15, -0.13], [0.16, 0.12]].flatMap(([x, z]) => [   // a bowl (a wall, a foot, a rim) and the broth filling it
    part(shell([[0, 0], [0.035, 0], [0.04, 0.008], [0.065, 0.03], [0.077, 0.068], [0.074, 0.071], [0.062, 0.034], [0.035, 0.015], [0, 0.013]], 16), 0xf3efe6, x, 0.54, z),
    part(shell([[0, 0.014], [0.04, 0.019], [0.062, 0.04], [0.066, 0.052], [0, 0.052]], 16), 0xb8763d, x, 0.54, z)]),
  // the caddy: a little wooden tray with walls and a handle down the middle, two bottles in it
  part(box(0.12, 0.01, 0.07), 0x8b5a2b, 0, 0.545, 0),
  ...[-1, 1].map((k) => part(box(0.12, 0.045, 0.006), 0x8b5a2b, 0, 0.572, k * 0.032)),
  ...[-1, 1].map((k) => part(box(0.006, 0.045, 0.058), 0x8b5a2b, k * 0.057, 0.572, 0)),
  part(box(0.006, 0.1, 0.006), 0x6b4420, 0, 0.6, 0), part(box(0.1, 0.008, 0.008), 0x6b4420, 0, 0.65, 0),
  ...[-0.03, 0.03].map((x) => part(shell([[0, 0], [0.018, 0], [0.018, 0.07], [0.008, 0.09], [0.008, 0.1], [0, 0.1]], 10), [0xb5251d, 0x6b3b17][x > 0 ? 1 : 0], x, 0.55, 0)),
  ...[0, 0.01, 0.02].map((d) => part(cyl(0.003, 0.003, 0.24, 4), 0xc9a46a, 0.0 + d, 0.6, -0.2, 0, 0, Math.PI / 2)),
]);
const CART = merge([
  part(box(1.25, 0.72, 0.62), 0xc5c9ce, 0, SLAB + 0.5, 0),          // stainless body
  part(box(1.29, 0.04, 0.66), 0x8b5a2b, 0, SLAB + 0.88, 0),         // wooden top
  part(box(1.25, 0.05, 0.62), 0x7d8287, 0, SLAB + 0.16, 0),         // shelf
  ...[-1, 1].flatMap((sd) => [-0.3, 0.3].flatMap((x) => [            // two cupboard doors a side, each with a handle
    part(box(0.56, 0.52, 0.012), 0xb3b8be, x, SLAB + 0.5, sd * 0.316),
    rod([x + (x < 0 ? 0.2 : -0.2), SLAB + 0.42, sd * 0.33], [x + (x < 0 ? 0.2 : -0.2), SLAB + 0.6, sd * 0.33], 0.008, 0x6d7177)])),
  ...[[-0.5, 0.33], [0.5, 0.33], [-0.5, -0.33], [0.5, -0.33]].map(([x, z]) => part(new THREE.TorusGeometry(0.12, 0.035, 6, 14), 0x1b1b1b, x, SLAB + 0.12, z)),
  ...[[-0.6, 0.3], [0.6, 0.3], [-0.6, -0.3], [0.6, -0.3]].map(([x, z]) => part(box(0.03, 0.42, 0.03), 0xaab0b6, x, SLAB + 1.11, z)),   // the glass case's posts
  part(box(1.25, 0.03, 0.62), 0xaab0b6, 0, SLAB + 1.33, 0),
  part(cyl(0.21, 0.19, 0.3, 18), 0x6d7177, 0.42, SLAB + 1.05, 0),   // the pot of broth, steaming
  part(cyl(0.22, 0.22, 0.02, 18), 0x4e5257, 0.42, SLAB + 1.21, 0),
  part(cyl(0.12, 0.14, 0.12, 12), 0x2b2b2b, 0.42, SLAB + 0.96, 0),  // the burner under it
  ...[[-0.25, 0.12], [-0.05, -0.1]].map(([x, z]) => part(cyl(0.11, 0.08, 0.14, 12), 0xe9e3d6, x, SLAB + 0.97, z)),   // bowls of herbs and noodles
  part(new THREE.SphereGeometry(0.1, 10, 6), 0x5d9b3a, -0.25, SLAB + 1.04, 0.12, 0, 0, 0, 1, 0.45, 1),
  part(new THREE.SphereGeometry(0.1, 10, 6), 0xf3ead2, -0.05, SLAB + 1.04, -0.1, 0, 0, 0, 1, 0.45, 1),
]);
const CART_GLASS = part(box(1.18, 0.4, 0.58), 0xffffff, -0.05, SLAB + 1.11, 0);
// What a stall serves decides its cart and what's on its tables (the dish → SERVING kind, below).
// A cart's body (stainless, cupboard doors, wheels) without the glass case and the pot:
const CART_BODY = merge([
  part(box(1.25, 0.72, 0.62), 0xc5c9ce, 0, SLAB + 0.5, 0), part(box(1.29, 0.04, 0.66), 0x8b5a2b, 0, SLAB + 0.88, 0), part(box(1.25, 0.05, 0.62), 0x7d8287, 0, SLAB + 0.16, 0),
  ...[-1, 1].flatMap((sd) => [-0.3, 0.3].flatMap((x) => [part(box(0.56, 0.52, 0.012), 0xb3b8be, x, SLAB + 0.5, sd * 0.316),
    rod([x + (x < 0 ? 0.2 : -0.2), SLAB + 0.42, sd * 0.33], [x + (x < 0 ? 0.2 : -0.2), SLAB + 0.6, sd * 0.33], 0.008, 0x6d7177)])),
  ...[[-0.5, 0.33], [0.5, 0.33], [-0.5, -0.33], [0.5, -0.33]].map(([x, z]) => part(new THREE.TorusGeometry(0.12, 0.035, 6, 14), 0x1b1b1b, x, SLAB + 0.12, z)),
]);
// a sugarcane press: a steel housing with two ribbed rollers and a crank wheel at the cart's end, a tray under its
// spout, a bundle of peeled canes standing in a bucket, an ice box, a stack of cups, kumquats in a bowl
const CANE_TOP = merge([
  part(box(0.42, 0.34, 0.36), 0x9aa0a6, 0.32, SLAB + 1.07, 0), part(box(0.44, 0.03, 0.38), 0x7d8287, 0.32, SLAB + 1.25, 0),
  ...[-0.06, 0.06].map((y) => part(cyl(0.055, 0.055, 0.3, 14), 0xc9cdd2, 0.32, SLAB + 1.07 + y, 0, Math.PI / 2, 0, 0)),
  part(new THREE.TorusGeometry(0.17, 0.018, 6, 20), 0x3a3d42, 0.32, SLAB + 1.07, 0.24), part(cyl(0.015, 0.015, 0.2, 6), 0x3a3d42, 0.32, SLAB + 1.07, 0.24, Math.PI / 2, 0, 0),
  rod([0.32, SLAB + 1.07, 0.24], [0.32 + 0.17, SLAB + 1.07, 0.24], 0.012, 0x3a3d42), part(cyl(0.02, 0.02, 0.1, 6), 0xd23b2b, 0.49, SLAB + 1.07, 0.3, Math.PI / 2, 0, 0),
  part(box(0.2, 0.03, 0.14), 0xb3b8be, 0.32, SLAB + 0.92, -0.24), part(box(0.05, 0.04, 0.08), 0x9aa0a6, 0.32, SLAB + 0.98, -0.2),
  part(cyl(0.12, 0.1, 0.28, 14), 0x2f6fd8, -0.42, SLAB + 1.04, -0.12),
  ...Array.from({ length: 11 }, (_, i) => { const a = i * 2.4, r = 0.03 + (i % 3) * 0.025;
    return part(cyl(0.017, 0.017, 1.15 + (i % 4) * 0.08, 7), i % 2 ? 0xd9d07a : 0xc4c46a, -0.42 + Math.cos(a) * r, SLAB + 1.4, -0.12 + Math.sin(a) * r, Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05); }),
  part(box(0.3, 0.2, 0.24), 0xf4f4f2, -0.05, SLAB + 1.0, 0.12), part(box(0.31, 0.03, 0.25), 0x2f6fd8, -0.05, SLAB + 1.115, 0.12),
  ...[0, 1, 2, 3].map((i) => part(shell([[0, 0], [0.033, 0], [0.04, 0.12], [0.036, 0.12], [0.03, 0.006], [0, 0.006]], 12), 0xf2f2f2, -0.05, SLAB + 0.9 + i * 0.012, -0.16)),
  part(cyl(0.08, 0.06, 0.06, 12), 0xe9e3d6, 0.06, SLAB + 0.93, -0.18),
  ...[-0.02, 0.02, 0.0].map((d, i) => part(new THREE.SphereGeometry(0.02, 8, 6), 0x7cb342, 0.06 + d, SLAB + 0.97, -0.18 + (i - 1) * 0.02)),
]);
// coffee: a kettle on a burner, a row of drip filters over glasses, a big jar of beans, glasses stacked
const COFFEE_TOP = merge([
  part(cyl(0.11, 0.13, 0.08, 14), 0x2b2b2b, 0.36, SLAB + 0.94, 0), part(shell([[0, 0], [0.12, 0], [0.13, 0.12], [0.08, 0.2], [0.03, 0.22], [0, 0.22]], 16), 0x9aa0a6, 0.36, SLAB + 0.98, 0),
  rod([0.46, SLAB + 1.06, 0], [0.56, SLAB + 1.16, 0], 0.014, 0x9aa0a6),
  ...[-0.35, -0.2, -0.05, 0.1].flatMap((x) => [part(shell([[0, 0], [0.03, 0], [0.034, 0.1], [0.03, 0.1], [0.026, 0.006], [0, 0.006]], 12), 0xeaf4fa, x, SLAB + 0.9, 0.12),
    part(cyl(0.028, 0.028, 0.07, 10), 0x3a2312, x, SLAB + 0.935, 0.12),
    part(cyl(0.04, 0.034, 0.06, 12), 0xb8bcc2, x, SLAB + 1.03, 0.12), part(cyl(0.05, 0.05, 0.006, 12), 0xb8bcc2, x, SLAB + 1.003, 0.12)]),
  part(cyl(0.09, 0.09, 0.26, 14), 0xf4f1ea, -0.4, SLAB + 1.03, -0.15), part(cyl(0.08, 0.08, 0.2, 12), 0x5b3315, -0.4, SLAB + 1.02, -0.15),
]);
// chè: rows of tall glass jars of colourful sweet soups, ladles, a stack of cups
const CHE_TOP = merge([
  ...[[-0.42, -0.1], [-0.22, -0.1], [-0.02, -0.1], [0.18, -0.1], [-0.32, 0.12], [-0.12, 0.12], [0.08, 0.12], [0.28, 0.12]].flatMap(([x, z], i) => [
    part(cyl(0.075, 0.075, 0.2, 14), [0x5a8a3a, 0xc98fb8, 0xf0e6c8, 0x8a3b2b, 0xe6b84a, 0x3b5a8a, 0xf4f1ea, 0x6b8a3a][i], x, SLAB + 1.0, z),
    part(cyl(0.08, 0.08, 0.02, 14), 0x9aa0a6, x, SLAB + 1.11, z)]),
  part(cyl(0.04, 0.035, 0.12, 12), 0xf2f2f2, 0.45, SLAB + 0.96, -0.18),
]);
// a cooked-rice or sticky-rice cart: a covered steamer, a grill with chops on it for cơm tấm
const RICE_TOP = merge([
  part(cyl(0.18, 0.18, 0.22, 16), 0x9aa0a6, 0.36, SLAB + 1.01, 0), part(shell([[0, 0], [0.19, 0], [0.12, 0.08], [0.02, 0.1], [0, 0.1]], 16), 0x8a8f94, 0.36, SLAB + 1.12, 0),
  part(box(0.46, 0.06, 0.3), 0x2b2b2b, -0.3, SLAB + 0.93, 0.05), ...[-0.42, -0.3, -0.18].map((x) => part(box(0.09, 0.012, 0.07), 0x9b4b26, x, SLAB + 0.97, 0.05)),
  ...[0, 1, 2].map((i) => part(cyl(0.12, 0.1, 0.012, 16), 0xf3efe6, 0.0, SLAB + 0.9 + i * 0.014, -0.18)),
]);
// a bread cart: the glass case with loaves stacked in it, pâté and cold cuts on the board
const BREAD_TOP = merge([
  ...Array.from({ length: 12 }, (_, i) => part(new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), 0xd29a52, -0.4 + (i % 6) * 0.15, SLAB + 0.94 + Math.floor(i / 6) * 0.06, -0.08 + Math.floor(i / 6) * 0.06, 0, 0, Math.PI / 2)),
  part(cyl(0.08, 0.08, 0.06, 12), 0x8b5a2b, 0.38, SLAB + 0.93, 0.15), part(box(0.2, 0.03, 0.14), 0xd98c8c, 0.35, SLAB + 0.92, -0.12),
]);
// table tops: bowls (noodle soup), plates (rice, bread), glasses (drinks)
const PLATES_TOP = merge([
  ...[[-0.15, -0.13], [0.16, 0.12]].map(([x, z]) => part(shell([[0, 0], [0.1, 0], [0.12, 0.012], [0.125, 0.018], [0.11, 0.012], [0, 0.008]], 18), 0xf3efe6, x, 0.54, z)),
  part(box(0.12, 0.01, 0.07), 0x8b5a2b, 0, 0.545, 0), part(cyl(0.018, 0.018, 0.07, 10), 0xb5251d, -0.02, 0.585, 0), part(cyl(0.018, 0.018, 0.07, 10), 0x6b3b17, 0.02, 0.585, 0),
]);
const glassesTop = (fill) => merge([
  ...[[-0.15, -0.12], [0.14, 0.13], [0.16, -0.1]].flatMap(([x, z]) => [
    part(shell([[0, 0], [0.031, 0], [0.038, 0.128], [0.0345, 0.128], [0.028, 0.008], [0, 0.008]], 12), 0xeaf4fa, x, 0.54, z),
    part(cyl(0.032, 0.027, 0.09, 10), fill, x, 0.594, z), rod([x + 0.01, 0.62, z], [x + 0.03, 0.72, z], 0.004, 0xe84a5f, 4)]),
  part(box(0.12, 0.01, 0.07), 0x8b5a2b, 0, 0.545, 0),
]);
const STALL_LOOK = {
  soup: { cart: [CART, CART_GLASS], table: TABLE_TOP, pot: true }, rice: { cart: [CART_BODY, RICE_TOP], table: PLATES_TOP, pot: true },
  xoi: { cart: [CART_BODY, RICE_TOP], table: PLATES_TOP }, banhmi: { cart: [CART_BODY, BREAD_TOP, CART_GLASS], table: PLATES_TOP },
  cane: { cart: [CART_BODY, CANE_TOP], table: glassesTop(0xd9d68a) }, coffee: { cart: [CART_BODY, COFFEE_TOP], table: glassesTop(0x3a2312) },
  che: { cart: [CART_BODY, CHE_TOP], table: glassesTop(0xc98fb8) },
};
const UMBRELLA_POLE = merge([part(cyl(0.025, 0.025, 2.35, 8), 0xdcdcdc, 0, SLAB + 1.175, 0), part(cyl(0.2, 0.25, 0.08, 12), 0x8a8f94, 0, SLAB + 0.04, 0)]);
const UMBRELLA = (() => {   // a canopy of alternating panels: a cloth with thickness and a hem, sagging between 12 ribs
  const g = shell([[0, 0.25], [0.06, 0.24], [0.4, 0.13], [0.85, -0.03], [1.35, -0.21], [1.37, -0.25], [1.34, -0.26], [0.84, -0.06], [0.39, 0.1], [0.06, 0.2], [0, 0.2]], 48).toNonIndexed();
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {   // between two ribs the cloth hangs a little lower
    const x = pos.getX(i), z = pos.getZ(i), rr = Math.hypot(x, z);
    pos.setY(i, pos.getY(i) - Math.abs(Math.sin(Math.atan2(z, x) * 6)) * 0.07 * (rr / 1.35) ** 1.5);
  }
  pos.applyMatrix4(new THREE.Matrix4().makeTranslation(0, SLAB + 2.3, 0));
  const a = new THREE.Color(0xd8402f), b = new THREE.Color(0xf4efe4);
  for (let i = 0; i < pos.count; i += 3) {   // a panel's colour by its triangle's middle, so the seams stay sharp
    const x = pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2), z = pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2);
    const c = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 12) % 2 ? a : b;
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
})();
// under the canopy: the ribs, the runner on the pole and the struts up to them, a finial on top
const UMBRELLA_RIBS = merge(Array.from({ length: 12 }, (_, k) => {
  const a = k / 6 * Math.PI, c = Math.cos(a), sn = Math.sin(a), y = SLAB + 2.3;
  return [rod([c * 0.06, y + 0.19, sn * 0.06], [c * 1.33, y - 0.27, sn * 1.33], 0.008, 0xc8c8c8, 4), rod([0, y - 0.32, 0], [c * 0.62, y - 0.02, sn * 0.62], 0.006, 0xb0b0b0, 4)];
}).flat().concat([part(cyl(0.035, 0.035, 0.09, 10), 0xb8b8b8, 0, SLAB + 1.98, 0), part(new THREE.SphereGeometry(0.035, 10, 6), 0x9a9a9a, 0, SLAB + 2.57, 0)]));
// a market stall: a table of goods under a tarp on four poles
const STALL = merge([
  part(box(2.3, 0.06, 0.95), 0x8b6a45, 0, SLAB + 0.78, 0),
  ...[[-1.05, 0.4], [1.05, 0.4], [-1.05, -0.4], [1.05, -0.4]].map(([x, z]) => part(box(0.06, 0.78, 0.06), 0x6b5236, x, SLAB + 0.39, z)),
  ...[[-1.25, 0.95], [1.25, 0.95], [-1.25, -0.75], [1.25, -0.75]].map(([x, z]) => part(cyl(0.025, 0.025, z > 0 ? 2.05 : 2.35, 6), 0x9aa0a6, x, SLAB + (z > 0 ? 1.025 : 1.175), z)),
  // a crate behind: corner posts and slats with gaps between them
  ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => part(box(0.04, 0.42, 0.04), 0x6e5436, a * 0.23, SLAB + 0.21, -0.85 + b * 0.23)),
  ...[0.05, 0.17, 0.29, 0.39].flatMap((y) => [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([x, z]) => part(box(x ? 0.015 : 0.46, 0.08, x ? 0.46 : 0.015), 0x8a6c49, x * 0.245, SLAB + y, -0.85 + z * 0.245))),
  part(box(0.46, 0.015, 0.46), 0x8a6c49, 0, SLAB + 0.02, -0.85),
]);
const TARP = merge([part(box(2.7, 0.03, 1.95), 0xffffff, 0, SLAB + 2.2, 0.1, -0.16, 0, 0),   // the sheet, and its hem hanging at the front and back
  part(box(2.7, 0.2, 0.02), 0xffffff, 0, SLAB + 2.255, 1.063), part(box(2.7, 0.2, 0.02), 0xffffff, 0, SLAB + 1.945, -0.863)]);
const FOLDED = extrude([[-0.19, -0.005], [0.19, -0.005], [0.19, 0.005], [-0.19, 0.005]], 0.32, 0.02);   // a folded garment: soft rounded edges
// the goods on a stall: fruit, greens or folded clothes. `lo`: the same goods, made of a few faces, for further off
const goodsOf = (lo) => {
  const fruit = [], veg = [], cloth = [];
  const r = seeded(77);
  for (let k = 0; k < 26; k++) {
    const x = -0.95 + (k % 9) * 0.24 + r() * 0.05, z = -0.3 + Math.floor(k / 9) * 0.28;
    fruit.push(part(new THREE.SphereGeometry(0.075 + r() * 0.025, lo ? 5 : 9, lo ? 3 : 6), pickOf(r, [0xf08c1e, 0xe6c22c, 0xc8242a, 0x7cb342, 0xf2a03a]), x, SLAB + 0.88 + r() * 0.03, z));
  }
  for (let k = 0; k < 12; k++) {
    const x = -0.95 + (k % 6) * 0.38, z = -0.22 + Math.floor(k / 6) * 0.42;
    if (k % 3 === 0) veg.push(part(new THREE.SphereGeometry(0.13, lo ? 6 : 10, lo ? 4 : 7), 0x8fc25a, x, SLAB + 0.9, z, 0, 0, 0, 1, 0.8, 1));   // cabbages
    else for (let s = 0; s < 4; s++) {   // bundles of greens (far off: one block for the bundle)
      const c = pickOf(r, [0x3f8f3a, 0x5aa83f, 0x2f7a33]), rz = r() * 0.3;
      if (!lo) veg.push(part(cyl(0.02, 0.025, 0.36, 5), c, x + (s - 1.5) * 0.04, SLAB + 0.83, z, Math.PI / 2 - 0.1, 0, rz));
      else if (s === 0) veg.push(part(box(0.18, 0.05, 0.36), c, x, SLAB + 0.83, z));
    }
  }
  for (let k = 0; k < 8; k++) {
    const x = -0.85 + (k % 4) * 0.56, z = -0.2 + Math.floor(k / 4) * 0.42, h = 3 + Math.floor(r() * 4);
    for (let s = 0; s < h; s++) {
      const c = pickOf(r, [0xc0392b, 0x2e86c1, 0xf1c40f, 0x8e44ad, 0xe67e22, 0x16a085, 0xecf0f1]), ry = (r() - 0.5) * 0.15;
      cloth.push(part(lo ? box(0.38, 0.05, 0.32) : FOLDED.clone(), c, x, SLAB + 0.84 + s * 0.052 + (lo ? 0.005 : 0), z, 0, ry, 0));
    }
  }
  return [merge(fruit), merge(veg), merge(cloth)];
};
const GOODS = goodsOf(false), GOODS_FAR = goodsOf(true);
const GOODS_NEAR = 24;   // metres: the full goods within this, the plain ones out to the stalls' detail distance
// a vendor's bicycle piled with flowers or fruit (facing +x)
const VENDOR_BIKE = (() => {
  const frame = (c) => [
    ...[0.55, -0.55].map((x) => part(new THREE.TorusGeometry(0.33, 0.02, 6, 26), 0x1a1a1a, x, 0.35, 0)),
    ...[0.55, -0.55].map((x) => part(cyl(0.035, 0.035, 0.06, 8), 0x888888, x, 0.35, 0, Math.PI / 2, 0, 0)),
    rod([-0.55, 0.35, 0], [0.0, 0.42, 0], 0.018, c), rod([0.0, 0.42, 0], [0.42, 0.85, 0], 0.018, c), rod([-0.15, 0.82, 0], [0.42, 0.85, 0], 0.018, c),
    rod([-0.55, 0.35, 0], [-0.15, 0.82, 0], 0.018, c), rod([0.55, 0.35, 0], [0.42, 0.95, 0], 0.018, c), rod([0.0, 0.42, 0], [-0.15, 0.82, 0], 0.018, c),
    part(cyl(0.012, 0.012, 0.55, 6), 0x222222, 0.42, 0.97, 0, Math.PI / 2, 0, 0),
    part(box(0.22, 0.05, 0.1), 0x222222, -0.17, 0.86, 0),
    part(box(0.7, 0.03, 0.55), 0x6b5236, -0.62, 0.78, 0),   // the rack, wider than the bike
  ];
  const r = seeded(31), flowers = [], fruit = [];
  for (let k = 0; k < 46; k++) {
    const a = r() * 6.283, rr = r() * 0.3, x = -0.62 + Math.cos(a) * rr * 1.2, z = Math.sin(a) * rr, h = 0.15 + r() * 0.55;
    flowers.push(part(cyl(0.006, 0.006, h, 4), 0x3c7a2e, x, 0.8 + h / 2, z));
    flowers.push(part(new THREE.IcosahedronGeometry(0.045 + r() * 0.03, 0), pickOf(r, [0xe8445a, 0xf7d23a, 0xf4f1ea, 0xf28fb0, 0xc0392b, 0xff8a3d, 0x9b59b6]), x, 0.8 + h, z));
  }
  for (let k = 0; k < 40; k++) {
    const l = Math.floor(k / 14), x = -0.85 + (k % 7) * 0.075 + (l % 2) * 0.03, z = -0.2 + (Math.floor(k / 7) % 2) * 0.2 + r() * 0.05;
    fruit.push(part(new THREE.SphereGeometry(0.07, 9, 6), pickOf(r, [0xf08c1e, 0xe6c22c, 0x7cb342, 0xc8242a]), x + 0.18, 0.86 + l * 0.11, z));
  }
  fruit.push(part(shell([[0, 0], [0.26, 0], [0.3, 0.2], [0.315, 0.21], [0.3, 0.222], [0.284, 0.2], [0.246, 0.02], [0, 0.02]], 18), 0xb48a4e, -0.62, 0.8, 0));   // a basket
  for (const [y, rr] of [[0.06, 0.274], [0.13, 0.288]]) fruit.push(part(new THREE.TorusGeometry(rr, 0.008, 4, 22), 0x94703c, -0.62, 0.8 + y, 0, Math.PI / 2, 0, 0));   // its woven bands
  return [merge([...frame(0x2f5d8a), ...flowers]), merge([...frame(0x7a2f2f), ...fruit])];
})();
// a vendor's shoulder pole and two baskets of goods, carried on the right shoulder (local: +z is forward)
const GANH = (() => {
  const r = seeded(5), parts = [rod([0.2, 1.42, -0.85], [0.2, 1.47, 0.85], 0.022, 0x9b7a45)];
  for (const s of [-1, 1]) {
    const z = s * 0.78;
    parts.push(part(shell([[0, 0], [0.2, 0.02], [0.27, 0.2], [0.285, 0.222], [0.268, 0.226], [0.256, 0.2], [0.19, 0.036], [0, 0.034]], 16), 0xb08a52, 0.2, 0.3, z));
    for (const [y, rr] of [[0.08, 0.222], [0.15, 0.248]]) parts.push(part(new THREE.TorusGeometry(rr, 0.007, 4, 20), 0x8f6c3c, 0.2, 0.3 + y, z, Math.PI / 2, 0, 0));
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; parts.push(rod([0.2 + Math.cos(a) * 0.27, 0.52, z + Math.sin(a) * 0.27], [0.2, 1.44 + s * 0.02, z], 0.006, 0x3d3226, 4)); }
    for (let k = 0; k < 14; k++) parts.push(part(new THREE.SphereGeometry(0.06, 8, 5), pickOf(r, s > 0 ? [0xf08c1e, 0xe6c22c, 0x7cb342] : [0x5aa83f, 0xc8242a, 0xf2e3b3]), 0.2 + (r() - 0.5) * 0.32, 0.52 + r() * 0.06, z + (r() - 0.5) * 0.32));
  }
  return merge(parts);
})();

// ---------------------------------------------------------------- batches in squares

// a bowl of noodle soup, all in 3D: a white ceramic bowl with a blue rim (lathed), the broth, noodles in loose
// loops, herbs and slices on top, chopsticks across, and puffs of steam rising (see update)
const BOWL_MAT = {
  ceramic: new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.25 }), rim: new THREE.MeshStandardMaterial({ color: 0x2f5fa8, roughness: 0.3 }),
  broth: new THREE.MeshStandardMaterial({ color: 0xc98b46, roughness: 0.15, transparent: true, opacity: 0.92 }), noodle: new THREE.MeshStandardMaterial({ color: 0xf2ead6, roughness: 0.6 }),
  herb: new THREE.MeshStandardMaterial({ color: 0x4d9a3c, roughness: 0.7 }), meat: new THREE.MeshStandardMaterial({ color: 0x8a4a35, roughness: 0.7 }),
  wood: new THREE.MeshStandardMaterial({ color: 0xc89b62, roughness: 0.6 }), steam: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.35, depthWrite: false }),
};
// what a stall serves: a bowl of soup, a plate, a bánh mì on its paper, or a glass with ice and a straw
const SERVING = { 'Phở': 'soup', 'Bún bò': 'soup', 'Hủ tiếu': 'soup', 'Bún chả': 'soup', 'Cơm tấm': 'rice', 'Xôi': 'xoi', 'Bánh mì': 'banhmi',
  'Cà phê': 'coffee', 'Nước mía': 'cane', 'Chè': 'che' };
function makeServing(dish) {
  const kind = SERVING[dish] || 'soup';
  if (kind === 'soup') return makeBowl();
  const g = new THREE.Group(), add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });
  if (kind === 'rice' || kind === 'xoi') {
    const plate = new THREE.LatheGeometry([[0, 0], [0.1, 0], [0.13, 0.012], [0.14, 0.02], [0.135, 0.022], [0.12, 0.012], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x, y)), 28);
    add(plate, BOWL_MAT.ceramic);
    const mound = add(new THREE.SphereGeometry(0.07, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(kind === 'xoi' ? 0xf1e3a4 : 0xf7f3ea, { roughness: 0.9 }), -0.03, 0.012, 0);
    mound.scale.set(1.2, 0.7, 1);
    if (kind === 'rice') {
      const rib = add(new THREE.BoxGeometry(0.1, 0.014, 0.06), std(0x9b4b26, { roughness: 0.6 }), 0.06, 0.025, -0.01); rib.rotation.y = 0.4;
      for (let k = 0; k < 3; k++) add(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 14), std(0x7dbb5a), 0.05 + k * 0.012, 0.022 + k * 0.004, 0.06);
      add(new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf7f2e6), -0.07, 0.016, 0.06).scale.set(1, 0.4, 1);
      add(new THREE.SphereGeometry(0.013, 10, 8), std(0xf2b021), -0.07, 0.024, 0.06);
    } else for (let k = 0; k < 12; k++) add(new THREE.SphereGeometry(0.006, 5, 4), std(0xb7782f), -0.03 + (Math.random() - 0.5) * 0.1, 0.06, (Math.random() - 0.5) * 0.08);
    return g;
  }
  if (kind === 'banhmi') {
    add(new THREE.BoxGeometry(0.22, 0.004, 0.16), std(0xd8c7a3, { roughness: 0.95 }), 0, 0.002, 0);
    // the loaf is its own group: it's what goes up to the mouth (userData.handheld); the paper stays on the table
    const bread = new THREE.Group(); bread.position.set(0, 0.035, 0); g.add(bread);
    const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; bread.add(m); return m; };
    const loaf = part(new THREE.CapsuleGeometry(0.035, 0.14, 6, 12), std(0xd29a52, { roughness: 0.7 }), 0, 0, 0); loaf.rotation.z = Math.PI / 2; loaf.scale.set(1, 1, 0.85);
    for (let k = -2; k <= 2; k++) { const cut = part(new THREE.BoxGeometry(0.004, 0.004, 0.05), std(0xa86a33), k * 0.03, 0.033, 0); cut.rotation.y = 0.6; }
    part(new THREE.BoxGeometry(0.15, 0.012, 0.012), std(0x5aa648), 0, -0.005, 0.028);
    g.userData.handheld = bread;
    return g;
  }
  // a glass: clear walls, the drink inside, ice cubes, a straw
  const drink = { coffee: 0x3a2312, cane: 0xd9d68a, che: 0xc98fb8 }[kind];
  // the glass is lathed whole: a thick base, walls 2.5 mm thick, a rounded lip (inside: 0.0298 at the base to 0.0355 at the top)
  add(shell([[0, 0], [0.031, 0], [0.032, 0.002], [0.038, 0.128], [0.0372, 0.1305], [0.0358, 0.1295], [0.0298, 0.0075], [0, 0.0075]], 28),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0).castShadow = false;
  const inner = (y) => 0.0296 + 0.0057 * (y - 0.0075) / 0.122;   // what fills the glass touches its inside wall
  const fill = (y0, y1, color, extra) => add(new THREE.CylinderGeometry(inner(y1), inner(y0), y1 - y0, 20), std(color, extra), 0, (y0 + y1) / 2, 0);
  if (kind === 'che') {
    fill(0.0075, 0.04, 0x5a8a3a, { transparent: true, opacity: 0.9 });
    fill(0.04, 0.08, 0xf0e6c8, { transparent: true, opacity: 0.9 });
    fill(0.08, 0.11, drink, { transparent: true, opacity: 0.9 });
  } else fill(0.0075, 0.105, drink, { roughness: 0.15, transparent: true, opacity: 0.85 });
  for (let k = 0; k < 4; k++) { const ice = add(new THREE.BoxGeometry(0.022, 0.022, 0.022), std(0xeaf4fa, { roughness: 0.05, transparent: true, opacity: 0.6 }), (Math.random() - 0.5) * 0.03, 0.1 + Math.random() * 0.015, (Math.random() - 0.5) * 0.03); ice.rotation.set(Math.random(), Math.random(), 0); }
  const straw = add(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 8), std(0xe84a5f), 0.012, 0.13, 0); straw.rotation.z = -0.25;
  g.userData.steam = [];
  return g;
}
function makeBowl() {
  const g = new THREE.Group();
  const prof = [[0.0, 0], [0.04, 0], [0.05, 0.012], [0.075, 0.03], [0.095, 0.065], [0.105, 0.09], [0.1, 0.092], [0.09, 0.066], [0.068, 0.034], [0.0, 0.02]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 28), BOWL_MAT.ceramic));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.103, 0.005, 6, 32), BOWL_MAT.rim); rim.rotation.x = Math.PI / 2; rim.position.y = 0.09; g.add(rim);
  // the broth: a body of soup filling the bowl up to 0.075, its sides on the bowl's inside wall
  g.add(new THREE.Mesh(shell([[0, 0.021], [0.067, 0.035], [0.089, 0.066], [0.0925, 0.075], [0, 0.075]], 28), BOWL_MAT.broth));
  for (let k = 0; k < 7; k++) {
    const n = new THREE.Mesh(new THREE.TorusGeometry(0.025 + Math.random() * 0.03, 0.0035, 5, 18, Math.PI * (1 + Math.random())), BOWL_MAT.noodle);
    n.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.3, 0, Math.random() * 6.28); n.position.set((Math.random() - 0.5) * 0.08, 0.077, (Math.random() - 0.5) * 0.08); g.add(n);
  }
  for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.006, 0.03), BOWL_MAT.meat); m.position.set(-0.03 + k * 0.03, 0.08, -0.02 + (k % 2) * 0.03); m.rotation.y = k; g.add(m); }
  for (let k = 0; k < 8; k++) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.008, 5, 4), BOWL_MAT.herb); h.scale.set(1.6, 0.4, 1); h.position.set((Math.random() - 0.5) * 0.12, 0.081, (Math.random() - 0.5) * 0.12); g.add(h); }
  for (const dx of [-0.012, 0.012]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.24, 6), BOWL_MAT.wood); c.rotation.z = Math.PI / 2; c.rotation.y = 0.2; c.position.set(0.02, 0.098, dx); g.add(c); }
  g.userData.steam = [0, 1, 2, 3].map((k) => { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 1), BOWL_MAT.steam); p.userData.t = k * 0.6; g.add(p); return p; });
  g.traverse((m) => { if (m.isMesh) m.castShadow = m.material !== BOWL_MAT.steam; });
  return g;
}

// who runs a stall, after the dish on its sign: an aunt, an uncle, a first name, a corner
const STALL_OWNERS = ['Cô Ba', 'Bà Tư', 'Chú Năm', 'Dì Bảy', 'Ông Sáu', 'Cô Út', 'Anh Hai', 'Chị Mai', 'Hòa', 'Lan', 'Thủy', 'Hạnh',
  'Minh', 'Phúc', 'Gió', 'Góc Phố', 'Đầu Hẻm', 'Cây Me', 'Nhà Gỗ', 'Sáng', 'Bến Đò', 'Ngõ Nhỏ', 'Thu', 'Kim'];
// the sign's board and lettering, one look per stall
const SIGN_LOOKS = [{ board: 0xf6d34a, ink: '#c4161c' }, { board: 0xf4efe4, ink: '#1f5aa8' }, { board: 0x1f6b3a, ink: '#fff4d6' }, { board: 0xb5251d, ink: '#ffe08a' }];

// Squatting on a motorbike's seat, the way a xe ôm driver waits for a fare: the thighs folded up in front, the feet
// on the seat under the hips, the forearms resting across the knees, the head up. Posed over the seated clip each
// frame (host Character.pose), each limb aimed along a direction in the body's own frame, parents first.
const hashKey = (k) => [...String(k)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
export const SQUAT_LIFT = 0.3;   // about how much higher the hips are, folded, than sitting (the feet then set on the seat)
export function squatPose(c) {
  const obj = c.body.object;
  let b = obj.userData.squatBones;
  if (!b) {
    const find = (re) => { let f = null; obj.traverse((o) => { if (!f && o.isBone && re.test(o.name)) f = o; }); return f; };
    const B = (nm, alt) => find(new RegExp(`(Bip01[_ ])?${nm}$`, 'i')) || find(alt);
    b = obj.userData.squatBones = { pelvis: find(/Pelvis$|Hips$/i), spine: find(/Spine1?$/i), neck: find(/Neck$/i), head: find(/Head$/i),
      lt: B('L_Thigh', /LeftUpLeg$/i), lc: B('L_Calf', /LeftLeg$/i), lf: B('L_Foot', /LeftFoot$/i),
      rt: B('R_Thigh', /RightUpLeg$/i), rc: B('R_Calf', /RightLeg$/i), rf: B('R_Foot', /RightFoot$/i),
      lu: B('L_UpperArm', /LeftArm$/i), lfa: B('L_Forearm', /LeftForeArm$/i), lh: B('L_Hand', /LeftHand$/i),
      ru: B('R_UpperArm', /RightArm$/i), rfa: B('R_Forearm', /RightForeArm$/i), rh: B('R_Hand', /RightHand$/i) };
  }
  if (Object.values(b).some((x) => !x)) return;
  obj.updateMatrixWorld(true);
  const P = (o) => o.getWorldPosition(new THREE.Vector3());
  const up = P(b.neck).sub(P(b.pelvis)).normalize();
  const right = P(b.ru).sub(P(b.lu)); right.addScaledVector(up, -right.dot(up)).normalize();
  const fwd = up.clone().cross(right).normalize();
  const D = (u, rr, f) => new THREE.Vector3().addScaledVector(up, u).addScaledVector(right, rr).addScaledVector(fwd, f).normalize();
  const aim = (bone, child, dir) => {
    const from = P(child).sub(P(bone)).normalize(), q = new THREE.Quaternion().setFromUnitVectors(from, dir);
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion()), worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parentQ.invert().multiply(q.multiply(worldQ)));
    bone.updateMatrixWorld(true);
  };
  aim(b.spine, b.neck, D(0.78, 0, 0.62));                    // leaning forward over the knees
  aim(b.neck, b.head, D(0.94, 0, 0.34));                      // looking up the street
  aim(b.rt, b.rc, D(0.22, 0.22, 0.95)); aim(b.rc, b.rf, D(-0.55, 0.04, -0.83));   // knees up, heels back under the hips
  aim(b.lt, b.lc, D(0.22, -0.22, 0.95)); aim(b.lc, b.lf, D(-0.55, -0.04, -0.83));
  aim(b.ru, b.rfa, D(-0.62, 0.2, 0.76)); aim(b.rfa, b.rh, D(-0.2, -0.5, 0.84));   // forearms across the knees
  aim(b.lu, b.lfa, D(-0.62, -0.2, 0.76)); aim(b.lfa, b.lh, D(-0.2, 0.5, 0.84));
  // the feet on the seat: the whole body set down (or up) so the lower sole is on it
  if (c.squatTop != null) {
    const foot = Math.min(P(b.lf).y, P(b.rf).y) - 0.06;
    obj.position.y += (c.squatTop - foot) / (c.root.scale.y || 1);
    obj.updateMatrixWorld(true);
  }
}

export function createStreetLife(host, street) {
  const { scene, city, player, camera } = host;
  const G = city.grid, CELL = 2 * G.pitch, inner = G.inner;
  const root = new THREE.Group(); root.name = 'street-life'; scene.add(root);
  const r = seeded(20261015);
  const squares = new Map();   // key → { group, detail, items: Map(batchKey → { geo, mat, list: [[matrix, colour]] }), at, r }
  const squareOf = (x, z) => {
    const key = `${Math.floor((x - G.cx) / CELL)},${Math.floor((z - G.cz) / CELL)}`;
    if (!squares.has(key)) {
      const group = new THREE.Group(), detail = new THREE.Group(); group.add(detail); root.add(group);
      squares.set(key, { group, detail, items: new Map(), pts: [] });
    }
    return squares.get(key);
  };
  // one instance of a shape at a place (world matrix), into its square's batch
  const add = (geo, mat, matrix, color = null, { detail = false, shadow = true } = {}) => {
    const p = new THREE.Vector3().setFromMatrixPosition(matrix), sq = squareOf(p.x, p.z);
    const k = `${geo.uuid}|${mat.uuid}|${detail}`;
    if (!sq.items.has(k)) sq.items.set(k, { geo, mat, detail, shadow, list: [] });
    sq.items.get(k).list.push([matrix, color]);
    sq.pts.push(p);
  };
  // parked motorbikes: one list, sorted into three instanced batches as the camera moves (sortParked)
  const parked = [];
  const addBike = (m, color) => parked.push({ m, color, p: new THREE.Vector3().setFromMatrixPosition(m) });
  const walls = [];
  const wallBox = (x0, z0, x1, z1, kind) => walls.push({ y: 0, kind, minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
  const at = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
  // a local frame on a sidewalk: block (bx, bz), side normal n (towards the street), u along it, d from the block's centre
  const frame = (bx, bz, n, u, d) => ({ x: bx + n[0] * d - n[1] * u, z: bz + n[1] * d + n[0] * u });
  const faceStreet = (n) => Math.atan2(n[0], n[1]);   // rotation that turns local +z towards n
  const boxAround = (pts, kind, pad = 0) => {
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
    wallBox(Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad, kind);
  };

  // ---- the city's sidewalks, block by block: parked bikes, food stalls, vendor bicycles, motorbike-taxi corners
  const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const stalls = [], xeOmSpots = [], DISHES = ['Phở', 'Bún chả', 'Cơm tấm', 'Bánh mì', 'Cà phê', 'Bún bò', 'Hủ tiếu', 'Chè', 'Nước mía', 'Xôi'];
  const DEEP = inner / 2 - 4;    // the sidewalk's building edge, from the block's centre
  const MOUTH = 3.9;             // the sidewalk kept clear either side of an alley's middle
  for (let i = -G.rings; i <= G.rings; i++) for (let j = -G.rings; j <= G.rings; j++) {
    if (!i && !j) continue;   // the company's own plaza stays clear
    const bx = G.cx + i * G.pitch, bz = G.cz + j * G.pitch;
    SIDES.forEach((n, side) => {
      // fill the side from one corner to the other, leaving the corners and gaps; items stand in the building-side
      // half of the sidewalk, so a narrow strip by the kerb (trees, lamp posts) is what's left to walk
      // what this side gets (busier near the company, where the CEO mostly is): a few of these, in a random order
      const busy = Math.max(Math.abs(i), Math.abs(j)) <= 2 ? 1.35 : 0.75;
      const plan = [];
      if (r() < 0.55 * busy) plan.push('bikes');
      if (r() < 0.3 * busy) plan.push('bikes');
      if (r() < 0.32 * busy) plan.push('stall');
      if (r() < 0.12 * busy) plan.push('cycle');
      for (let k = plan.length - 1; k > 0; k--) { const q = Math.floor(r() * (k + 1)); [plan[k], plan[q]] = [plan[q], plan[k]]; }
      let u = -inner / 2 + 6 + r() * 6;
      const end = inner / 2 - 6;
      if (r() < 0.1 * busy) {   // a motorbike-taxi driver waiting near the corner
        const p = frame(bx, bz, n, -inner / 2 + 4.6, DEEP + 2.0);
        xeOmSpots.push({ x: p.x, z: p.z, n });
      }
      // the alleys' mouths on this side stay clear (u: where each is along the side)
      const mouths = (city.alleys || []).filter((m) => m.n[0] === n[0] && m.n[1] === n[1] && Math.abs((m.x - bx) * n[0] + (m.z - bz) * n[1] - DEEP) < 1 && Math.abs(-n[1] * (m.x - bx) + n[0] * (m.z - bz)) < inner / 2)
        .map((m) => -n[1] * (m.x - bx) + n[0] * (m.z - bz))
        .concat((city.spills || []).filter(([x, z]) => Math.abs((x - bx) * n[0] + (z - bz) * n[1] - DEEP - 0.7) < 0.8).map(([x, z]) => -n[1] * (x - bx) + n[0] * (z - bz)));
      const clear = (u0, len) => { let v = u0; for (let k = 0; k < 3; k++) for (const um of mouths) if (v < um + MOUTH && v + len > um - MOUTH) v = um + MOUTH; return v; };
      for (const what of plan) {
        if (what === 'bikes') {   // a row of parked motorbikes, front wheels to the street
          const count = 3 + Math.floor(r() * 7), len = count * 0.78;
          u = clear(u, len);
          if (u + len > end) break;
          const pts = [];
          for (let b = 0; b < count; b++) {
            const p = frame(bx, bz, n, u + b * 0.78 + 0.39, DEEP + 1.0);
            const m = at(p.x, SLAB, p.z, Math.atan2(-n[1], n[0]) + (r() - 0.5) * 0.25);
            addBike(m, new THREE.Color(pickOf(r, BIKE_PAINT)));
            pts.push(frame(bx, bz, n, u + b * 0.78 + 0.05, DEEP + 0.08), frame(bx, bz, n, u + b * 0.78 + 0.73, DEEP + 1.92));
          }
          boxAround(pts, 'bike');
          u += len + 3 + r() * 10;
        } else if (what === 'stall') {   // a food stall: the cart, two or three tables with their stools, an umbrella, the dish on a sign
          const tables = 2 + (r() < 0.4 ? 1 : 0), len = 1.95 + tables * 1.35 + 0.4;
          u = clear(u, len);
          if (u + len > end) break;
          const ry = faceStreet(n), o = frame(bx, bz, n, u, DEEP);
          const L = (x, z) => { const c = Math.cos(ry), s = Math.sin(ry); return { x: o.x + x * c + z * s, z: o.z - x * s + z * c }; };   // local → world
          const color = new THREE.Color(pickOf(r, PLASTIC));
          const cart = L(-0.75, 0.75), tops = [];
          const seats = [];
          for (let tb = 0; tb < tables; tb++) {
            const c = L(-2.1 - tb * 1.35, 0.95);
            add(TABLE, MAT.plastic, at(c.x, SLAB, c.z, ry), color);
            tops.push(c);
            for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, -0.5], [0, 0.5]]) {
              const s = L(-2.1 - tb * 1.35 + dx, 0.95 + dz);
              add(STOOL, MAT.plastic, at(s.x, SLAB, s.z, ry + r() * 0.3), color, { shadow: false });
              seats.push({ x: s.x, z: s.z, face: Math.atan2(c.x - s.x, c.z - s.z) });
            }
          }
          const um = L(-2.1 - (tables - 1) * 0.675, 0.85);
          add(UMBRELLA_POLE, MAT.vc, at(um.x, 0, um.z, 0), null, { shadow: false });
          const umr = r() * 6.28;
          add(UMBRELLA, MAT.vc2, at(um.x, 0, um.z, umr));
          add(UMBRELLA_RIBS, MAT.vc, at(um.x, 0, um.z, umr), null, { detail: true, shadow: false });
          // what it sells decides the cart (a pot of broth, a cane press, a coffee kettle, jars of chè…) and the tables
          const dish = pickOf(r, DISHES), look = STALL_LOOK[SERVING[dish] || 'soup'];
          for (const g of look.cart) add(g, g === CART_GLASS ? MAT.glass : MAT.vc, at(cart.x, 0, cart.z, ry), null, g === CART_GLASS ? { detail: true, shadow: false } : undefined);
          for (const c of tops) add(look.table, MAT.vc, at(c.x, SLAB, c.z, ry), null, { detail: true, shadow: false });
          const pot = look.pot ? L(-0.75 + 0.42, 0.75) : null;   // the pot (steaming) sits at the cart's +x end
          stalls.push({ seats, dish, sign: L(-0.75, 0.98), ry, pot, at: L(-len / 2, 1), front: L(-len / 2, 2.7) });
          boxAround([L(0.05, 0.05), L(-len + 0.05, 1.95)], 'stall');
          u += len + 3 + r() * 10;
        } else {   // a vendor's bicycle, piled high
          u = clear(u, 2.2);
          if (u + 2.2 > end) break;
          const p = frame(bx, bz, n, u + 1.1, DEEP + 1.3);
          add(VENDOR_BIKE[r() < 0.5 ? 0 : 1], MAT.vc, at(p.x, SLAB, p.z, Math.atan2(-n[0], -n[1]) + (r() < 0.5 ? Math.PI : 0)));   // along the kerb
          boxAround([frame(bx, bz, n, u + 0.1, DEEP + 0.75), frame(bx, bz, n, u + 2.1, DEEP + 1.85)], 'bike');
          stalls.push({ seats: [], vendorAt: frame(bx, bz, n, u + 1.1, DEEP + 2.25), face: faceStreet(n) + Math.PI, at: p });
          u += 2.2 + 3 + r() * 10;
        }
      }
    });
  }
  // ---- each food stall's own name, on its sign: the dish and whoever runs it ("Phở Cô Ba", "Cà phê Gió"),
  // the same every time (from the stall's place in the city, not the layout's random stream), no two alike
  {
    const taken = new Set();
    stalls.forEach((st, si) => {
      if (!st.dish) return;
      const rn = seeded(9001 + si * 7919 + st.dish.length * 131);
      for (let k = 0; k < 40 && !st.name; k++) {
        const n = `${st.dish} ${pickOf(rn, STALL_OWNERS)}`;
        if (!taken.has(n)) st.name = n;
      }
      st.name ||= `${st.dish} ${si}`;
      taken.add(st.name);
    });
  }
  // at some alleys' mouths a xe ôm waits too, beside the mouth, squatting on his seat
  const rx = seeded(4243);
  for (const m of city.alleys || []) {
    if (rx() > 0.32) continue;
    const bx = G.cx + Math.round((m.x - G.cx) / G.pitch) * G.pitch, bz = G.cz + Math.round((m.z - G.cz) / G.pitch) * G.pitch, n = m.n;
    const um = -n[1] * (m.x - bx) + n[0] * (m.z - bz), p = frame(bx, bz, n, um + (rx() < 0.5 ? -1 : 1) * (m.half + 1.05), DEEP + 1.2);
    xeOmSpots.push({ x: p.x, z: p.z, n, squat: true });
  }
  // xe ôm bikes: parked along the kerb side near the corner, the driver sitting on it
  for (const s of xeOmSpots) {
    const ry = Math.atan2(-s.n[0], -s.n[1]);   // parallel to the kerb
    s.ry = ry;
    const m = at(s.x, SLAB, s.z, ry);
    addBike(m, new THREE.Color(pickOf(r, BIKE_PAINT)));
    const c = Math.cos(ry), sn = Math.sin(ry);
    wallBox(s.x - Math.abs(c) * 0.95 - Math.abs(sn) * 0.35, s.z - Math.abs(sn) * 0.95 - Math.abs(c) * 0.35, s.x + Math.abs(c) * 0.95 + Math.abs(sn) * 0.35, s.z + Math.abs(sn) * 0.95 + Math.abs(c) * 0.35, 'bike');
  }

  // ---- the market: on the park nearest the company, rows of stalls under tarps
  const goodsCells = new Map();
  const market = (() => {
    const park = [...(city.parks || [])].sort((a, b) => Math.hypot(a.x - G.cx, a.z - G.cz) - Math.hypot(b.x - G.cx, b.z - G.cz))[0];
    if (!park) return null;
    const A = Math.min(park.half * 0.82, 15), trees = city.walls.filter((w) => w.kind === 'tree' && Math.abs((w.minX + w.maxX) / 2 - park.x) < park.half && Math.abs((w.minZ + w.maxZ) / 2 - park.z) < park.half);
    const clearOf = (x, z, pad) => !trees.some((w) => x > w.minX - pad && x < w.maxX + pad && z > w.minZ - pad && z < w.maxZ + pad);
    // the market's floor: a worn concrete square over the grass
    const floor = new THREE.Mesh(new THREE.BoxGeometry(A * 2 + 2, 0.06, A * 2 + 2), new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.95 }));
    floor.position.set(park.x, 0.05, park.z); floor.receiveShadow = true; squareOf(park.x, park.z).group.add(floor);
    const stallsAt = [], aisles = [];
    let row = 0;
    for (let z = -A + 1.5; z <= A - 1.5; z += 4.4, row++) {
      const face = row % 2 ? Math.PI : 0;
      for (let x = -A + 1.6; x <= A - 1.6; x += 2.85) {
        const wx = park.x + x, wz = park.z + z;
        if (!clearOf(wx, wz, 1.7)) continue;
        const m = at(wx, 0, wz, face);
        add(STALL, MAT.vc, m);
        add(TARP, MAT.tarp, m, new THREE.Color(pickOf(r, TARPS)), { shadow: true });
        const gk = Math.floor(r() * 3), gc = `${Math.floor(wx / 12)},${Math.floor(wz / 12)}`;   // the goods: in cells of 12 m, near or far version
        if (!goodsCells.has(gc)) goodsCells.set(gc, { pts: [], lists: [[], [], []] });
        goodsCells.get(gc).lists[gk].push(m); goodsCells.get(gc).pts.push(new THREE.Vector3(wx, 0, wz));
        wallBox(wx - 1.3, wz - 0.75, wx + 1.3, wz + 0.75, 'market');
        stallsAt.push({ x: wx, z: wz, face, seller: { x: wx, z: wz - Math.cos(face) * 1.0 } });
      }
      for (let x = -A + 2; x <= A - 2; x += 3) { const wx = park.x + x, wz = park.z + z + 2.2; if (clearOf(wx, wz, 0.8)) aisles.push(new THREE.Vector3(wx, SLAB, wz)); }
    }
    return { park, stalls: stallsAt, aisles, gate: new THREE.Vector3(park.x, 0, park.z + A + 1.2) };
  })();

  // the market's goods: each cell a near and a far batch per kind, swapped by distance (see the frame)
  const goodsList = [];
  for (const cell of goodsCells.values()) {
    const at = cell.pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / cell.pts.length), near = new THREE.Group(), far = new THREE.Group();
    cell.lists.forEach((list, k) => {
      if (!list.length) return;
      for (const [geo, grp] of [[GOODS[k], near], [GOODS_FAR[k], far]]) {
        const im = new THREE.InstancedMesh(geo, MAT.vc, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = false; im.receiveShadow = true; im.computeBoundingSphere();
        grp.add(im);
      }
    });
    root.add(near, far);
    goodsList.push({ at, r: Math.max(...cell.pts.map((p) => p.distanceTo(at))) + 1.5, near, far });
  }
  // build the batches: one instanced mesh per shape per square
  const squareList = [];
  for (const sq of squares.values()) {
    for (const { geo, mat, detail, shadow, list } of sq.items.values()) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([m, c], k) => { im.setMatrixAt(k, m); if (c) im.setColorAt(k, c); });
      im.castShadow = shadow; im.receiveShadow = true;
      im.computeBoundingSphere();
      (detail ? sq.detail : sq.group).add(im);
    }
    const c = sq.pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, sq.pts.length));
    squareList.push({ ...sq, at: c, r: Math.max(10, ...sq.pts.map((p) => p.distanceTo(c))) });
  }
  // the parked bikes, drawn by distance: the full model within BIKE_NEAR, simpler ones further off; only those in
  // view (a margin round it) and short of the haze. Re-sorted a few times a second while the camera moves.
  // (only the near ones cast a shadow: the sun's shadow box round the player reaches no further than BIKE_NEAR)
  const bikeTiers = [BIKE, BIKE_FAR, BIKE_DIST].map((B, tier) => {
    const n = Math.max(1, parked.length), T = { paint: new THREE.InstancedMesh(B.paint, MAT.paint, n), rest: new THREE.InstancedMesh(B.rest, MAT.vc, n) };
    for (const im of [T.paint, T.rest]) { im.count = 0; im.frustumCulled = false; im.castShadow = tier === 0; im.receiveShadow = true; root.add(im); }
    T.paint.setColorAt(0, new THREE.Color(1, 1, 1));
    return T;
  });
  const _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4(), _bsph = new THREE.Sphere(new THREE.Vector3(), 3);
  const sorted = { t: 0, at: new THREE.Vector3(1e9, 0, 0), q: new THREE.Quaternion() };
  function sortParked(dt) {
    sorted.t -= dt;
    const cam = camera.position, moved = cam.distanceToSquared(sorted.at) > 0.04 || camera.quaternion.angleTo(sorted.q) > 0.02;
    if (sorted.t > 0 || (!moved && sorted.t > -1)) return;
    sorted.t = 0.15; sorted.at.copy(cam); sorted.q.copy(camera.quaternion);
    camera.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const far = (scene.fog?.far ?? 320) + 10, n = [0, 0, 0];
    for (const b of parked) {
      const d = b.p.distanceTo(cam);
      if (d > far || !_frustum.intersectsSphere(_bsph.set(b.p, 3))) continue;
      const t = d < BIKE_NEAR ? 0 : d < BIKE_MID ? 1 : 2, T = bikeTiers[t], k = n[t]++;
      T.paint.setMatrixAt(k, b.m); T.rest.setMatrixAt(k, b.m); T.paint.setColorAt(k, b.color);
    }
    bikeTiers.forEach((T, t) => {
      for (const a of [T.paint.instanceMatrix, T.rest.instanceMatrix, T.paint.instanceColor]) {
        a.clearUpdateRanges(); if (n[t]) a.addUpdateRange(0, n[t] * a.itemSize); a.needsUpdate = true;
      }
      T.paint.count = T.rest.count = n[t];
    });
  }
  // they stop you like any wall (an older app without host.addWalls: from its next layout)
  if (host.addWalls) host.addWalls(walls); else city.walls.push(...walls);

  // ---- each stall's name on its sign: raised letters on a board (relief.js from the app, when it has it). Every
  // sign says something different, so they're made as the CEO comes near (a couple at a time), not all at once
  let relief = null, signT = 0;
  const signQueue = stalls.filter((st) => st.name);
  import('/relief.js').then((m) => { relief = m.relief; }).catch(() => { /* an older app: no signs */ });
  const SIGN_W = 1.5, SIGN_H = 0.36, signBoard = new THREE.BoxGeometry(SIGN_W, SIGN_H, 0.03), signPost = new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6);   // the posts stand on the glass case's top
  const signMats = new Map();
  const signMat = (c) => signMats.get(c) || signMats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })).get(c);
  function makeSign(st, look) {
    const g = relief((ctx, w, h) => {
      let size = h * 0.66;
      ctx.font = `900 ${size}px "Helvetica Neue", Arial, sans-serif`;
      const tw = ctx.measureText(st.name).width;
      if (tw > w * 0.94) { size *= w * 0.94 / tw; ctx.font = `900 ${size}px "Helvetica Neue", Arial, sans-serif`; }   // a long name: smaller letters
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = look.ink; ctx.fillText(st.name, w / 2, h / 2 + 4);
    }, { w: 800, h: 160, width: SIGN_W - 0.08, depth: 0.025, bevel: 0.25, roughness: 0.4 });
    return g.children[0];
  }
  function buildSigns(dt) {
    if (!relief || !signQueue.length || (signT -= dt) > 0) return;
    signT = 0.25;
    const cam = camera.position;
    signQueue.sort((a, b) => Math.hypot(a.sign.x - cam.x, a.sign.z - cam.z) - Math.hypot(b.sign.x - cam.x, b.sign.z - cam.z));
    for (let k = 0; k < 2 && signQueue.length; k++) {
      const st = signQueue[0];
      if (Math.hypot(st.sign.x - cam.x, st.sign.z - cam.z) > 140) break;
      signQueue.shift();
      const look = SIGN_LOOKS[(st.name.length * 7 + st.name.charCodeAt(0)) % SIGN_LOOKS.length];
      const letters = makeSign(st, look);
      if (!letters) continue;
      const g = new THREE.Group(); g.name = `sign:${st.name}`;
      g.position.set(st.sign.x, SLAB + 1.64, st.sign.z); g.rotation.y = st.ry;
      const b = new THREE.Mesh(signBoard, signMat(look.board)); b.castShadow = true; g.add(b);
      const l = new THREE.Mesh(letters.geometry, letters.material); l.position.z = 0.015; g.add(l);
      const back = new THREE.Mesh(letters.geometry, letters.material); back.position.z = -0.015; back.rotation.y = Math.PI; g.add(back);   // readable from both sides
      for (const x of [-0.6, 0.6]) { const post = new THREE.Mesh(signPost, signMat(0x9aa0a6)); post.position.set(x, -SIGN_H / 2 - 0.06, 0); g.add(post); }
      squareOf(st.sign.x, st.sign.z).detail.add(g);
    }
  }

  // ---- steam over the pots near the CEO: little puffs rising, swelling, then gone
  const PUFFS = 7, NEAR_POTS = 8;
  const steam = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 1), MAT.steam, PUFFS * NEAR_POTS);
  steam.frustumCulled = false; root.add(steam);
  const pots = stalls.filter((s) => s.pot);
  const _o = new THREE.Object3D();

  // ---- the people: from the model library, near the CEO only
  const spawn = (name) => host.spawnPerson?.(name);
  const hide = (c) => { if (c) { c.root.visible = false; c.pose = null; scene.add(c.root); } };
  // a helmet or a straw hat that follows a character's head
  const headOf = (c) => {
    if (c.headBone !== undefined) return c.headBone;
    if (!c.body?.model) return null;
    c.headBone = null;
    c.body.object.traverse((o) => { if (!c.headBone && o.isBone && /head$/i.test(o.name)) c.headBone = o; });
    return c.headBone;
  };
  const _h = new THREE.Vector3();
  const follow = (c, hat, lift) => {
    const b = headOf(c);
    if (!b || !hat.parent) return;
    b.getWorldPosition(_h); _h.y += lift;
    hat.parent.worldToLocal(_h); hat.position.copy(_h);
    hat.visible = c.root.visible;
  };
  const helmetMats = new Map();
  const helmetMat = (color) => helmetMats.get(color) || helmetMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.1 })).get(color);

  // seated people (customers at the stalls, sellers at the market, the xe ôm drivers): a pool, placed at the
  // nearest free seats; far ones are left empty
  const pool = { free: [], used: new Map(), made: 0 };
  const POOL_MAX = 25, SEAT_R = 85, SHOP_R = 40;   // the shops' people only when you're close by
  const seatsAll = [];
  stalls.forEach((s, si) => {
    s.seats.forEach((st, k) => { if ((si * 7 + k) % 3 !== 1) seatsAll.push({ key: `s${si}.${k}`, x: st.x, z: st.z, face: st.face, sit: true, y: 0 }); });
    if (s.vendorAt) seatsAll.push({ key: `v${si}`, x: s.vendorAt.x, z: s.vendorAt.z, face: s.face, sit: false, y: SLAB, hat: true });
  });
  xeOmSpots.forEach((s, k) => {
    const c = Math.cos(s.ry), sn = Math.sin(s.ry);
    // the rider's root on the bike's seat: RIDER_AT turned with the bike
    // (squatting: the hips over the seat by the folded legs' height, the root raised with them; see squatPose)
    const ra = s.squat ? RIDER_AT.x + 0.12 : RIDER_AT.x;
    seatsAll.push({ key: `x${k}`, x: s.x + ra * c, z: s.z - ra * sn, face: s.ry + Math.PI / 2, sit: true, y: SLAB + RIDER_AT.y + (s.squat ? SQUAT_LIFT : 0), helmet: !s.squat, xeom: s, squat: s.squat });
  });
  if (market) market.stalls.forEach((s, k) => { if (k % 2 === 0) seatsAll.push({ key: `m${k}`, x: s.seller.x, z: s.seller.z, face: s.face, sit: false, y: SLAB }); });
  // the shops one walks into (city.shops): the keeper behind the counter, a customer or two at the shelves (now and
  // then going over to the counter and back), diners on some of an eatery's stools
  (city.shops || []).forEach((sh, si) => {
    seatsAll.push({ key: `k${si}`, x: sh.staff.x, z: sh.staff.z, face: sh.staff.face, sit: false, y: SLAB, inShop: true });
    sh.browse.forEach((b, k) => { if ((si + k) % 3 !== 2) seatsAll.push({ key: `b${si}.${k}`, x: b.x, z: b.z, face: b.face, sit: false, y: SLAB, alt: b.alt, inShop: true }); });
    sh.seats.forEach((st, k) => { if ((si * 5 + k) % 3 === 0) seatsAll.push({ key: `d${si}.${k}`, x: st.x, z: st.z, face: st.face, sit: true, y: 0, inShop: true }); });
  });
  // the stools left empty are the CEO's to sit on (F, host.addSeats): they order the stall's dish and a bowl comes
  // out to the table in front of them, steaming; it's cleared when they get up
  const bowls = [], orders = [];   // orders: each stool's order waiting on the app's payment
  if (host.addSeats) {
    const mine = [];
    stalls.forEach((st, si) => st.seats.forEach((sp, k) => {
      if ((si * 7 + k) % 3 !== 1) return;
      const fx = Math.sin(sp.face), fz = Math.cos(sp.face);
      let bowl = null, timer = 0, order = null;
      mine.push({
        pos: new THREE.Vector3(sp.x, SLAB + 0.41 - 0.505, sp.z), approach: new THREE.Vector3(sp.x - fx * 0.95, 0, sp.z - fz * 0.95), facing: sp.face,
        label: t('Ngồi ăn <b>{dish}</b> ở quán {name}', { dish: st.dish, name: st.name }),
        onSit() {
          street.pop(street.pick([t('Cho một phần {dish} nha!', { dish: st.dish }), t('Một phần {dish}, không hành nha.', { dish: st.dish }), t('Chủ quán ơi, {dish}!', { dish: st.dish })]), () => host.player.root.position);
          // pay first: the app charges the dish's price from the purse (cityBuy); the bowl comes only once it's paid
          order = { dish: st.dish, serve: () => { timer = setTimeout(serve, 1600); } };
          host.callPy?.('cityBuy', st.dish);
        },
        onStand() { order = null; clearTimeout(timer); if (bowl) { bowl.removeFromParent(); bowls.splice(bowls.indexOf(bowl), 1); bowl.traverse((m) => m.geometry?.dispose()); bowl = null; } },
      });
      function serve() {
        street.pop(street.pick([t('Có liền nè!'), t('Nóng hổi đây!'), t('Ăn ngon nha!')]), () => new THREE.Vector3(st.at.x, 0, st.at.z), 'them');
        bowl = makeServing(st.dish); bowl.position.set(sp.x + fx * 0.36, SLAB + 0.537, sp.z + fz * 0.36); bowl.rotation.y = sp.face;
        scene.add(bowl); bowls.push(bowl); host.audio?.sfx('drop');
        // the CEO eats: chopsticks to a bowl or a plate; a glass or a bánh mì goes up to the mouth itself
        const kind = { soup: 'soup', rice: 'rice', xoi: 'rice', banhmi: 'bread' }[SERVING[st.dish] || 'soup'] || 'drink';
        host.playerEat?.({ at: bowl.position.clone(), kind, prop: kind === 'drink' || kind === 'bread' ? bowl.userData.handheld || bowl : null });
      }
      orders.push({ get: () => order, clear: () => { order = null; }, at: () => new THREE.Vector3(st.at.x, 0, st.at.z) });
    }));
    // the app's answer to an order: paid (the stall serves) or the purse is short (the vendor says so, nothing comes)
    host.on?.('city_buy', (msg) => {
      for (const o of orders) {
        const ord = o.get();
        if (!ord || ord.dish !== msg.dish) continue;
        o.clear();
        if (msg.ok) { street.pop(t('Trả {price} coin', { price: msg.price }), () => host.player.root.position); ord.serve(); }
        else if (msg.reason === 'coins') street.pop(t('Thiếu coin rồi, món này {price} coin.', { price: msg.price }), o.at, 'them');
        break;
      }
    });
    host.addSeats(mine);
  }
  const frustum = new THREE.Frustum(), _vp = new THREE.Matrix4(), _sph = new THREE.Sphere();
  const inView = (x, z) => { _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(_vp); return frustum.intersectsSphere(_sph.set(_h.set(x, 1, z), 1.2)); };
  let poolT = 0;
  // customers who browse go to the counter and back now and then
  function browsing(dt) {
    for (const u of pool.used.values()) {
      if (!u.s.alt || u.c.seated) continue;
      if ((u.wait = (u.wait ?? 6 + Math.random() * 10) - dt) > 0) continue;
      const to = u.away ? u.s : u.s.alt; u.away = !u.away; u.wait = 9 + Math.random() * 12;
      u.c.walkTo(new THREE.Vector3(to.x, u.s.y, to.z), () => u.c.play('idle'), new THREE.Vector3(to.x + Math.sin(to.face), u.s.y, to.z + Math.cos(to.face)));
    }
  }
  function updatePool(dt, out) {
    if ((poolT -= dt) > 0) return;
    poolT = 0.6;
    const me = camera.position;
    if (!out) { for (const [k, u] of pool.used) { hide(u.c); u.gear?.removeFromParent(); pool.free.push(u.c); pool.used.delete(k); } return; }
    const near = seatsAll.map((s) => ({ s, d: Math.hypot(s.x - me.x, s.z - me.z) })).filter((e) => e.d < (e.s.inShop ? SHOP_R : SEAT_R)).sort((a, b) => a.d - b.d).slice(0, POOL_MAX);
    const keep = new Set(near.map((e) => e.s.key));
    for (const [k, u] of pool.used) if (!keep.has(k)) { hide(u.c); u.gear?.removeFromParent(); pool.free.push(u.c); pool.used.delete(k); }
    for (const { s, d } of near) {
      if (pool.used.has(s.key)) continue;
      if (d < 40 && inView(s.x, s.z)) continue;   // nobody pops up in plain sight
      let c = pool.free.pop();
      if (!c && pool.made < POOL_MAX) c = spawn(`quan${pool.made++}`);
      if (!c) break;
      scene.add(c.root);
      c.root.position.set(s.x, s.y, s.z); c.root.rotation.set(0, s.face, 0); c.root.visible = true;
      c.target = null; c.faceTarget = null; c.seated = s.sit; c.play(s.sit ? 'sit' : 'idle');
      // a xe ôm driver is a man in everyday clothes (the pooled person is re-dressed if need be)
      if (s.xeom && !/(^|\/)(Male_|Delivery_Male|Construction_Male|Gardener_Male)/.test(String(c.modelFile || '').split('/').pop())) {
        c.setModel(new URL(`./people/Male_Adult_${String(1 + (hashKey(s.key) % 10)).padStart(2, '0')}.glb`, import.meta.url).pathname);
      }
      c.pose = s.squat ? squatPose : null; c.squatTop = s.squat ? SLAB + RIDER_AT.y + 0.53 : null;
      let gear = null;
      if (s.helmet) { gear = new THREE.Mesh(HELMET, helmetMat(pickOf(Math.random, HELMETS))); gear.rotation.y = s.face - Math.PI / 2; root.add(gear); }
      else if (s.hat) { gear = new THREE.Mesh(HAT, MAT.straw); root.add(gear); }
      pool.used.set(s.key, { c, s, gear, called: 0 });
    }
  }

  // ---- vendors with a shoulder pole, walking the sidewalks near the CEO, stopping to sell
  const VENDORS = 6, vendors = [];
  const loopAround = (i, j, h) => { const cx = G.cx + i * G.pitch, cz = G.cz + j * G.pitch;
    return [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h]].map(([x, z]) => new THREE.Vector3(x, SLAB, z)); };
  function placeVendor(v, far) {
    const me = player.root.position;
    for (let k = 0; k < 30; k++) {
      const i = clamp(Math.round((me.x - G.cx) / G.pitch) + Math.floor(Math.random() * 3) - 1, -G.rings, G.rings);
      const j = clamp(Math.round((me.z - G.cz) / G.pitch) + Math.floor(Math.random() * 3) - 1, -G.rings, G.rings);
      if (!i && !j) continue;
      const loop = loopAround(i, j, inner / 2 - 1.0), e = Math.floor(Math.random() * 4), p = loop[e].clone().lerp(loop[(e + 1) % 4], Math.random());
      if ((far && p.distanceTo(me) < 30) || (k < 29 && p.distanceTo(me) < 60 && inView(p.x, p.z))) continue;
      Object.assign(v, { loop, edge: e, cw: Math.random() < 0.5, pause: 0 });
      v.c.placeAt(p);
      vendorOn(v);
      return;
    }
  }
  function vendorOn(v) {
    if (Math.random() < 0.45) { v.c.play('idle'); v.pause = 4 + Math.random() * 7; return; }   // stopped to sell
    v.edge = (v.edge + (v.cw ? 1 : 3)) % 4;
    v.c.walkTo(v.loop[v.edge], () => vendorOn(v));
  }
  function addVendor() {
    const c = spawn(`ganh${vendors.length}`);
    if (!c) return;
    const pole = new THREE.Mesh(GANH, MAT.vc); pole.castShadow = true; c.root.add(pole);
    const hat = new THREE.Mesh(HAT, MAT.straw); root.add(hat);
    const v = { c, pole, hat, bumpT: 0 };
    vendors.push(v);
    placeVendor(v, false);
  }

  // ---- motorbikes in the traffic, around the CEO: right-hand side of the road, weaving past the cars
  const N = G.rings * 2 + 2, DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const roadX = (a) => G.cx + (a - G.rings - 0.5) * G.pitch, roadZ = (b) => G.cz + (b - G.rings - 0.5) * G.pitch;
  const insideGrid = (a, b) => a >= 0 && b >= 0 && a < N && b < N;
  const BIKES = 34, bikes = [], paintMats = new Map();
  const paintMat = (color) => paintMats.get(color) || paintMats.set(color, MAT.paint.clone().setValues({ color })).get(color);
  function legOf(b) {
    const [dx, dz] = DIRS[b.dir];
    b.from = new THREE.Vector3(roadX(b.a) + dx * 9, 0, roadZ(b.b) + dz * 9);
    b.to = new THREE.Vector3(roadX(b.a + dx) - dx * 9, 0, roadZ(b.b + dz) - dz * 9);
    b.fwd = new THREE.Vector3(dx, 0, dz); b.right = new THREE.Vector3(-dz, 0, dx);
  }
  function nextLeg(b) {
    b.a += DIRS[b.dir][0]; b.b += DIRS[b.dir][1];
    const opts = [[b.dir, 3], [(b.dir + 1) % 4, 1.2], [(b.dir + 3) % 4, 1.2]].filter(([d]) => insideGrid(b.a + DIRS[d][0], b.b + DIRS[d][1]));
    let pick = Math.random() * opts.reduce((n, [, w]) => n + w, 0);
    b.dir = (opts.find(([, w]) => (pick -= w) < 0) || opts[0] || [(b.dir + 2) % 4])[0];
    legOf(b);
  }
  function placeBike(b, far) {
    const me = player.root.position;
    for (let k = 0; k < 40; k++) {
      const a = clamp(Math.floor((me.x - G.cx) / G.pitch + G.rings + 0.5) + Math.floor(Math.random() * 5) - 2, 0, N - 1);
      const bb = clamp(Math.floor((me.z - G.cz) / G.pitch + G.rings + 0.5) + Math.floor(Math.random() * 5) - 2, 0, N - 1);
      const dir = Math.floor(Math.random() * 4);
      if (!insideGrid(a + DIRS[dir][0], bb + DIRS[dir][1])) continue;
      Object.assign(b, { a, b: bb, dir }); legOf(b);
      b.lat = 5.6 + Math.random() * 1.6; b.latWant = b.lat;
      const p = b.from.clone().lerp(b.to, Math.random()).addScaledVector(b.right, b.lat);
      if ((far && p.distanceTo(me) < 40) || (k < 39 && p.distanceTo(me) < 90 && inView(p.x, p.z))) continue;
      b.group.position.copy(p); b.heading = Math.atan2(-b.fwd.z, b.fwd.x); b.speed = 7;
      return;
    }
  }
  for (let k = 0; k < BIKES; k++) {
    const g = new THREE.Group(); g.rotation.order = 'YXZ';   // heading, then the lean
    const color = pickOf(Math.random, BIKE_PAINT);
    const pm = new THREE.Mesh(BIKE.paint, paintMat(color)); pm.castShadow = true; g.add(pm);
    const rm = new THREE.Mesh(BIKE.rest, MAT.vc); rm.castShadow = true; g.add(rm);
    g.userData.meshes = [pm, rm];
    root.add(g);
    const b = { group: g, speed: 0, stopFor: 0, honkT: 0, rider: null, helmet: null, cruise: 9 + Math.random() * 4 };
    placeBike(b, false);
    bikes.push(b);
  }
  function seatRider(b) {
    if (b.rider || !host.spawnPerson) return;
    const c = spawn(`xemay${bikes.indexOf(b)}`);
    if (!c) return;
    b.group.add(c.root);
    c.root.position.copy(RIDER_AT); c.root.rotation.set(0, Math.PI / 2, 0); c.root.scale.setScalar(0.95);
    c.seated = true; c.play('sit');
    b.rider = c;
    b.helmet = new THREE.Mesh(HELMET, helmetMat(pickOf(Math.random, HELMETS))); b.helmet.rotation.y = 0; b.helmet.castShadow = true; b.group.add(b.helmet);
  }
  const blockersFor = (b) => {
    const list = [];
    for (const c of street?.cars || []) {   // a car's footprint as the bike sees it: across a junction it's long sideways
      const d = (c.heading ?? 0) - b.heading, sn = Math.abs(Math.sin(d)), cs = Math.abs(Math.cos(d));
      list.push({ pos: c.group.position, w: 2.3 * sn + 0.92 * cs + 0.1, l: 2.3 * cs + 0.92 * sn + 0.2 });
    }
    for (const c of street?.parkedNear?.(b.group.position, 16) || []) {   // cars parked at the kerb are in the way too
      const d = c.heading - b.heading, sn = Math.abs(Math.sin(d)), cs = Math.abs(Math.cos(d));
      list.push({ pos: c.group.position, w: 2.3 * sn + 0.92 * cs + 0.1, l: 2.3 * cs + 0.92 * sn + 0.2 });
    }
    for (const o of bikes) if (o !== b) list.push({ pos: o.group.position, w: 0.45, l: 1.0 });
    if (!street?.driving) list.push({ pos: player.root.position, w: 0.45, l: 0.4, me: true });
    const aide = host.companion?.();
    if (aide?.visible) list.push({ pos: aide.position, w: 0.45, l: 0.4 });
    return list;
  };
  let honkGlobal = 0;
  function updateBikes(dt) {
    honkGlobal -= dt;
    const me = player.root.position, cam = camera.position, far2 = ((scene.fog?.far ?? 320) + 10) ** 2;
    for (const b of bikes) {
      const p = b.group.position;
      if (p.distanceTo(me) > 230) { placeBike(b, true); continue; }
      // where it is along its leg; on to the next one near its end
      const along = p.clone().sub(b.from).dot(b.fwd), len = b.to.clone().sub(b.from).dot(b.fwd);
      if (along > len - 3) { nextLeg(b); b.latWant = 5.6 + Math.random() * 1.6; }
      // what's ahead: pick the clearest lateral line (by the kerb, between the lanes or in the car lane), else brake
      const obs = blockersFor(b);
      const laneOf = (q) => q.clone().sub(b.from).dot(b.right);
      const blocked = (lat) => {
        let near = Infinity;
        for (const o of obs) {
          const rel = o.pos.clone().sub(p); rel.y = 0;
          const ahead = rel.dot(b.fwd);
          if (ahead < -0.5 || ahead > 11) continue;
          if (Math.abs(laneOf(o.pos) - lat) < o.w + 0.45) near = Math.min(near, ahead - o.l);
        }
        return near;
      };
      let free = blocked(b.latWant);
      if (free < 8) {
        const options = [6.6, 5.2, 2.6].map((lat) => ({ lat, f: blocked(lat) })).sort((x, y) => y.f - x.f || Math.abs(x.lat - b.lat) - Math.abs(y.lat - b.lat));
        if (options[0].f > free + 1) { b.latWant = options[0].lat; free = options[0].f; }
      }
      // aim at a point a few metres on along the leg, at the lateral line it wants
      b.lat += clamp(b.latWant - b.lat, -1.4 * dt, 1.4 * dt);
      const aimAlong = clamp(Math.max(along, 0) + 5, 0, len);
      const aim = b.from.clone().addScaledVector(b.fwd, aimAlong).addScaledVector(b.right, b.lat);
      const want = Math.atan2(-(aim.z - p.z), aim.x - p.x);
      b.heading += clamp(wrap(want - b.heading), -2.6 * dt, 2.6 * dt);
      let goal = Math.min(b.cruise, Math.max(0, (free - 2.2) * 2));
      if (Math.abs(wrap(want - b.heading)) > 0.45) goal = Math.min(goal, 5);
      if (b.stopFor > 0) { b.stopFor -= dt; goal = 0; }
      b.speed += clamp(goal - b.speed, -12 * dt, 4 * dt);
      p.x += Math.cos(b.heading) * b.speed * dt; p.z -= Math.sin(b.heading) * b.speed * dt;
      // never through a car: the bike's front and back wheels are pushed out of any car box, and it stops there
      if (street?.outOfCars) {
        const hx = Math.cos(b.heading) * 0.55, hz = -Math.sin(b.heading) * 0.55, f = new THREE.Vector3(p.x + hx, 0, p.z + hz), r0 = new THREE.Vector3(p.x - hx, 0, p.z - hz);
        const f0 = f.clone(), b0 = r0.clone();
        if (street.outOfCars(f, 0.35) | street.outOfCars(r0, 0.35)) {   // both wheels checked; the bigger push moves the bike
          const df = f.sub(f0), db = r0.sub(b0), d = df.lengthSq() > db.lengthSq() ? df : db;
          p.x += d.x; p.z += d.z;
          b.speed = 0; b.stopFor = Math.max(b.stopFor || 0, 0.8);
        }
      }
      b.group.rotation.set(-clamp(wrap(want - b.heading), -0.5, 0.5) * 0.35 * Math.min(1, b.speed / 6), b.heading, 0);   // leaning into the turn
      // a honk when held up by someone on foot, or now and then in the crush
      if ((b.honkT -= dt) <= 0 && free < 7 && b.speed < 4 && honkGlobal <= 0 && p.distanceTo(me) < 30) { host.audio?.sfx('horn'); b.honkT = 4 + Math.random() * 4; honkGlobal = 1.2; }
      // the CEO on foot in its way: too fast to stop, a brush that sends them aside
      if (!street?.driving && host.isOutdoors() && b.speed > 4) {
        const d = Math.hypot(me.x - p.x, me.z - p.z);
        if (d < 0.95) {
          const away = me.clone().sub(p).setY(0).normalize();
          me.addScaledVector(away, 1.0); host.collide(me, 0.3); player.keys.clear();
          street?.pop?.(pickOf(Math.random, LINES.hit), () => b.group.position, 'them', b.rider);
          host.audio?.sfx('bump_car');
          b.speed = 0; b.stopFor = 2;
        }
      }
      // shown up to the haze; the rider (and their animation) only within 75 m
      const d2 = p.distanceToSquared(cam);
      b.group.visible = d2 < far2;
      const lod = d2 < BIKE_NEAR * BIKE_NEAR ? BIKE : d2 < BIKE_MID * BIKE_MID ? BIKE_FAR : BIKE_DIST, [pm, rm] = b.group.userData.meshes;   // the full model close by
      if (pm.geometry !== lod.paint) { pm.geometry = lod.paint; rm.geometry = lod.rest; }
      if (d2 < 120 * 120) seatRider(b);
      if (b.rider) {
        b.rider.root.visible = d2 < 75 * 75;
        if (b.rider.root.visible && d2 < 45 * 45) follow(b.rider, b.helmet, 0.1);
        b.helmet.visible = b.rider.root.visible;
      }
    }
  }
  // the cars stop for the bikes, a driven car shoves them aside
  street?.addRoadUsers?.(() => bikes.map((b) => ({ pos: b.group.position, r: 0.5, hit: (mine) => { b.speed = 0; b.stopFor = 2.5; if (mine) street?.pop?.(pickOf(Math.random, LINES.carHit), () => b.group.position, 'them', b.rider); } })));

  // ---- solid people and bikes: the CEO and the assistant can't walk through them; a word when bumped hard
  const LINES = {
    hit: [t('Ê! Nhìn đường chứ!'), t('Đứng giữa đường làm gì vậy!'), t('Suýt nữa là tông rồi…')],
    carHit: [t('Lái xe kiểu gì vậy trời!'), t('Ui, cái xe của tôi!')],
    vendor: [t('Ối, gánh hàng của tôi!'), t('Từ từ thôi, đổ hết bây giờ!'), t('Mua giùm ít trái cây đi!')],
    shopper: [t('Chen gì mà chen!'), t('Xin lỗi nha!'), t('Ui, giẫm chân tôi rồi!')],
    xeom: [t('Xe ôm không anh chị?'), t('Đi đâu chở đi nè!'), t('Lên xe đi, rẻ mà!'), t('Xe ôm không? Đi đâu cũng chở!')],
  };
  let lastPos = null, mySpeed = 0, sayT = 0;
  const pushOut = (q, x, z, rad) => {
    const dx = q.x - x, dz = q.z - z, d = Math.hypot(dx, dz);
    if (d >= rad || d < 1e-4) return false;
    q.x = x + dx / d * rad; q.z = z + dz / d * rad;
    return true;
  };
  function solid(dt) {
    const me = player.root.position, aide = host.companion?.();
    if (lastPos) mySpeed = mySpeed * 0.8 + (Math.hypot(me.x - lastPos.x, me.z - lastPos.z) / Math.max(dt, 1e-3)) * 0.2;
    lastPos = (lastPos || new THREE.Vector3()).copy(me);
    sayT -= dt;
    const out = host.isOutdoors() && !street?.driving;
    const say = (list, at, who) => { if (sayT > 0) return; sayT = 1.8; street?.pop?.(pickOf(Math.random, list), at, 'them', who); host.audio?.sfx('bump_person'); };
    for (const b of bikes) {   // a bike: two circles along it
      const p = b.group.position, fx = Math.cos(b.heading) * 0.45, fz = -Math.sin(b.heading) * 0.45;
      for (const s of [1, -1]) {
        if (out) pushOut(me, p.x + fx * s, p.z + fz * s, 0.72);
        if (aide) pushOut(aide.position, p.x + fx * s, p.z + fz * s, 0.72);
      }
    }
    for (const v of vendors) {   // a vendor and the baskets fore and aft
      const p = v.c.root.position, a = v.c.root.rotation.y, fx = Math.sin(a) * 0.78, fz = Math.cos(a) * 0.78;
      let hit = false;
      for (const s of [0, 1, -1]) {
        if (out && pushOut(me, p.x + fx * s, p.z + fz * s, s ? 0.62 : 0.55)) hit = true;
        if (aide) pushOut(aide.position, p.x + fx * s, p.z + fz * s, 0.6);
      }
      if (hit && mySpeed > 3.2 && v.bumpT <= 0) { v.bumpT = 3; say(LINES.vendor, () => v.c.root.position, v.c); v.c.play('sad'); v.pause = Math.max(v.pause, 2); v.c.target = null; }
      v.bumpT -= dt;
    }
    for (const u of pool.used.values()) {
      if (u.s.sit && !u.s.xeom) continue;   // customers sit inside their stall (already a wall)
      const p = u.c.root.position;
      if (out && pushOut(me, p.x, p.z, 0.55) && !u.s.xeom && mySpeed > 3.2) say(LINES.shopper, () => p, u.c);
      if (aide) pushOut(aide.position, p.x, p.z, 0.55);
    }
    // the xe ôm drivers call out as the CEO walks by
    if (out) for (const u of pool.used.values()) {
      if (!u.s.xeom || performance.now() < u.called) continue;
      if (Math.hypot(me.x - u.s.x, me.z - u.s.z) < 4.5) { u.called = performance.now() + 25000; street?.pop?.(pickOf(Math.random, LINES.xeom), () => u.c.root.position, 'them', u.c); }
    }
  }

  // ---- the market's shoppers: walking slowly between the stalls, stopping to look
  const SHOPPERS = 7, shoppers = [];
  function updateShoppers(dt, out) {
    if (!market) return;
    const me = camera.position, near = out && Math.hypot(me.x - market.park.x, me.z - market.park.z) < market.park.half + 90;
    if (near && !shoppers.length) for (let k = 0; k < SHOPPERS; k++) {
      const c = spawn(`cho${k}`); if (!c) break;
      const s = { c, pause: Math.random() * 3 };
      c.placeAt(pickOf(Math.random, market.aisles));
      shoppers.push(s);
    }
    for (const s of shoppers) {
      s.c.root.visible = near;
      if (!near) continue;
      if (s.c.target) continue;
      if ((s.pause -= dt) > 0) continue;
      s.pause = 2 + Math.random() * 6;
      const p = s.c.root.position, next = market.aisles.filter((q) => Math.abs(q.z - p.z) < 0.5 || Math.hypot(q.x - p.x, q.z - p.z) < 7);
      s.c.walkTo(pickOf(Math.random, next.length ? next : market.aisles), () => s.c.play('idle'));
    }
  }
  // the market's name over its entrance
  if (market) import('/relief.js').then(({ relief }) => {
    const g = relief((ctx, w, h) => { ctx.font = `900 ${h * 0.7}px "Helvetica Neue", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f6d34a'; ctx.fillText(t('Chợ'), w / 2, h / 2 + 6); },
      { w: 256, h: 128, width: 1.6, depth: 0.08 });
    const gate = new THREE.Group(); gate.position.copy(market.gate);
    const red = new THREE.MeshStandardMaterial({ color: 0x9e1b1b, roughness: 0.6 });
    for (const x of [-2.6, 2.6]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, 0.25), red); post.position.set(x, 1.7, 0); post.castShadow = true; gate.add(post); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.9, 0.2), red); beam.position.y = 3.4; beam.castShadow = true; gate.add(beam);
    g.position.set(0, 3.38, 0.11); gate.add(g);
    const back = g.clone(); back.position.z = -0.11; back.rotation.y = Math.PI; gate.add(back);
    squareOf(market.gate.x, market.gate.z).group.add(gate);
  }).catch(() => {});

  root.userData.debug = { stalls, xeOmSpots, market, bikes, vendors, pool, walls, street };   // for tests: where things are
  // ---- the frame: squares past the haze hidden, small details only near; people and traffic
  let t0 = 0;
  return {
    // for the city's dangers (survival.js): where people crowd — the stalls and the market
    get crowds() { return [...stalls.filter((s) => s.seats.length).map((s) => new THREE.Vector3(s.at.x, 0, s.at.z)), ...(market ? [new THREE.Vector3(market.park.x, 0, market.park.z)] : [])]; },
    // the food stalls, by name, for today's missions (quests.js): where to stand to be at each one
    get shops() { return stalls.filter((s) => s.name).map((s) => ({ name: s.name, dish: s.dish, x: s.front.x, z: s.front.z })); },
    get marketArea() { return market ? { x: market.park.x, z: market.park.z, half: market.park.half } : null; },
    update(dt) {
      // steam off the CEO's bowl: puffs rise, swell and fade, one after another
      for (const b of bowls) for (const p of b.userData.steam || []) {
        p.userData.t = (p.userData.t + dt * 0.45) % 2.4;
        const k = p.userData.t / 2.4;
        p.position.set(Math.sin(p.userData.t * 3 + p.id) * 0.03, 0.1 + k * 0.42, Math.cos(p.userData.t * 2 + p.id) * 0.02);
        p.scale.setScalar(0.6 + k * 1.6);
        p.visible = k < 0.95;
      }
      t0 += dt;
      const cam = camera.position, far = (scene.fog?.far ?? 320) + 10, out = host.isOutdoors() || !!street?.driving;
      for (const sq of squareList) {
        const d = Math.hypot(sq.at.x - cam.x, sq.at.z - cam.z) - sq.r;
        sq.group.visible = d < far; sq.detail.visible = d < 90;   // the small things on the stalls: specks past that
      }
      for (const g of goodsList) { const d = Math.hypot(g.at.x - cam.x, g.at.z - cam.z) - g.r; g.near.visible = d < GOODS_NEAR; g.far.visible = d >= GOODS_NEAR && d < 90; }
      sortParked(dt);
      updateBikes(dt);
      updatePool(dt, out); browsing(dt);
      if (out && vendors.length < VENDORS) addVendor();
      for (const v of vendors) {
        v.c.root.visible = out;
        if (v.pause > 0 && (v.pause -= dt) <= 0) vendorOn(v);
        if (out && v.c.root.position.distanceTo(player.root.position) > 160) placeVendor(v, true);
        if (out && v.c.root.position.distanceToSquared(cam) < 40 * 40) follow(v.c, v.hat, 0.12); else v.hat.visible = false;
      }
      updateShoppers(dt, out);
      if (out) buildSigns(dt);
      for (const u of pool.used.values()) if (u.gear && u.c.root.position.distanceToSquared(cam) < 40 * 40) follow(u.c, u.gear, u.s.helmet ? 0.1 : 0.12);
      solid(dt);
      // steam over the nearest pots
      const near = pots.map((s) => ({ s, d: Math.hypot(s.pot.x - cam.x, s.pot.z - cam.z) })).filter((e) => e.d < 45).sort((a, b) => a.d - b.d).slice(0, NEAR_POTS);
      for (let k = 0; k < NEAR_POTS; k++) for (let q = 0; q < PUFFS; q++) {
        const e = near[k], idx = k * PUFFS + q;
        if (!e) { _o.scale.setScalar(0); _o.updateMatrix(); steam.setMatrixAt(idx, _o.matrix); continue; }
        const ph = (t0 * 0.5 + q / PUFFS + k * 0.37) % 1;
        _o.position.set(e.s.pot.x + Math.sin(q * 2.1 + t0 * 0.7) * 0.06 * (1 + ph * 3), SLAB + 1.25 + ph * 0.9, e.s.pot.z + Math.cos(q * 1.7 + t0 * 0.6) * 0.06 * (1 + ph * 3));
        _o.scale.setScalar((0.6 + ph * 2.2) * Math.sin(ph * Math.PI));
        _o.rotation.set(q, t0 * 0.3 + q, 0);
        _o.updateMatrix(); steam.setMatrixAt(idx, _o.matrix);
      }
      steam.instanceMatrix.needsUpdate = true;
    },
  };
}
