// The city's daily quests: chests to find on the streets and in the parks, and the day's missions
// (written each day in the project's repository; see agentorch/inventory.py). Rewards go to the
// company's inventory (Tab › Kho đồ) and are rolled by the app, not here: the page only learns a
// mission's rarity until it is done. This module places today's chests and the marked place of a
// "visit" mission, notices what the CEO does and reports it, and shows what came out.
//
// createCityQuests({ scene, city, call, player, isOutdoors }) → {
//   onState(msg), onReward(msg), near (chest within reach, or null), open(), update(dt), report(r), hint (text or '') }

import * as THREE from 'three';
import { t } from '/i18n.js';
import { itemCanvas } from './itemview.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const REACH = 2.2;

// A column of light rising from the ground: bright at the foot, fading out as it climbs, faint bands
// drifting up it. Shared shapes; each chest has its own material (its own time and colour).
// Tall enough to stand over the trees and low roofs, so a chest can be spotted from blocks away.
const BEAM_H = 38;
const BEAM_GEO = new THREE.CylinderGeometry(0.75, 0.95, BEAM_H, 32, 1, true).translate(0, BEAM_H / 2, 0);
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float up = vUv.y;                                            // 0 at the ground, 1 at the top
        float fade = mix(1.0, 0.25, up) * smoothstep(1.0, 0.85, up);  // still strong high up, soft at the very top
        float bands = 0.65 + 0.35 * sin((up * 40.0 - uTime * 2.2) * 6.2832);
        float edge = 0.7 + 0.3 * sin(vUv.x * 6.2832 * 3.0 + uTime * 0.7);
        // normal blending, not additive: an additive glow vanishes against a daytime sky and white walls
        gl_FragColor = vec4(min(uColor * (1.15 + 0.35 * bands), vec3(1.0)), fade * (0.6 + 0.2 * bands) * edge);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
// a soft glow pool on the ground at the foot of the beam
const POOL_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const SPARK_N = 24;

function chestMesh(color = '#ffd77a') {
  const g = new THREE.Group();
  // the light: a pool on the ground, the column, sparks rising inside it
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: POOL_TEX, color, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.13; g.add(pool);   // over the paving slabs
  const beamMat = beamMaterial(color);
  const beam = new THREE.Mesh(BEAM_GEO, beamMat); g.add(beam);
  const sparkGeo = new THREE.BufferGeometry(), sp = new Float32Array(SPARK_N * 3), seeds = [];
  for (let k = 0; k < SPARK_N; k++) seeds.push([Math.random() * 6.283, 0.15 + Math.random() * 0.6, Math.random(), 0.6 + Math.random() * 0.8]);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color, size: 0.09, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(sparks);
  // the chest, floating in the light
  const chest = new THREE.Group(); chest.position.y = 1.1; chest.scale.setScalar(1.35); g.add(chest);
  const wood = new THREE.MeshStandardMaterial({ color: '#5a3b22', roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: '#d9a640', roughness: 0.3, metalness: 0.85, emissive: '#3a2600', emissiveIntensity: 0.4 });
  const box = (m, w, h, d, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; chest.add(o); return o; };
  box(wood, 0.9, 0.5, 0.6, 0, 0, 0);
  const lid = new THREE.Group(); lid.position.set(0, 0.25, -0.3); chest.add(lid);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16, 1, false, 0, Math.PI), wood);
  top.rotation.z = Math.PI / 2; top.position.set(0, 0, 0.3); top.castShadow = true; lid.add(top);
  for (const x of [-0.4, 0.4]) box(trim, 0.06, 0.52, 0.62, x, 0.01, 0);
  box(trim, 0.92, 0.06, 0.62, 0, 0.25, 0);
  box(trim, 0.14, 0.16, 0.04, 0, 0.17, 0.31);
  const glow = new THREE.PointLight(color, 3, 6, 2); glow.position.y = 1.1; g.add(glow);
  g.userData = { lid, beam, beamMat, trim, chest, sparks, seeds, pool, glow };
  return g;
}

// the light breathing, the chest bobbing and turning, sparks rising up the column
function animateChest(m, t, i) {
  const u = m.userData;
  u.beamMat.uniforms.uTime.value = t + i;
  u.pool.material.opacity = 0.65 + 0.2 * Math.sin(t * 2.4 + i);
  u.glow.intensity = 2.4 + 0.8 * Math.sin(t * 2.4 + i);
  u.chest.position.y = 1.1 + Math.sin(t * 1.6 + i) * 0.12;
  u.chest.rotation.y = t * 0.6 + i;
  u.chest.rotation.z = Math.sin(t * 1.1 + i) * 0.05;
  u.trim.emissiveIntensity = 0.35 + 0.3 * Math.sin(t * 4 + i);
  const pos = u.sparks.geometry.attributes.position;
  u.seeds.forEach(([a, r, ph, sp], k) => {
    const h = ((t * sp * 0.35 + ph) % 1);
    pos.setXYZ(k, Math.cos(a + t * 0.8) * r, h * 4.5, Math.sin(a + t * 0.8) * r);
  });
  pos.needsUpdate = true;
}

function markMesh() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, BEAM_H, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: '#3fb8f0', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = BEAM_H / 2; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40),
    new THREE.MeshBasicMaterial({ color: '#5fd0ff', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.13; g.add(ring);
  g.userData = { beam, ring };
  return g;
}

export function createCityQuests({ scene, city, call, player, isOutdoors, track = () => {}, audio = null, usable = null }) {
  const group = new THREE.Group();
  scene.add(group);
  const chests = new Map();   // index → mesh
  const marks = new Map();    // visit mission id → mesh
  let state = null, near = null, sinceReport = 0, inFlight = 0, shownWalk = 0, last = null, parksSeen = new Set(), time = 0, clockShown = '';

  // ---- the tracker, top right, while outdoors: today's missions, the reward's rarity only, time left
  const tracker = document.createElement('div');
  tracker.id = 'city-tracker';
  tracker.className = 'hidden';
  document.body.append(tracker);
  const RARITY_NAME = { common: t('Thường'), rare: t('Hiếm'), epic: t('Sử thi'), legendary: t('Huyền thoại') };
  const left = () => {
    const s = Math.max(0, Math.round(state.ends_at - Date.now() / 1000));
    return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
  };
  function renderTracker() {
    if (!state) return;
    clockShown = left();
    const chestsLeft = state.count - state.opened.length;
    // walking: what the app has counted plus the metres walked since the last report, so the bar moves as you go
    const have = (q) => (q.goal === 'walk' && !q.done ? Math.min(q.target, q.progress + Math.floor(inFlight + sinceReport)) : q.progress);
    shownWalk = Math.floor(sinceReport);
    tracker.innerHTML = `<div class="ct-head"><small>${t('Nhiệm vụ hôm nay')}</small><b class="ct-clock" title="${t('Hết ngày, nhiệm vụ chưa xong sẽ mất phần thưởng')}">${t('Còn {time}', { time: clockShown })}</b></div>
      ${state.quests.map((q) => `<div class="ct-task r-${q.rarity}${q.done ? ' done' : ''}${detailId === q.id ? ' on' : ''}" data-q="${esc(q.id)}">
        <div class="ct-top"><span>${esc(q.name)}</span><em class="ct-gift">${q.claimed ? '✓' : RARITY_NAME[q.rarity]}</em></div>
        <div class="ct-bar"><i style="width:${Math.min(100, have(q) / q.target * 100)}%"></i></div>
        <small>${q.claimed ? t('Đã nhận') : q.done ? t('Đang xác nhận…') : q.goal === 'walk' ? t('{n} / {target} m', { n: have(q), target: q.target }) : `${q.progress}/${q.target}`}</small></div>`).join('')}
      <div class="ct-row"><span class="ct-chest"></span>${t('Rương còn lại trên phố')}<em>${chestsLeft}/${state.count}</em></div>
      ${state.pending ? `<div class="ct-pending">${t('{n} phần thưởng đang chờ xác nhận', { n: state.pending })}</div>` : ''}`;
    tracker.querySelectorAll('[data-q]').forEach((el) => { el.onclick = () => showDetail(el.dataset.q); });
    chestIcon ||= itemCanvas({ kind: 'chest', id: 'chest' }, { spin: true });   // a little chest turning, kept across redraws
    tracker.querySelector('.ct-chest')?.append(chestIcon);
    if (detailId) showDetail(detailId, true);
  }

  // ---- a short note at the top of the screen
  const note = document.createElement('div');
  note.id = 'city-note';
  note.className = 'hidden';
  document.body.append(note);
  let noteTimer = 0;
  function onHint(text) {
    note.textContent = text;
    note.classList.remove('hidden');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => note.classList.add('hidden'), 4000);
  }

  // ---- a mission's details, opened by clicking it in the tracker
  const detail = document.createElement('div');
  detail.id = 'quest-detail'; detail.className = 'hidden';
  document.body.append(detail);
  let detailId = null, chestIcon = null;
  const HOW = {
    walk: t('Đi bộ hoặc chạy ngoài phố, ra khỏi tòa nhà. Lái xe không tính.'),
    parks: t('Ghé các công viên khác nhau trong thành phố (bãi cỏ xanh giữa các khối nhà). Mỗi công viên tính một lần trong ngày.'),
    chests: t('Tìm rương dưới cột sáng vàng trên phố và mở ra (F hoặc bấm vào rương).'),
    reception: t('Hỏi lễ tân ở sảnh tầng G (F ở quầy lễ tân). Mỗi câu hỏi tính một lần.'),
    lift: t('Đi thang máy giữa các tầng (E trong thang máy).'),
    visit: t('Đi tới cột sáng xanh trên phố.'),
  };
  const RAR = () => ({ common: t('Thường'), rare: t('Hiếm'), epic: t('Sử thi'), legendary: t('Huyền thoại') });
  function showDetail(id, refresh = false) {
    const q = state?.quests.find((x) => x.id === id);
    if (!q || (!refresh && detailId === id && !detail.classList.contains('hidden'))) { detailId = null; detail.classList.add('hidden'); renderTrackerSoon(); return; }
    detailId = id;
    const have = q.goal === 'walk' && !q.done ? Math.min(q.target, q.progress + Math.floor(inFlight + sinceReport)) : q.progress;
    let where = '';
    if (q.goal === 'visit' && !q.done && marks.has(q.id)) {
      const m = marks.get(q.id).position, p = player.root.position, d = Math.round(Math.hypot(m.x - p.x, m.z - p.z));
      const ang = Math.atan2(m.x - p.x, m.z - p.z), dirs = [t('phía nam'), t('phía đông nam'), t('phía đông'), t('phía đông bắc'), t('phía bắc'), t('phía tây bắc'), t('phía tây'), t('phía tây nam')];
      where = `<div class="qd-where">${t('Cách bạn khoảng {m} m, về {dir}.', { m: d, dir: dirs[(Math.round(ang / (Math.PI / 4)) + 8) % 8] })}</div>`;
    }
    detail.className = `r-${q.rarity}`;
    detail.innerHTML = `<button class="qd-close" title="${t('Đóng')}">×</button>
      <small class="qd-kind">${t('Nhiệm vụ hôm nay')}</small>
      <h3>${esc(q.name)}</h3>
      ${q.story ? `<p class="qd-story">“${esc(q.story)}”</p>` : ''}
      <div class="qd-label">${t('Cách làm')}</div><p>${HOW[q.goal] || ''}</p>${where}
      <div class="qd-label">${t('Tiến độ')}</div>
      <div class="qd-bar"><i style="width:${Math.min(100, have / q.target * 100)}%"></i></div>
      <div class="qd-row"><span>${q.goal === 'walk' ? `${have} / ${q.target} m` : `${have} / ${q.target}`}</span>
        <em>${q.claimed ? t('Đã nhận thưởng') : q.done ? t('Đang xác nhận…') : t('Còn {time}', { time: left() })}</em></div>
      <div class="qd-label">${t('Phần thưởng')}</div>
      <div class="qd-reward"><span class="qd-rar">${RAR()[q.rarity] || q.rarity}</span>${t('Một món ngẫu nhiên từ bậc này trở lên, tung lúc hoàn thành. Hết ngày chưa xong là mất.')}</div>`;
    detail.querySelector('.qd-close').onclick = () => showDetail(id);
    renderTrackerSoon();
  }
  let rtT = 0;
  const renderTrackerSoon = () => { clearTimeout(rtT); rtT = setTimeout(() => { tracker.querySelectorAll('[data-q]').forEach((el) => el.classList.toggle('on', el.dataset.q === detailId)); }, 0); };
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && detailId) { detailId = null; detail.classList.add('hidden'); renderTrackerSoon(); } });

  // ---- the reward card: flips over in the colour of its rarity
  const card = document.createElement('div');
  card.id = 'reward-card';
  card.className = 'hidden';
  document.body.append(card);
  let cardTimer = 0;
  function showCard(item, title, { mission = false, n = 1, of = 1 } = {}) {
    card.className = `r-${item.rarity}${mission ? ' mission' : ''}`;
    card.innerHTML = `<div class="rc-inner"><div class="rc-back"></div><div class="rc-front">
      ${mission ? `<span class="rc-ribbon">${t('NHIỆM VỤ HOÀN THÀNH')}</span>` : ''}${of > 1 ? `<span class="rc-count">${n}/${of}</span>` : ''}
      <small>${esc(title)}</small><span class="rc-rarity">${RARITY_NAME[item.rarity] || item.rarity}</span>
      <div class="rc-icon3d"></div><b>${esc(t(item.name))}</b><p>${esc(t(item.desc))}</p>
      <em>${t('Đã cất vào Kho đồ')}${item.kind === 'coins' ? ` · +${item.amount} coin` : ''}</em></div></div>`;
    card.querySelector('.rc-icon3d').append(itemCanvas(item, { spin: true }));   // the prize, turning in 3D
    void card.offsetWidth;
    card.classList.add('show');
    audio?.sfx(mission ? 'mission' : 'reward', { rarity: item.rarity });
    if (item.kind === 'coins') setTimeout(() => audio?.sfx('coin'), 600);
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => card.classList.add('hidden'), item.rarity === 'legendary' ? 6500 : 4500);
  }
  card.addEventListener('pointerdown', () => card.classList.add('hidden'));

  // ---- today's chests, from the day's seed (the same places for the whole day)
  function placeChests() {
    for (const m of chests.values()) group.remove(m);
    chests.clear();
    if (!state || !city.spots.length) return;
    // spread out over the city: each one at least `apart` metres from the others (loosened if the city runs out)
    const rnd = seeded(state.seed % 2147483646 + 1), pool = city.spots.slice(), taken = [];
    const apart = (city.grid?.pitch || 84) * 0.9;
    const choose = () => {
      for (let need = apart; need > 5; need *= 0.7) {
        const ok = pool.filter(([x, z]) => taken.every(([a, b]) => Math.hypot(a - x, b - z) >= need));
        if (ok.length) return ok[Math.floor(rnd() * ok.length)];
      }
      return pool[Math.floor(rnd() * pool.length)];
    };
    for (let i = 0; i < state.count && pool.length; i++) {
      const spot = choose();
      pool.splice(pool.indexOf(spot), 1); taken.push(spot);
      const [x, z] = spot;
      if (state.opened.includes(i)) continue;
      const m = chestMesh();
      m.position.set(x, 0, z);
      group.add(m); chests.set(i, m);
      // clicking a chest opens it when it's within reach
      usable?.(m.userData.chest, () => t('Mở rương'), () => { if (near === i) api.open(); else onHint(t('Lại gần rương hơn để mở.')); });
    }
  }

  // the marked place of a "visit" mission: one of the city's spots, picked by the app for today
  function placeMarks() {
    for (const m of marks.values()) group.remove(m);
    marks.clear();
    if (!state || !city.spots.length) return;
    for (const q of state.quests) {
      if (q.goal !== 'visit' || q.done) continue;
      const [x, z] = city.spots[q.spot % city.spots.length];
      const m = markMesh(); m.position.set(x, 0, z); m.userData.id = q.id;
      group.add(m); marks.set(q.id, m);
    }
  }

  function report(r) { call('cityProgress', JSON.stringify(r)); }

  const api = {
    get near() { return near; },
    get hint() { return near != null ? t('Mở rương') : ''; },
    onState(msg) {
      inFlight = 0;   // the app's count now includes what was reported
      const fresh = !state || state.day !== msg.day || state.seed !== msg.seed;
      state = msg;
      if (fresh) { placeChests(); parksSeen = new Set(); }
      else for (const i of msg.opened) { const m = chests.get(i); if (m) { group.remove(m); chests.delete(i); } }
      placeMarks();
      renderTracker();
    },
    // rewards come once the app has checked them against the repository (a moment later, or when back online)
    onReward(msg) {
      if (msg.error) { onHint(msg.error); return; }
      for (const r of msg.rewards || []) if (r.source !== 'chest') track('city_mission_done', { rarity: r.item.rarity });
      // several at once (a chest that also finishes a mission): one after the other, numbered
      const list = msg.rewards || [];
      list.forEach((r, i) => setTimeout(() => showCard(r.item, r.source === 'chest' ? t('Mở rương') : r.name,
        { mission: r.source !== 'chest', n: i + 1, of: list.length }), i * 4800));
      if (msg.rejected) onHint(t('{n} phần thưởng không khớp với nhiệm vụ gốc nên bị huỷ.', { n: msg.rejected }));
      if (msg.offline && !(msg.rewards || []).length) onHint(t('Chưa kết nối được kho nhiệm vụ: phần thưởng sẽ được trao khi có mạng.'));
    },
    open() {
      if (near == null) return false;
      const m = chests.get(near);
      if (m) { m.userData.opening = 0.001; }
      track('city_chest_opened');
      audio?.sfx('chest');
      call('cityOpenChest', near);
      return true;
    },
    report,
    // where today's chests and the marked places are, for the minimap and the compass
    markers() {
      const out = [];
      for (const m of chests.values()) if (!m.userData.opening) out.push({ kind: 'chest', x: m.position.x, z: m.position.z });
      for (const m of marks.values()) out.push({ kind: 'visit', x: m.position.x, z: m.position.z });
      return out;
    },
    update(dt) {
      time += dt;
      const p = player.root.position, out = isOutdoors();
      tracker.classList.toggle('hidden', !out || !state);
      if (out && state && (left() !== clockShown || Math.floor(sinceReport) !== shownWalk)) renderTracker();
      if (!out && detailId) { detailId = null; detail.classList.add('hidden'); }
      if (state && Date.now() / 1000 > state.ends_at) { state.ends_at = Infinity; call('cityState'); }   // a new day
      for (const [id, m] of marks) {
        m.userData.beam.material.opacity = 0.34 + 0.1 * Math.sin(time * 2.5);
        m.userData.ring.scale.setScalar(1 + 0.12 * Math.sin(time * 3));
        if (out && Math.hypot(m.position.x - p.x, m.position.z - p.z) < 1.6) { group.remove(m); marks.delete(id); report({ visit: id }); }
      }
      // chests: bob the beam, swing the lid open once asked, find the nearest within reach
      near = null;
      let best = REACH;
      for (const [i, m] of chests) {
        if (m.userData.opening) {   // the lid swings open, the chest rises and the light fades out
          const o = m.userData.opening = Math.min(1, m.userData.opening + dt * 1.6);
          animateChest(m, time, i);
          m.userData.lid.rotation.x = -1.9 * Math.min(1, o * 2);
          m.userData.chest.position.y += o * 0.8;
          m.userData.chest.scale.setScalar(1.35 * (1 - Math.max(0, o - 0.6) * 2.4));
          m.userData.beamMat.uniforms.uColor.value.multiplyScalar(0.96);
          m.userData.pool.material.opacity *= 1 - o;
          if (o >= 1) { group.remove(m); chests.delete(i); }
          continue;
        }
        animateChest(m, time, i);
        const d = Math.hypot(m.position.x - p.x, m.position.z - p.z);
        if (out && d < best) { best = d; near = i; }
      }
      // walking outdoors: metres, reported in small steps (the app caps each step)
      if (out && last) {
        const step = Math.hypot(p.x - last.x, p.z - last.z);
        if (step < 3) sinceReport += step;
        if (sinceReport >= 50) { report({ walk: Math.round(sinceReport) }); inFlight += Math.round(sinceReport); sinceReport = 0; }   // the app counts it (capped per report)
      }
      last = out ? p.clone() : null;
      // parks: once each per day
      if (out) city.parks.forEach((pk, i) => {
        if (!parksSeen.has(i) && Math.abs(p.x - pk.x) < pk.half && Math.abs(p.z - pk.z) < pk.half) { parksSeen.add(i); report({ park: i }); }
      });
    },
  };
  return api;
}
