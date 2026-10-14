// Items of the inventory as little 3D objects turning slowly: a rifle in its finish's paint, a med kit, a
// bandage roll, a vest, a pistol, a jacket, a stack of coins. One small shared renderer draws every canvas
// that is on screen, like the avatars in the office (agentorch/web/avatar3d.js).
//
//   const cv = itemCanvas(item)   // item from the catalogue (kind, id, color, accent, glow, metal, effect)

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SIZE = 128, FPS = 15;
let renderer = null, scene, cam;
function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  // something for metal to reflect (gold, chrome), or it renders black
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404a5c, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(-2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe4ff, 1.8); rim.position.set(3, 1, -3); scene.add(rim);
  cam = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
  cam.position.set(0, 0.9, 5.2); cam.lookAt(0, 0, 0);
}

const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
const box = (w, h, d, x, y, z, rx, ry, rz) => at(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
const cyl = (r0, r1, h, x, y, z, rx = 0, ry = 0, rz = 0, n = 16) => at(new THREE.CylinderGeometry(r0, r1, h, n), x, y, z, rx, ry, rz);
const mesh = (geo, mat) => new THREE.Mesh(geo, mat);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2, ...o });

// a rifle along x: body/stock in the main colour, the accent on grips, rail and magazine
function rifle(item) {
  const g = new THREE.Group();
  const main = std(item.color || '#3a3f45', item.metal ? { metalness: 1, roughness: 0.22 } : {});
  const accent = std(item.accent || '#1d2024', item.glow ? { emissive: item.accent, emissiveIntensity: 1.4 } : item.metal ? { metalness: 1, roughness: 0.3 } : {});
  const steel = std('#2b2f35', { metalness: 0.8, roughness: 0.35 });
  g.add(mesh(mergeGeometries([box(1.5, 0.28, 0.16, 0, 0, 0), box(0.9, 0.24, 0.13, -1.1, -0.06, 0, 0, 0, 0.12)]), main));   // receiver, stock
  g.add(mesh(mergeGeometries([box(0.18, 0.42, 0.12, 0.3, -0.32, 0, 0, 0, -0.2), box(0.14, 0.36, 0.11, -0.25, -0.3, 0, 0, 0, 0.25), box(1.1, 0.05, 0.1, 0.15, 0.17, 0)]), accent));   // magazine, grip, rail
  g.add(mesh(mergeGeometries([cyl(0.045, 0.045, 1.1, 1.3, 0.04, 0, 0, 0, Math.PI / 2), cyl(0.07, 0.07, 0.6, 0.95, 0.02, 0, 0, 0, Math.PI / 2), box(0.3, 0.12, 0.1, 0.2, 0.3, 0)]), steel));
  g.scale.setScalar(1.25);
  return g;
}
function pistol() {
  const g = new THREE.Group(), dark = std('#22262c', { metalness: 0.6, roughness: 0.35 }), grip = std('#3b2e25', { roughness: 0.7 });
  g.add(mesh(box(1.1, 0.3, 0.2, 0.1, 0.2, 0), dark), mesh(box(0.3, 0.7, 0.18, -0.25, -0.2, 0, 0, 0, 0.25), grip), mesh(cyl(0.05, 0.05, 0.25, 0.75, 0.24, 0, 0, 0, Math.PI / 2), dark));
  g.scale.setScalar(1.3);
  return g;
}
function medkit() {
  const g = new THREE.Group();
  g.add(mesh(box(1.4, 0.95, 0.55, 0, 0, 0), std('#e9edf2', { roughness: 0.5 })));
  g.add(mesh(mergeGeometries([box(0.5, 0.16, 0.06, 0, 0, 0.29), box(0.16, 0.5, 0.06, 0, 0, 0.29)]), std('#d8343a', { emissive: '#5a0d10', emissiveIntensity: 0.4 })));
  g.add(mesh(box(0.5, 0.1, 0.12, 0, 0.53, 0), std('#9aa3ad')));
  return g;
}
function bandage() {
  const g = new THREE.Group(), cloth = std('#f3eee4', { roughness: 0.9 });
  g.add(mesh(cyl(0.5, 0.5, 0.55, 0, 0, 0, Math.PI / 2, 0, 0, 28), cloth), mesh(cyl(0.18, 0.18, 0.57, 0, 0, 0, Math.PI / 2, 0, 0, 20), std('#cfc8ba')));
  g.add(mesh(box(0.9, 0.04, 0.5, 0.45, -0.5, 0, 0, 0, -0.08), cloth));
  return g;
}
function vest(item) {
  const g = new THREE.Group(), c = std(item.rarity === 'rare' ? '#4b5634' : '#3f4a57', { roughness: 0.8 });
  const sh = new THREE.Shape();
  [[-0.7, -0.8], [0.7, -0.8], [0.72, 0.35], [0.4, 0.75], [0.18, 0.75], [0.0, 0.45], [-0.18, 0.75], [-0.4, 0.75], [-0.72, 0.35]].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  g.add(mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 }).translate(0, 0, -0.17), c));
  g.add(mesh(mergeGeometries([box(1.3, 0.1, 0.42, 0, -0.2, 0.01), box(1.3, 0.1, 0.42, 0, -0.5, 0.01)]), std('#1d2024')));
  return g;
}
function jacket(item) {
  const h = [...item.id].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7) >>> 0;
  const g = new THREE.Group(), c = std(['#4b5634', '#2e3238', '#5a4632', '#33475b'][h % 4], { roughness: 0.85 });
  const sh = new THREE.Shape();
  [[-0.55, -0.85], [0.55, -0.85], [0.55, 0.2], [0.95, -0.35], [1.15, -0.15], [0.7, 0.6], [0.25, 0.75], [0, 0.6], [-0.25, 0.75], [-0.7, 0.6], [-1.15, -0.15], [-0.95, -0.35], [-0.55, 0.2]].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  g.add(mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3 }).translate(0, 0, -0.15), c));
  g.add(mesh(box(0.04, 1.3, 0.34, 0, -0.15, 0), std('#16181c')));   // zip
  return g;
}
function coins(item) {
  const g = new THREE.Group(), gold = std('#e3b341', { metalness: 1, roughness: 0.25, emissive: '#3a2600', emissiveIntensity: 0.3 });
  const n = item.amount >= 200 ? 7 : item.amount >= 50 ? 5 : 3;
  for (let i = 0; i < n; i++) g.add(mesh(cyl(0.45, 0.45, 0.1, (i % 2) * 0.05, -0.5 + i * 0.12, 0, 0, i, 0, 28), gold));
  if (n > 3) g.add(mesh(cyl(0.45, 0.45, 0.1, 0.65, -0.5, 0.2, 0, 0, 0, 28), gold), mesh(cyl(0.45, 0.45, 0.1, 0.62, -0.38, 0.22, 0, 0, 0, 28), gold));
  return g;
}

// a treasure chest: wooden body, arched lid, gold bands and lock
function chest() {
  const g = new THREE.Group(), wood = std('#6b4524', { roughness: 0.75 }), gold = std('#e3b341', { metalness: 1, roughness: 0.28, emissive: '#3a2600', emissiveIntensity: 0.4 });
  g.add(mesh(box(1.6, 0.9, 1.05, 0, -0.35, 0), wood));
  g.add(mesh(new THREE.CylinderGeometry(0.53, 0.53, 1.6, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0.1, 0), wood));
  for (const x of [-0.62, 0, 0.62]) {
    g.add(mesh(box(0.1, 0.92, 1.08, x, -0.35, 0), gold));
    g.add(mesh(new THREE.CylinderGeometry(0.545, 0.545, 0.1, 24, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(x, 0.1, 0), gold));
  }
  g.add(mesh(box(1.62, 0.08, 1.07, 0, 0.1, 0), gold));
  g.add(mesh(box(0.26, 0.32, 0.08, 0, -0.02, 0.55), gold));
  g.add(mesh(cyl(0.05, 0.05, 0.1, 0, -0.06, 0.6, Math.PI / 2), std('#1d1408')));
  g.scale.setScalar(0.85);
  return g;
}

function build(item) {
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

const live = new Set();
let timer = 0;
function tick() {
  const t = performance.now() / 1000;
  for (const a of live) {
    if (!a.canvas.isConnected) { live.delete(a); continue; }
    if (a.canvas.offsetParent === null) continue;
    a.obj.rotation.y = a.spin ? t * 0.8 + a.seed : -0.35;
    a.obj.rotation.x = 0.12;
    a.obj.position.y = Math.sin(t * 1.6 + a.seed) * 0.04;
    scene.add(a.obj); renderer.render(scene, cam); scene.remove(a.obj);
    a.ctx.clearRect(0, 0, SIZE, SIZE); a.ctx.drawImage(renderer.domElement, 0, 0);
  }
  if (!live.size) { clearInterval(timer); timer = 0; }
}

// spin: keep turning (the reward card, the selected slot); otherwise it rests at a three-quarter view
export function itemCanvas(item, { spin = false, dim = false } = {}) {
  if (!renderer) setup();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  canvas.className = 'item3d' + (dim ? ' dim' : '');
  const obj = build(item);
  live.add({ canvas, ctx: canvas.getContext('2d'), obj, spin, seed: Math.random() * 6 });
  if (!timer) timer = setInterval(tick, 1000 / FPS);
  return canvas;
}
