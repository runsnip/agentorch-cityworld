// The city's dangers: things the CEO has to keep an eye on while out on the streets.
//
//   the documents bag   carried in the hand outdoors; a rider may swerve close and snatch it (cityTheft 'bag') and
//                       flee through the traffic: catch them (on foot or by car) before the window ends to get it back
//   a pickpocket        in a crowd, someone lingers close behind for a few seconds — step away and nothing happens;
//                       stay and they brush past with some coins (cityTheft 'coins'): bump into them to get them back
//   the company's dog   follows the CEO, wanders off to the stalls and into the road; too far and it's lost until
//                       found (F); it waits at home when the CEO is home, rides along in the car
//   stamina in the sun  drains walking and running (more at midday), comes back sitting at a stall, eating, resting
//                       indoors; at zero the CEO staggers, then faints and wakes at home
//   the office          a company with approvals waiting for over a minute while the CEO is away rings their phone
//
// What a theft costs is decided by the app (inventory.theft / recover); this only stages it. Nothing happens
// indoors, in a car (but the chase), or while a panel is open; each kind of trouble is rare (minutes apart).
//
// createSurvival(host, street, life) → { update(dt), key(e), hint(), markers() }

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { t } from '/i18n.js';
import { BIKE, MAT as LIFE_MAT, RIDER_AT, HELMET, HELMETS, BIKE_PAINT } from './streetlife.js';

const V = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const pickOf = (list) => list[Math.floor(Math.random() * list.length)];
const WINDOW = 150;                 // seconds to catch a thief (the app's own window)
const PET = 'Mực';

// ---------------------------------------------------------------- models

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
function roundedSlab(w, h, d, r) {
  const s = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x, -h / 2); s.lineTo(x, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -y); s.lineTo(w / 2, y);
  s.quadraticCurveTo(w / 2, h / 2, x, h / 2); s.lineTo(-x, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
  s.lineTo(-w / 2, -y); s.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r * 0.6, bevelEnabled: true, bevelSize: r * 0.5, bevelThickness: r * 0.6, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * r * 0.6) / 2);
  return g;
}

// a leather documents case: rounded body, the flap's seam, a handle on two mounts, brass clasps and corners.
// Its origin is at the top of the handle, so it hangs from the hand.
function makeBriefcase() {
  const g = new THREE.Group(), leather = std(0x4a2c1a, { roughness: 0.45 }), dark = std(0x2b190f, { roughness: 0.5 }), brass = std(0xc9a24a, { roughness: 0.25, metalness: 0.9 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(roundedSlab(0.42, 0.3, 0.1, 0.03), leather, 0, -0.24, 0);
  add(new THREE.BoxGeometry(0.43, 0.012, 0.104), dark, 0, -0.16, 0);
  const handle = add(new THREE.TorusGeometry(0.06, 0.012, 8, 18, Math.PI), dark, 0, -0.085, 0);
  handle.rotation.z = 0;
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.03, 0.02, 0.03), brass, s * 0.06, -0.09, 0);
    add(new THREE.BoxGeometry(0.035, 0.035, 0.012), brass, s * 0.12, -0.17, 0.052);
    for (const y of [-0.105, -0.375]) add(new THREE.BoxGeometry(0.03, 0.03, 0.105), brass, s * 0.2, y, 0);
  }
  return g;
}

// a red marker that floats over a thief: a cone pointing down inside a spinning ring, glowing
function makeMarker() {
  const g = new THREE.Group(), red = std(0xff2a2a, { emissive: 0xff1010, emissiveIntensity: 0.9, roughness: 0.3 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), red); cone.rotation.x = Math.PI; g.add(cone);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 28), red); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);
  g.userData.ring = ring;
  return g;
}

// the company's dog: body, chest, neck, head with a muzzle, a nose, eyes and pricked ears, a jointed tail, four
// two-part legs with paws, a collar with a tag. Every joint is a pivot so it can walk, trot and sit.
function makeDog() {
  const fur = std(0xb87a43, { roughness: 0.85 }), pale = std(0xead2a8, { roughness: 0.85 }), black = std(0x141414, { roughness: 0.3 }),
    red = std(0xc2262a, { roughness: 0.5 }), gold = std(0xd8b04a, { roughness: 0.25, metalness: 0.9 }), white = std(0xffffff, { roughness: 0.2 });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  body.position.y = 0.36;
  const trunk = mesh(new THREE.CapsuleGeometry(0.12, 0.3, 6, 12), fur, body); trunk.rotation.x = Math.PI / 2;
  const belly = mesh(new THREE.CapsuleGeometry(0.09, 0.22, 6, 10), pale, body, 0, -0.04, 0.02); belly.rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.13, 14, 10), fur, body, 0, 0.02, 0.15).scale.set(1, 1.05, 0.95);
  mesh(new THREE.SphereGeometry(0.1, 12, 8), pale, body, 0, -0.03, 0.22).scale.set(0.9, 1.1, 0.6);
  const neck = new THREE.Group(); neck.position.set(0, 0.08, 0.22); body.add(neck);
  const nk = mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.16, 10), fur, neck, 0, 0.06, 0.02); nk.rotation.x = 0.5;
  const collar = mesh(new THREE.TorusGeometry(0.068, 0.015, 8, 18), red, neck, 0, 0.04, 0.01); collar.rotation.x = Math.PI / 2 + 0.5;
  mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 12), gold, neck, 0, -0.02, 0.07).rotation.x = Math.PI / 2;
  const head = new THREE.Group(); head.position.set(0, 0.15, 0.08); neck.add(head);
  mesh(new THREE.SphereGeometry(0.095, 14, 10), fur, head).scale.set(1, 0.92, 1.05);
  const muzzle = mesh(new THREE.CapsuleGeometry(0.045, 0.07, 6, 10), pale, head, 0, -0.025, 0.1); muzzle.rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.022, 10, 8), black, head, 0, -0.005, 0.158).scale.set(1.2, 0.9, 1);
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.016, 10, 8), black, head, s * 0.045, 0.03, 0.075);
    mesh(new THREE.SphereGeometry(0.005, 6, 4), white, head, s * 0.047, 0.036, 0.089);
    const ear = mesh(new THREE.ConeGeometry(0.035, 0.085, 4), fur, head, s * 0.055, 0.1, -0.01); ear.rotation.z = -s * 0.35; ear.scale.set(1, 1, 0.45);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.06, -0.26); body.add(tail);
  let seg = tail;
  for (let k = 0; k < 3; k++) {
    const piv = new THREE.Group(); piv.rotation.x = -0.45; seg.add(piv);
    mesh(new THREE.CylinderGeometry(0.022 - k * 0.005, 0.03 - k * 0.005, 0.09, 8), k === 2 ? pale : fur, piv, 0, 0.045, 0);
    const next = new THREE.Group(); next.position.y = 0.09; piv.add(next); seg = next;
  }
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const hip = new THREE.Group(); hip.position.set(sx * 0.08, 0.36 - 0.02, sz * 0.17); root.add(hip);
    mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.17, 8), fur, hip, 0, -0.085, 0);
    const knee = new THREE.Group(); knee.position.y = -0.17; hip.add(knee);
    mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.16, 8), sz > 0 ? pale : fur, knee, 0, -0.08, 0);
    mesh(new THREE.SphereGeometry(0.03, 8, 6), pale, knee, 0, -0.165, 0.012).scale.set(1, 0.6, 1.3);
    return { hip, knee, front: sz > 0, side: sx };
  });
  return { root, body, neck, head, tail, legs };
}

// ---------------------------------------------------------------- the module

export function createSurvival(host, street, life) {
  const { scene, player, camera, city } = host;
  const G = city.grid, N = G.rings * 2 + 2, DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const roadX = (a) => G.cx + (a - G.rings - 0.5) * G.pitch, roadZ = (b) => G.cz + (b - G.rings - 0.5) * G.pitch;
  const me = () => player.root.position;
  const sfx = (n, o) => host.audio?.sfx(n, o);
  const pop = (text, at, kind) => street.pop(text, at || (() => me()), kind);
  const busy = () => host.uiBusy?.() || false;
  const outdoorsOnFoot = () => host.isOutdoors() && !street.driving && !player.seat;
  const homeAt = () => host.home?.() || null;
  const atHome = () => { const h = homeAt(); return !!h && !host.isOutdoors() && Math.hypot(me().x - h.x, me().z - h.z) < 10; };
  // how far a point is from the nearest carriageway's centre line (roads run between the blocks)
  const roadInfo = (p) => {
    let best = null;
    for (let a = 0; a < N; a++) { const d = Math.abs(p.x - roadX(a)); if (!best || d < best.d) best = { d, axis: 'x', a }; }
    for (let b = 0; b < N; b++) { const d = Math.abs(p.z - roadZ(b)); if (d < best.d) best = { d, axis: 'z', b }; }
    return best;
  };

  // ---- the HUD: stamina bar, chase timer, phone toasts, a loss/gain banner
  const hud = document.createElement('div'); hud.id = 'city-survival';
  hud.innerHTML = `<div class="sv-stamina hidden"><i class="sv-sun"></i><div class="sv-bar"><b></b></div><em></em></div>
    <div class="sv-chase hidden"><i class="sv-alarm"></i><span></span><b></b></div>
    <div class="sv-phone hidden"><i class="sv-handset"></i><span></span></div>
    <div class="sv-banner hidden"></div>`;
  document.body.append(hud);
  const $ = (s) => hud.querySelector(s);
  let bannerT = 0, phoneT = 0;
  const banner = (text, kind) => { const b = $('.sv-banner'); b.textContent = text; b.className = `sv-banner ${kind}`; bannerT = 3.2; };
  const phone = (text) => { const p = $('.sv-phone'); p.querySelector('span').textContent = text; p.classList.remove('hidden'); p.classList.add('ring'); phoneT = 6; sfx('message'); setTimeout(() => p.classList.remove('ring'), 900); };

  // ---------------------------------------------------------------- the documents bag
  const bag = makeBriefcase(); scene.add(bag);
  let bagState = 'hand';   // 'hand' | 'taken' (on the thief's bike) | 'lost'
  let handBone;
  const findHand = () => {
    if (handBone !== undefined && handBone?.parent) return handBone;
    handBone = null;
    player.body?.object?.traverse((o) => { if (!handBone && o.isBone && /R[_ ]?Hand$/i.test(o.name)) handBone = o; });
    return handBone;
  };
  function updateBagInHand() {
    const show = bagState === 'hand' && host.isOutdoors() && !street.driving && !player.seat && player.root.visible;
    bag.visible = bagState === 'taken' ? bag.visible : show;
    if (!show || bagState !== 'hand') return;
    const h = findHand();
    if (!h) { bag.visible = false; return; }
    h.getWorldPosition(bag.position);
    bag.rotation.set(0, player.root.rotation.y + Math.PI / 2, 0);
  }

  // ---------------------------------------------------------------- the bag snatcher, on a motorbike
  let snatch = null;            // { group, rider, helmet, marker, phase: 'approach'|'flee'|'gone', ... }
  let snatchClock = 300 + Math.random() * 240;   // seconds of walking the streets before the first try
  function makeBikeWithRider() {
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    const paint = LIFE_MAT.paint.clone(); paint.color.set(pickOf(BIKE_PAINT));
    const pm = new THREE.Mesh(BIKE.paint, paint), rm = new THREE.Mesh(BIKE.rest, LIFE_MAT.vc); pm.castShadow = rm.castShadow = true; g.add(pm, rm);
    const rider = host.spawnPerson?.(`thief${Math.floor(Math.random() * 1e5)}`);
    if (rider) { g.add(rider.root); rider.root.position.copy(RIDER_AT); rider.root.rotation.set(0, Math.PI / 2, 0); rider.root.scale.setScalar(0.95); rider.seated = true; rider.play('sit'); }
    const helmet = new THREE.Mesh(HELMET, new THREE.MeshStandardMaterial({ color: pickOf(HELMETS), roughness: 0.25 })); helmet.castShadow = true; g.add(helmet);
    scene.add(g);
    return { group: g, rider, helmet, paint };
  }
  const headOf = (c) => { let b = null; c?.body?.object?.traverse((o) => { if (!b && o.isBone && /head$/i.test(o.name)) b = o; }); return b; };
  function startSnatch() {
    const p = me(), road = roadInfo(p);
    if (!road || road.d > 13 || road.d < 1) return false;
    // ride up the carriageway behind the CEO, in the lane on their side
    const along = road.axis === 'x' ? new V(0, 0, Math.random() < 0.5 ? 1 : -1) : new V(Math.random() < 0.5 ? 1 : -1, 0, 0);
    const centre = road.axis === 'x' ? new V(roadX(road.a), 0, p.z) : new V(p.x, 0, roadZ(road.b));
    const side = p.clone().sub(centre).setY(0); const lat = clamp(side.length(), 4.5, 7.2); side.normalize();
    const start = centre.clone().addScaledVector(side, lat).addScaledVector(along, -45);
    const s = { ...makeBikeWithRider(), phase: 'approach', along, side, lat, centre, speed: 8, revved: false, t: 0 };
    s.group.position.copy(start);
    s.heading = Math.atan2(-along.z, along.x);
    s.marker = makeMarker(); s.marker.visible = false; scene.add(s.marker);
    snatch = s;
    return true;
  }
  // the grid route the thief flees along: crossing to crossing, a turn now and then
  function nextCrossing(s) {
    const p = s.group.position, [dx, dz] = DIRS[s.dir];
    if (dx) { let a = 0; while (a < N && (dx > 0 ? roadX(a) <= p.x + 2 : roadX(N - 1 - a) >= p.x - 2)) a++; s.cross = new V(dx > 0 ? roadX(Math.min(a, N - 1)) : roadX(Math.max(N - 1 - a, 0)), 0, roadZ(s.lane)); }
    else { let b = 0; while (b < N && (dz > 0 ? roadZ(b) <= p.z + 2 : roadZ(N - 1 - b) >= p.z - 2)) b++; s.cross = new V(roadX(s.lane), 0, dz > 0 ? roadZ(Math.min(b, N - 1)) : roadZ(Math.max(N - 1 - b, 0))); }
  }
  function beginFlee(s) {
    s.phase = 'flee'; s.t = 0;
    const [dx] = [s.along.x];
    s.dir = dx > 0.5 ? 0 : dx < -0.5 ? 2 : s.along.z > 0 ? 1 : 3;
    const r = roadInfo(s.group.position);
    s.lane = r.axis === 'x' ? r.a : r.b;
    nextCrossing(s);
  }
  function turnAt(s) {
    // at a crossing: straight on mostly, else left or right; never back
    const opts = [s.dir, (s.dir + 1) % 4, (s.dir + 3) % 4].filter((d) => {
      const c = s.cross; const ia = Math.round((c.x - G.cx) / G.pitch + G.rings + 0.5), ib = Math.round((c.z - G.cz) / G.pitch + G.rings + 0.5);
      const na = ia + DIRS[d][0], nb = ib + DIRS[d][1];
      return na >= 0 && nb >= 0 && na < N && nb < N;
    });
    const d = Math.random() < 0.6 && opts.includes(s.dir) ? s.dir : pickOf(opts.length ? opts : [(s.dir + 2) % 4]);
    const c = s.cross;
    s.lane = DIRS[d][0] ? Math.round((c.z - G.cz) / G.pitch + G.rings + 0.5) : Math.round((c.x - G.cx) / G.pitch + G.rings + 0.5);
    s.dir = d; nextCrossing(s);
  }
  function endSnatch() {
    if (!snatch) return;
    snatch.rider && host.removePerson?.(snatch.rider);
    snatch.group.removeFromParent(); snatch.marker?.removeFromParent();
    snatch = null;
    $('.sv-chase').classList.add('hidden');
  }
  function updateSnatch(dt) {
    const s = snatch, p = s.group.position;
    s.t += dt;
    if (s.helmet && s.rider) { const hb = s.head?.parent ? s.head : (s.head = headOf(s.rider)); if (hb) { hb.getWorldPosition(s.helmet.position); s.group.worldToLocal(s.helmet.position); s.helmet.position.y += 0.1; } }
    if (s.phase === 'approach') {
      // aim at the CEO's line, swerving close at the last moment
      const d = me().clone().sub(p).setY(0), ahead = d.dot(s.along);
      if (!s.revved && d.length() < 16) { s.revved = true; sfx('horn'); host.audio?.loop('engine', { speed: 14, throttle: 1, level: 0.7 }); setTimeout(() => { if (!street.driving) host.audio?.loop('engine', null); }, 2200); }
      // the curb by the CEO, a little ahead of them (it never rides up onto the sidewalk)
      const curb = (q) => { const c = q.clone(), off = c.clone().sub(s.centre).dot(s.side); return c.addScaledVector(s.side, clamp(off, 4.5, 7.4) - off); };
      const aim = ahead > 2 ? curb(me().clone().addScaledVector(s.along, 1.5)) : curb(p.clone().addScaledVector(s.along, 6));
      const want = Math.atan2(-(aim.z - p.z), aim.x - p.x);
      s.heading += clamp(wrap(want - s.heading), -2.2 * dt, 2.2 * dt);
      s.speed = Math.min(11, s.speed + 3 * dt);
      p.x += Math.cos(s.heading) * s.speed * dt; p.z -= Math.sin(s.heading) * s.speed * dt;
      s.group.rotation.set(0, s.heading, clamp(wrap(want - s.heading), -0.4, 0.4) * 0.6);
      const lateral = Math.abs(d.dot(s.side)), passing = s.prevAhead > 0 && ahead <= 0.6;
      s.prevAhead = ahead;
      // within arm's reach as it passes (frames can step over the closest point); keeping away from the curb is the counter
      if ((d.length() < 2.2 || (passing && lateral < 2.6)) && bagState === 'hand' && outdoorsOnFoot()) {
        // the grab: the bag goes to the rider; the vault decides what's lost
        bagState = 'taken'; bag.visible = true; s.group.add(bag); bag.position.set(-0.3, 0.75, -0.32); bag.rotation.set(0, 0, 0);
        sfx('bump_person'); pop(pickOf([t('Á! Cái cặp của tôi!'), t('Giật túi! Đứng lại!'), t('Cướp! Cướp!')]));
        host.callPy('cityTheft', 'bag');
        s.marker.visible = true; s.deadline = performance.now() / 1000 + WINDOW;
        beginFlee(s);
      } else if (ahead < -8 || s.t > 25) { s.phase = 'gone'; }   // passed by: nothing this time
      return;
    }
    if (s.phase === 'flee') {
      // along the lanes, a touch faster than running; slowed by the traffic ahead
      const [dx, dz] = DIRS[s.dir], fwd = new V(dx, 0, dz), right = new V(-dz, 0, dx);
      if (Math.abs((s.cross.x - p.x) * dx + (s.cross.z - p.z) * dz) < 3) turnAt(s);
      // into its lane quickly, then along it toward the next crossing
      const lane = s.cross.clone().addScaledVector(right, 5.5), toX = lane.clone().sub(p).dot(fwd);
      const aim = lane.addScaledVector(fwd, -toX + Math.min(Math.max(toX - 2, 0), 9));
      const want = Math.atan2(-(aim.z - p.z), aim.x - p.x);
      s.heading += clamp(wrap(want - s.heading), -2.6 * dt, 2.6 * dt);
      let goal = 6.4;
      for (const c of street.cars || []) { const rel = c.group.position.clone().sub(p); const a = rel.dot(fwd); if (a > 0 && a < 8 && Math.abs(rel.dot(right)) < 2.5) goal = 3.2; }
      s.speed += clamp(goal - s.speed, -8 * dt, 3 * dt);
      p.x += Math.cos(s.heading) * s.speed * dt; p.z -= Math.sin(s.heading) * s.speed * dt;
      s.group.rotation.set(0, s.heading, clamp(wrap(want - s.heading), -0.5, 0.5) * 0.7);
      const left = s.deadline - performance.now() / 1000, dist = me().distanceTo(p);
      const ch = $('.sv-chase'); ch.classList.remove('hidden');
      ch.querySelector('span').textContent = t('Đuổi theo kẻ giật túi! {d} m', { d: Math.round(dist) });
      ch.querySelector('b').textContent = `${Math.floor(Math.max(0, left) / 60)}:${String(Math.floor(Math.max(0, left) % 60)).padStart(2, '0')}`;
      if (dist > 5 || s.t > 2.5) s.armed = true;   // the grab itself isn't a catch: they have to get away first
      if (s.armed && dist < 2.3 && bagState === 'taken') {   // caught (on foot or at the wheel)
        host.callPy('cityRecover', 'bag');
        pop(pickOf([t('Trả lại đây!'), t('Bắt được rồi nhé!')]));
        s.phase = 'gone'; s.speed = 12; s.marker.visible = false;
      } else if (left <= 0 || dist > 260) {
        if (bagState === 'taken') { bagState = 'lost'; banner(t('Kẻ gian đã thoát cùng túi tài liệu.'), 'loss'); sfx('error'); setTimeout(() => { if (bagState === 'lost') { bagState = 'hand'; scene.add(bag); } }, 600e3); }
        s.phase = 'gone'; s.marker.visible = false;
      }
      return;
    }
    // gone: off it rides, then away
    p.x += Math.cos(s.heading) * 12 * dt; p.z -= Math.sin(s.heading) * 12 * dt; s.t += dt;
    if (s.t > 6 || p.distanceTo(me()) > 120) endSnatch();
  }

  // ---------------------------------------------------------------- the pickpocket
  let pick = null;              // { c, phase: 'come'|'linger'|'flee'|'leave', t, marker }
  let pickClock = 420 + Math.random() * 300;
  const people = () => scene.children.filter((o) => o.userData?.character && o.visible && o !== player.root);
  function crowded() {
    const p = me();
    let n = 0;
    for (const o of people()) if (o.position.distanceToSquared(p) < 64) n++;
    if (n >= 3) return true;
    return (life.crowds || []).some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 18);
  }
  function startPick() {
    const c = host.spawnPerson?.(`pick${Math.floor(Math.random() * 1e5)}`);
    if (!c) return false;
    // appear out of sight behind the CEO, then close in
    const back = new V(-Math.sin(player.root.rotation.y), 0, -Math.cos(player.root.rotation.y));
    const at = me().clone().addScaledVector(back, 14).add(new V((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
    host.collide?.(at, 0.4);
    c.placeAt(at); c.root.visible = true;
    pick = { c, phase: 'come', t: 0 };
    return true;
  }
  function endPick() {
    if (!pick) return;
    pick.marker?.removeFromParent();
    host.removePerson?.(pick.c);
    pick = null;
  }
  function stepTo(c, target, speed, dt) {
    const p = c.root.position, d = target.clone().sub(p).setY(0), L = d.length();
    if (L > 0.05) { p.addScaledVector(d.normalize(), Math.min(L, speed * dt)); host.collide?.(p, 0.3); c.lookToward(target, clamp(dt * 8, 0, 1)); }
    c.target = null; c.play(speed > 3 ? 'run' : 'walk');
    return L;
  }
  function updatePick(dt) {
    const s = pick, c = s.c, p = c.root.position;
    s.t += dt;
    const back = new V(-Math.sin(player.root.rotation.y), 0, -Math.cos(player.root.rotation.y));
    const behind = me().clone().addScaledVector(back, 1.1);
    if (s.phase === 'come') {
      if (stepTo(c, behind, 1.9, dt) < 0.6) {   // the telegraph: the CEO feels someone too close behind
        s.phase = 'linger'; s.t = 0; sfx('step');
        pop(pickOf([t('Hình như có ai đứng sát sau lưng…'), t('Ai đứng sát quá vậy?')]));
      }
      if (s.t > 30 || !outdoorsOnFoot()) s.phase = 'leave';
    } else if (s.phase === 'linger') {
      // too close for comfort, for a few seconds: walking away (out of reach) spoils it
      stepTo(c, behind, 2.4, dt);
      if (p.distanceTo(me()) > 3.4) { s.phase = 'leave'; s.t = 0; return; }
      if (s.t > 3.5) {
        host.callPy('cityTheft', 'coins');
        sfx('bump_person');
        s.phase = 'flee'; s.t = 0; s.deadline = performance.now() / 1000 + WINDOW;
        s.marker = makeMarker(); scene.add(s.marker);
        s.away = p.clone().sub(me()).setY(0).normalize().multiplyScalar(60).add(p);
      }
    } else if (s.phase === 'flee') {
      // off through the crowd at a brisk walk: bump into them to get it back
      stepTo(c, s.away, 3.1, dt);
      if (s.marker) { s.marker.position.set(p.x, 2.3 + Math.sin(s.t * 4) * 0.08, p.z); s.marker.userData.ring.rotation.z += dt * 3; }
      if (p.distanceTo(me()) > 2.5) s.armed = true;
      if (s.armed && outdoorsOnFoot() && p.distanceTo(me()) < 0.95 && s.taken) { host.callPy('cityRecover', 'coins'); pop(pickOf([t('Trả tiền đây!'), t('Đứng lại! Tiền của tôi!')])); s.phase = 'leave'; s.t = 0; s.marker?.removeFromParent(); s.marker = null; }
      if (performance.now() / 1000 > s.deadline || p.distanceTo(me()) > 90) { s.phase = 'leave'; s.t = 0; }
    } else {
      stepTo(c, p.clone().add(p.clone().sub(me()).setY(0).normalize().multiplyScalar(5)), 2.2, dt);
      if (s.t > 6) endPick();
    }
  }

  // ---------------------------------------------------------------- the company's dog
  const dog = makeDog(); scene.add(dog.root);
  const pet = { state: 'follow', pos: dog.root.position, heading: 0, phase: 0, speed: 0, sit: 0, wanderClock: 40 + Math.random() * 40, target: null, sniff: 0, lastSeen: null, honkT: 0 };
  street.addRoadUsers?.(() => (dog.root.visible ? [{ pos: pet.pos, r: 0.35 }] : []));
  {
    const h = homeAt();
    if (h) pet.pos.set(h.x - 2.2, 0.2, h.z + 1.6);
  }
  function petMove(target, speed, dt) {
    const d = target.clone().sub(pet.pos).setY(0), L = d.length();
    if (L > 0.1) {
      const want = Math.atan2(d.x, d.z);
      pet.heading += clamp(wrap(want - pet.heading), -5 * dt, 5 * dt);
      const step = Math.min(L, speed * dt);
      pet.pos.x += Math.sin(pet.heading) * step; pet.pos.z += Math.cos(pet.heading) * step;
      host.collide?.(pet.pos, 0.25);
      pet.speed = speed;
    } else pet.speed = 0;
    return L;
  }
  function animateDog(dt) {
    const moving = pet.speed > 0.05;
    pet.sit += ((moving ? 0 : pet.state === 'lost' || pet.state === 'home' || pet.state === 'wait' || pet.sniff <= 0 ? 1 : 0) - pet.sit) * clamp(dt * 4, 0, 1);
    pet.phase += dt * (moving ? 4 + pet.speed * 2.2 : 0);
    const amp = moving ? clamp(0.35 + pet.speed * 0.08, 0.35, 0.8) : 0;
    for (const L of dog.legs) {
      // a trot: diagonal pairs together
      const off = (L.front === (L.side > 0)) ? 0 : Math.PI;
      const s = Math.sin(pet.phase + off) * amp;
      let hip = s, knee = Math.max(0, -Math.sin(pet.phase + off)) * amp * 0.9;
      // sitting: the haunches drop with the tilted body, thighs forward, the hocks folded back flat to the ground
      if (!L.front) { hip = hip * (1 - pet.sit) + -1.3 * pet.sit; knee = knee * (1 - pet.sit) + 2.4 * pet.sit; L.hip.position.y = 0.34 - 0.19 * pet.sit; }
      L.hip.rotation.x = hip; L.knee.rotation.x = knee;
    }
    dog.body.rotation.x = -0.42 * pet.sit;
    dog.body.position.y = 0.36 - 0.09 * pet.sit + (moving ? Math.abs(Math.sin(pet.phase)) * 0.015 : 0);
    dog.neck.rotation.x = 0.3 * pet.sit - (pet.sniff > 0 ? 0.55 : 0);
    dog.tail.rotation.y = Math.sin(performance.now() / (moving ? 120 : 90)) * (pet.state === 'lost' ? 0.15 : 0.5);
    dog.root.position.y = pet.pos.y;
    dog.root.rotation.y = pet.heading;
    // the head turns toward the CEO when they're near
    const d = me().clone().sub(pet.pos);
    dog.head.rotation.y = pet.speed < 0.1 && d.length() < 6 ? clamp(wrap(Math.atan2(d.x, d.z) - pet.heading), -0.7, 0.7) : 0;
  }
  function updateDog(dt) {
    const out = host.isOutdoors(), driving = street.driving, h = homeAt();
    pet.honkT -= dt;
    if (atHome() && h) {   // home: it waits inside, by the sofa
      if (pet.state !== 'home') { pet.state = 'home'; pet.pos.set(h.x - 2.2, 0.2, h.z + 1.8); pet.heading = 0; }
      dog.root.visible = true; pet.speed = 0; animateDog(dt); return;
    }
    if (driving) { dog.root.visible = false; if (pet.state !== 'lost') pet.state = 'car'; return; }
    if (!out) {   // in an office: it waits at the door, outside
      if (pet.state === 'follow' || pet.state === 'wander') pet.state = 'wait';
      pet.speed = 0; animateDog(dt); return;
    }
    dog.root.visible = true;
    if (pet.state === 'car' || pet.state === 'home' || pet.state === 'wait') {   // out again: back at the CEO's heels
      if (pet.state !== 'wait' || pet.pos.distanceTo(me()) > 25) { pet.pos.copy(me()).add(new V(0.8, 0, 0.8)); pet.pos.y = 0; host.collide?.(pet.pos, 0.3); }
      pet.pos.y = 0; pet.state = 'follow';
    }
    const dist = pet.pos.distanceTo(me());
    if (pet.state === 'lost') {
      pet.speed = 0;
      if (dist < 3) {}   // waits for F
      animateDog(dt); return;
    }
    if (dist > 25 && pet.state === 'wander') {
      pet.state = 'lost'; pet.lastSeen = pet.pos.clone();
      banner(t('{pet} đi lạc rồi! Xem bản đồ để tìm.', { pet: PET }), 'warn'); sfx('error');
      animateDog(dt); return;
    }
    if (pet.state === 'follow') {
      const back = new V(-Math.sin(player.root.rotation.y), 0, -Math.cos(player.root.rotation.y)), side = new V(back.z, 0, -back.x);
      const spot = me().clone().addScaledVector(back, 1.3).addScaledVector(side, 0.7);
      const L = spot.distanceTo(pet.pos);
      if (L > 1.0) petMove(spot, L > 4 ? 5.8 : 1.6 + L * 0.4, dt); else pet.speed = 0;
      if (dist > 30) { pet.pos.copy(spot); }   // left far behind (a lift, a ride): it catches up
      if (!busy() && outdoorsOnFoot() && (pet.wanderClock -= dt) <= 0) {
        // curious: a stall nearby, or something across the road
        pet.wanderClock = 35 + Math.random() * 50;
        const crowds = (life.crowds || []).filter((c) => Math.hypot(c.x - me().x, c.z - me().z) < 32);
        if (crowds.length && Math.random() < 0.55) pet.target = pickOf(crowds).clone().add(new V((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
        else {
          const r = roadInfo(pet.pos);
          pet.target = r ? (r.axis === 'x' ? new V(roadX(r.a) + (Math.random() - 0.5) * 6, 0, pet.pos.z + (Math.random() - 0.5) * 14) : new V(pet.pos.x + (Math.random() - 0.5) * 14, 0, roadZ(r.b) + (Math.random() - 0.5) * 6)) : null;
        }
        if (pet.target) { pet.state = 'wander'; pet.sniff = 0; }
      }
    } else if (pet.state === 'wander') {
      if (pet.sniff > 0) { pet.sniff -= dt; pet.speed = 0; if (pet.sniff <= 0) pet.state = 'follow'; }
      else if (petMove(pet.target, 2.6, dt) < 0.6) pet.sniff = 3 + Math.random() * 3;
    }
    // in the road with traffic near: horns
    const r = roadInfo(pet.pos);
    if (r && r.d < 7.5 && pet.honkT <= 0) {
      for (const c of street.cars || []) if (c.group.position.distanceTo(pet.pos) < 8 && Math.abs(c.speed || 0) > 1) {
        sfx('horn'); pet.honkT = 4;
        pop(pickOf([t('Chó của ai đây trời!'), t('Coi chừng con chó!'), t('Giữ chó lại chứ!')]), () => c.group.position, 'them');
        break;
      }
    }
    animateDog(dt);
  }

  // ---------------------------------------------------------------- stamina under the sun
  const st = { v: 100, zero: 0, stagger: 0, last: null, warned: false, faint: 0 };
  function updateStamina(dt) {
    const p = me(), moved = st.last ? Math.hypot(p.x - st.last.x, p.z - st.last.z) / Math.max(dt, 1e-3) : 0;
    st.last = (st.last || new V()).copy(p);
    const out = host.isOutdoors() && !street.driving, el = $('.sv-stamina');
    const hour = new Date().getHours(), noon = hour >= 11 && hour < 15 ? 1.5 : 1;
    let rate;
    if (street.driving) rate = 0;
    else if (!host.isOutdoors()) rate = 0.8;                                   // resting indoors
    else if (player.seat) rate = player.eating ? 6 : 2.5;                      // sitting down, eating and drinking
    else if (moved > 3.8) rate = -0.2 * noon;                                  // running
    else if (moved > 0.4) rate = -0.05 * noon;                                 // walking
    else rate = 0.12;                                                          // standing in the shade of a moment
    st.v = clamp(st.v + rate * dt, 0, 100);
    el.classList.toggle('hidden', !out || busy());
    el.querySelector('b').style.width = `${st.v}%`;
    el.querySelector('em').textContent = Math.round(st.v);
    el.classList.toggle('low', st.v < 25);
    if (st.v < 25 && !st.warned && out) { st.warned = true; pop(t('Nắng quá… ghé quán uống gì đi sếp.')); }
    if (st.v > 40) st.warned = false;
    // exhausted from zero until it's back to 15: pushing on staggers (the keys drop every second or so), and 20 s of
    // pushing on faints; standing still or sitting down brings it back
    if (st.v <= 0) st.exhausted = true; else if (st.v >= 15) st.exhausted = false;
    if (st.exhausted && out && !player.seat && moved > 0.4) {
      st.v = 0; st.zero += dt; st.stagger -= dt;
      if (st.stagger <= 0) { st.stagger = 1.1 + Math.random() * 0.6; player.keys.clear(); if (Math.random() < 0.4) pop(pickOf([t('Chóng mặt quá…'), t('Mệt quá rồi…')])); }
      if (st.zero > 20) faint();
    } else if (!st.exhausted) st.zero = 0;
  }
  function faint() {
    st.zero = 0;
    const h = homeAt(), fade = document.createElement('div'); fade.className = 'sv-faint'; document.body.append(fade);
    sfx('drop');
    setTimeout(() => {
      if (h) { player.root.position.set(h.x - 2.8, 0.2, h.z + 1.6); player.floorBase = 0; player.camReady = false; }
      st.v = 60; st.exhausted = false; bagState = bagState === 'lost' ? 'lost' : 'hand';
      fade.classList.add('out');
      setTimeout(() => { fade.remove(); banner(t('Sếp bị say nắng, được đưa về nhà nghỉ.'), 'warn'); }, 1200);
    }, 1400);
  }

  // ---------------------------------------------------------------- the office without its CEO
  const waitingSince = new Map(), lastRing = new Map(), ringing = new Set();
  let officeT = 0;
  function updateOffice(dt) {
    if ((officeT -= dt) > 0) return;
    officeT = 1;
    const now = performance.now() / 1000;
    for (const c of host.companies?.() || []) {
      const inside = c.here && !host.isOutdoors() && !atHome();   // in that company's office: they'll see it there
      if (!c.waiting || inside) { waitingSince.delete(c.name); ringing.delete(c.name); continue; }
      if (!waitingSince.has(c.name)) waitingSince.set(c.name, now);
      if (now - waitingSince.get(c.name) > 60 && now - (lastRing.get(c.name) || -1e9) > 180 && !busy()) {
        lastRing.set(c.name, now); ringing.add(c.name);
        phone(t('{company} có {n} việc chờ sếp duyệt', { company: c.name, n: c.waiting }));
      }
    }
  }

  // ---------------------------------------------------------------- theft results from the app
  host.on('city_theft', (msg) => {
    if (msg.kind === 'bag') {
      if (msg.recovered) {
        if (msg.ok) { bagState = 'hand'; scene.add(bag); banner(t('Lấy lại được túi tài liệu!'), 'gain'); sfx('coin'); }
      } else if (msg.ok) {
        banner(msg.missions ? t('Mất túi tài liệu! {n} phần thưởng nhiệm vụ ở trong đó.', { n: msg.missions }) : t('Mất túi tài liệu!'), 'loss'); sfx('error');
      } else if (snatch && bagState === 'taken') {   // the app says not now: the rider fumbles it
        bagState = 'hand'; scene.add(bag); pop(t('Hụt! Hắn đánh rơi cái cặp.')); if (snatch) { snatch.marker.visible = false; snatch.phase = 'gone'; }
      }
      return;
    }
    if (msg.kind === 'coins') {
      if (msg.recovered) { if (msg.ok) { banner(t('+{n} coin lấy lại được!', { n: msg.amount }), 'gain'); sfx('coin'); } return; }
      if (msg.ok) { if (pick) pick.taken = true; banner(t('−{n} coin! Bị móc túi rồi!', { n: msg.amount }), 'loss'); sfx('error'); }
      else if (pick) { pop(t('Hừ, túi rỗng…'), () => pick?.c.root.position, 'them'); pick.phase = 'leave'; pick.t = 0; pick.marker?.removeFromParent(); pick.marker = null; }
    }
  });

  const api = {
    update(dt) {
      updateBagInHand();
      updateDog(dt);
      updateStamina(dt);
      updateOffice(dt);
      // trouble, rarely: only out on foot, never while a panel is open
      const free = outdoorsOnFoot() && !busy();
      if (free && !snatch && bagState === 'hand') { snatchClock -= dt; if (snatchClock <= 0) { snatchClock = startSnatch() ? 600 + Math.random() * 360 : 20; } }
      if (free && !pick) { pickClock -= dt; if (pickClock <= 0) { pickClock = crowded() && startPick() ? 600 + Math.random() * 420 : 15; } }
      if (snatch) {
        updateSnatch(dt);
        if (snatch?.marker?.visible) { const p = snatch.group.position; snatch.marker.position.set(p.x, 2.6 + Math.sin(performance.now() / 250) * 0.1, p.z); snatch.marker.userData.ring.rotation.z += dt * 3; }
      }
      if (pick) updatePick(dt);
      if ((bannerT -= dt) <= 0) $('.sv-banner').classList.add('hidden'); else $('.sv-banner').classList.remove('hidden');
      if ((phoneT -= dt) <= 0) $('.sv-phone').classList.add('hidden');
      if (!snatch || snatch.phase !== 'flee') $('.sv-chase').classList.add('hidden');
    },
    key(e) {
      if (e.code === 'KeyF' && !e.repeat && pet.state === 'lost' && pet.pos.distanceTo(me()) < 3 && outdoorsOnFoot()) {
        pet.state = 'follow'; pet.lastSeen = null; pet.wanderClock = 60;
        pop(t('{pet} ơi, về đây!', { pet: PET })); sfx('coin');
        return true;
      }
      return false;
    },
    hint() { return pet.state === 'lost' && pet.pos.distanceTo(me()) < 3 && outdoorsOnFoot() ? t('Gọi <b>{pet}</b> về', { pet: PET }) : ''; },
    // for the minimap and the compass: the lost dog's last-seen spot, a fleeing thief
    markers() {
      const out = [];
      if (pet.state === 'lost' && pet.lastSeen) out.push({ kind: 'pet', x: pet.lastSeen.x, z: pet.lastSeen.z, name: PET });
      if (snatch?.phase === 'flee') out.push({ kind: 'thief', x: snatch.group.position.x, z: snatch.group.position.z });
      if (pick?.phase === 'flee' && pick.taken) out.push({ kind: 'thief', x: pick.c.root.position.x, z: pick.c.root.position.z });
      return out;
    },
    // the companies whose approvals have been waiting on the CEO (their minimap pins pulse)
    alerts() { return [...ringing]; },
  };
  return api;
}
