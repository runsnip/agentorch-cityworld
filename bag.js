// The company's inventory ("Kho đồ") as a tab of the assistant's board: items from the city's chests and
// missions, by rarity. The items themselves are kept by the app (agentorch/inventory.py, in the vault).

import { t } from '/i18n.js';
import { itemCanvas } from './itemview.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = '<svg viewBox="0 0 24 24"><path d="M3 9h18v11H3z"/><path d="M3 9l2-5h14l2 5"/><path d="M10 13h4"/></svg>';

export function createBagTab({ call, board }) {
  const st = { inventory: null, bagKind: 'all', bagSel: null };
  const icons = new Map();   // item id → its 3D canvas
  let bigFor = null, bigCv = null;
  let asked = false;
  // The company's inventory: items from the city's chests and missions, by rarity (kept by the app, see inventory.py).
  const RARITY = { common: t('Thường'), rare: t('Hiếm'), epic: t('Sử thi'), legendary: t('Huyền thoại') };
  const KINDS = [['all', t('Tất cả')], ['finish', t('Họa tiết súng')], ['starter', t('Đồ mang vào trận')], ['outfit', t('Trang phục')]];
  const GAME_NAMES = { arena: t('Đảo sinh tồn'), '*': t('Mọi game') };
  const KIND_NAMES = { finish: t('Họa tiết súng'), starter: t('Đồ mang vào trận'), outfit: t('Trang phục') };
  function render(left, right) {
    const inv = st.inventory;
    if (!inv) { left.innerHTML = `<div class="lt-label">${t('Kho đồ')}</div><div class="lt-hint">${t('Đang mở kho…')}</div>`; right.innerHTML = ''; if (!asked) { asked = true; call('inventoryView'); } return; }
    const order = { legendary: 0, epic: 1, rare: 2, common: 3 };
    const items = inv.items.filter((it) => st.bagKind === 'all' || it.kind === st.bagKind)
      .sort((a, b) => (b.count > 0) - (a.count > 0) || order[a.rarity] - order[b.rarity]);
    const owned = inv.items.filter((it) => it.count > 0).length;
    left.innerHTML = `<div class="lt-label">${t('Kho đồ')} <small>${owned}/${inv.items.length}</small></div>
      <div class="lt-chips">${KINDS.map(([k, label]) => `<button class="lt-chip${st.bagKind === k ? ' on' : ''}" data-kind="${k}">${label}</button>`).join('')}</div>
      <div class="bag-grid">${items.map((it) => `<button class="bag-slot r-${it.rarity}${it.count ? '' : ' none'}${st.bagSel === it.id ? ' on' : ''}${inv.equipped.finish === it.id ? ' worn' : ''}" data-id="${it.id}" title="${esc(t(it.name))}">
        <i class="bag-ico3d" data-ico="${it.id}"></i>
        <span>${it.count ? esc(t(it.name)) : '???'}</span>${it.count > 1 ? `<em>×${it.count}</em>` : ''}</button>`).join('')}</div>
      ${inv.pending ? `<div class="lt-hint">${t('{n} phần thưởng đang chờ xác nhận', { n: inv.pending })}</div>` : ''}`;
    // the items in 3D (kept across redraws: one turning model per item)
    left.querySelectorAll('[data-ico]').forEach((el) => {
      const item = inv.items.find((x) => x.id === el.dataset.ico);
      if (!icons.has(item.id)) icons.set(item.id, itemCanvas(item));
      el.append(icons.get(item.id));
    });
    left.querySelectorAll('[data-kind]').forEach((b) => { b.onclick = () => { st.bagKind = b.dataset.kind; board.refresh('bag'); }; });
    left.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => { st.bagSel = b.dataset.id; board.refresh('bag'); }; });

    const it = inv.items.find((x) => x.id === st.bagSel);
    const total = Object.values(inv.rarities).reduce((n, r) => n + r.weight, 0) || 1;
    const rates = `<div class="lt-label">${t('Tỉ lệ rơi')}</div><div class="bag-rates">${Object.entries(inv.rarities).map(([k, r]) =>
      `<div class="r-${k}"><b>${RARITY[k]}</b><i style="width:${r.weight / total * 100}%"></i><em>${(r.weight / total * 100).toFixed(r.weight / total < 0.05 ? 1 : 0)}%</em></div>`).join('')}</div>
      <div class="lt-hint">${t('Mỗi lần mở, app tải lại nhiệm vụ và danh mục từ repo AgentOrch rồi tung ngẫu nhiên: không ai đoán trước được.')}</div>`;
    const missed = inv.missed.length ? `<div class="lt-label">${t('Đã bỏ lỡ')}</div><div class="bag-missed">${inv.missed.slice(0, 6).map((m) =>
      `<div class="r-${m.rarity}"><span>${esc(m.quest)}</span><em>${RARITY[m.rarity] || ''} · ${esc(m.day)}</em></div>`).join('')}</div>` : '';
    right.innerHTML = it ? `
      <div class="bag-detail r-${it.rarity}">
        <i class="bag-big" data-big="${it.id}"></i>
        <span class="bag-rarity">${RARITY[it.rarity]}</span>
        <div class="lt-title">${it.count ? esc(t(it.name)) : t('Chưa có')}</div>
        <div class="qb-text">${it.count ? esc(t(it.desc)) : t('Mở rương hoặc làm nhiệm vụ trong thành phố để có thể nhận món này.')}</div>
        <div class="bag-meta"><span>${KIND_NAMES[it.kind] || it.kind}</span><span>${t('Dùng cho')}: ${it.games.map((g) => GAME_NAMES[g] || esc(g)).join(', ')}</span>${it.count ? `<span>${t('Đang có')}: ${it.count}</span>` : ''}</div>
        ${it.kind === 'finish' && it.count ? `<button class="qb-give" id="bag-equip">${inv.equipped.finish === it.id ? t('Bỏ trang bị') : t('Trang bị cho súng')}</button>` : ''}
        ${it.kind === 'starter' && it.count ? `<div class="lt-hint">${t('Chọn mang vào ở màn hình chuẩn bị trận; dùng một lần.')}</div>` : ''}
      </div>${rates}${missed}`
      : `<div class="lt-title">${t('Kho đồ')}</div>
      <div class="qb-text">${t('Ra thành phố tìm rương có cột sáng và làm nhiệm vụ hằng ngày. Nhiệm vụ mới mỗi ngày; hết ngày chưa làm xong là mất phần thưởng.')}</div>${rates}${missed}`;
    const big = right.querySelector('[data-big]');
    if (big && it) { if (bigFor !== it.id) { bigFor = it.id; bigCv = itemCanvas(it, { spin: true }); } big.append(bigCv); }
    const eq = right.querySelector('#bag-equip');
    if (eq) eq.onclick = () => call('inventoryEquip', 'finish', inv.equipped.finish === it.id ? '' : it.id);
  }


  board.addTab({ id: 'bag', label: t('Kho đồ'), icon: ICON, render, onOpen: () => { if (st.inventory) call('inventoryView'); } });
  return { set(inv) { st.inventory = inv; asked = false; board.refresh('bag'); } };
}
