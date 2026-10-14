// Life in the streets: cars driving their lanes, people on the sidewalks, and a car the CEO can drive.
//
// Cars keep to the right-hand lane of the street grid (city.grid), pick a way at each crossing, slow
// down and stop for whatever is ahead (another car, a person, the CEO) and stop when bumped. People
// walk the sidewalks around the blocks near the CEO. F at a car's driver door gets in: W/S to drive and
// brake, A/D to steer, Space for the handbrake, V switches the cockpit and the view from behind, F gets out.
//
// createStreet(host) → { update(dt), key(e), hint(), driving }

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { t } from '/i18n.js';

const CARS = 22, PEOPLE = 16;
const CRUISE = 9.5, LANE = 4, CAR_R = 0.95, WHEELBASE = 2.6;
const PEOPLE_NAMES = ['an', 'binh', 'chi', 'dung', 'giang', 'ha', 'khoa', 'linh', 'minh', 'nam', 'oanh', 'phuc', 'quan', 'son', 'thao', 'uyen', 'vy', 'xuan'];
const COLORS = [0xd8d8d8, 0x1f2a36, 0x8a1f22, 0x2d4f7a, 0x6b6e72, 0xe8e2d0, 0x234d3a, 0xc9a227, 0x111111, 0x5b2a6e];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- the car model (facing +x, wheels on the ground)

const MAT = {
  glass: new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
  trim: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.15, metalness: 1 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }),
  head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 0.6, roughness: 0.2 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x8a0d0d, emissive: 0xff1a1a, emissiveIntensity: 0.5, roughness: 0.3 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.85 }),
  dash: new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.7 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }),
};
const extrude = (pts, width, bevel) => {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], k) => (k ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 8 });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  return g;
};
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
// shared shapes, built once
const SHAPE = (() => {
  // the body is hollow, like a car: lower body, bonnet, boot and door panels; a thin roof on pillars
  const W = 1.78, T = 0.07;
  const side = (pts, z) => at(extrude(pts, T, 0.02), 0, 0, z);
  const body = mergeGeometries([
    extrude([[-2.2, 0.36], [2.15, 0.36], [2.28, 0.55], [2.28, 0.64], [-2.28, 0.64], [-2.28, 0.6]], W, 0.08),        // lower body
    extrude([[0.78, 0.62], [2.28, 0.62], [2.26, 0.74], [2.0, 0.86], [0.95, 0.95], [0.78, 0.98]], W, 0.06),          // bonnet
    extrude([[-2.28, 0.62], [-1.58, 0.62], [-1.58, 0.98], [-1.95, 0.95], [-2.22, 0.84]], W, 0.06),                 // boot
    side([[-1.58, 0.62], [0.78, 0.62], [0.78, 0.98], [-1.58, 0.98]], W / 2 - T / 2),                             // doors
    side([[-1.58, 0.62], [0.78, 0.62], [0.78, 0.98], [-1.58, 0.98]], -(W / 2 - T / 2)),
  ]);
  const cabin = mergeGeometries([
    at(extrude([[0.3, 1.34], [-1.2, 1.38], [-1.2, 1.43], [0.3, 1.39]], 1.56, 0.03), 0, 0, 0),                     // roof
    ...[0.76, -0.76].flatMap((z) => [
      side([[0.92, 0.96], [0.82, 0.96], [0.24, 1.37], [0.34, 1.37]], z),                                            // A pillars
      side([[-1.74, 0.96], [-1.58, 0.96], [-1.12, 1.39], [-1.24, 1.39]], z),                                        // C pillars
    ]),
  ]);
  const glass = extrude([[0.86, 0.98], [0.32, 1.33], [-1.15, 1.37], [-1.62, 1.0]], 1.6, 0.02);
  const trim = mergeGeometries([
    at(new THREE.BoxGeometry(4.5, 0.16, 1.82), 0, 0.3, 0),                          // sills and the bumpers' lower band
    at(new THREE.BoxGeometry(0.06, 0.18, 1.2), 2.28, 0.5, 0),                       // grille
    at(new THREE.BoxGeometry(0.06, 0.42, 0.06), -0.4, 1.17, 0.78), at(new THREE.BoxGeometry(0.06, 0.42, 0.06), -0.4, 1.17, -0.78),   // B pillars
    at(new THREE.BoxGeometry(0.22, 0.1, 0.06), 0.66, 1.0, 0.95), at(new THREE.BoxGeometry(0.22, 0.1, 0.06), 0.66, 1.0, -0.95),     // mirrors
    ...[0.42, -0.4, -1.25].flatMap((x) => [at(new THREE.BoxGeometry(0.012, 0.32, 0.02), x, 0.8, 0.9), at(new THREE.BoxGeometry(0.012, 0.32, 0.02), x, 0.8, -0.9)]),  // door lines
    at(new THREE.BoxGeometry(2.3, 0.04, 1.62), -0.4, 0.62, 0),                     // cabin floor
  ]);
  const chrome = mergeGeometries([
    at(new THREE.BoxGeometry(0.03, 0.04, 1.25), 2.3, 0.6, 0),
    ...[0.1, -0.85].flatMap((x) => [at(new THREE.BoxGeometry(0.14, 0.025, 0.02), x, 0.84, 0.9), at(new THREE.BoxGeometry(0.14, 0.025, 0.02), x, 0.84, -0.9)]),   // door handles
  ]);
  const head = mergeGeometries([at(new THREE.BoxGeometry(0.06, 0.1, 0.36), 2.24, 0.68, 0.6), at(new THREE.BoxGeometry(0.06, 0.1, 0.36), 2.24, 0.68, -0.6)]);
  const tail = mergeGeometries([at(new THREE.BoxGeometry(0.06, 0.12, 0.4), -2.27, 0.74, 0.62), at(new THREE.BoxGeometry(0.06, 0.12, 0.4), -2.27, 0.74, -0.62)]);
  const plate = mergeGeometries([at(new THREE.BoxGeometry(0.02, 0.12, 0.42), 2.32, 0.42, 0), at(new THREE.BoxGeometry(0.02, 0.12, 0.42), -2.32, 0.5, 0)]);
  // inside: two front seats, a back bench, the dashboard, the steering wheel (driver on the left, -z)
  const seatOne = (x, z) => [at(new THREE.BoxGeometry(0.5, 0.12, 0.48), x, 0.72, z), at(new THREE.BoxGeometry(0.12, 0.62, 0.46), x - 0.27, 1.02, z, 0, 0, 0.18),
    at(new THREE.BoxGeometry(0.1, 0.18, 0.26), x - 0.37, 1.4, z, 0, 0, 0.18)];
  const seat = mergeGeometries([...seatOne(-0.4, -0.38), ...seatOne(-0.4, 0.38), at(new THREE.BoxGeometry(0.5, 0.12, 1.4), -1.25, 0.72, 0), at(new THREE.BoxGeometry(0.12, 0.55, 1.4), -1.52, 1.0, 0, 0, 0, 0.15)]);
  const dash = mergeGeometries([
    at(new THREE.BoxGeometry(0.34, 0.2, 1.62), 0.72, 0.9, 0),                       // dashboard under the windscreen
    at(new THREE.BoxGeometry(0.2, 0.06, 0.34), 0.56, 1.0, -0.38),                   // instrument hood
    at(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 8), 0.46, 0.92, -0.38, 0, 0, 1.0),   // steering column
  ]);
  const steer = at(new THREE.TorusGeometry(0.17, 0.02, 8, 28), 0.33, 0.98, -0.38, 0, Math.PI / 2, 0.45);
  const tyre = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 24).rotateX(Math.PI / 2);
  const rim = mergeGeometries([new THREE.CylinderGeometry(0.24, 0.24, 0.275, 18).rotateX(Math.PI / 2),
    ...[0, 1, 2, 3, 4].map((k) => at(new THREE.BoxGeometry(0.04, 0.4, 0.03), 0, 0, 0.12, 0, 0, k / 5 * Math.PI))]);
  return { body, cabin, glass, trim, chrome, head, tail, plate, seat, dash, steer, tyre, rim };
})();
const WHEELS = [[1.42, 0.8], [1.42, -0.8], [-1.45, 0.8], [-1.45, -0.8]];

function makeCar(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55, side: THREE.DoubleSide });   // seen from inside too
  const mesh = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m; };
  mesh(SHAPE.body, paint); mesh(SHAPE.cabin, paint); mesh(SHAPE.glass, MAT.glass, false); mesh(SHAPE.trim, MAT.trim);
  mesh(SHAPE.chrome, MAT.chrome, false); mesh(SHAPE.head, MAT.head, false); mesh(SHAPE.tail, MAT.tail, false); mesh(SHAPE.plate, MAT.plate, false);
  mesh(SHAPE.seat, MAT.seat, false); mesh(SHAPE.dash, MAT.dash, false); mesh(SHAPE.steer, MAT.trim, false);
  // nobody visible at the wheel of the city's cars: a dark tint on the glass hides the cabin from outside
  const wheels = WHEELS.map(([x, z]) => {
    const w = new THREE.Group(); w.position.set(x, 0.36, z);
    const spin = new THREE.Group(); w.add(spin);
    const tyre = new THREE.Mesh(SHAPE.tyre, MAT.tyre); tyre.castShadow = true;
    spin.add(tyre, new THREE.Mesh(SHAPE.rim, MAT.chrome));
    g.add(w);
    return { w, spin, front: x > 0 };
  });
  return { group: g, wheels };
}

// ---------------------------------------------------------------- the street

export function createStreet(host) {
  const { scene, city, player, camera } = host;
  const G = city.grid, N = G.rings * 2 + 2;   // roads per direction (between and around the blocks)
  const roadX = (a) => G.cx + (a - G.rings - 0.5) * G.pitch;
  const roadZ = (b) => G.cz + (b - G.rings - 0.5) * G.pitch;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const group = new THREE.Group(); group.name = 'street'; scene.add(group);
  const rnd = Math.random;

  // ---- cars on the road
  const cars = [];
  // a leg of the route: from crossing (a, b) along DIRS[dir] to the next crossing, in the right-hand lane
  function leg(car) {
    const [dx, dz] = DIRS[car.dir], rx = -dz, rz = dx;
    const ax = roadX(car.a), az = roadZ(car.b), bx = roadX(car.a + dx), bz = roadZ(car.b + dz);
    car.way = [new THREE.Vector3(ax + dx * 10 + rx * LANE, 0, az + dz * 10 + rz * LANE), new THREE.Vector3(bx - dx * 10 + rx * LANE, 0, bz - dz * 10 + rz * LANE)];
  }
  const inside = (a, b) => a >= 0 && b >= 0 && a < N && b < N;
  function nextLeg(car) {
    car.a += DIRS[car.dir][0]; car.b += DIRS[car.dir][1];
    const options = [[car.dir, 3], [(car.dir + 1) % 4, 1], [(car.dir + 3) % 4, 1]]
      .filter(([d]) => inside(car.a + DIRS[d][0], car.b + DIRS[d][1]));
    let total = options.reduce((n, [, w]) => n + w, 0), pick = rnd() * total;
    car.dir = (options.find(([, w]) => (pick -= w) < 0) || options[0] || [(car.dir + 2) % 4])[0];
    leg(car);
  }
  function spawnCar() {
    const m = makeCar(COLORS[Math.floor(rnd() * COLORS.length)]);
    const car = { ...m, a: 0, b: 0, dir: 0, way: null, heading: 0, speed: 0, stopFor: 0, stuck: 0, ai: true };
    for (let k = 0; k < 20; k++) {
      car.dir = Math.floor(rnd() * 4); car.a = Math.floor(rnd() * N); car.b = Math.floor(rnd() * N);
      if (inside(car.a + DIRS[car.dir][0], car.b + DIRS[car.dir][1])) break;
    }
    leg(car);
    const p = car.way[0].clone().lerp(car.way[1], rnd());
    car.group.position.copy(p);
    car.heading = Math.atan2(-DIRS[car.dir][1], DIRS[car.dir][0]);   // local +x along the lane
    car.speed = CRUISE * 0.6;
    group.add(car.group);
    cars.push(car);
    return car;
  }
  for (let i = 0; i < CARS; i++) spawnCar();

  // ---- the parked cars along the kerbs: the city's simple ones swapped for these, all in a few instanced
  // meshes; one is taken out (and a real car put in its place) when the CEO gets into it
  const parked = city.parked.map(([x, z, a], k) => ({ x, z, a, k, color: city.carColors[k % city.carColors.length], wall: city.parkedWalls[k], gone: false }));
  const parkedSets = [];
  if (parked.length) {
    for (const m of city.parkedMeshes) m.visible = false;
    const white = new THREE.Color(1, 1, 1);
    const paint = new THREE.MeshStandardMaterial({ color: white, roughness: 0.32, metalness: 0.55, side: THREE.DoubleSide });
    const parts = [[SHAPE.body, paint, true], [SHAPE.cabin, paint, true], [SHAPE.glass, MAT.glass], [SHAPE.trim, MAT.trim], [SHAPE.chrome, MAT.chrome],
      [SHAPE.head, MAT.head], [SHAPE.tail, MAT.tail], [SHAPE.plate, MAT.plate], [SHAPE.seat, MAT.seat], [SHAPE.dash, MAT.dash], [SHAPE.steer, MAT.trim]];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    const poseOf = (c) => m4.compose(new THREE.Vector3(c.x, 0, c.z), q.setFromAxisAngle(up, c.a), one).clone();
    for (const [geo, mat, painted] of parts) {
      const im = new THREE.InstancedMesh(geo, mat, parked.length);
      parked.forEach((c, i) => { im.setMatrixAt(i, poseOf(c)); if (painted) im.setColorAt(i, new THREE.Color(c.color)); });
      im.castShadow = mat !== MAT.glass; im.receiveShadow = true;
      group.add(im); parkedSets.push({ im, wheel: null });
    }
    for (const [geo, mat] of [[SHAPE.tyre, MAT.tyre], [SHAPE.rim, MAT.chrome]]) {
      const im = new THREE.InstancedMesh(geo, mat, parked.length * 4);
      parked.forEach((c, i) => WHEELS.forEach(([x, z], w) => im.setMatrixAt(i * 4 + w, poseOf(c).multiply(new THREE.Matrix4().makeTranslation(x, 0.36, z)))));
      im.castShadow = true;
      group.add(im); parkedSets.push({ im, wheel: true });
    }
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // take parked car i off the kerb: a real car, its own collision box gone
  function unpark(c) {
    c.gone = true;
    for (const { im, wheel } of parkedSets) {
      if (wheel) for (let w = 0; w < 4; w++) im.setMatrixAt(c.k * 4 + w, zero); else im.setMatrixAt(c.k, zero);
      im.instanceMatrix.needsUpdate = true;
    }
    Object.assign(c.wall, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const m = makeCar(c.color);
    const car = { ...m, a: 0, b: 0, dir: 0, way: null, heading: c.a, speed: 0, stopFor: 0, stuck: 0, ai: false, parkedCar: true };
    car.group.position.set(c.x, 0, c.z);
    group.add(car.group);
    cars.push(car);
    return car;
  }
  const fwdOf = (h) => new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));

  // ---- people on the sidewalks
  const people = [];
  const around = (i, j) => { const cx = G.cx + i * G.pitch, cz = G.cz + j * G.pitch, h = G.inner / 2 - 0.8;
    return [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h]].map(([x, z]) => new THREE.Vector3(x, 0, z)); };
  function placePerson(p, far = true) {
    // a block near the CEO, a point on its sidewalk loop not right in front of them
    const me = player.root.position;
    for (let k = 0; k < 12; k++) {
      const i = clamp(Math.round((me.x - G.cx) / G.pitch) + Math.floor(rnd() * 3) - 1, -G.rings, G.rings);
      const j = clamp(Math.round((me.z - G.cz) / G.pitch) + Math.floor(rnd() * 3) - 1, -G.rings, G.rings);
      const loop = around(i, j), e = Math.floor(rnd() * 4), pt = loop[e].clone().lerp(loop[(e + 1) % 4], rnd());
      if (far && pt.distanceTo(me) < 30) continue;
      p.loop = loop; p.edge = e; p.cw = rnd() < 0.5;
      p.char.placeAt(pt);
      walkOn(p);
      return;
    }
  }
  function walkOn(p) {
    if (p.removed) return;
    if (rnd() < 0.2) {   // a pause now and then
      p.char.play('idle');
      p.pauseT = 2 + rnd() * 4;
      return;
    }
    p.edge = (p.edge + (p.cw ? 1 : 3)) % 4;
    p.char.walkTo(p.loop[p.edge], () => walkOn(p));
  }
  function addPerson() {
    const p = { char: host.spawnPerson(PEOPLE_NAMES[people.length % PEOPLE_NAMES.length] + people.length), pauseT: 0 };
    people.push(p);
    placePerson(p, false);
  }
  let peopleOn = false;

  // ---- what is in front of a car: the distance to it along the lane, or Infinity
  const others = [];
  function aheadOf(car, fwd) {
    const p = car.group.position, right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let near = Infinity;
    for (const o of others) {
      if (o.ref === car) continue;
      const rel = o.pos.clone().sub(p); rel.y = 0;
      const along = rel.dot(fwd), side = Math.abs(rel.dot(right));
      if (along > 0 && along < 14 && side < 1.6 + o.r) near = Math.min(near, along - o.r);
    }
    return near;
  }

  // ---- the car the CEO drives
  let drive = null, view = 'cockpit', honk = 0;
  const hud = document.createElement('div');
  hud.id = 'drive-hud'; hud.className = 'hidden';
  hud.innerHTML = `<b class="dh-speed">0</b><small>km/h</small><div class="dh-keys"><kbd>W</kbd><kbd>S</kbd> ${t('ga / phanh')} · <kbd>A</kbd><kbd>D</kbd> ${t('lái')} · <kbd>V</kbd> ${t('góc nhìn')} · <kbd>F</kbd> ${t('xuống xe')}</div>`;
  document.body.append(hud);
  // sounds through the app's shared engine (/audio.js); an older app without it stays quiet
  const sfx = (name, o) => host.audio?.sfx(name, o);
  const doorOf = (car) => car.group.position.clone().add(new THREE.Vector3(-0.3, 0, -1.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading));
  function nearCar() {
    if (drive || !host.isOutdoors()) return null;
    const me = player.root.position.clone().setY(0);
    let best = null, bd = 2.2;
    for (const c of cars) { const d = doorOf(c).distanceTo(me); if (d < bd) { bd = d; best = c; } }
    for (const c of parked) {
      if (c.gone) continue;
      const d = doorOf({ group: { position: new THREE.Vector3(c.x, 0, c.z) }, heading: c.a }).distanceTo(me);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function getIn(car) {
    sfx('door_car');
    host.track?.('car_driven', { parked: !!car.parkedCar });
    car.ai = false; drive = car; car.speed = 0;
    player.root.visible = false;
    player.yaw = car.heading + Math.PI / 2; player.pitch = 0.05;   // start looking ahead
    host.control(controller);
    hud.classList.remove('hidden');
    view = 'cockpit';
  }
  function getOut() {
    sfx('door_car'); host.audio?.loop('engine', null);
    const car = drive;
    const out = doorOf(car).add(new THREE.Vector3(-0.0, 0, -0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading));
    host.collide(out, 0.35);
    player.root.position.set(out.x, 0, out.z);
    player.yaw = car.heading + Math.PI / 2;   // the player's camera yaw facing where the car faces
    player.root.visible = true;
    player.camReady = false;
    drive = null;
    host.control(null);
    hud.classList.add('hidden');
    car.backT = 6;   // back to its lane in a moment
  }
  // the car back to the nearest lane leg, from where it was left
  function rejoin(car) {
    const p = car.group.position;
    let best = null, bd = Infinity;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) for (let d = 0; d < 4; d++) {
      if (!inside(a + DIRS[d][0], b + DIRS[d][1])) continue;
      const c = { a, b, dir: d }; leg(c);
      const dd = c.way[0].distanceTo(p) + Math.abs(wrap(Math.atan2(-DIRS[d][1], DIRS[d][0]) - car.heading)) * 8;
      if (dd < bd) { bd = dd; best = c; }
    }
    Object.assign(car, { a: best.a, b: best.b, dir: best.dir, way: best.way, ai: true });
  }

  const look = { yaw: 0, pitch: 0 };
  const controller = {
    update(dt, keys) {
      const car = drive, p = car.group.position;
      const throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
      const hand = keys.has('Space');
      if (throttle > 0) car.speed += (car.speed < 0 ? 14 : 6) * dt;
      else if (throttle < 0) car.speed -= (car.speed > 0 ? 14 : 4) * dt;
      else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 2.2 * dt);
      if (hand) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 18 * dt);
      car.speed = clamp(car.speed, -6, 24);
      car.steer = (car.steer || 0) + (steer * 0.55 * clamp(1.2 - Math.abs(car.speed) / 30, 0.35, 1) - (car.steer || 0)) * clamp(dt * 6, 0, 1);
      car.heading += car.speed / WHEELBASE * Math.tan(car.steer) * dt;
      p.addScaledVector(fwdOf(car.heading), car.speed * dt);
      bump(car, true);
      // the CEO rides along (the office world follows their position)
      player.root.position.set(p.x, 0, p.z);
      // camera: the driver's eyes, or behind the car; the mouse looks around
      look.yaw = clamp(wrap(player.yaw - (car.heading + Math.PI / 2)), -1.6, 1.6);
      look.pitch = clamp(player.pitch * 0.8, -0.4, 0.6);
      const h = car.heading + look.yaw;
      if (view === 'cockpit') {
        const eye = p.clone().add(new THREE.Vector3(-0.55, 1.24, -0.38).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading));
        camera.position.copy(eye);
        camera.lookAt(eye.clone().add(new THREE.Vector3(Math.cos(h), -Math.sin(look.pitch), -Math.sin(h))));
      } else {
        const back = p.clone().add(new THREE.Vector3(-Math.cos(h) * 7, 2.6 + look.pitch * 3, Math.sin(h) * 7));
        camera.position.lerp(back, clamp(dt * 6, 0, 1));
        camera.lookAt(p.clone().setY(1.2));
      }
      hud.querySelector('.dh-speed').textContent = Math.round(Math.abs(car.speed) * 3.6);
      host.audio?.loop('engine', { speed: car.speed, throttle: Math.abs(throttle), level: 1 });
    },
  };
  // walls, trees, the office, parked cars: push the car out; other cars: both stop
  function bump(car, mine) {
    const p = car.group.position, f = fwdOf(car.heading);
    let hit = false;
    for (const k of [1.35, 0, -1.35]) {
      const c = p.clone().addScaledVector(f, k), before = c.clone();
      host.collide(c, CAR_R);
      const push = c.sub(before);
      if (push.lengthSq() > 1e-6) { p.add(push); hit = true; }
    }
    for (const o of cars) {
      if (o === car) continue;
      const d = o.group.position.clone().sub(p); d.y = 0;
      const dist = d.length();
      if (dist < 2.3 && dist > 1e-3) {
        p.addScaledVector(d.normalize(), -(2.3 - dist) * (o.ai ? 1 : 0.5));
        hit = true;
        if (o.ai) { o.stopFor = 4; o.speed = 0; if (mine && honk <= 0) { sfx('horn'); sfx('bump_car'); honk = 1.5; } }
      }
    }
    if (hit && Math.abs(car.speed) > 2) car.speed *= mine ? -0.25 : 0;
    // people step aside
    for (const pp of people) {
      const d = pp.char.root.position.clone().sub(p); d.y = 0;
      if (d.length() < 1.6) pp.char.root.position.addScaledVector(d.normalize(), 1.6 - d.length());
    }
  }

  function updateCars(dt) {
    others.length = 0;
    for (const c of cars) others.push({ ref: c, pos: c.group.position, r: 1.2 });
    if (!drive) others.push({ ref: null, pos: player.root.position, r: 0.4 });
    for (const p of people) others.push({ ref: null, pos: p.char.root.position, r: 0.4 });
    for (const car of cars) {
      if (!car.ai) {
        if (car !== drive && !car.parkedCar && (car.backT -= dt) <= 0 && player.root.position.distanceTo(car.group.position) > 8) rejoin(car);
        continue;
      }
      const p = car.group.position, fwd = fwdOf(car.heading);
      if (p.distanceTo(car.way[1]) < 3) nextLeg(car);
      // steer toward the lane: a point a few metres on along the leg (curves through crossings by itself)
      const target = p.distanceTo(car.way[0]) > 3 && fwd.dot(car.way[0].clone().sub(p)) > 0 ? car.way[0] : car.way[1];
      const dx = target.x - p.x, dz = target.z - p.z;
      const want = Math.atan2(-dz, dx);
      car.heading += clamp(wrap(want - car.heading), -1.6 * dt, 1.6 * dt);
      if (target === car.way[1] && p.distanceTo(car.way[0]) < 3) car.way[0] = car.way[1];
      // speed: cruise, slow for what's ahead, stop when bumped
      const free = aheadOf(car, fwd);
      let goal = Math.min(CRUISE, Math.max(0, (free - 4) * 1.4));
      if (Math.abs(wrap(want - car.heading)) > 0.5) goal = Math.min(goal, 4.5);   // turning
      if (car.stopFor > 0) { car.stopFor -= dt; goal = 0; }
      // waiting long for another car (a jam at a crossing): creep on
      if (goal < 0.5 && free < 14) car.stuck += dt; else car.stuck = 0;
      if (car.stuck > 7 && car.stopFor <= 0) goal = 2.5;
      car.speed += clamp(goal - car.speed, -10 * dt, 3.5 * dt);
      p.addScaledVector(fwdOf(car.heading), car.speed * dt);
      // the CEO on foot walking into a car: the car stops
      if (!drive && p.distanceTo(player.root.position) < 2.2) {
        if (car.speed > 3 && p.distanceTo(player.root.position) < 1.6) {   // too late to stop: a nudge that sends the CEO aside
          const away = player.root.position.clone().sub(p).setY(0).normalize();
          knock(away.negate(), 1.2); shake = 0.45; stunned = 0.6; player.keys.clear();
          pop(pick([t('Á! Xe!'), t('Suýt nữa thì…'), t('Đi xe kiểu gì vậy!')]), () => player.root.position);
          sfx('bump_car');
        }
        car.stopFor = 3; if (car.speed > 1 && honk <= 0) { sfx('horn'); honk = 1.5; } car.speed = 0;
      }
    }
    for (const car of cars) {
      car.group.rotation.y = car.heading;
      for (const w of car.wheels) {
        w.spin.rotation.z -= car.speed * dt / 0.36;
        w.w.rotation.y = w.front ? (car === drive ? car.steer || 0 : 0) : 0;
      }
    }
  }

  // ---- bumping into things: a word popping up over whoever says it, a stagger, the camera shaking
  const pops = [];
  const popLayer = document.createElement('div'); popLayer.id = 'city-pops'; document.body.append(popLayer);
  function pop(text, at, kind = 'me') {
    const el = document.createElement('div'); el.className = `city-pop ${kind}`; el.textContent = text;
    popLayer.append(el);
    pops.push({ el, at, t: 0 });
  }
  const _v = new THREE.Vector3();
  function updatePops(dt) {
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += dt;
      const pos = typeof p.at === 'function' ? p.at() : p.at;
      _v.copy(pos).setY(pos.y + 2.05 + p.t * 0.35).project(camera);
      const vis = _v.z < 1 && p.t < 1.8;
      p.el.style.transform = `translate(-50%, -100%) translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px)`;
      p.el.style.opacity = vis ? String(Math.min(1, (1.8 - p.t) * 2)) : '0';
      if (p.t >= 1.8) { p.el.remove(); pops.splice(i, 1); }
    }
  }
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const OUCH = { lamp: [t('Ui da!'), t('Cột đèn ở đâu ra vậy…'), t('Á, đầu tôi!')], tree: [t('Ui!'), t('Cây này mọc hồi nào?'), t('Á!')],
    building: [t('Ối!'), t('Tường cứng thật…')], car: [t('Ui, xe ai đậu đây!'), t('Á!')] };
  let shake = 0, stunned = 0, lastOuch = 0;
  const knock = (dir, m) => { const p = player.root.position; p.addScaledVector(dir, -m); host.collide(p, 0.3); };
  host.onEvent('bump', ({ kind, running, dir }) => {
    if (!host.isOutdoors() || drive || stunned > 0) return;
    if (!running) return;   // walking into something just stops you
    const now = performance.now();
    knock(dir.clone().normalize(), 0.55);
    shake = 0.35; stunned = 0.45;
    player.keys.clear();
    if (now - lastOuch > 1500) { lastOuch = now; pop(pick(OUCH[kind] || OUCH.building), () => player.root.position); }
    sfx(`bump_${kind}`);
    host.track?.('city_bump', { kind });
  });
  // people: they don't let you walk through them; run into one and they stagger and tell you about it
  const SORRY = [t('Xin lỗi nha!'), t('Ơ, cẩn thận chứ!'), t('Sếp đi đâu vội vậy?'), t('Ui, giật cả mình!')];
  const ANGRY = [t('Đi đứng kiểu gì vậy!'), t('Á! Nhìn đường chứ!'), t('Chạy như ma đuổi…'), t('Trời ơi, cái chân tôi!')];
  let lastPos = null, mySpeed = 0;
  function bumpPeople(dt) {
    const me = player.root.position;
    if (lastPos) mySpeed = mySpeed * 0.8 + (Math.hypot(me.x - lastPos.x, me.z - lastPos.z) / Math.max(dt, 1e-3)) * 0.2;
    lastPos = (lastPos || new THREE.Vector3()).copy(me);
    if (drive) return;
    for (const p of people) {
      const pos = p.char.root.position, dx = me.x - pos.x, dz = me.z - pos.z, d = Math.hypot(dx, dz);
      if (d > 0.62 || d < 1e-4) continue;
      // you can't pass through them
      me.x = pos.x + dx / d * 0.62; me.z = pos.z + dz / d * 0.62;
      if ((p.bumpT || 0) > 0) continue;
      p.bumpT = 2.5;
      const hard = mySpeed > 3.2;
      // they stop, turn to you and say something; a hard one knocks them back a step
      p.char.target = null; p.char.faceTarget = me.clone(); p.pauseT = hard ? 2.2 : 1.2;
      if (hard) { pos.addScaledVector(new THREE.Vector3(-dx / d, 0, -dz / d), 0.45); p.char.play('sad'); knock(new THREE.Vector3(-dx, 0, -dz).normalize(), 0.35); shake = 0.25; }
      else p.char.play('idle');
      pop(pick(hard ? ANGRY : SORRY), () => pos, 'them');
      sfx('bump_person');
      host.track?.('city_bump', { kind: hard ? 'person_hard' : 'person' });
    }
    for (const p of people) if (p.bumpT > 0) p.bumpT -= dt;
  }

  function updatePeople(dt) {
    const out = host.isOutdoors() || !!drive;
    if (out && !peopleOn) { peopleOn = true; while (people.length < PEOPLE) addPerson(); }
    for (const p of people) {
      p.char.root.visible = out;
      if (p.pauseT > 0 && (p.pauseT -= dt) <= 0) { p.char.faceTarget = null; walkOn(p); }
      if (out && p.char.root.position.distanceTo(player.root.position) > 150) placePerson(p);
    }
    if (out) bumpPeople(dt);
  }

  return {
    get driving() { return !!drive; },
    update(dt) {
      honk -= dt;
      updatePops(dt);
      if (stunned > 0) { stunned -= dt; player.keys.clear(); }
      if (shake > 0) {   // after the frame's camera is placed: a short jolt
        shake = Math.max(0, shake - dt);
        const k = shake * 0.12;
        camera.position.x += (Math.random() - 0.5) * k; camera.position.y += (Math.random() - 0.5) * k;
      }
      updateCars(dt);
      updatePeople(dt);
    },
    key(e) {
      if (e.code === 'KeyF' && !e.repeat) {
        if (drive) { getOut(); return true; }
        const c = nearCar();
        if (c) { getIn(c.group ? c : unpark(c)); return true; }
      }
      if (e.code === 'KeyV' && drive) { view = view === 'cockpit' ? 'chase' : 'cockpit'; return true; }
      return false;
    },
    hint() { return nearCar() ? `<kbd>F</kbd> ${t('Lên xe')}` : ''; },
  };
}
