// Items of the inventory as little 3D objects turning slowly: a rifle in its finish's paint, a pistol, a med
// kit, a bandage roll, a plate carrier, a jacket, coins (a pouch, a bigger pouch, a box overflowing) and the
// mission chest. Every part is modelled (closed, bevelled solids); one shared renderer draws the canvases that
// are on screen, like the avatars in the office (agentorch/web/avatar3d.js).
//
//   const cv = itemCanvas(item)   // item from the catalogue (kind, id, color, accent, glow, metal, effect)

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MAX = 320, FPS = 24, PI = Math.PI;   // a canvas is drawn at its displayed size × devicePixelRatio, up to MAX
let renderer = null, scene, cam;
function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(MAX, MAX);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  // something for metal to reflect (gold, steel), or it renders black
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4252, 0.9));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.6); key.position.set(-2, 3, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7); fill.position.set(3, 0.5, 4); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xbfe4ff, 2.0); rim.position.set(3, 1.5, -3); scene.add(rim);
  cam = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
  cam.position.set(0, 0.9, 5.2); cam.lookAt(0, 0, 0);
}

// ---- modelling kit: closed solids only (extrusions with bevels, cylinders, lathes, spheres, tori, swept boxes)
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function at(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return g.applyMatrix4(new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz)));
}
const xf = (geos, ...a) => geos.map((g) => at(g, ...a));
const shape = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); return s; };
function rrect(p, w, h, r, cx = 0, cy = 0) {
  r = Math.max(0.003, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
  const x0 = cx - w / 2, y0 = cy - h / 2;
  p.moveTo(x0 + r, y0); p.lineTo(x0 + w - r, y0); p.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  p.lineTo(x0 + w, y0 + h - r); p.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  p.lineTo(x0 + r, y0 + h); p.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0);
  return p;
}
// an extrusion of `s` exactly `d` deep (centred on z) with rounded edges `b`, the outline kept as drawn
function ext(s, d, b = 0.02, seg = 2, curve = 8) {
  b = Math.min(b, d * 0.45);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(d - 2 * b, 0.0005), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b,
    bevelOffset: -b, bevelSegments: seg, curveSegments: curve });
  return g.translate(0, 0, -(d - 2 * b) / 2);
}
const rbox = (w, h, d, r = 0.02) => ext(rrect(new THREE.Shape(), w, h, r), d, Math.min(r, d * 0.45), 2, 3);
const cyl = (rt, rb, h, n = 16) => new THREE.CylinderGeometry(rt, rb, h, n);
const cylX = (r, h, n = 16) => cyl(r, r, h, n).rotateZ(-PI / 2);
const cylZ = (r, h, n = 16) => cyl(r, r, h, n).rotateX(PI / 2);
const sph = (r, w = 10, h = 7) => new THREE.SphereGeometry(r, w, h);
const torus = (R, r, rs = 8, ts = 24) => new THREE.TorusGeometry(R, r, rs, ts);
// a ring (or a sector of one, a0..a1) as a flat shape
function ann(rOut, rIn, a0 = 0, a1 = 2 * PI) {
  const s = new THREE.Shape();
  if (a1 - a0 >= 2 * PI - 1e-6) {
    s.absarc(0, 0, rOut, 0, 2 * PI, false);
    const h = new THREE.Path(); h.absarc(0, 0, rIn, 0, 2 * PI, true); s.holes.push(h);
  } else {
    s.moveTo(rOut * Math.cos(a0), rOut * Math.sin(a0)); s.absarc(0, 0, rOut, a0, a1, false);
    s.lineTo(rIn * Math.cos(a1), rIn * Math.sin(a1)); s.absarc(0, 0, rIn, a1, a0, true); s.closePath();
  }
  return s;
}
// a band between two arcs of the same centre (a curved magazine)
function arcBand(cx, cy, rA, rB, a0, a1, n = 18) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + rA * Math.cos(a), cy + rA * Math.sin(a)]); }
  for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + rB * Math.cos(a), cy + rB * Math.sin(a)]); }
  return shape(pts);
}
// a strap: a box `th` thick and `wid` wide bent along a polyline; `side` is the direction of its width
function sweep(points, side, th, wid) {
  const n = points.length - 1, g = new THREE.BoxGeometry(1, th, wid, n * 2, 1, 1), p = g.attributes.position;
  const T = new THREE.Vector3(), N = new THREE.Vector3(), P = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const f = Math.min(n - 1e-6, (p.getX(i) + 0.5) * n), k = Math.floor(f), u = f - k;
    P.lerpVectors(points[k], points[k + 1], u);
    T.subVectors(points[k + 1], points[k]).normalize();
    N.crossVectors(side, T).normalize();
    P.addScaledVector(N, p.getY(i)).addScaledVector(side, p.getZ(i));
    p.setXYZ(i, P.x, P.y, P.z);
  }
  g.computeVertexNormals();
  return g;
}
function clean(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.clearGroups(); n.morphAttributes = {};
  return n;
}
// parts collected per material, merged into one mesh each
class Kit {
  constructor() { this.parts = new Map(); }
  add(mat, ...geos) { let l = this.parts.get(mat); if (!l) this.parts.set(mat, (l = [])); l.push(...geos.flat()); return this; }
  build() { const g = new THREE.Group(); for (const [m, l] of this.parts) g.add(new THREE.Mesh(mergeGeometries(l.map(clean)), m)); return g; }
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...o });
const hash = (s) => [...String(s)].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
function rng(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- patterns painted on the modelled parts (procedural, tileable)
const texCache = new Map();
function canvasTex(key, size, draw, rep = 1) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.repeat.set(rep, rep);
  texCache.set(key, t);
  return t;
}
// blotches of each colour over the first one, drawn wrapped so the tile repeats without seams
const camoTex = (cols, seed, rep = 1.6) => canvasTex('camo' + cols.join() + rep, 256, (g, S) => {
  const r = rng(seed);
  g.fillStyle = cols[0]; g.fillRect(0, 0, S, S);
  cols.slice(1).forEach((c, ci) => {
    g.fillStyle = c;
    for (let b = 0; b < 9 - ci * 2; b++) {
      const cx = r() * S, cy = r() * S, k = 4 + Math.floor(r() * 4);
      for (let j = 0; j < k; j++) {
        const x = cx + (r() - 0.5) * 60, y = cy + (r() - 0.5) * 40, rad = 10 + r() * 20, rot = r() * 3;
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.beginPath(); g.ellipse(x + ox, y + oy, rad * 1.4, rad, rot, 0, 2 * PI); g.fill(); }
      }
    }
  });
  const d = g.getImageData(0, 0, S, S);
  for (let i = 0; i < d.data.length; i += 4) { const n = (r() - 0.5) * 14; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
  g.putImageData(d, 0, 0);
}, rep);
// wood grain: wavy streaks along u
const woodTex = () => canvasTex('wood', 256, (g, S) => {
  const r = rng(11);
  g.fillStyle = '#c99a63'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const y0 = r() * S, a = 1 + r() * 3, k = 1 + Math.floor(r() * 3), ph = r() * 6;
    g.strokeStyle = r() < 0.75 ? `rgba(70,38,14,${0.12 + r() * 0.3})` : `rgba(255,230,190,${0.1 + r() * 0.15})`;
    g.lineWidth = 0.6 + r() * 2.2;
    for (const oy of [-S, 0, S]) {
      g.beginPath();
      for (let x = 0; x <= S; x += 4) { const y = y0 + oy + a * Math.sin(2 * PI * k * x / S + ph); x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  }
  for (let i = 0; i < 2; i++) { const x = r() * S, y = r() * S; g.fillStyle = 'rgba(60,30,10,.45)'; g.beginPath(); g.ellipse(x, y, 7, 3.5, 0, 0, 2 * PI); g.fill(); }
}, 1.3);
// a fabric weave (gauze, nylon, cloth)
const weaveTex = (step = 4, rep = 3) => canvasTex('weave' + step + ':' + rep, 128, (g, S) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 1;
  for (let i = 0; i < S; i += step) { g.beginPath(); g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, S); g.stroke(); g.beginPath(); g.moveTo(0, i + 0.5); g.lineTo(S, i + 0.5); g.stroke(); }
  const r = rng(5), d = g.getImageData(0, 0, S, S);
  for (let i = 0; i < d.data.length; i += 4) { const n = (r() - 0.5) * 22; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
  g.putImageData(d, 0, 0);
}, rep);

// ---- rifle along x (muzzle at +x): the finish's colour on receiver, handguard and stock, its accent on the
// furniture (grip, magazine, butt pad); glow → lit lines, metal → polished gold
const CAMO = { 'finish-olive': ['#4b5634', '#2a2f22', '#6d6b47', '#3a3024'], 'finish-sand': ['#b49a68', '#8a7550', '#d4c08f', '#6b5a3c'],
  'finish-arctic': ['#d9e4ec', '#a9bccb', '#f5f9fb', '#7f97a8'] };
function rifle(item) {
  const K = new Kit(), metal = !!item.metal, glow = !!item.glow, col = item.color || '#3a3f45', acc = item.accent || '#1d2024', camo = CAMO[item.id];
  const paint = metal ? std(col, { metalness: 1, roughness: 0.2 })
    : camo ? std('#ffffff', { map: camoTex(camo, hash(item.id)), roughness: 0.62, metalness: 0.08 })
    : std(col, { roughness: glow ? 0.35 : 0.48, metalness: glow ? 0.35 : 0.15 });
  const furn = metal ? std(acc, { metalness: 1, roughness: 0.32 }) : glow ? std('#121419', { roughness: 0.62 }) : std(acc, { roughness: 0.72, metalness: 0.05 });
  const steel = std('#2a2d32', { metalness: 0.85, roughness: 0.34 }), steel2 = std('#17191c', { metalness: 0.8, roughness: 0.42 });
  const rail = metal ? paint : std('#1d2024', { metalness: 0.6, roughness: 0.45 });
  const dark = std('#060708', { roughness: 0.8 });
  const lit = glow ? std('#000000', { emissive: acc, emissiveIntensity: 1.15, roughness: 0.3 }) : null;

  // receiver: upper and lower, ejection port with its cover hinge, forward assist, charging handle, pins, selector
  K.add(paint, ext(shape([[-0.62, 0.02], [0.44, 0.02], [0.44, 0.24], [-0.56, 0.24], [-0.62, 0.19]]), 0.2, 0.02));
  K.add(paint, ext(shape([[-0.6, 0.03], [0.44, 0.03], [0.44, -0.04], [0.4, -0.2], [0.12, -0.2], [0.08, -0.12], [-0.45, -0.12], [-0.6, -0.05]]), 0.18, 0.018));
  K.add(dark, at(rbox(0.25, 0.075, 0.02, 0.008), 0.08, 0.135, 0.1));
  K.add(steel, at(cylX(0.011, 0.27, 8), 0.08, 0.085, 0.104), at(cylX(0.032, 0.11, 14), -0.3, 0.16, 0.1), at(rbox(0.06, 0.085, 0.05, 0.015), -0.08, 0.14, 0.1));
  K.add(steel, at(rbox(0.08, 0.045, 0.12, 0.012), -0.66, 0.205, 0), at(rbox(0.05, 0.03, 0.06, 0.01), -0.67, 0.205, 0.07));
  K.add(steel, at(cylZ(0.022, 0.196, 12), -0.5, -0.02, 0), at(cylZ(0.022, 0.196, 12), 0.36, 0, 0), at(cylZ(0.022, 0.2, 12), 0.1, -0.07, 0));
  K.add(steel, at(cylZ(0.028, 0.196, 12), -0.4, -0.04, 0), at(rbox(0.075, 0.024, 0.014, 0.008), -0.37, -0.03, 0.1, 0, 0, 0.45));
  // top rail with its notches
  K.add(rail, at(rbox(1.76, 0.04, 0.13, 0.008), 0.32, 0.26, 0));
  for (let x = -0.53; x <= 1.18; x += 0.058) K.add(rail, at(rbox(0.03, 0.034, 0.14, 0.006), x, 0.29, 0));
  // handguard (eight-sided, flat on the sides) with vent slots, its end rings
  K.add(paint, at(cyl(0.13, 0.13, 0.78, 8).rotateY(PI / 8), 0.83, 0.12, 0, 0, 0, -PI / 2));
  K.add(steel2, at(cyl(0.142, 0.142, 0.05, 8).rotateY(PI / 8), 0.45, 0.12, 0, 0, 0, -PI / 2), at(cyl(0.136, 0.136, 0.035, 8).rotateY(PI / 8), 1.225, 0.12, 0, 0, 0, -PI / 2));
  for (const x of [0.56, 0.69, 0.82, 0.95, 1.08]) {
    for (const sz of [1, -1]) K.add(dark, at(rbox(0.085, 0.04, 0.02, 0.018), x, 0.135, sz * 0.12));
    if (x > 0.6 && x < 1.0) K.add(dark, at(rbox(0.085, 0.02, 0.05, 0.01), x, 0.0, 0));
  }
  // barrel, gas block with the front sight tower, muzzle brake with ports and a dark bore
  K.add(steel, at(cylX(0.034, 0.72, 14), 1.56, 0.12, 0));
  K.add(steel, at(rbox(0.08, 0.1, 0.1, 0.015), 1.3, 0.12, 0), at(ext(shape([[-0.05, 0], [0.05, 0], [0.022, 0.19], [-0.022, 0.19]]), 0.06, 0.01), 1.3, 0.15, 0));
  K.add(steel, at(rbox(0.035, 0.08, 0.014, 0.006), 1.3, 0.37, 0.035), at(rbox(0.035, 0.08, 0.014, 0.006), 1.3, 0.37, -0.035), at(cyl(0.009, 0.009, 0.07, 8), 1.3, 0.36, 0));
  K.add(steel2, at(cylX(0.05, 0.18, 12), 1.99, 0.12, 0), at(cylX(0.054, 0.03, 12), 1.915, 0.12, 0));
  for (const x of [1.955, 2.0, 2.045]) K.add(dark, at(rbox(0.024, 0.014, 0.07, 0.005), x, 0.168, 0), at(rbox(0.024, 0.07, 0.014, 0.005), x, 0.12, 0.048), at(rbox(0.024, 0.07, 0.014, 0.005), x, 0.12, -0.048));
  K.add(dark, at(cylX(0.021, 0.012, 12), 2.081, 0.12, 0));
  // rear sight: base, ears, aperture
  K.add(steel, at(rbox(0.13, 0.05, 0.12, 0.012), -0.42, 0.33, 0), at(rbox(0.06, 0.09, 0.025, 0.01), -0.42, 0.39, 0.042), at(rbox(0.06, 0.09, 0.025, 0.01), -0.42, 0.39, -0.042));
  K.add(steel, at(torus(0.026, 0.009, 6, 16), -0.42, 0.395, 0, 0, PI / 2, 0));
  // pistol grip with its ridges
  const grip = [ext(shape([[-0.08, 0.02], [0.07, 0.02], [0.065, -0.38], [0.02, -0.44], [-0.07, -0.43], [-0.1, -0.36], [-0.1, 0]]), 0.15, 0.025)];
  for (let i = 0; i < 6; i++) grip.push(at(rbox(0.13, 0.016, 0.166, 0.006), -0.018, -0.1 - i * 0.045, 0));
  K.add(furn, xf(grip, -0.3, -0.1, 0, 0, 0, -0.32));
  // trigger guard and trigger
  const tg = rrect(new THREE.Shape(), 0.3, 0.12, 0.05); tg.holes.push(rrect(new THREE.Path(), 0.23, 0.065, 0.03));
  K.add(paint, at(ext(tg, 0.045, 0.01), -0.08, -0.18, 0));
  K.add(steel, at(ext(shape([[0, 0], [0.028, 0], [0.03, -0.05], [0.012, -0.09], [-0.008, -0.085], [0.006, -0.05]]), 0.025, 0.006), -0.1, -0.12, 0));
  // curved magazine with two ribs and a floor plate
  const mc = [1.15, -0.18], m0 = PI - 0.1, m1 = PI + 0.52;
  K.add(furn, ext(arcBand(mc[0], mc[1], 1.0, 0.78, m0, m1), 0.13, 0.02));
  K.add(lit || furn, ext(arcBand(mc[0], mc[1], 0.945, 0.915, PI + 0.04, m1 - 0.04), 0.148, 0.006), ext(arcBand(mc[0], mc[1], 0.865, 0.835, PI + 0.04, m1 - 0.04), 0.148, 0.006));
  K.add(furn, at(rbox(0.27, 0.045, 0.16, 0.015), mc[0] + 0.89 * Math.cos(m1 + 0.022), mc[1] + 0.89 * Math.sin(m1 + 0.022), 0, 0, 0, m1));
  // stock: buffer tube, skeleton stock, cheek riser, butt pad with ridges, sling loop
  K.add(steel2, at(cylX(0.055, 0.5, 16), -0.85, 0.12, 0));
  const st = shape([[-0.78, 0.21], [-1.38, 0.19], [-1.4, -0.25], [-1.3, -0.27], [-0.98, -0.05], [-0.78, 0.0]]);
  st.holes.push(shape([[-1.03, 0.11], [-1.26, 0.1], [-1.27, -0.08], [-1.18, -0.1], [-1.03, 0.0]]));
  K.add(paint, ext(st, 0.16, 0.02), at(rbox(0.36, 0.05, 0.13, 0.02), -1.06, 0.215, 0));
  K.add(furn, at(rbox(0.06, 0.48, 0.17, 0.025), -1.42, -0.03, 0));
  for (let i = 0; i < 7; i++) K.add(furn, at(rbox(0.02, 0.018, 0.168, 0.006), -1.452, 0.16 - i * 0.062, 0));
  K.add(steel, at(torus(0.04, 0.011, 6, 16), -1.27, -0.29, 0));
  if (lit) K.add(lit, [1, -1].flatMap((s) => [at(rbox(0.68, 0.012, 0.012, 0.004), 0.83, 0.085, s * 0.121), at(rbox(0.9, 0.014, 0.012, 0.004), -0.08, 0.06, s * 0.1),
    at(rbox(0.5, 0.014, 0.012, 0.004), -1.07, 0.15, s * 0.08)]));
  return K.build();
}

// ---- pistol along x: slide with serrations and sights, frame with a rail, textured grip
function pistol() {
  const K = new Kit();
  const slideM = std('#3a3f46', { metalness: 0.75, roughness: 0.36 }), frameM = std('#2c2f2a', { roughness: 0.78 }), steel = std('#1d2024', { metalness: 0.8, roughness: 0.3 });
  const dark = std('#060708', { roughness: 0.8 }), dot = std('#e8f5e0', { emissive: '#bfffd0', emissiveIntensity: 0.5 });
  K.add(slideM, ext(shape([[-0.56, 0.08], [0.56, 0.08], [0.6, 0.12], [0.6, 0.27], [0.55, 0.31], [-0.52, 0.31], [-0.57, 0.27]]), 0.2, 0.025));
  for (let i = 0; i < 8; i++) K.add(slideM, at(rbox(0.015, 0.17, 0.214, 0.005), -0.49 + i * 0.028, 0.2, 0));
  for (let i = 0; i < 4; i++) K.add(slideM, at(rbox(0.015, 0.15, 0.214, 0.005), 0.37 + i * 0.028, 0.205, 0));
  K.add(dark, at(rbox(0.25, 0.02, 0.115, 0.006), 0.15, 0.305, 0.022));
  K.add(steel, at(rbox(0.17, 0.02, 0.07, 0.006), 0.15, 0.312, 0.022));
  K.add(steel, at(rbox(0.06, 0.05, 0.05, 0.01), -0.47, 0.335, 0.045), at(rbox(0.06, 0.05, 0.05, 0.01), -0.47, 0.335, -0.045), at(rbox(0.045, 0.05, 0.035, 0.01), 0.5, 0.335, 0));
  K.add(dot, at(sph(0.011, 8, 6), -0.442, 0.345, 0.045), at(sph(0.011, 8, 6), -0.442, 0.345, -0.045), at(sph(0.011, 8, 6), 0.476, 0.347, 0));
  K.add(steel, at(cylX(0.064, 0.04, 20), 0.604, 0.19, 0), at(cylX(0.03, 0.03, 12), 0.61, 0.11, 0));
  K.add(dark, at(cylX(0.034, 0.012, 16), 0.626, 0.19, 0));
  // frame, rail grooves, beavertail, hammer
  K.add(frameM, ext(shape([[-0.52, 0.09], [0.57, 0.09], [0.57, 0.0], [0.1, -0.03], [-0.52, -0.04]]), 0.18, 0.02));
  for (const x of [0.3, 0.38, 0.46, 0.54]) K.add(frameM, at(rbox(0.035, 0.035, 0.19, 0.006), x, -0.005, 0));
  K.add(frameM, ext(shape([[-0.5, 0.09], [-0.66, 0.07], [-0.66, 0.035], [-0.48, -0.01]]), 0.16, 0.015));
  K.add(steel, at(rbox(0.06, 0.09, 0.06, 0.015), -0.585, 0.3, 0, 0, 0, 0.45));
  // grip with stippled panels and the magazine's base plate
  const gp = [ext(shape([[-0.11, 0.02], [0.1, 0.02], [0.095, -0.5], [0.06, -0.53], [-0.12, -0.53], [-0.15, -0.48], [-0.14, -0.02]]), 0.18, 0.03)];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 4; c++) gp.push(at(rbox(0.024, 0.024, 0.196, 0.006), -0.1 + c * 0.05, -0.08 - r * 0.06, 0));
  K.add(frameM, xf(gp, -0.36, -0.02, 0, 0, 0, -0.24));
  K.add(steel, xf([at(rbox(0.27, 0.04, 0.2, 0.012), -0.025, -0.545, 0)], -0.36, -0.02, 0, 0, 0, -0.24));
  // trigger guard and trigger, slide stop, take-down lever, magazine release
  const tg = rrect(new THREE.Shape(), 0.34, 0.17, 0.06); tg.holes.push(rrect(new THREE.Path(), 0.26, 0.1, 0.04));
  K.add(frameM, at(ext(tg, 0.06, 0.012), 0.0, -0.11, 0));
  K.add(steel, at(ext(shape([[0, 0], [0.03, 0], [0.032, -0.06], [0.012, -0.11], [-0.008, -0.105], [0.006, -0.06]]), 0.03, 0.006), -0.03, -0.02, 0));
  K.add(steel, at(rbox(0.17, 0.026, 0.02, 0.008), 0.05, 0.07, 0.1), at(rbox(0.05, 0.03, 0.02, 0.008), 0.26, 0.06, 0.1), at(cylZ(0.022, 0.196, 12), -0.21, -0.03, 0));
  return K.build();
}

// ---- med kit: a hard case, lid seam, latches, carry handle, hinges, a raised red cross
function medkit() {
  const K = new Kit();
  const shell = std('#e8ebee', { roughness: 0.38, metalness: 0.05 }), red = std('#d1262e', { roughness: 0.42, emissive: '#3a0508', emissiveIntensity: 0.4 });
  const grey = std('#8a929b', { metalness: 0.7, roughness: 0.35 }), rubber = std('#2a2d31', { roughness: 0.85 }), dark = std('#121418', { roughness: 0.9 });
  K.add(shell, at(rbox(1.5, 0.62, 0.6, 0.08), 0, -0.16, 0), at(rbox(1.5, 0.34, 0.6, 0.08), 0, 0.33, 0));
  K.add(shell, at(rbox(1.53, 0.035, 0.63, 0.015), 0, 0.235, 0), at(rbox(1.53, 0.035, 0.63, 0.015), 0, -0.4, 0));
  K.add(dark, at(rbox(1.44, 0.05, 0.54, 0.02), 0, 0.155, 0));
  const a = 0.065, L = 0.2;
  K.add(red, at(ext(shape([[-a, L], [a, L], [a, a], [L, a], [L, -a], [a, -a], [a, -L], [-a, -L], [-a, -a], [-L, -a], [-L, a], [-a, a]]), 0.05, 0.014), 0, -0.13, 0.3));
  K.add(std('#c9d3dc', { roughness: 0.6 }), at(rbox(0.46, 0.1, 0.014, 0.01), 0, 0.37, 0.3));
  for (const sx of [-1, 1]) {
    const x = 0.52 * sx;
    K.add(grey, at(rbox(0.17, 0.16, 0.04, 0.02), x, 0.07, 0.31), at(rbox(0.13, 0.15, 0.035, 0.02), x, 0.13, 0.336, -0.12, 0, 0), at(rbox(0.12, 0.05, 0.04, 0.012), x, 0.27, 0.312));
    K.add(dark, at(cylX(0.012, 0.15, 10), x, 0.065, 0.335));
    K.add(grey, at(rbox(0.09, 0.1, 0.13, 0.02), 0.3 * sx, 0.53, 0), at(cylX(0.03, 0.3, 14), 0.4 * sx, 0.155, -0.305));
    for (const sz of [-1, 1]) K.add(rubber, at(cyl(0.05, 0.05, 0.04, 14), 0.6 * sx, -0.485, 0.2 * sz));
  }
  K.add(rubber, at(rbox(0.7, 0.075, 0.11, 0.035), 0, 0.6, 0));
  for (let i = 0; i < 8; i++) K.add(rubber, at(rbox(0.02, 0.085, 0.116, 0.008), -0.21 + i * 0.06, 0.6, 0));
  return K.build();
}

// ---- bandage: wound gauze layers on a card core, a loose tail curling off the floor, a metal clip
function bandage() {
  const K = new Kit(), w = weaveTex(3, 4);
  const g1 = std('#f5f1e8', { map: w, roughness: 0.95 }), g2 = std('#e6dfcf', { map: w, roughness: 0.95 });
  const core = std('#b99a68', { roughness: 0.85 }), steel = std('#b8bec6', { metalness: 0.9, roughness: 0.3 });
  const L = 9, r0 = 0.2, dr = 0.034, W = 0.56, rO = r0 + L * dr;
  for (let i = 0; i < L; i++) K.add(i % 2 ? g2 : g1, ext(ann(r0 + (i + 1) * dr + 0.002, r0 + i * dr), W - (i % 3) * 0.01, 0.009, 1, 40));
  K.add(core, ext(ann(r0 + 0.003, 0.14), W + 0.03, 0.01, 1, 40));
  // the tail: flat on the floor, then lifting
  const th = 0.018, pts = []; let x = -0.1, y = -rO + th / 2, a = 0;
  for (let u = 0; u <= 1.12; u += 0.04) {
    pts.push(V3(x, y, 0));
    a = u < 0.55 ? 0 : (u - 0.55) ** 2 * 2.6;
    x += 0.04 * Math.cos(a); y += 0.04 * Math.sin(a);
  }
  K.add(g1, sweep(pts, V3(0, 0, 1), th, W - 0.03));
  K.add(steel, at(rbox(0.1, 0.01, 0.15, 0.004), 0.32, -rO + th + 0.004, 0));
  for (const dx of [-0.05, 0.05]) K.add(steel, at(rbox(0.012, 0.03, 0.15, 0.004), 0.32 + dx, -rO + th - 0.004, 0));
  for (let i = 0; i < 4; i++) K.add(steel, at(rbox(0.016, 0.012, 0.012, 0.003), 0.32, -rO + th + 0.012, -0.05 + i * 0.033));
  return K.build();
}

// ---- plate carrier: front and back plate bags, shoulder straps with pads, cummerbund, MOLLE rows, pouches
function vest() {
  const K = new Kit(), wv = weaveTex(3, 5);
  const nylon = std('#5c6446', { map: wv, roughness: 0.92 }), web = std('#434b33', { map: wv, roughness: 0.9 }), black = std('#17181b', { roughness: 0.55 });
  const velcro = std('#4d553c', { roughness: 1 });
  const panel = (h) => { const s = new THREE.Shape(); s.moveTo(-0.58, -h); s.lineTo(0.58, -h); s.lineTo(0.6, 0.22); s.quadraticCurveTo(0.58, 0.44, 0.4, 0.56);
    s.lineTo(0.22, 0.6); s.quadraticCurveTo(0, 0.48, -0.22, 0.6); s.lineTo(-0.4, 0.56); s.quadraticCurveTo(-0.58, 0.44, -0.6, 0.22); s.closePath(); return s; };
  K.add(nylon, at(ext(panel(0.55), 0.16, 0.04, 2, 10), 0, 0, 0.24), at(ext(panel(0.62), 0.16, 0.04, 2, 10), 0, 0.02, -0.24));
  for (const sx of [-1, 1]) {
    const arc = (r, f0, f1, x) => Array.from({ length: 13 }, (_, i) => { const f = f0 + (f1 - f0) * i / 12; return V3(x, 0.5 + r * Math.sin(f), r * Math.cos(f)); });
    K.add(web, sweep(arc(0.27, 0, PI, 0.3 * sx), V3(1, 0, 0), 0.045, 0.17));
    K.add(nylon, sweep(arc(0.3, 0.45, PI - 0.45, 0.3 * sx), V3(1, 0, 0), 0.06, 0.15));
    // cummerbund wrapping the side, with its own webbing
    const side = (rr, y) => Array.from({ length: 15 }, (_, i) => { const f = PI * i / 14; return V3(sx * (0.55 + rr * Math.sin(f)), y, 0.21 * Math.cos(f)); });
    K.add(nylon, sweep(side(0.2, -0.25), V3(0, 1, 0), 0.04, 0.42));
    for (const y of [-0.12, -0.25, -0.38]) K.add(web, sweep(side(0.222, y), V3(0, 1, 0), 0.016, 0.045));
  }
  // MOLLE rows with bar tacks, a plain patch
  for (const [y, w] of [[0.32, 0.9], [0.18, 1.02]]) {
    K.add(web, at(rbox(w, 0.05, 0.02, 0.008), 0, y, 0.328));
    for (let x = -w / 2 + 0.06; x < w / 2 - 0.03; x += 0.125) K.add(black, at(rbox(0.018, 0.056, 0.03, 0.006), x, y, 0.33));
  }
  K.add(velcro, at(rbox(0.36, 0.09, 0.02, 0.012), 0, 0.43, 0.325));
  // three magazine pouches: body, top fold, flap, strap and side-release buckle, band
  for (const x of [-0.37, 0, 0.37]) {
    K.add(nylon, at(rbox(0.3, 0.44, 0.14, 0.04), x, -0.25, 0.39), at(rbox(0.32, 0.035, 0.155, 0.015), x, -0.03, 0.392));
    K.add(nylon, at(rbox(0.32, 0.14, 0.05, 0.025), x, -0.08, 0.46, -0.12, 0, 0));
    K.add(web, at(rbox(0.045, 0.1, 0.015, 0.006), x, -0.13, 0.482), at(rbox(0.045, 0.09, 0.015, 0.006), x, -0.28, 0.465), at(rbox(0.31, 0.035, 0.015, 0.006), x, -0.38, 0.465));
    K.add(black, at(rbox(0.07, 0.065, 0.03, 0.012), x, -0.18, 0.478), at(rbox(0.085, 0.06, 0.036, 0.012), x, -0.235, 0.474));
  }
  // drag handle on the back
  K.add(web, sweep(Array.from({ length: 11 }, (_, i) => { const f = PI * i / 10; return V3(0.11 * Math.cos(f), 0.42, -0.31 - 0.08 * Math.sin(f)); }), V3(0, 1, 0), 0.025, 0.05));
  return K.build();
}

// ---- jacket: padded body, sleeves with volume, stand collar, zip, pockets with flaps, seams, rib hem
function jacket(item) {
  const K = new Kit(), h = hash(item.id);
  const night = /night/.test(item.id), ranger = /ranger/.test(item.id);
  const body = ranger ? std('#ffffff', { map: camoTex(['#5d6742', '#3b4430', '#7c7652', '#2b3122'], h, 2.4), roughness: 0.9 })
    : night ? std('#1d2128', { map: weaveTex(3, 5), roughness: 0.62, metalness: 0.15 })
    : std(['#4b5634', '#2e3238', '#5a4632', '#33475b'][h % 4], { map: weaveTex(3, 5), roughness: 0.85 });
  const trim = std(ranger ? '#353d2a' : night ? '#0f1114' : '#22252a', { roughness: 0.85 }), steel = std('#a3aab2', { metalness: 0.9, roughness: 0.3 });
  const glow = night ? std('#000000', { emissive: '#2cf5b0', emissiveIntensity: 1.1, roughness: 0.3 }) : null;
  const s = new THREE.Shape(); s.moveTo(-0.5, -0.72); s.lineTo(0.5, -0.72); s.lineTo(0.53, 0.2); s.quadraticCurveTo(0.54, 0.44, 0.36, 0.52);
  s.lineTo(0.18, 0.6); s.lineTo(-0.18, 0.6); s.lineTo(-0.36, 0.52); s.quadraticCurveTo(-0.54, 0.44, -0.53, 0.2); s.closePath();
  K.add(body, ext(s, 0.48, 0.11, 4, 12));
  K.add(trim, at(rbox(1.05, 0.12, 0.51, 0.055), 0, -0.69, 0));
  for (const sx of [-1, 1]) {
    // sleeve from the shoulder down and out, its cuff, two folds and a sleeve pocket
    const top = V3(0.48 * sx, 0.36, 0), dir = V3(0.26 * sx, -0.88, 0).normalize(), len = 0.92, rz = sx * Math.atan2(0.26, 0.88);
    const out = V3(-dir.y * sx, dir.x * sx, 0);   // away from the body, square to the sleeve
    const p = (f) => top.clone().addScaledVector(dir, f * len), rad = (f) => 0.19 - 0.045 * f;
    K.add(body, at(sph(0.195, 16, 12), 0.46 * sx, 0.37, 0), at(cyl(0.19, 0.145, len, 20), ...p(0.5).toArray(), 0, 0, rz));
    K.add(trim, at(cyl(0.155, 0.155, 0.1, 20), ...p(1.03).toArray(), 0, 0, rz));
    for (const f of [0.55, 0.68]) K.add(body, at(torus(rad(f) + 0.004, 0.013, 6, 24).rotateX(PI / 2), ...p(f).toArray(), 0, 0, rz));
    K.add(ranger ? trim : body, at(rbox(0.03, 0.17, 0.15, 0.012), ...p(0.25).addScaledVector(out, rad(0.25) + 0.008).toArray(), 0, 0, rz));
    if (glow) {
      K.add(glow, at(rbox(0.016, 0.62, 0.03, 0.006), ...p(0.55).addScaledVector(out, rad(0.55) + 0.004).toArray(), 0, 0, rz));
      K.add(glow, at(torus(0.157, 0.011, 6, 24).rotateX(PI / 2), ...p(0.99).toArray(), 0, 0, rz));
      K.add(glow, at(rbox(0.3, 0.035, 0.02, 0.008), 0.22 * sx, 0.02, 0.245));
    }
    // chest pocket with flap and snap, lower pocket with a slanted flap, yoke seam
    K.add(body, at(rbox(0.24, 0.25, 0.04, 0.025), 0.24 * sx, 0.15, 0.255), at(rbox(0.26, 0.085, 0.035, 0.02), 0.24 * sx, 0.29, 0.272));
    K.add(steel, at(cylZ(0.022, 0.02, 14), 0.24 * sx, 0.28, 0.292));
    K.add(body, at(rbox(0.26, 0.22, 0.04, 0.025), 0.27 * sx, -0.43, 0.255), at(rbox(0.28, 0.075, 0.035, 0.02), 0.27 * sx, -0.3, 0.272, 0, 0, sx * 0.06));
    K.add(trim, at(rbox(0.33, 0.014, 0.016, 0.005), 0.22 * sx, 0.42, 0.243));
  }
  // stand collar, open at the front
  K.add(body, at(ext(ann(0.205, 0.155, -PI / 2 + 0.38, 1.5 * PI - 0.38), 0.17, 0.025, 2, 24).rotateX(-PI / 2), 0, 0.66, -0.02));
  // zip: tape, teeth, slider and pull
  K.add(trim, at(rbox(0.07, 1.28, 0.02, 0.008), 0, -0.08, 0.245));
  for (let y = -0.68, i = 0; y < 0.56; y += 0.032, i++) K.add(steel, at(rbox(0.028, 0.016, 0.018, 0.004), (i % 2 ? 0.011 : -0.011), y, 0.258));
  K.add(steel, at(rbox(0.055, 0.08, 0.03, 0.012), 0, 0.18, 0.266), at(rbox(0.035, 0.11, 0.012, 0.008), 0, 0.1, 0.285, 0.2, 0, 0));
  return K.build();
}

// ---- coins: rim, raised boss and bead ring on both faces, reeded edge (one geometry, shared)
let coinG = null;
function coinGeo() {
  if (coinG) return coinG;
  const P = [[0, -0.031], [0.1, -0.031], [0.12, -0.023], [0.205, -0.021], [0.235, -0.035], [0.285, -0.035], [0.3, -0.026],
    [0.3, 0.026], [0.285, 0.035], [0.235, 0.035], [0.205, 0.021], [0.12, 0.023], [0.1, 0.031], [0, 0.031]];
  const lathe = new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r, y)), 48), pos = lathe.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) > 0.29 && Math.floor(i / P.length) % 2) pos.setXYZ(i, x * 0.975, pos.getY(i), z * 0.975);
  }
  const body = lathe.toNonIndexed(); body.computeVertexNormals();
  const parts = [body];
  for (const sy of [1, -1]) {
    for (let k = 0; k < 20; k++) { const a = k / 20 * 2 * PI; parts.push(at(sph(0.011, 6, 4), 0.165 * Math.cos(a), 0.022 * sy, 0.165 * Math.sin(a))); }
    parts.push(at(ext(shape([[0, 0.06], [0.04, 0], [0, -0.06], [-0.04, 0]]), 0.016, 0.005), 0, 0.031 * sy, 0, -PI / 2 * sy, 0, 0));
  }
  return (coinG = mergeGeometries(parts.map(clean)));
}
const coin = (x, y, z, rx = 0, ry = 0, rz = 0) => at(coinGeo().clone(), x, y, z, rx, ry, rz);
const goldM = () => std('#e6b53f', { metalness: 1, roughness: 0.26, emissive: '#3a2600', emissiveIntensity: 0.25 });

// a cloth pouch tied with a cord: bulging body, pinched neck, ruffled top, folds all round
function pouch(K, s, x0, y0, z0, cloth, cord) {
  const P = [[0, -0.48], [0.25, -0.47], [0.42, -0.4], [0.5, -0.25], [0.5, -0.05], [0.42, 0.12], [0.28, 0.25], [0.18, 0.33], [0.16, 0.38],
    [0.22, 0.45], [0.31, 0.54], [0.28, 0.6], [0.18, 0.57], [0, 0.52]];
  const g = new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r, y)), 40), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
    const f = 1 + (y > 0.36 ? 0.14 * Math.sin(11 * a) : 0.05 * Math.sin(7 * a + y * 4) * (1 - Math.abs(y + 0.1)));
    p.setXYZ(i, x * f, y < -0.4 ? y : y * (1 + 0.02 * Math.sin(5 * a)), z * f);
  }
  g.computeVertexNormals();
  const T = (geo) => at(geo, x0, y0, z0, 0, 0, 0, s);
  K.add(cloth, T(g));
  K.add(cord, T(torus(0.17, 0.026, 8, 28).rotateX(PI / 2).translate(0, 0.36, 0)), T(at(sph(0.048, 10, 8), 0, 0.36, 0.18)));
  for (const sx of [-1, 1]) K.add(cord, T(at(cyl(0.02, 0.02, 0.26, 8), sx * 0.05, 0.25, 0.2, 0.15, 0, sx * 0.3)), T(at(sph(0.032, 8, 6), sx * 0.09, 0.13, 0.22)));
}

function coins(item) {
  const K = new Kit(), gold = goldM();
  if (item.amount >= 200) return treasure(K, gold);
  const big = item.amount >= 50, s = big ? 1 : 0.8;
  const cloth = big ? std('#7a2d2a', { map: weaveTex(3, 4), roughness: 0.95 }) : std('#a07a4c', { map: weaveTex(3, 4), roughness: 0.97 });
  const cord = std(big ? '#c9a24a' : '#5b3d22', { roughness: 0.7, metalness: big ? 0.5 : 0 });
  pouch(K, s, -0.15, 0, 0, cloth, cord);
  const fl = -0.48 * s + 0.035, r = rng(hash(item.id));
  if (!big) {
    K.add(gold, coin(0.42, fl, 0.22, 0, 0.3), coin(0.44, fl + 0.07, 0.22, 0.06, 1.2, 0.04), coin(0.1, fl, 0.5, 0, 0.8), coin(0.28, -0.2, 0.36, 1.15, 0.2, 0));
  } else {
    for (let i = 0; i < 6; i++) K.add(gold, coin(0.62 + (r() - 0.5) * 0.03, fl + i * 0.068, 0.18 + (r() - 0.5) * 0.03, (r() - 0.5) * 0.06, r() * 6, 0));
    K.add(gold, coin(0.25, fl, 0.55, 0, 1), coin(0.62, fl, 0.62, 0, 2), coin(0.92, fl + 0.02, 0.38, 0, 0, 0.1), coin(0.35, -0.24, 0.48, 1.1, -0.3, 0));
  }
  return K.build();
}

// ---- a chest of planks with gaps, banded and riveted, arched lid of slats, lock plate with a keyhole
function chestParts(K, { open = false, band }) {
  const W = 1.6, H = 0.8, D = 1.0, R = 0.5, y0 = -0.6, yt = y0 + H;
  const tex = woodTex(), wA = std('#a8743f', { map: tex, roughness: 0.8 }), wB = std('#93623a', { map: tex, roughness: 0.82 });
  const core = std('#2a180c', { roughness: 1 }), dark = std('#050403', { roughness: 0.9 });
  const lid = new Kit();   // the lid's parts, turned on the hinge when the chest is open
  K.add(core, at(rbox(W - 0.08, H - 0.04, D - 0.08, 0.02), 0, y0 + H / 2, 0));
  const n = 3, gap = 0.022, ph = (H - gap * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    const y = y0 + gap + ph / 2 + i * (ph + gap);
    for (const sz of [1, -1]) K.add(i % 2 ? wA : wB, at(rbox(W - 0.02, ph, 0.07, 0.016), 0, y, sz * (D / 2 - 0.035)));
    for (const sx of [1, -1]) K.add(i % 2 ? wB : wA, at(rbox(D - 0.16, ph, 0.07, 0.016), sx * (W / 2 - 0.035), y, 0, 0, PI / 2, 0));
  }
  K.add(wB, at(rbox(W, 0.05, D, 0.016), 0, y0, 0));
  const half = (r) => { const s = new THREE.Shape(); s.moveTo(r, 0); s.absarc(0, 0, r, 0, PI, false); s.closePath(); return s; };
  const side = (g, x) => at(g.rotateY(PI / 2), x, yt, 0);   // a shape drawn in (z, y) set on the lid at x
  lid.add(core, side(ext(half(R - 0.05), W - 0.1, 0.01, 1, 20), 0));
  for (let k = 0; k < 5; k++) {
    const f = (k + 0.5) * PI / 5, rr = R - 0.035;
    lid.add(k % 2 ? wA : wB, at(rbox(W - 0.04, 2 * R * Math.sin(PI / 10) - 0.022, 0.07, 0.016), 0, yt + rr * Math.sin(f), rr * Math.cos(f), -f, 0, 0));
  }
  for (const sx of [-1, 1]) lid.add(wA, side(ext(half(R), 0.07, 0.016, 2, 20), sx * (W / 2 - 0.035)));
  // bands, rivets, corner guards
  const rivet = (x, y, z) => at(sph(0.021, 8, 6), x, y, z);
  for (const bx of [-0.5, 0.5]) {
    K.add(band, at(rbox(0.11, H + 0.03, 0.03, 0.01), bx, y0 + H / 2, D / 2 + 0.012), at(rbox(0.11, H + 0.03, 0.03, 0.01), bx, y0 + H / 2, -D / 2 - 0.012));
    K.add(band, at(rbox(0.11, 0.03, D + 0.05, 0.01), bx, y0 - 0.035, 0));
    lid.add(band, side(ext(ann(R + 0.03, R - 0.005, 0, PI), 0.11, 0.008, 2, 24), bx));
    for (const y of [y0 + 0.1, y0 + 0.4, yt - 0.08]) K.add(band, rivet(bx, y, D / 2 + 0.027));
    for (const f of [0.3, 0.92, PI / 2, 2.22, 2.84]) lid.add(band, rivet(bx, yt + (R + 0.03) * Math.sin(f), (R + 0.03) * Math.cos(f)));
  }
  for (const sx of [-1, 1]) {
    lid.add(band, side(ext(ann(R + 0.012, R - 0.07, 0, PI), 0.03, 0.008, 2, 24), sx * (W / 2 + 0.004)));
    for (const sz of [-1, 1]) for (const y of [y0 + 0.09, yt - 0.09]) {
      K.add(band, at(rbox(0.15, 0.16, 0.025, 0.01), sx * (W / 2 - 0.065), y, sz * (D / 2 + 0.014)), at(rbox(0.025, 0.16, 0.15, 0.01), sx * (W / 2 + 0.014), y, sz * (D / 2 - 0.065)));
      K.add(band, rivet(sx * (W / 2 - 0.07), y, sz * (D / 2 + 0.03)), rivet(sx * (W / 2 + 0.03), y, sz * (D / 2 - 0.07)));
    }
    // side handle: plate and ring
    K.add(band, at(rbox(0.03, 0.14, 0.22, 0.01), sx * (W / 2 + 0.02), y0 + H * 0.62, 0), at(torus(0.09, 0.016, 8, 20), sx * (W / 2 + 0.045), y0 + H * 0.62 - 0.08, 0, 0, PI / 2, 0));
  }
  K.add(band, at(rbox(W + 0.01, 0.05, 0.03, 0.01), 0, yt - 0.03, D / 2 + 0.012), at(rbox(W + 0.01, 0.05, 0.03, 0.01), 0, yt - 0.03, -D / 2 - 0.012));
  lid.add(band, at(rbox(W + 0.01, 0.06, 0.03, 0.01), 0, yt + 0.03, R + 0.012));
  // lock plate with a keyhole, and the hasp on the lid
  K.add(band, at(ext(rrect(new THREE.Shape(), 0.24, 0.3, 0.06), 0.03, 0.008), 0, yt - 0.17, D / 2 + 0.03));
  const kh = new THREE.Shape(); kh.absarc(0, 0, 0.028, 0, 2 * PI, false);
  K.add(dark, at(ext(kh, 0.012, 0.003, 1, 16), 0, yt - 0.15, D / 2 + 0.048), at(ext(shape([[-0.012, 0.0], [0.012, 0.0], [0.024, -0.08], [-0.024, -0.08]]), 0.012, 0.003), 0, yt - 0.155, D / 2 + 0.048));
  lid.add(band, at(rbox(0.12, 0.17, 0.025, 0.02), 0, yt + 0.01, R + 0.042), at(torus(0.032, 0.009, 6, 16), 0, yt - 0.07, R + 0.06));
  // hinged open: the lid swings back about its rear edge
  const hinge = open ? new THREE.Matrix4().makeTranslation(0, yt, -R).multiply(new THREE.Matrix4().makeRotationX(-1.95)).multiply(new THREE.Matrix4().makeTranslation(0, -yt, R)) : null;
  for (const [m, l] of lid.parts) K.add(m, hinge ? l.map((g) => g.applyMatrix4(hinge)) : l);
  return { W, D, yt, y0 };
}
function chest() {
  const K = new Kit();
  chestParts(K, { band: std('#e3b341', { metalness: 1, roughness: 0.28, emissive: '#3a2600', emissiveIntensity: 0.3 }) });
  return K.build();
}
// coins-l: the same box, iron-banded, open and overflowing
function treasure(K, gold) {
  const { W, D, yt, y0 } = chestParts(K, { open: true, band: std('#454a52', { metalness: 0.75, roughness: 0.42 }) });
  const r = rng(7), ground = y0 - 0.025 + 0.035;
  K.add(std('#d9a836', { metalness: 1, roughness: 0.4 }), at(sph(1, 28, 14), 0, yt - 0.01, 0, 0, 0, 0, (W - 0.14) / 2, 0.2, (D - 0.14) / 2));
  for (let i = 0; i < 30; i++) {
    let u, v; do { u = (r() * 2 - 1) * 0.86; v = (r() * 2 - 1) * 0.86; } while (u * u + v * v > 0.74);
    const hgt = 0.2 * Math.sqrt(1 - u * u - v * v);
    K.add(gold, coin(u * (W - 0.14) / 2, yt - 0.01 + hgt + 0.01, v * (D - 0.14) / 2, -v * 0.9 + (r() - 0.5) * 0.5, r() * 6, u * 0.9 + (r() - 0.5) * 0.5));
  }
  for (const x of [-0.45, 0.1, 0.42]) K.add(gold, coin(x, yt + 0.02, D / 2 + 0.06, 1.25, 0, (r() - 0.5) * 0.4));
  for (let i = 0; i < 7; i++) K.add(gold, coin(-0.7 + i * 0.24 + (r() - 0.5) * 0.08, ground, D / 2 + 0.25 + r() * 0.35, 0, r() * 6, 0));
  for (let i = 0; i < 4; i++) K.add(gold, coin(0.62, ground + 0.068 * (i + 1), D / 2 + 0.3, (r() - 0.5) * 0.06, r() * 6, 0));
  K.add(std('#d01e3c', { metalness: 0.2, roughness: 0.1, emissive: '#400010', emissiveIntensity: 0.5 }), at(new THREE.IcosahedronGeometry(0.07, 0), -0.18, yt + 0.22, 0.08));
  K.add(std('#2f7bff', { metalness: 0.2, roughness: 0.1, emissive: '#001040', emissiveIntensity: 0.5 }), at(new THREE.OctahedronGeometry(0.065, 0), 0.25, yt + 0.19, -0.05, 0.4, 0.3, 0));
  return K.build();
}

// the mission book (the folded tracker's icon): leather covers over a block of pages, a rounded spine with raised
// bands, brass corners and a label plate, a red ribbon marker hanging out below, a strap round the fore-edge to a buckle
function questBook() {
  const K = new Kit(), W = 1.05, H = 1.4, T = 0.3, C = 0.045;
  const leather = std('#6b3a1f', { roughness: 0.75 }), dark = std('#4a2612', { roughness: 0.8 });
  const brass = std('#d8a93b', { metalness: 1, roughness: 0.3, emissive: '#2a1800', emissiveIntensity: 0.3 });
  const paper = std('#efe4c8', { roughness: 0.95 }), edge = std('#d6c79f', { roughness: 0.95 });
  // pages, set back from the covers' edges, a few darker leaves on the fore-edge
  K.add(paper, at(rbox(W - 0.07, H - 0.07, T - 2 * C, 0.012), 0.025, 0, 0));
  for (let i = 1; i < 8; i++) K.add(edge, at(rbox(0.006, H - 0.09, 0.004, 0.002), W / 2 - 0.01, 0, -T / 2 + C + i * (T - 2 * C) / 8));
  // the covers and the spine with its raised bands
  for (const z of [-1, 1]) K.add(leather, at(rbox(W, H, C, 0.03), 0, 0, z * (T / 2 - C / 2)));
  K.add(leather, at(cyl(T / 2, T / 2, H, 20), -W / 2 + 0.01, 0, 0));
  for (const y of [-0.45, -0.15, 0.15, 0.45]) K.add(dark, at(cyl(T / 2 + 0.014, T / 2 + 0.014, 0.05, 20), -W / 2 + 0.01, y, 0));
  // brass corners on the front cover, a framed label plate in the middle
  for (const [sx, sy] of [[1, 1], [1, -1]]) {
    const s = shape([[0, 0], [-0.18, 0], [0, -0.18]]);
    K.add(brass, at(ext(s, 0.016, 0.004), sx * (W / 2 + 0.004), sy * (H / 2 + 0.004), T / 2 + 0.002, 0, 0, sy > 0 ? 0 : -PI / 2));
  }
  K.add(dark, at(rbox(0.62, 0.34, 0.02, 0.04), 0.05, 0.22, T / 2 + 0.006));
  const frame = (w, h, r, b) => { const o = rrect(new THREE.Shape(), w, h, r); o.holes.push(rrect(new THREE.Path(), w - 2 * b, h - 2 * b, r * 0.7)); return o; };
  K.add(brass, at(ext(frame(0.66, 0.38, 0.05, 0.04), 0.022, 0.005), 0.05, 0.22, T / 2 + 0.01));
  for (const dx of [-0.2, 0, 0.2]) K.add(brass, at(rbox(0.13, 0.025, 0.012, 0.006), 0.05 + dx, 0.22 + (dx ? 0.04 : -0.02), T / 2 + 0.02));   // a few raised lines of title
  // the ribbon marker: out of the top of the pages, down over the bottom edge
  K.add(std('#b3202c', { roughness: 0.6 }), sweep([V3(0.2, H / 2 - 0.06, 0.02), V3(0.22, -H / 2 + 0.02, 0.03), V3(0.24, -H / 2 - 0.05, 0.05), V3(0.27, -H / 2 - 0.2, 0.08)], V3(1, 0, 0), 0.008, 0.05));
  // a strap from the back cover round the fore-edge to a buckle on the front
  K.add(dark, sweep([V3(W / 2 - 0.25, -0.15, -T / 2 - 0.006), V3(W / 2 + 0.02, -0.15, -T / 2 - 0.006), V3(W / 2 + 0.03, -0.15, 0), V3(W / 2 + 0.02, -0.15, T / 2 + 0.006), V3(W / 2 - 0.2, -0.15, T / 2 + 0.006)], V3(0, 1, 0), 0.014, 0.12));
  K.add(brass, at(ext(frame(0.12, 0.16, 0.02, 0.025), 0.02, 0.005), W / 2 - 0.2, -0.15, T / 2 + 0.018));
  K.add(brass, at(cylX(0.009, 0.1, 8), W / 2 - 0.2, -0.15, T / 2 + 0.03, 0, 0, PI / 2));
  return K.build();
}

function build(item) {
  if (item.kind === 'book') return questBook();
  if (item.kind === 'chest') return chest();
  if (item.kind === 'finish') return rifle(item);
  if (item.kind === 'outfit') return jacket(item);
  if (item.kind === 'coins') return coins(item);
  const e = item.effect || {};
  if (e.weapon) return pistol();
  if (e.armor) return vest(item);
  if (e.meds?.medkit) return medkit();
  return bandage();
}

// one model per item, centred and sized to the view, built once; each canvas gets a light clone (shared geometry)
const templates = new Map();
function template(item) {
  const key = item.kind + ':' + (item.id || '') + ':' + (item.amount || '');
  let t = templates.get(key);
  if (!t) {
    const obj = build(item);
    if (item.kind === 'finish') { obj.rotation.z = 0.3; obj.updateMatrixWorld(); }   // long guns sit on a diagonal, like an icon
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(V3(0, 0, 0)), size = box.getSize(V3(0, 0, 0));
    const s = Math.min(2.5 / Math.max(size.x, size.y, size.z), 1.45 / (size.length() / 2));   // fills the view, never clips while turning
    const inner = new THREE.Group(); inner.add(obj); inner.scale.setScalar(s); inner.position.copy(c).multiplyScalar(-s);
    t = new THREE.Group(); t.add(inner);
    templates.set(key, t);
  }
  return t.clone();
}

// the renderer and its environment take a moment to set up: do it while the page is idle, not when a reward card opens
(window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => { if (!renderer) setup(); }, { timeout: 5000 });

const entries = new WeakMap();   // canvas → { ctx, obj, spin, seed, drawn }
let timer = 0;
function tick() {
  const t = performance.now() / 1000, dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const canvas of document.querySelectorAll('canvas.item3d')) {
    const a = entries.get(canvas);
    if (!a || canvas.offsetParent === null) continue;   // only what is on screen
    const css = Math.max(canvas.clientWidth, canvas.clientHeight);
    if (!css) continue;
    const px = Math.min(MAX, Math.max(32, Math.round(css * dpr)));
    if (canvas.width !== px) { canvas.width = canvas.height = px; a.drawn = false; }
    if (!a.spin && a.drawn) continue;   // a resting icon is drawn once
    a.obj.rotation.set(0.12, a.spin ? t * 0.8 + a.seed : -0.45, 0);
    a.obj.position.y = a.spin ? Math.sin(t * 1.6 + a.seed) * 0.04 : 0;
    renderer.setViewport(0, 0, px, px);
    scene.add(a.obj); renderer.render(scene, cam); scene.remove(a.obj);
    a.ctx.clearRect(0, 0, px, px); a.ctx.drawImage(renderer.domElement, 0, MAX - px, px, px, 0, 0, px, px);
    a.drawn = true;
  }
}

// spin: keep turning (the reward card, the selected slot); otherwise it rests at a three-quarter view
export function itemCanvas(item, { spin = false, dim = false } = {}) {
  if (!renderer) setup();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  canvas.className = 'item3d' + (dim ? ' dim' : '');
  entries.set(canvas, { ctx: canvas.getContext('2d'), obj: template(item), spin, seed: Math.random() * 6, drawn: false });
  if (!timer) timer = setInterval(tick, 1000 / FPS);
  return canvas;
}
