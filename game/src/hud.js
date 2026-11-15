// hud.js — the DOM overlay: health, ammo, timer, score, money, killfeed,
// banners, buy menu, start/death/match overlays and the crosshair.
// All reads/writes are cached so unchanged values never touch the DOM.
import { WEAPONS } from './guns.js';
import { TEAM_NAME } from './state.js';

const BUYABLES = ['carbine', 'smg', 'breacher', 'grenade'];

export function createHUD(onBuy) {
  const $ = (id) => document.getElementById(id);
  const hud = {
    el: {
      cross: $('crosshair'), hit: $('hitmarker'), hpBar: $('hp-fill'), hpNum: $('hp-num'),
      ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), weaponName: $('weapon-name'),
      timer: $('timer'), scoreJ: $('score-jackals'), scoreW: $('score-wardens'),
      money: $('money'), feed: $('killfeed'), banner: $('banner'), bannerSub: $('banner-sub'),
      bomb: $('bomb-status'), plant: $('plant-bar'), plantFill: $('plant-fill'),
      plantLabel: $('plant-label'), buy: $('buy-menu'), buyList: $('buy-list'),
      start: $('start-overlay'), death: $('death-overlay'), deathText: $('death-text'),
      match: $('match-overlay'), matchText: $('match-text'), board: $('scoreboard'),
      vignette: $('damage-vignette'), roundLabel: $('round-label'), hint: $('hint'),
      grenades: $('grenades'),
    },
    cache: {},
    onBuy,
  };
  hud.el.buyList.innerHTML = BUYABLES.map((id) => {
    const w = WEAPONS[id];
    const extra = id === 'grenade' ? 'Throwable · fuse 1.6s · blast 6m' :
      `${w.damage} dmg · ${w.mag} rounds · ${w.auto ? 'auto' : 'semi-auto'}`;
    return `<div class="buy-item" data-id="${id}">
      <span class="buy-key">${BUYABLES.indexOf(id) + 1}</span>
      <span class="buy-name">${w.name}</span>
      <span class="buy-desc">${extra}</span>
      <span class="buy-price">$${w.price}</span>
    </div>`;
  }).join('');
  hud.el.buyList.addEventListener('click', (e) => {
    const item = e.target.closest('.buy-item');
    if (item && hud.onBuy) hud.onBuy(item.dataset.id);
  });
  return hud;
}

function setText(hud, key, el, text) {
  if (hud.cache[key] !== text) { hud.cache[key] = text; el.textContent = text; }
}
function show(el, on) { el.style.display = on ? '' : 'none'; }

export function updateHUD(hud, state, player) {
  const el = hud.el;
  const w = player.weapon;
  setText(hud, 'hp', el.hpNum, `${Math.max(0, Math.ceil(player.hp))}`);
  const hpPct = `${Math.max(0, player.hp)}%`;
  if (hud.cache.hpBar !== hpPct) { hud.cache.hpBar = hpPct; el.hpBar.style.width = hpPct; }
  if (w) {
    setText(hud, 'mag', el.ammoMag, w.reloading > 0 ? '--' : `${w.ammo}`);
    setText(hud, 'res', el.ammoRes, `/ ${w.reserve}`);
    setText(hud, 'wname', el.weaponName, w.def.name);
  }
  setText(hud, 'gren', el.grenades, player.grenades > 0 ? `◉ ${player.grenades}` : '');
  setText(hud, 'money', el.money, `$${state.money}`);
  setText(hud, 'scoreJ', el.scoreJ, `${state.score.jackals}`);
  setText(hud, 'scoreW', el.scoreW, `${state.score.wardens}`);
  setText(hud, 'round', el.roundLabel, `ROUND ${state.round}`);
  const t = Math.max(0, Math.ceil(state.timer));
  setText(hud, 'timer', el.timer, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
  // crosshair gap from spread
  const spread = w ? 6 + (w.spread + w.bloom) * 900 + (player.moving ? 6 : 0) : 8;
  el.cross.style.setProperty('--gap', `${Math.round(spread)}px`);
  show(el.cross, state.phase === 'live' && player.alive);
  // bomb status (only while a round is in progress)
  const b = state.bomb;
  const bombShown = state.phase === 'live' || state.phase === 'buy';
  if (bombShown && b.state === 'planted') {
    show(el.bomb, true);
    setText(hud, 'bomb', el.bomb, `CHARGE LIVE — ${Math.max(0, Math.ceil(b.fuse))}s`);
  } else if (bombShown && b.state === 'carried' && b.carrierId === 'player') {
    show(el.bomb, true);
    setText(hud, 'bomb', el.bomb, `CARRYING THE CHARGE — plant at ${state.plan} (hold E)`);
  } else show(el.bomb, false);
  // plant/defuse progress
  const prog = player.planting > 0 ? player.planting / 3.5 : player.defusing > 0 ? player.defusing / 5 : 0;
  if (prog > 0) {
    show(el.plant, true);
    el.plantFill.style.width = `${Math.round(prog * 100)}%`;
    setText(hud, 'plantLabel', el.plantLabel, player.planting > 0 ? 'PLANTING…' : 'DEFUSING…');
  } else show(el.plant, false);
  // killfeed
  const feedHtml = state.events.slice(-5).map((e) => `<div class="feed-${e.kind}">${e.text}</div>`).join('');
  if (hud.cache.feed !== feedHtml) { hud.cache.feed = feedHtml; el.feed.innerHTML = feedHtml; }
  // overlays by phase
  show(el.start, state.phase === 'menu');
  show(el.buy, state.phase === 'buy');
  show(el.death, state.phase === 'live' && !player.alive);
  show(el.match, state.phase === 'matchEnd');
  if (state.phase === 'matchEnd' && state.matchWinner) {
    setText(hud, 'match', el.matchText, `${TEAM_NAME[state.matchWinner]} TAKE THE MATCH — ${state.score.jackals} : ${state.score.wardens}`);
  }
  if (state.phase === 'live' && !player.alive) {
    setText(hud, 'death', el.deathText, 'You are down — spectating your squad. Next round you redeploy.');
  }
  // damage vignette fades with time since last hit
  const since = state.time - (player.lastDamageT || -10);
  const op = Math.max(0, 0.55 - since * 0.8);
  el.vignette.style.opacity = op.toFixed(2);
}

export function showBanner(hud, text, sub) {
  hud.el.banner.textContent = text;
  hud.el.bannerSub.textContent = sub || '';
  hud.el.banner.style.opacity = '1';
  hud.el.bannerSub.style.opacity = '1';
  clearTimeout(hud._bannerT);
  hud._bannerT = setTimeout(() => {
    hud.el.banner.style.opacity = '0';
    hud.el.bannerSub.style.opacity = '0';
  }, 2600);
}

export function flashHitmarker(hud, kill) {
  hud.el.hit.style.opacity = '1';
  hud.el.hit.style.color = kill ? '#ff5a4e' : '#fff';
  clearTimeout(hud._hitT);
  hud._hitT = setTimeout(() => { hud.el.hit.style.opacity = '0'; }, kill ? 220 : 120);
}

export function refreshBuyAfford(hud, money, ownedPrimary) {
  for (const item of hud.el.buyList.children) {
    const w = WEAPONS[item.dataset.id];
    const afford = money >= w.price && (item.dataset.id === 'grenade' || ownedPrimary !== item.dataset.id);
    item.classList.toggle('cant', !afford);
  }
}

export function showScoreboard(hud, state, on) {
  if (!on) { hud.el.board.style.display = 'none'; return; }
  const rows = state.actors.map((a) => {
    const cls = a.team === 'jackals' ? 'row-j' : 'row-w';
    const name = a.kind === 'player' ? 'YOU' : a.name;
    const extra = a.id === state.bomb.carrierId && state.bomb.state === 'carried' ? ' ◉' : '';
    return `<div class="board-row ${cls}"><span>${name}${extra}</span><span>${a.kills} K</span><span>${a.deaths} D</span><span>${a.alive ? '●' : '✕'}</span></div>`;
  }).join('');
  hud.el.board.innerHTML = `<div class="board-title">RUST HARBOR — ${TEAM_NAME.jackals} ${state.score.jackals} : ${state.score.wardens} ${TEAM_NAME.wardens}</div>${rows}`;
  hud.el.board.style.display = '';
}
