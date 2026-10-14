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

function chestMesh() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#5a3b22', roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: '#d9a640', roughness: 0.3, metalness: 0.85, emissive: '#3a2600', emissiveIntensity: 0.4 });
  const box = (m, w, h, d, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  box(wood, 0.9, 0.5, 0.6, 0, 0.25, 0);
  const lid = new THREE.Group(); lid.position.set(0, 0.5, -0.3); g.add(lid);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16, 1, false, 0, Math.PI), wood);
  top.rotation.z = Math.PI / 2; top.position.set(0, 0, 0.3); top.castShadow = true; lid.add(top);
  for (const x of [-0.4, 0.4]) box(trim, 0.06, 0.52, 0.62, x, 0.26, 0);
  box(trim, 0.92, 0.06, 0.62, 0, 0.5, 0);
  box(trim, 0.14, 0.16, 0.04, 0, 0.42, 0.31);
  // a beam of light so the chest can be spotted down the street
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.45, 9, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 4.6; g.add(beam);
  g.userData = { lid, beam, trim };
  return g;
}

function markMesh() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 14, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: '#5fd0ff', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 7; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40),
    new THREE.MeshBasicMaterial({ color: '#5fd0ff', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  g.userData = { beam, ring };
  return g;
}

export function createCityQuests({ scene, city, call, player, isOutdoors, track = () => {} }) {
  const group = new THREE.Group();
  scene.add(group);
  const chests = new Map();   // index → mesh
  const marks = new Map();    // visit mission id → mesh
  let state = null, near = null, sinceReport = 0, last = null, parksSeen = new Set(), time = 0, clockShown = '';

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
    tracker.innerHTML = `<div class="ct-head"><small>${t('Nhiệm vụ hôm nay')}</small><b class="ct-clock" title="${t('Hết ngày, nhiệm vụ chưa xong sẽ mất phần thưởng')}">${t('Còn {time}', { time: clockShown })}</b></div>
      ${state.quests.map((q) => `<div class="ct-task r-${q.rarity}${q.done ? ' done' : ''}" title="${esc(q.story)}">
        <div class="ct-top"><span>${esc(q.name)}</span><em class="ct-gift">${q.claimed ? '✓' : RARITY_NAME[q.rarity]}</em></div>
        <div class="ct-bar"><i style="width:${Math.min(100, q.progress / q.target * 100)}%"></i></div>
        <small>${q.claimed ? t('Đã nhận') : q.done ? t('Đang xác nhận…') : `${q.progress}/${q.target}`}</small></div>`).join('')}
      <div class="ct-row"><span class="ct-chest"></span>${t('Rương còn lại trên phố')}<em>${chestsLeft}/${state.count}</em></div>
      ${state.pending ? `<div class="ct-pending">${t('{n} phần thưởng đang chờ xác nhận', { n: state.pending })}</div>` : ''}`;
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

  // ---- the reward card: flips over in the colour of its rarity
  const card = document.createElement('div');
  card.id = 'reward-card';
  card.className = 'hidden';
  document.body.append(card);
  let cardTimer = 0;
  function showCard(item, title) {
    card.className = `r-${item.rarity}`;
    card.innerHTML = `<div class="rc-inner"><div class="rc-back"></div><div class="rc-front">
      <small>${esc(title)}</small><span class="rc-rarity">${RARITY_NAME[item.rarity] || item.rarity}</span>
      <div class="rc-icon3d"></div><b>${esc(t(item.name))}</b><p>${esc(t(item.desc))}</p>
      <em>${t('Đã cất vào Kho đồ')}${item.kind === 'coins' ? ` · +${item.amount} coin` : ''}</em></div></div>`;
    card.querySelector('.rc-icon3d').append(itemCanvas(item, { spin: true }));   // the prize, turning in 3D
    void card.offsetWidth;
    card.classList.add('show');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => card.classList.add('hidden'), item.rarity === 'legendary' ? 6500 : 4500);
  }
  card.addEventListener('pointerdown', () => card.classList.add('hidden'));

  // ---- today's chests, from the day's seed (the same places for the whole day)
  function placeChests() {
    for (const m of chests.values()) group.remove(m);
    chests.clear();
    if (!state || !city.spots.length) return;
    const rnd = seeded(state.seed % 2147483646 + 1), pool = city.spots.slice();
    for (let i = 0; i < state.count && pool.length; i++) {
      const [x, z] = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      if (state.opened.includes(i)) continue;
      const m = chestMesh();
      m.position.set(x, 0.02, z); m.rotation.y = rnd() * Math.PI * 2;
      group.add(m); chests.set(i, m);
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

  return {
    get near() { return near; },
    get hint() { return near != null ? t('Mở rương') : ''; },
    onState(msg) {
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
      (msg.rewards || []).forEach((r, i) => setTimeout(() => showCard(r.item,
        r.source === 'chest' ? t('Mở rương') : t('Hoàn thành: {name}', { name: r.name })), i * 4800));
      if (msg.rejected) onHint(t('{n} phần thưởng không khớp với nhiệm vụ gốc nên bị huỷ.', { n: msg.rejected }));
      if (msg.offline && !(msg.rewards || []).length) onHint(t('Chưa kết nối được kho nhiệm vụ: phần thưởng sẽ được trao khi có mạng.'));
    },
    open() {
      if (near == null) return false;
      const m = chests.get(near);
      if (m) { m.userData.opening = 0.001; }
      track('city_chest_opened');
      call('cityOpenChest', near);
      return true;
    },
    report,
    update(dt) {
      time += dt;
      const p = player.root.position, out = isOutdoors();
      tracker.classList.toggle('hidden', !out || !state);
      if (out && state && left() !== clockShown) renderTracker();
      if (state && Date.now() / 1000 > state.ends_at) { state.ends_at = Infinity; call('cityState'); }   // a new day
      for (const [id, m] of marks) {
        m.userData.beam.material.opacity = 0.18 + 0.1 * Math.sin(time * 2.5);
        m.userData.ring.scale.setScalar(1 + 0.12 * Math.sin(time * 3));
        if (out && Math.hypot(m.position.x - p.x, m.position.z - p.z) < 1.6) { group.remove(m); marks.delete(id); report({ visit: id }); }
      }
      // chests: bob the beam, swing the lid open once asked, find the nearest within reach
      near = null;
      let best = REACH;
      for (const [i, m] of chests) {
        m.userData.beam.material.opacity = 0.16 + 0.08 * Math.sin(time * 3 + i);
        m.userData.trim.emissiveIntensity = 0.3 + 0.25 * Math.sin(time * 4 + i);
        if (m.userData.opening) {
          m.userData.opening = Math.min(1, m.userData.opening + dt * 2.5);
          m.userData.lid.rotation.x = -1.9 * m.userData.opening;
          if (m.userData.opening >= 1) { group.remove(m); chests.delete(i); }
          continue;
        }
        const d = Math.hypot(m.position.x - p.x, m.position.z - p.z);
        if (out && d < best) { best = d; near = i; }
      }
      // walking outdoors: metres, reported in small steps (the app caps each step)
      if (out && last) {
        const step = Math.hypot(p.x - last.x, p.z - last.z);
        if (step < 3) sinceReport += step;
        if (sinceReport >= 150) { report({ walk: Math.round(sinceReport) }); sinceReport = 0; }
      }
      last = out ? p.clone() : null;
      // parks: once each per day
      if (out) city.parks.forEach((pk, i) => {
        if (!parksSeen.has(i) && Math.abs(p.x - pk.x) < pk.half && Math.abs(p.z - pk.z) < pk.half) { parksSeen.add(i); report({ park: i }); }
      });
    },
  };
}
