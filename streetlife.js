// Everyday street life, in the way of the CEO's errands: motorbikes weaving through the traffic (a helmeted
// rider on each), rows of bikes parked across the sidewalks, street food on low plastic stools under umbrellas
// (a pot steaming on the cart, the dish on a raised sign), vendors with a shoulder pole and two baskets, vendor
// bicycles piled with flowers or fruit, a market on a square, motorbike-taxi drivers calling out at the corners.
//
// All of it is real geometry. The static things are batched per two-block square (hidden past the haze, small
// details past 130 m) and are walls (host.addWalls), so the CEO, the assistant and a driven car stop at them and
// bumping them gets a word. The people in it come from the model library, only near the CEO.
//
// createStreetLife(host, street) → { update(dt) }

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
// a rod from a to b
const rod = (a, b, r, color, n = 6) => {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = cyl(r, r, len, n);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return part(g, color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
};

const MAT = {
  vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 }),
  vc2: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide }),   // cloth, canopies
  paint: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.45 }),                          // bikes: colour per instance
  plastic: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 }),                            // stools, tables, tarps
  tarp: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide }),
  glass: new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false }),
  steam: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }),
  straw: new THREE.MeshStandardMaterial({ color: 0xd8c48c, roughness: 0.9 }),
};
const BIKE_PAINT = [0xc81e1e, 0x151515, 0xf2f2f2, 0x1d4f9a, 0xa7acb3, 0x6e1420, 0x2f6b3c, 0xe0b81e, 0x4a2a6a];
const PLASTIC = [0xd32b2b, 0x2a6fd1, 0xd32b2b, 0x2fa44f, 0xe8d23a];
const TARPS = [0x2f6fd8, 0xd8402f, 0xf08a22, 0x2fa45a, 0x7a3fb0, 0x3fb6c9];
const HELMETS = [0xf4f4f4, 0xc8241f, 0x151515, 0xf2c21b, 0x2457b8, 0xe86fa4, 0x3d8a3f];

// A motorbike, facing +x, wheels on the ground: the body (one paint) and everything else
const BIKE = (() => {
  const W = 0xffffff;
  const paint = merge([
    part(extrude([[-0.9, 0.6], [-0.82, 0.48], [-0.25, 0.43], [0.22, 0.38], [0.3, 0.42], [0.25, 0.5], [-0.15, 0.52], [-0.3, 0.7], [-0.88, 0.7]], 0.34), W),   // floorboard and the body under the seat
    part(extrude([[0.18, 0.42], [0.3, 0.36], [0.47, 0.95], [0.4, 1.02], [0.32, 0.98]], 0.42), W),                                                               // leg shield
    part(box(0.2, 0.12, 0.24), W, 0.46, 1.0, 0),                                                                                                             // headset
    part(extrude([[0.5, 0.58], [0.82, 0.58], [0.78, 0.66], [0.55, 0.66]], 0.16), W),                                                                           // front mudguard
  ]);
  const rest = merge([
    part(extrude([[-0.86, 0.7], [-0.22, 0.7], [-0.16, 0.76], [-0.32, 0.82], [-0.8, 0.81], [-0.88, 0.76]], 0.3), 0x1c1c1e),                                   // seat
    part(cyl(0.018, 0.018, 0.66, 8), 0x232325, 0.42, 1.07, 0, Math.PI / 2, 0, 0),                                                                            // handlebar
    ...[-1, 1].map((s) => part(cyl(0.022, 0.022, 0.12, 8), 0x101010, 0.42, 1.07, s * 0.28, Math.PI / 2, 0, 0)),                                                // grips
    ...[-1, 1].map((s) => rod([0.66, 0.32, s * 0.07], [0.45, 1.0, s * 0.07], 0.022, 0x9aa0a6)),                                                                // fork
    ...[-1, 1].map((s) => rod([0.42, 1.07, s * 0.24], [0.4, 1.28, s * 0.3], 0.008, 0x2a2a2a)),                                                                 // mirror stalks
    ...[-1, 1].map((s) => part(box(0.02, 0.06, 0.09), 0x2a2a2a, 0.4, 1.3, s * 0.31)),                                                                          // mirrors
    ...[0.66, -0.66].map((x) => part(new THREE.TorusGeometry(0.25, 0.075, 8, 22), 0x141414, x, 0.32, 0)),                                                     // tyres
    ...[0.66, -0.66].map((x) => part(cyl(0.15, 0.15, 0.09, 14), 0x7a7e84, x, 0.32, 0, Math.PI / 2, 0, 0)),                                                     // hubs
    rod([-0.62, 0.32, 0.12], [-0.1, 0.42, 0.12], 0.035, 0x55585c),                                                                                            // swing arm
    part(cyl(0.04, 0.045, 0.55, 10), 0x8d9196, -0.5, 0.34, 0.18, 0, 0, Math.PI / 2),                                                                          // exhaust
    part(box(0.06, 0.08, 0.14), 0xfff4d6, 0.57, 1.0, 0),                                                                                                     // headlight
    part(box(0.05, 0.05, 0.16), 0xc0141a, -0.92, 0.66, 0),                                                                                                   // tail light
    part(box(0.012, 0.11, 0.18), 0xf0f0f0, -0.93, 0.55, 0),                                                                                                  // plate
  ]);
  return { paint, rest };
})();
// on a bike, the rider's root: hips (0.6 above it) on the seat
const RIDER_AT = new THREE.Vector3(-0.42, 0.21, 0);

const HELMET = merge([
  part(new THREE.SphereGeometry(0.135, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.56), 0xffffff),
  part(box(0.04, 0.025, 0.2), 0xffffff, 0.12, 0.0, 0),   // the peak
]);
const HAT = merge([part(cyl(0.006, 0.25, 0.16, 20), 0xd8c48c, 0, 0.05, 0), part(new THREE.TorusGeometry(0.245, 0.008, 4, 24), 0xc4ad70, 0, -0.03, 0, Math.PI / 2, 0, 0)]);   // a conical straw hat

// A food stall's pieces (local: x along the sidewalk, +z towards the street)
const STOOL = merge([part(cyl(0.12, 0.16, 0.38, 4), 0xffffff, 0, 0.19, 0, 0, Math.PI / 4), part(box(0.23, 0.035, 0.23), 0xffffff, 0, 0.395, 0)]);
const TABLE = merge([part(cyl(0.2, 0.28, 0.5, 4), 0xffffff, 0, 0.25, 0, 0, Math.PI / 4), part(box(0.62, 0.035, 0.62), 0xffffff, 0, 0.52, 0)]);
const TABLE_TOP = merge([   // bowls, chopsticks, a condiment caddy on a table
  ...[[-0.15, -0.13], [0.16, 0.12]].map(([x, z]) => part(new THREE.SphereGeometry(0.075, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xf3efe6, x, 0.615, z)),
  ...[[-0.15, -0.13], [0.16, 0.12]].map(([x, z]) => part(cyl(0.07, 0.07, 0.006, 12), 0xb8763d, x, 0.6, z)),
  part(box(0.12, 0.08, 0.07), 0x8b5a2b, 0, 0.58, 0),
  ...[-0.03, 0.03].map((x) => part(cyl(0.018, 0.018, 0.1, 8), [0xb5251d, 0x6b3b17][x > 0 ? 1 : 0], x, 0.64, 0)),
  ...[0, 0.01, 0.02].map((d) => part(cyl(0.003, 0.003, 0.24, 4), 0xc9a46a, 0.0 + d, 0.6, -0.2, 0, 0, Math.PI / 2)),
]);
const CART = merge([
  part(box(1.25, 0.72, 0.62), 0xc5c9ce, 0, SLAB + 0.5, 0),          // stainless body
  part(box(1.29, 0.04, 0.66), 0x8b5a2b, 0, SLAB + 0.88, 0),         // wooden top
  part(box(1.25, 0.05, 0.62), 0x7d8287, 0, SLAB + 0.16, 0),         // shelf
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
const UMBRELLA_POLE = merge([part(cyl(0.025, 0.025, 2.35, 8), 0xdcdcdc, 0, SLAB + 1.175, 0), part(cyl(0.2, 0.25, 0.08, 12), 0x8a8f94, 0, SLAB + 0.04, 0)]);
const UMBRELLA = (() => {   // a canopy of alternating panels
  const g = new THREE.CylinderGeometry(0.04, 1.35, 0.42, 12, 1, true).toNonIndexed();
  g.translate(0, SLAB + 2.3, 0);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(0xd8402f), b = new THREE.Color(0xf4efe4);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.floor(((Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI) / (Math.PI * 2)) * 12 + 0.5) % 12, c = k % 2 ? a : b;
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
})();
// a market stall: a table of goods under a tarp on four poles
const STALL = merge([
  part(box(2.3, 0.06, 0.95), 0x8b6a45, 0, SLAB + 0.78, 0),
  ...[[-1.05, 0.4], [1.05, 0.4], [-1.05, -0.4], [1.05, -0.4]].map(([x, z]) => part(box(0.06, 0.78, 0.06), 0x6b5236, x, SLAB + 0.39, z)),
  ...[[-1.25, 0.95], [1.25, 0.95], [-1.25, -0.75], [1.25, -0.75]].map(([x, z]) => part(cyl(0.025, 0.025, z > 0 ? 2.05 : 2.35, 6), 0x9aa0a6, x, SLAB + (z > 0 ? 1.025 : 1.175), z)),
  part(box(0.5, 0.42, 0.5), 0x8a6c49, 0, SLAB + 0.21, -0.85),   // a crate behind
]);
const TARP = part(box(2.7, 0.03, 1.95), 0xffffff, 0, SLAB + 2.2, 0.1, -0.16, 0, 0);
const GOODS = (() => {
  const fruit = [], veg = [], cloth = [];
  const r = seeded(77);
  for (let k = 0; k < 26; k++) {
    const x = -0.95 + (k % 9) * 0.24 + r() * 0.05, z = -0.3 + Math.floor(k / 9) * 0.28;
    fruit.push(part(new THREE.SphereGeometry(0.075 + r() * 0.025, 9, 6), pickOf(r, [0xf08c1e, 0xe6c22c, 0xc8242a, 0x7cb342, 0xf2a03a]), x, SLAB + 0.88 + r() * 0.03, z));
  }
  for (let k = 0; k < 12; k++) {
    const x = -0.95 + (k % 6) * 0.38, z = -0.22 + Math.floor(k / 6) * 0.42;
    if (k % 3 === 0) veg.push(part(new THREE.SphereGeometry(0.13, 10, 7), 0x8fc25a, x, SLAB + 0.9, z, 0, 0, 0, 1, 0.8, 1));   // cabbages
    else for (let s = 0; s < 4; s++) veg.push(part(cyl(0.02, 0.025, 0.36, 5), pickOf(r, [0x3f8f3a, 0x5aa83f, 0x2f7a33]), x + (s - 1.5) * 0.04, SLAB + 0.83, z, Math.PI / 2 - 0.1, 0, r() * 0.3));   // bundles of greens
  }
  for (let k = 0; k < 8; k++) {
    const x = -0.85 + (k % 4) * 0.56, z = -0.2 + Math.floor(k / 4) * 0.42, h = 3 + Math.floor(r() * 4);
    for (let s = 0; s < h; s++) cloth.push(part(box(0.42, 0.05, 0.32), pickOf(r, [0xc0392b, 0x2e86c1, 0xf1c40f, 0x8e44ad, 0xe67e22, 0x16a085, 0xecf0f1]), x, SLAB + 0.84 + s * 0.052, z, 0, (r() - 0.5) * 0.15, 0));
  }
  return [merge(fruit), merge(veg), merge(cloth)];
})();
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
  fruit.push(part(cyl(0.3, 0.26, 0.2, 14, true), 0xb48a4e, -0.62, 0.9, 0));   // a basket
  return [merge([...frame(0x2f5d8a), ...flowers]), merge([...frame(0x7a2f2f), ...fruit])];
})();
// a vendor's shoulder pole and two baskets of goods, carried on the right shoulder (local: +z is forward)
const GANH = (() => {
  const r = seeded(5), parts = [rod([0.2, 1.42, -0.85], [0.2, 1.47, 0.85], 0.022, 0x9b7a45)];
  for (const s of [-1, 1]) {
    const z = s * 0.78;
    parts.push(part(new THREE.LatheGeometry([[0.0, 0], [0.2, 0.02], [0.27, 0.2], [0.28, 0.22]].map(([x, y]) => new THREE.Vector2(x, y)), 14), 0xb08a52, 0.2, 0.3, z));
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
    const loaf = add(new THREE.CapsuleGeometry(0.035, 0.14, 6, 12), std(0xd29a52, { roughness: 0.7 }), 0, 0.035, 0); loaf.rotation.z = Math.PI / 2; loaf.scale.set(1, 1, 0.85);
    for (let k = -2; k <= 2; k++) { const cut = add(new THREE.BoxGeometry(0.004, 0.004, 0.05), std(0xa86a33), k * 0.03, 0.068, 0); cut.rotation.y = 0.6; }
    add(new THREE.BoxGeometry(0.15, 0.012, 0.012), std(0x5aa648), 0, 0.03, 0.028);
    return g;
  }
  // a glass: clear walls, the drink inside, ice cubes, a straw
  const drink = { coffee: 0x3a2312, cane: 0xd9d68a, che: 0xc98fb8 }[kind];
  add(new THREE.CylinderGeometry(0.038, 0.032, 0.13, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }), 0, 0.065, 0);
  add(new THREE.CylinderGeometry(0.032, 0.032, 0.006, 20), BOWL_MAT.ceramic, 0, 0.003, 0).material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.4 });
  if (kind === 'che') {
    add(new THREE.CylinderGeometry(0.031, 0.031, 0.035, 18), std(0x5a8a3a, { transparent: true, opacity: 0.9 }), 0, 0.022, 0);
    add(new THREE.CylinderGeometry(0.033, 0.031, 0.04, 18), std(0xf0e6c8, { transparent: true, opacity: 0.9 }), 0, 0.06, 0);
    add(new THREE.CylinderGeometry(0.035, 0.033, 0.03, 18), std(drink, { transparent: true, opacity: 0.9 }), 0, 0.095, 0);
  } else add(new THREE.CylinderGeometry(0.035, 0.031, 0.1, 18), std(drink, { roughness: 0.15, transparent: true, opacity: 0.85 }), 0, 0.055, 0);
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
  const broth = new THREE.Mesh(new THREE.CircleGeometry(0.093, 28), BOWL_MAT.broth); broth.rotation.x = -Math.PI / 2; broth.position.y = 0.075; g.add(broth);
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
      for (const what of plan) {
        if (what === 'bikes') {   // a row of parked motorbikes, front wheels to the street
          const count = 3 + Math.floor(r() * 7), len = count * 0.78;
          if (u + len > end) break;
          const pts = [];
          for (let b = 0; b < count; b++) {
            const p = frame(bx, bz, n, u + b * 0.78 + 0.39, DEEP + 1.0);
            const m = at(p.x, SLAB, p.z, Math.atan2(-n[1], n[0]) + (r() - 0.5) * 0.25);
            add(BIKE.paint, MAT.paint, m, new THREE.Color(pickOf(r, BIKE_PAINT)));
            add(BIKE.rest, MAT.vc, m);
            pts.push(frame(bx, bz, n, u + b * 0.78 + 0.05, DEEP + 0.08), frame(bx, bz, n, u + b * 0.78 + 0.73, DEEP + 1.92));
          }
          boxAround(pts, 'bike');
          u += len + 3 + r() * 10;
        } else if (what === 'stall') {   // a food stall: the cart, two or three tables with their stools, an umbrella, the dish on a sign
          const tables = 2 + (r() < 0.4 ? 1 : 0), len = 1.95 + tables * 1.35 + 0.4;
          if (u + len > end) break;
          const ry = faceStreet(n), o = frame(bx, bz, n, u, DEEP);
          const L = (x, z) => { const c = Math.cos(ry), s = Math.sin(ry); return { x: o.x + x * c + z * s, z: o.z - x * s + z * c }; };   // local → world
          const color = new THREE.Color(pickOf(r, PLASTIC));
          const cart = L(-0.75, 0.75);
          add(CART, MAT.vc, at(cart.x, 0, cart.z, ry));
          add(CART_GLASS, MAT.glass, at(cart.x, 0, cart.z, ry), null, { detail: true, shadow: false });
          const seats = [];
          for (let tb = 0; tb < tables; tb++) {
            const c = L(-2.1 - tb * 1.35, 0.95);
            add(TABLE, MAT.plastic, at(c.x, SLAB, c.z, ry), color);
            add(TABLE_TOP, MAT.vc, at(c.x, SLAB, c.z, ry), null, { detail: true, shadow: false });
            for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, -0.5], [0, 0.5]]) {
              const s = L(-2.1 - tb * 1.35 + dx, 0.95 + dz);
              add(STOOL, MAT.plastic, at(s.x, SLAB, s.z, ry + r() * 0.3), color, { shadow: false });
              seats.push({ x: s.x, z: s.z, face: Math.atan2(c.x - s.x, c.z - s.z) });
            }
          }
          const um = L(-2.1 - (tables - 1) * 0.675, 0.85);
          add(UMBRELLA_POLE, MAT.vc, at(um.x, 0, um.z, 0), null, { shadow: false });
          add(UMBRELLA, MAT.vc2, at(um.x, 0, um.z, r() * 6.28));
          const pot = L(-0.75 + 0.42, 0.75);   // the pot sits at the cart's +x end
          stalls.push({ seats, dish: pickOf(r, DISHES), sign: L(-0.75, 1.07), ry, pot, at: L(-len / 2, 1) });
          boxAround([L(0.05, 0.05), L(-len + 0.05, 1.95)], 'stall');
          u += len + 3 + r() * 10;
        } else {   // a vendor's bicycle, piled high
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
  // xe ôm bikes: parked along the kerb side near the corner, the driver sitting on it
  for (const s of xeOmSpots) {
    const ry = Math.atan2(-s.n[0], -s.n[1]);   // parallel to the kerb
    s.ry = ry;
    const m = at(s.x, SLAB, s.z, ry);
    add(BIKE.paint, MAT.paint, m, new THREE.Color(pickOf(r, BIKE_PAINT)));
    add(BIKE.rest, MAT.vc, m);
    const c = Math.cos(ry), sn = Math.sin(ry);
    wallBox(s.x - Math.abs(c) * 0.95 - Math.abs(sn) * 0.35, s.z - Math.abs(sn) * 0.95 - Math.abs(c) * 0.35, s.x + Math.abs(c) * 0.95 + Math.abs(sn) * 0.35, s.z + Math.abs(sn) * 0.95 + Math.abs(c) * 0.35, 'bike');
  }

  // ---- the market: on the park nearest the company, rows of stalls under tarps
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
        add(GOODS[Math.floor(r() * 3)], MAT.vc, m, null, { detail: true, shadow: false });
        wallBox(wx - 1.3, wz - 0.75, wx + 1.3, wz + 0.75, 'market');
        stallsAt.push({ x: wx, z: wz, face, seller: { x: wx, z: wz - Math.cos(face) * 1.0 } });
      }
      for (let x = -A + 2; x <= A - 2; x += 3) { const wx = park.x + x, wz = park.z + z + 2.2; if (clearOf(wx, wz, 0.8)) aisles.push(new THREE.Vector3(wx, SLAB, wz)); }
    }
    return { park, stalls: stallsAt, aisles, gate: new THREE.Vector3(park.x, 0, park.z + A + 1.2) };
  })();

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
  // they stop you like any wall (an older app without host.addWalls: from its next layout)
  if (host.addWalls) host.addWalls(walls); else city.walls.push(...walls);

  // ---- the dish on each stall: raised letters on a board (relief.js from the app, when it has it)
  const signs = new THREE.Group(); root.add(signs);
  import('/relief.js').then(({ relief }) => {
    const made = new Map();
    const make = (dish) => {
      if (made.has(dish)) return made.get(dish);
      const g = relief((ctx, w, h) => {
        ctx.font = `900 ${h * 0.62}px "Helvetica Neue", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#c4161c'; ctx.fillText(dish, w / 2, h / 2 + 4);
      }, { w: 512, h: 128, width: 1.05, depth: 0.025, roughness: 0.4 });
      const mesh = g.children[0];
      made.set(dish, mesh);
      return mesh;
    };
    const board = new THREE.BoxGeometry(1.2, 0.3, 0.03), boardMat = new THREE.MeshStandardMaterial({ color: 0xf6d34a, roughness: 0.5 });
    for (const s of stalls) {
      if (!s.dish) continue;
      const proto = make(s.dish);
      if (!proto) continue;
      const g = new THREE.Group();
      g.position.set(s.sign.x, SLAB + 1.62, s.sign.z); g.rotation.y = s.ry;
      const b = new THREE.Mesh(board, boardMat); b.castShadow = true; g.add(b);
      const l = new THREE.Mesh(proto.geometry, proto.material); l.position.z = 0.015; g.add(l);
      const back = new THREE.Mesh(proto.geometry, proto.material); back.position.z = -0.015; back.rotation.y = Math.PI; g.add(back);   // readable from both sides
      for (const x of [-0.55, 0.55]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), boardMat); post.position.set(x, -0.25, 0); g.add(post); }
      squareOf(s.sign.x, s.sign.z).detail.add(g);
    }
  }).catch(() => { /* an older app: no signs */ });

  // ---- steam over the pots near the CEO: little puffs rising, swelling, then gone
  const PUFFS = 7, NEAR_POTS = 8;
  const steam = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 1), MAT.steam, PUFFS * NEAR_POTS);
  steam.frustumCulled = false; root.add(steam);
  const pots = stalls.filter((s) => s.pot);
  const _o = new THREE.Object3D();

  // ---- the people: from the model library, near the CEO only
  const spawn = (name) => host.spawnPerson?.(name);
  const hide = (c) => { if (c) { c.root.visible = false; scene.add(c.root); } };
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
  const POOL_MAX = 22, SEAT_R = 85;
  const seatsAll = [];
  stalls.forEach((s, si) => {
    s.seats.forEach((st, k) => { if ((si * 7 + k) % 3 !== 1) seatsAll.push({ key: `s${si}.${k}`, x: st.x, z: st.z, face: st.face, sit: true, y: 0 }); });
    if (s.vendorAt) seatsAll.push({ key: `v${si}`, x: s.vendorAt.x, z: s.vendorAt.z, face: s.face, sit: false, y: SLAB, hat: true });
  });
  xeOmSpots.forEach((s, k) => {
    const c = Math.cos(s.ry), sn = Math.sin(s.ry);
    // the rider's root on the bike's seat: RIDER_AT turned with the bike
    seatsAll.push({ key: `x${k}`, x: s.x + RIDER_AT.x * c, z: s.z - RIDER_AT.x * sn, face: s.ry + Math.PI / 2, sit: true, y: SLAB + RIDER_AT.y, helmet: true, xeom: s });
  });
  if (market) market.stalls.forEach((s, k) => { if (k % 2 === 0) seatsAll.push({ key: `m${k}`, x: s.seller.x, z: s.seller.z, face: s.face, sit: false, y: SLAB }); });
  // the stools left empty are the CEO's to sit on (F, host.addSeats): they order the stall's dish and a bowl comes
  // out to the table in front of them, steaming; it's cleared when they get up
  const bowls = [];
  if (host.addSeats) {
    const mine = [];
    stalls.forEach((st, si) => st.seats.forEach((sp, k) => {
      if ((si * 7 + k) % 3 !== 1) return;
      const fx = Math.sin(sp.face), fz = Math.cos(sp.face);
      let bowl = null, timer = 0;
      mine.push({
        pos: new THREE.Vector3(sp.x, SLAB + 0.41 - 0.505, sp.z), approach: new THREE.Vector3(sp.x - fx * 0.95, 0, sp.z - fz * 0.95), facing: sp.face,
        label: t('Ngồi ăn <b>{dish}</b>', { dish: st.dish }),
        onSit() {
          street.pop(street.pick([t('Cho một phần {dish} nha!', { dish: st.dish }), t('Một phần {dish}, không hành nha.', { dish: st.dish }), t('Chủ quán ơi, {dish}!', { dish: st.dish })]), () => host.player.root.position);
          timer = setTimeout(() => {
            street.pop(street.pick([t('Có liền nè!'), t('Nóng hổi đây!'), t('Ăn ngon nha!')]), () => new THREE.Vector3(st.at.x, 0, st.at.z), 'them');
            bowl = makeServing(st.dish); bowl.position.set(sp.x + fx * 0.36, SLAB + 0.537, sp.z + fz * 0.36); bowl.rotation.y = sp.face;
            scene.add(bowl); bowls.push(bowl); host.audio?.sfx('drop');
            // the CEO eats: chopsticks to a bowl or a plate; a glass or a bánh mì goes up to the mouth itself
            const kind = { soup: 'soup', rice: 'rice', xoi: 'rice', banhmi: 'bread' }[SERVING[st.dish] || 'soup'] || 'drink';
            host.playerEat?.({ at: bowl.position.clone(), kind, prop: kind === 'drink' || kind === 'bread' ? bowl : null });
          }, 2200);
        },
        onStand() { clearTimeout(timer); if (bowl) { bowl.removeFromParent(); bowls.splice(bowls.indexOf(bowl), 1); bowl.traverse((m) => m.geometry?.dispose()); bowl = null; } },
      });
    }));
    host.addSeats(mine);
  }
  const frustum = new THREE.Frustum(), _vp = new THREE.Matrix4(), _sph = new THREE.Sphere();
  const inView = (x, z) => { _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(_vp); return frustum.intersectsSphere(_sph.set(_h.set(x, 1, z), 1.2)); };
  let poolT = 0;
  function updatePool(dt, out) {
    if ((poolT -= dt) > 0) return;
    poolT = 0.6;
    const me = camera.position;
    if (!out) { for (const [k, u] of pool.used) { hide(u.c); u.gear?.removeFromParent(); pool.free.push(u.c); pool.used.delete(k); } return; }
    const near = seatsAll.map((s) => ({ s, d: Math.hypot(s.x - me.x, s.z - me.z) })).filter((e) => e.d < SEAT_R).sort((a, b) => a.d - b.d).slice(0, POOL_MAX);
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
    for (const c of street?.cars || []) list.push({ pos: c.group.position, w: 1.0, l: 2.3 });
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
      b.group.rotation.set(-clamp(wrap(want - b.heading), -0.5, 0.5) * 0.35 * Math.min(1, b.speed / 6), b.heading, 0);   // leaning into the turn
      // a honk when held up by someone on foot, or now and then in the crush
      if ((b.honkT -= dt) <= 0 && free < 7 && b.speed < 4 && honkGlobal <= 0 && p.distanceTo(me) < 30) { host.audio?.sfx('horn'); b.honkT = 4 + Math.random() * 4; honkGlobal = 1.2; }
      // the CEO on foot in its way: too fast to stop, a brush that sends them aside
      if (!street?.driving && host.isOutdoors() && b.speed > 4) {
        const d = Math.hypot(me.x - p.x, me.z - p.z);
        if (d < 0.95) {
          const away = me.clone().sub(p).setY(0).normalize();
          me.addScaledVector(away, 1.0); host.collide(me, 0.3); player.keys.clear();
          street?.pop?.(pickOf(Math.random, LINES.hit), () => b.group.position, 'them');
          host.audio?.sfx('bump_car');
          b.speed = 0; b.stopFor = 2;
        }
      }
      // shown up to the haze; the rider (and their animation) only within 75 m
      const d2 = p.distanceToSquared(cam);
      b.group.visible = d2 < far2;
      if (d2 < 120 * 120) seatRider(b);
      if (b.rider) {
        b.rider.root.visible = d2 < 75 * 75;
        if (b.rider.root.visible && d2 < 45 * 45) follow(b.rider, b.helmet, 0.1);
        b.helmet.visible = b.rider.root.visible;
      }
    }
  }
  // the cars stop for the bikes, a driven car shoves them aside
  street?.addRoadUsers?.(() => bikes.map((b) => ({ pos: b.group.position, r: 0.5, hit: (mine) => { b.speed = 0; b.stopFor = 2.5; if (mine) street?.pop?.(pickOf(Math.random, LINES.carHit), () => b.group.position, 'them'); } })));

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
    const say = (list, at) => { if (sayT > 0) return; sayT = 1.8; street?.pop?.(pickOf(Math.random, list), at, 'them'); host.audio?.sfx('bump_person'); };
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
      if (hit && mySpeed > 3.2 && v.bumpT <= 0) { v.bumpT = 3; say(LINES.vendor, () => v.c.root.position); v.c.play('sad'); v.pause = Math.max(v.pause, 2); v.c.target = null; }
      v.bumpT -= dt;
    }
    for (const u of pool.used.values()) {
      if (u.s.sit && !u.s.xeom) continue;   // customers sit inside their stall (already a wall)
      const p = u.c.root.position;
      if (out && pushOut(me, p.x, p.z, 0.55) && !u.s.xeom && mySpeed > 3.2) say(LINES.shopper, () => p);
      if (aide) pushOut(aide.position, p.x, p.z, 0.55);
    }
    // the xe ôm drivers call out as the CEO walks by
    if (out) for (const u of pool.used.values()) {
      if (!u.s.xeom || performance.now() < u.called) continue;
      if (Math.hypot(me.x - u.s.x, me.z - u.s.z) < 4.5) { u.called = performance.now() + 25000; street?.pop?.(pickOf(Math.random, LINES.xeom), () => u.c.root.position, 'them'); }
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

  root.userData.debug = { stalls, xeOmSpots, market, bikes, vendors, pool, walls };   // for tests: where things are
  // ---- the frame: squares past the haze hidden, small details only near; people and traffic
  let t0 = 0;
  return {
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
        sq.group.visible = d < far; sq.detail.visible = d < 130;
      }
      updateBikes(dt);
      updatePool(dt, out);
      if (out && vendors.length < VENDORS) addVendor();
      for (const v of vendors) {
        v.c.root.visible = out;
        if (v.pause > 0 && (v.pause -= dt) <= 0) vendorOn(v);
        if (out && v.c.root.position.distanceTo(player.root.position) > 160) placeVendor(v, true);
        if (out && v.c.root.position.distanceToSquared(cam) < 40 * 40) follow(v.c, v.hat, 0.12); else v.hat.visible = false;
      }
      updateShoppers(dt, out);
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
