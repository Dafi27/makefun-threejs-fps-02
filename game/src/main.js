// main.js — RUST HARBOR bootstrap: renderer, fixed-step simulation, round
// flow, buy/plant/defuse, grenades, staging (?shot=) and the debug hook.
import * as THREE from 'three';
import { createState, TEAMS, TEAM_NAME, ROUND_TIME, BUY_TIME, ROUND_END_TIME, WIN_ROUNDS, PLANT_TIME, DEFUSE_TIME, BOMB_FUSE, START_MONEY, WIN_BONUS, LOSS_BONUS, KILL_BONUS, PLANT_BONUS, logEvent, aliveOf, otherTeam } from './state.js';
import { buildMap, SITES, SPAWNS, validateMap } from './map.js';
import { createPlayer, equipPrimary, stepPlayer, startReload, switchWeapon, eyePos } from './player.js';
import { spawnBots, resetBot, stepBot, killBotMesh } from './bots.js';
import { WEAPONS, createWeaponState, throwGrenade, stepGrenade } from './guns.js';
import { createFX, spawnTracer, spawnPuff, muzzle, explosion, stepFX } from './fx.js';
import { createSound } from './sound.js';
import { createInput } from './input.js';
import { createHUD, updateHUD, showBanner, flashHitmarker, refreshBuyAfford, showScoreboard } from './hud.js';
import { mulberry32 } from './collide.js';

const params = new URLSearchParams(location.search);
const STAGE = params.get('shot');
const SEED = parseInt(params.get('seed') || '1', 10) || 1;

// ---------- renderer / scene ----------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c2333);
scene.fog = new THREE.FogExp2(0x232a3d, 0.0052);
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 320);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hemi = new THREE.HemisphereLight(0x8fa3c7, 0x3a2f26, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 1.9);
sun.position.set(-34, 42, -20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 140;
sun.shadow.bias = -0.0006;
scene.add(sun);

// ---------- world / state ----------
const mapData = buildMap(scene);
const state = createState();
state.seed = SEED;
const player = createPlayer(SPAWNS.jackals[0]);
const bots = spawnBots(state, scene, mapData);
state.actors = [player, ...bots];
const fx = createFX(scene);
const sound = createSound();
const input = createInput(renderer.domElement);
const hud = createHUD(buyWeapon);

// gun viewmodel attached to the camera
const viewGun = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.45, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.36);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.1), dark);
  mag.position.set(0, -0.13, -0.05);
  viewGun.add(body, barrel, mag);
  viewGun.position.set(0.28, -0.26, -0.55);
  camera.add(viewGun);
}
// bomb mesh (shown when planted)
const bombMesh = new THREE.Group();
{
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.4, metalness: 0.6 }));
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1a, emissiveIntensity: 2 }));
  lamp.position.y = 0.14;
  bombMesh.add(box, lamp);
  bombMesh.visible = false;
  scene.add(bombMesh);
}
// grenade pool (3 meshes)
const grenades = [];
for (let i = 0; i < 3; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2e4a2e, roughness: 0.5, metalness: 0.6 }));
  m.visible = false;
  scene.add(m);
  grenades.push({ g: null, mesh: m });
}

const EYE = { x: 0, y: 0, z: 0 };
const TMP = new THREE.Vector3();

// ---------- combat callbacks (shared by player and bots) ----------
function onShot(shooter, w, x, y, z, hit) {
  const fx0 = -Math.sin(shooter.yaw), fz0 = -Math.cos(shooter.yaw);
  const mx = x + fx0 * 0.7, my = y - 0.12, mz = z + fz0 * 0.7;
  spawnTracer(fx, mx, my, mz, hit.x, hit.y, hit.z);
  if (hit.kind === 'wall') spawnPuff(fx, hit.x, hit.y, hit.z);
  if (shooter === player) muzzle(fx, mx, my, mz);
  const d2 = (x - player.pos.x) ** 2 + (z - player.pos.z) ** 2;
  sound.shot(w.def.kind, shooter !== player && d2 > 400);
  ctx.shots.push({ x, y, z, team: shooter.team, t: state.time });
  if (ctx.shots.length > 24) ctx.shots.shift();
}

function onDamage(victim, dmg, attacker, part) {
  if (!victim.alive) return;
  victim.hp -= dmg;
  victim.lastDamageT = state.time;
  victim.lastDamageFrom = attacker;
  if (attacker === player && victim !== player) {
    flashHitmarker(hud, victim.hp <= 0);
    sound.hit();
  }
  if (victim === player) sound.hurt();
  if (victim.hp > 0) return;
  victim.hp = 0;
  victim.alive = false;
  victim.deaths += 1;
  if (attacker) attacker.kills += 1;
  const an = attacker ? (attacker.kind === 'player' ? 'YOU' : attacker.name) : '—';
  const vn = victim.kind === 'player' ? 'YOU' : victim.name;
  logEvent(state, `${an} ✕ ${vn}${part === 'head' ? '  (headshot)' : ''}`, 'kill');
  if (attacker === player) { sound.kill(); state.money += KILL_BONUS; }
  if (victim.kind === 'bot') killBotMesh(victim);
  if (victim === player) {
    input.releaseLock();
    if (state.bomb.state === 'carried' && state.bomb.carrierId === 'player') transferBomb();
  } else if (victim.carrier) {
    transferBomb();
  }
  // elimination check
  if (state.phase === 'live') {
    if (aliveOf(state, TEAMS.JACKALS) === 0) endRound(TEAMS.WARDENS, 'Squad wiped out');
    else if (aliveOf(state, TEAMS.WARDENS) === 0) endRound(TEAMS.JACKALS, 'Squad wiped out');
  }
}

function transferBomb() {
  const mates = state.actors.filter((a) => a.team === TEAMS.JACKALS && a.alive && a.kind === 'bot');
  if (!mates.length) return;
  mates.sort((a, b) => (a.pos.x - player.pos.x) ** 2 + (a.pos.z - player.pos.z) ** 2 - ((b.pos.x - player.pos.x) ** 2 + (b.pos.z - player.pos.z) ** 2));
  const next = mates[0];
  next.carrier = true;
  state.bomb.carrierId = next.id;
  logEvent(state, `${next.name} picks up the charge`, 'bomb');
}

function plantBomb(by) {
  const site = SITES[state.plan];
  state.bomb.state = 'planted';
  state.bomb.site = site;
  state.bomb.x = site.x; state.bomb.z = site.z; state.bomb.y = 0;
  state.bomb.fuse = BOMB_FUSE;
  state.bomb.plantT = 0;
  bombMesh.visible = true;
  bombMesh.position.set(site.x, 0.12, site.z);
  if (by === player) state.money += PLANT_BONUS;
  logEvent(state, `Charge planted at site ${state.plan}`, 'bomb');
  sound.beep(3);
  showBanner(hud, 'CHARGE PLANTED', `Defend site ${state.plan} — ${BOMB_FUSE}s to detonation`);
}

function defuseBomb(by) {
  state.bomb.state = 'defused';
  state.bomb.defuseT = 0;
  bombMesh.visible = false;
  logEvent(state, `Charge defused by ${by.kind === 'player' ? 'YOU' : by.name}`, 'bomb');
  endRound(TEAMS.WARDENS, 'Charge defused');
}

function onPlant(bot) { if (state.phase === 'live' && state.bomb.state === 'carried') plantBomb(bot); }
function onDefuse(bot) { if (state.phase === 'live' && state.bomb.state === 'planted') defuseBomb(bot); }

const ctx = {
  state, colliders: mapData.colliders, actors: state.actors, mapData,
  phase: 'menu', shots: [],
  onShot, onDamage,
  onDryFire: () => sound.dry(),
  onEmpty: () => {},
  onStep: (bot) => {
    const d2 = (bot.pos.x - player.pos.x) ** 2 + (bot.pos.z - player.pos.z) ** 2;
    if (d2 < 500) sound.step();
  },
  onPlant, onDefuse,
};

// ---------- round flow ----------
function startMatch() {
  state.score.jackals = 0; state.score.wardens = 0;
  state.round = 1; state.matchWinner = null;
  state.money = START_MONEY;
  player.primary = null;
  player.sidearm = null;
  player.weapon = null;
  player.grenades = 0;
  player.kills = 0; player.deaths = 0;
  startRound();
}

function startRound() {
  state.plan = Math.random() < 0.5 ? 'A' : 'B';
  const sp = SPAWNS.jackals[0];
  player.pos.x = sp.x; player.pos.z = sp.z; player.pos.y = 0;
  player.yaw = sp.yaw; player.pitch = 0;
  player.hp = 100; player.alive = true;
  player.planting = 0; player.defusing = 0;
  player.sidearm = createWeaponState('sidearm');
  if (player.primary) {
    player.primary.ammo = player.primary.def.mag;
    player.primary.reserve = player.primary.def.reserve;
    player.primary.cooldown = 0; player.primary.reloading = 0; player.primary.bloom = 0;
    player.weapon = player.primary;
  } else {
    player.weapon = player.sidearm;
  }
  bots.forEach((b, i) => resetBot(b, SPAWNS[b.team][b.team === 'jackals' ? (i % 4) + 1 : i - 4]));
  // carrier: the player starts with the charge
  state.bomb = { state: 'carried', site: null, carrierId: 'player', x: 0, y: 0, z: 0, fuse: 0, plantT: 0, defuseT: 0, defuserId: null };
  bots.forEach((b) => { b.carrier = false; });
  bombMesh.visible = false;
  state.phase = 'buy';
  state.phaseT = 0;
  state.timer = BUY_TIME;
  state.roundWinner = null;
  document.getElementById('buy-site').textContent = state.plan;
  refreshBuyAfford(hud, state.money, player.primary ? player.primary.def.id : null);
  if (!STAGE) showBanner(hud, `ROUND ${state.round}`, `Push site ${state.plan} — buy phase`);
}

function beginLive() {
  if (state.phase !== 'buy') return;
  state.phase = 'live';
  state.phaseT = 0;
  state.timer = ROUND_TIME;
  input.requestLock();
  sound.click();
}

function endRound(winner, reason) {
  if (state.phase !== 'live') return;
  state.score[winner] += 1;
  state.roundWinner = winner;
  if (winner === TEAMS.JACKALS) state.money += WIN_BONUS; else state.money += LOSS_BONUS;
  state.phase = 'roundEnd';
  state.phaseT = 0;
  state.timer = ROUND_END_TIME;
  input.releaseLock();
  logEvent(state, `${TEAM_NAME[winner]} take round ${state.round} — ${reason}`, 'info');
  showBanner(hud, `${TEAM_NAME[winner]} TAKE THE ROUND`, `${reason} · ${state.score.jackals} : ${state.score.wardens}`);
  if (winner === TEAMS.JACKALS) sound.win(); else sound.lose();
}

function endMatch() {
  state.matchWinner = state.score.jackals > state.score.wardens ? TEAMS.JACKALS : TEAMS.WARDENS;
  state.phase = 'matchEnd';
  state.phaseT = 0;
  logEvent(state, `${TEAM_NAME[state.matchWinner]} take the match`, 'info');
}

function buyWeapon(defId) {
  if (state.phase !== 'buy') return;
  const def = WEAPONS[defId];
  if (!def || state.money < def.price) return;
  if (defId === 'grenade') {
    if (player.grenades >= 2) return;
    player.grenades += 1;
  } else {
    equipPrimary(player, defId);
  }
  state.money -= def.price;
  sound.buy();
  refreshBuyAfford(hud, state.money, player.primary ? player.primary.def.id : null);
  logEvent(state, `Bought ${def.name} — $${def.price}`, 'info');
}

function throwPlayerGrenade() {
  if (state.phase !== 'live' || !player.alive || player.grenades <= 0) return;
  const slot = grenades.find((s) => !s.g);
  if (!slot) return;
  player.grenades -= 1;
  eyePos(player, EYE);
  const fx0 = -Math.sin(player.yaw) * Math.cos(player.pitch);
  const fy0 = Math.sin(player.pitch);
  const fz0 = -Math.cos(player.yaw) * Math.cos(player.pitch);
  slot.g = throwGrenade(EYE.x + fx0 * 0.6, EYE.y - 0.1, EYE.z + fz0 * 0.6,
    fx0 * 15 + player.vel.x, fy0 * 15 + 3.2, fz0 * 15 + player.vel.z);
  slot.mesh.visible = true;
  sound.click();
}

function explodeGrenade(slot) {
  const g = slot.g;
  slot.g = null;
  slot.mesh.visible = false;
  explosion(fx, g.x, g.y, g.z);
  sound.explosion();
  for (const a of state.actors) {
    if (!a.alive) continue;
    const d = Math.hypot(a.pos.x - g.x, (a.pos.y + 1) - g.y, a.pos.z - g.z);
    if (d < WEAPONS.grenade.radius) {
      const dmg = Math.max(12, WEAPONS.grenade.damage * (1 - d / WEAPONS.grenade.radius));
      onDamage(a, dmg, player, 'body');
    }
  }
}

// ---------- input wiring ----------
input.onClick = () => {
  if (state.phase === 'menu') {
    sound.unlock();
    startMatch();
    input.requestLock();
  } else if (state.phase === 'live' && player.alive) {
    input.requestLock();
  }
};
input.onKey = (code, down) => {
  if (!down) {
    if (code === 'Tab') showScoreboard(hud, state, false);
    return;
  }
  if (code === 'Tab') { showScoreboard(hud, state, true); return; }
  if (code === 'KeyM') { sound.enabled = !sound.enabled; return; }
  if (state.phase === 'matchEnd' && code === 'KeyR') { startMatch(); return; }
  if (state.phase === 'buy') {
    if (code === 'KeyB' || code === 'Enter') beginLive();
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    if (idx >= 0) buyWeapon(['carbine', 'smg', 'breacher', 'grenade'][idx]);
    return;
  }
  if (state.phase !== 'live' || !player.alive) return;
  if (code === 'KeyR') startReload(player);
  if (code === 'Digit1') switchWeapon(player, 1);
  if (code === 'Digit2') switchWeapon(player, 2);
  if (code === 'KeyG') throwPlayerGrenade();
};
document.getElementById('start-btn').addEventListener('click', () => {
  sound.unlock();
  startMatch();
  input.requestLock();
});
document.getElementById('deploy-btn').addEventListener('click', () => beginLive());

// ---------- staging (?shot=) ----------
function stageShot() {
  startMatch();
  state.phase = 'live';
  if (STAGE === 'start') {
    state.phase = 'buy';
    state.timer = 12;
    state.money = 2300;
    refreshBuyAfford(hud, state.money, null);
    document.getElementById('buy-site').textContent = state.plan;
    // two defenders visible down mid lane
    const d1 = bots[4], d2 = bots[5];
    d1.pos.x = -16; d1.pos.z = 2; d1.yaw = Math.PI / 2;
    d2.pos.x = -10; d2.pos.z = -4; d2.yaw = Math.PI / 2;
    const m1 = bots[0]; m1.pos.x = -36; m1.pos.z = -3; m1.yaw = -Math.PI / 2;
  } else if (STAGE === 'play') {
    state.phase = 'live';
    state.timer = 62;
    state.money = 1450;
    equipPrimary(player, 'carbine');
    player.weapon.ammo = 18;
    player.hp = 82;
    player.pos.x = -14; player.pos.z = 0; player.yaw = -Math.PI / 2; player.pitch = 0;
    const d = bots[4];
    d.pos.x = 8; d.pos.z = 0.5; d.yaw = Math.PI / 2;
    const m1 = bots[0]; m1.pos.x = -10; m1.pos.z = -4; m1.yaw = -Math.PI / 2;
    const m2 = bots[1]; m2.pos.x = -18; m2.pos.z = 4; m2.yaw = -Math.PI / 2;
  } else if (STAGE === 'plant') {
    state.phase = 'live';
    state.timer = 41;
    state.money = 2300;
    equipPrimary(player, 'carbine');
    player.pos.x = -25.5; player.pos.z = -16.5;
    player.yaw = Math.atan2(-(SITES.A.x - player.pos.x), -(SITES.A.z - player.pos.z));
    player.planting = 2.1;
    const d = bots[4];
    d.pos.x = -20; d.pos.z = -13; d.yaw = Math.PI * 0.75;
    const d2 = bots[5];
    d2.pos.x = -33; d2.pos.z = -24; d2.yaw = -Math.PI / 4;
  } else if (STAGE === 'end') {
    state.phase = 'roundEnd';
    state.timer = 4;
    state.score.jackals = 2; state.score.wardens = 1;
    state.round = 3;
    showBanner(hud, 'JACKALS TAKE THE ROUND', 'Site A cleared — 2 : 1');
  }
  // sync bot meshes to staged poses
  for (const b of bots) {
    b.mesh.group.position.set(b.pos.x, b.pos.y, b.pos.z);
    b.mesh.group.rotation.y = b.yaw;
  }
  updateHUD(hud, state, player);
}

if (STAGE) {
  stageShot();
}

// ---------- fixed-step loop ----------
const DT = 1 / 60;
let last = performance.now();
let acc = 0;
let viewKick = 0;

function simStep(dt) {
  state.time += dt;
  state.phaseT += dt;
  ctx.phase = state.phase;
  if (state.phase === 'buy') {
    state.timer -= dt;
    const { dx, dy } = input.consumeMouse();
    player.yaw -= dx * 0.0022;
    player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - dy * 0.0022));
    if (state.timer <= 0) beginLive();
    return;
  }
  if (state.phase === 'roundEnd') {
    state.timer -= dt;
    if (state.timer <= 0) {
      if (state.score.jackals >= WIN_ROUNDS || state.score.wardens >= WIN_ROUNDS) endMatch();
      else { state.round += 1; startRound(); }
    }
    return;
  }
  if (state.phase !== 'live') return;
  state.timer -= dt;
  // player
  if (player.alive) {
    stepPlayer(player, input, dt, ctx);
    // plant / defuse channels (hold E)
    const site = SITES[state.plan];
    const nearSite = Math.hypot(player.pos.x - site.x, player.pos.z - site.z) < 3.5;
    if (input.keys.has('KeyE') && state.bomb.state === 'carried' && state.bomb.carrierId === 'player' && nearSite) {
      player.planting += dt;
      if (player.planting >= PLANT_TIME) { player.planting = 0; plantBomb(player); }
    } else player.planting = Math.max(0, player.planting - dt * 2);
    const nearBomb = state.bomb.state === 'planted' && Math.hypot(player.pos.x - state.bomb.x, player.pos.z - state.bomb.z) < 3;
    if (input.keys.has('KeyE') && nearBomb) {
      player.defusing += dt;
      if (player.defusing >= DEFUSE_TIME) { player.defusing = 0; defuseBomb(player); }
    } else player.defusing = Math.max(0, player.defusing - dt * 2);
  }
  // bots
  for (const b of bots) stepBot(b, dt, ctx);
  // grenades
  for (const slot of grenades) {
    if (!slot.g) continue;
    stepGrenade(slot.g, dt, mapData.colliders);
    slot.mesh.position.set(slot.g.x, slot.g.y, slot.g.z);
    if (slot.g.exploded) explodeGrenade(slot);
  }
  // bomb fuse
  if (state.bomb.state === 'planted') {
    state.bomb.fuse -= dt;
    const prev = Math.ceil(state.bomb.fuse + dt);
    if (state.bomb.fuse < 10 && Math.ceil(state.bomb.fuse) !== prev) sound.beep(1);
    if (state.bomb.fuse <= 0) {
      explosion(fx, state.bomb.x, 0.5, state.bomb.z);
      sound.explosion();
      bombMesh.visible = false;
      state.bomb.state = 'idle';
      endRound(TEAMS.JACKALS, 'Charge detonated');
    }
  }
  // round timer
  if (state.timer <= 0 && state.bomb.state !== 'planted') {
    endRound(TEAMS.WARDENS, 'Time expired — charge never planted');
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!STAGE) {
    acc += elapsed;
    let n = 0;
    while (acc >= DT && n < 5) { simStep(DT); acc -= DT; n++; }
    if (n === 5) acc = 0;
  }
  // camera
  if (player.alive) {
    eyePos(player, EYE);
    camera.position.set(EYE.x, EYE.y, EYE.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  } else {
    const mate = bots.find((b) => b.team === TEAMS.JACKALS && b.alive);
    if (mate) {
      camera.position.set(mate.pos.x, mate.pos.y + 1.5, mate.pos.z);
      camera.rotation.y = mate.yaw;
      camera.rotation.x = 0;
    }
  }
  // viewmodel kick + bob
  const w = player.weapon;
  if (w && w.cooldown > 0) viewKick = Math.min(0.09, viewKick + 0.05);
  viewKick = Math.max(0, viewKick - elapsed * 0.35);
  const bob = player.moving && player.alive ? Math.sin(state.time * 9) * 0.008 : 0;
  viewGun.position.z = -0.55 + viewKick;
  viewGun.position.y = -0.26 + bob;
  viewGun.visible = player.alive && (state.phase === 'live' || state.phase === 'buy');
  // bomb lamp blink
  if (bombMesh.visible) {
    bombMesh.children[1].material.emissiveIntensity = 1.2 + Math.sin(state.time * 6) * 1.2;
  }
  stepFX(fx, elapsed, camera);
  updateHUD(hud, state, player);
  renderer.render(scene, camera);
  if (STAGE) window.__shotReady = true;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// debug hook for automated smoke tests (also lets a harness drive the sim)
window.__rustharbor = {
  state, player, bots, mapData, startMatch, beginLive,
  step: (n) => { for (let i = 0; i < (n || 1); i++) simStep(DT); },
};
window.__mapErrors = validateMap(mapData.colliders);

requestAnimationFrame(frame);
