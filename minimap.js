// Finding your way outdoors: a round minimap in the top-left corner that turns with the view (what is ahead
// is up), and a compass strip across the top showing the heading, the way back to the company and the
// nearest of today's chests. Only outdoors (walking or driving), hidden while a panel is open.
//
// createMinimap({ city, camera, player, isOutdoors, uiBusy, markers }) → { update(dt) }
//   markers() → [{ kind: 'chest' | 'visit', x, z }]

import { t } from '/i18n.js';

const SIZE = 196, R = SIZE / 2 - 6;      // css px; R: the map's radius inside its rim
const SCALE = 0.85;                      // px per metre → about 110 m to the rim
const STRIP_W = 460, STRIP_H = 46, FOV = Math.PI * 0.75;   // the compass shows 135° across
const GOLD = '#d9b26f', CHEST = '#ffcf4a', VISIT = '#4fc3ff';

export function createMinimap({ city, camera, player, isOutdoors, uiBusy, markers }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const wrap = document.createElement('div'); wrap.id = 'city-minimap'; wrap.className = 'hidden';
  const map = document.createElement('canvas'); map.width = map.height = SIZE * dpr;
  const north = document.createElement('b'); north.className = 'mm-north'; north.textContent = t('B');
  wrap.append(map, north);
  const strip = document.createElement('div'); strip.id = 'city-compass'; strip.className = 'hidden';
  const sc = document.createElement('canvas'); sc.width = STRIP_W * dpr; sc.height = STRIP_H * dpr;
  const home = document.createElement('div'); home.className = 'cc-home';
  strip.append(sc, home);
  document.body.append(wrap, strip);
  const g = map.getContext('2d'), s = sc.getContext('2d');

  // what doesn't move, measured once: blocks, parks, buildings (the city's own collision boxes)
  const G = city.grid;
  const blocks = [];
  for (let i = -G.rings; i <= G.rings; i++) for (let j = -G.rings; j <= G.rings; j++) blocks.push([G.cx + i * G.pitch, G.cz + j * G.pitch, i === 0 && j === 0]);
  const buildings = city.walls.filter((w) => w.kind === 'building');
  const HQ = { x: G.cx, z: G.cz - 8 };   // the plaza is 8 m in front of the building's centre
  const edge = G.rings * G.pitch + G.pitch / 2;

  const DIRS = [t('B'), t('ĐB'), t('Đ'), t('ĐN'), t('N'), t('TN'), t('T'), t('TB')];
  let acc = 0, shown = false;

  // heading: 0 = north (-z), growing clockwise (east = +x)
  const heading = () => { const f = camera.getWorldDirection(camera.position.clone()); return Math.atan2(f.x, -f.z); };
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function drawMap(me, hd) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath(); g.arc(SIZE / 2, SIZE / 2, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2b2f36'; g.fillRect(0, 0, SIZE, SIZE);                    // roads everywhere
    g.translate(SIZE / 2, SIZE / 2); g.rotate(-hd); g.scale(SCALE, SCALE); g.translate(-me.x, -me.z);
    // past the last ring of blocks: the woods
    g.fillStyle = '#1d3a24'; g.fillRect(G.cx - edge - 400, G.cz - edge - 400, 2 * edge + 800, 2 * edge + 800);
    g.fillStyle = '#2b2f36'; g.fillRect(G.cx - edge, G.cz - edge, 2 * edge, 2 * edge);
    for (const [x, z, hq] of blocks) {
      g.fillStyle = hq ? '#6d6450' : '#8d8a84';                              // sidewalks
      g.fillRect(x - G.inner / 2, z - G.inner / 2, G.inner, G.inner);
      g.fillStyle = hq ? '#4f4a3c' : '#55575c';                              // the lot inside
      const lot = G.inner - 2 * G.walk;
      g.fillRect(x - lot / 2, z - lot / 2, lot, lot);
    }
    g.fillStyle = '#3f7a45';
    for (const p of city.parks) g.fillRect(p.x - p.half, p.z - p.half, p.half * 2, p.half * 2);
    g.fillStyle = '#9aa3b0';
    for (const b of buildings) g.fillRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
    g.fillStyle = GOLD;                                                      // the company
    g.fillRect(HQ.x - 24, HQ.z - 12, 48, 24);
    g.restore();

    // pins: drawn upright; past the rim they sit on it, pointing the way
    const pin = (x, z, color, glyph) => {
      const dx = (x - me.x) * SCALE, dz = (z - me.z) * SCALE;
      let px = dx * Math.cos(-hd) - dz * Math.sin(-hd), py = dx * Math.sin(-hd) + dz * Math.cos(-hd);
      const d = Math.hypot(px, py), out = d > R - 10;
      if (out) { px *= (R - 10) / d; py *= (R - 10) / d; }
      const cx = SIZE / 2 + px, cy = SIZE / 2 + py;
      g.save(); g.translate(cx, cy);
      g.fillStyle = color; g.strokeStyle = '#0a0d14'; g.lineWidth = 2;
      if (glyph === 'home') {
        g.beginPath(); g.moveTo(0, -9); g.lineTo(9, -1); g.lineTo(6, -1); g.lineTo(6, 8); g.lineTo(-6, 8); g.lineTo(-6, -1); g.lineTo(-9, -1); g.closePath();
        g.stroke(); g.fill();
      } else {
        g.lineWidth = 1.5;   // a chest: small, so a few close together don't cover the streets
        g.beginPath(); g.rect(-3.5, -2, 7, 5); g.stroke(); g.fill();
        g.beginPath(); g.ellipse(0, -2, 3.5, 2, 0, Math.PI, 0); g.stroke(); g.fill();
      }
      if (out) {   // a small arrow toward it, on the rim
        g.rotate(Math.atan2(py, px));
        const k = glyph === 'home' ? 1 : 0.6;
        g.beginPath(); g.moveTo(16 * k, 0); g.lineTo(10 * k, -5 * k); g.lineTo(10 * k, 5 * k); g.closePath(); g.fill();
      }
      g.restore();
    };
    for (const m of markers()) pin(m.x, m.z, m.kind === 'chest' ? CHEST : VISIT, 'chest');
    pin(HQ.x, HQ.z, GOLD, 'home');

    // the CEO: an arrow in the middle, always pointing up (the map turns instead)
    g.save(); g.translate(SIZE / 2, SIZE / 2);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#0a0d14'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.stroke(); g.fill();
    g.restore();
    // the rim
    g.beginPath(); g.arc(SIZE / 2, SIZE / 2, R, 0, Math.PI * 2);
    g.lineWidth = 3; g.strokeStyle = GOLD; g.stroke();
    // north, riding the rim
    const na = -hd - Math.PI / 2;
    north.style.transform = `translate(${Math.cos(na) * (R + 1)}px, ${Math.sin(na) * (R + 1)}px)`;
  }

  function drawStrip(me, hd) {
    s.setTransform(dpr, 0, 0, dpr, 0, 0);
    s.clearRect(0, 0, STRIP_W, STRIP_H);
    const xOf = (a) => STRIP_W / 2 + wrapA(a - hd) / (FOV / 2) * (STRIP_W / 2);
    const vis = (a) => Math.abs(wrapA(a - hd)) < FOV / 2;
    // ticks every 15°, letters every 45°
    for (let k = 0; k < 24; k++) {
      const a = k * Math.PI / 12;
      if (!vis(a)) continue;
      const x = xOf(a), main = k % 3 === 0;
      s.fillStyle = main ? '#eef1f6' : 'rgba(238,241,246,.45)';
      s.fillRect(x - 1, main ? 26 : 30, 2, main ? 10 : 6);
      if (main) {
        s.font = `${k % 6 === 0 ? 900 : 700} ${k % 6 === 0 ? 15 : 12}px -apple-system, sans-serif`;
        s.textAlign = 'center';
        s.fillStyle = k === 0 ? '#ff6b5b' : '#eef1f6';
        s.fillText(DIRS[k / 3], x, 20);
      }
    }
    // the company and the nearest chest along the strip (clamped to its ends when behind)
    const mark = (x, z, color, under) => {
      const a = Math.atan2(x - me.x, -(z - me.z));
      const px = Math.max(10, Math.min(STRIP_W - 10, xOf(a)));
      s.fillStyle = color; s.strokeStyle = '#0a0d14'; s.lineWidth = 2;
      s.beginPath(); s.moveTo(px, 40); s.lineTo(px - 6, STRIP_H); s.lineTo(px + 6, STRIP_H); s.closePath(); s.stroke(); s.fill();
      if (under) { s.fillRect(px - 5, 2, 10, 4); }
    };
    let best = null, bd = Infinity;
    for (const m of markers()) { const d = Math.hypot(m.x - me.x, m.z - me.z); if (d < bd) { bd = d; best = m; } }
    if (best) mark(best.x, best.z, best.kind === 'chest' ? CHEST : VISIT, true);
    mark(HQ.x, HQ.z, GOLD, false);
    // the centre line
    s.fillStyle = GOLD; s.fillRect(STRIP_W / 2 - 1, 22, 2, 18);
    const dh = Math.round(Math.hypot(HQ.x - me.x, HQ.z - me.z));
    const dc = best ? Math.round(bd) : null;
    home.innerHTML = `<span class="cc-hq">${t('Công ty')} <b>${dh} m</b></span>${dc != null ? `<span class="cc-chest">${t('Rương gần nhất')} <b>${dc} m</b></span>` : ''}`;
  }

  return {
    update(dt) {
      const on = isOutdoors() && !uiBusy();
      if (on !== shown) { shown = on; wrap.classList.toggle('hidden', !on); strip.classList.toggle('hidden', !on); }
      if (!on || (acc += dt) < 1 / 30) return;
      acc = 0;
      const me = player.root.position, hd = heading();
      drawMap(me, hd); drawStrip(me, hd);
    },
  };
}
