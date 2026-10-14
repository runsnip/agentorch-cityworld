// The living city, a downloaded add-on: detailed trees, the city's daily quests and chests, and the
// company's inventory tab. It plugs into the office world through the host the app hands it
// (agentorch/web/world.js › extras); rewards, coins and the vault stay in the app (inventory.py).

import { lang, setDictionary } from '/i18n.js';

// this add-on's own translations, in before its modules build their strings
if (lang !== 'vi') {
  try {
    const r = await fetch(new URL(`./locales/${lang}.json`, import.meta.url));
    if (r.ok) setDictionary((await r.json()).strings);
  } catch { /* stays Vietnamese */ }
}
const { createCityQuests } = await import('./quests.js');
const { createBagTab } = await import('./bag.js');

export async function install(host) {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = new URL('./city.css', import.meta.url).href;
  document.head.append(css);

  host.city.setTreeDetail(24);   // every leaf in 3D on the nearest trees

  const quests = createCityQuests({ scene: host.scene, city: host.city, call: host.callPy, player: host.player, isOutdoors: host.isOutdoors });
  host.on('city', (m) => quests.onState(m));
  host.on('city_reward', (m) => quests.onReward(m));
  host.onFrame((dt) => quests.update(dt));
  host.onHint(() => (quests.hint ? `<kbd>F</kbd> ${quests.hint}` : ''));
  host.onKey((e) => e.code === 'KeyF' && !e.repeat && quests.open());
  host.onEvent('lift', () => quests.report({ lift: 1 }));
  host.onEvent('reception', () => quests.report({ reception: 1 }));
  host.onEvent('company', () => host.callPy('cityState'));

  const bag = createBagTab({ call: host.callPy, board: host.board });
  host.on('inventory', (m) => bag.set(m));
  host.on('inventory_error', (m) => host.board.error(m.message));

  host.callPy('cityState');
}
