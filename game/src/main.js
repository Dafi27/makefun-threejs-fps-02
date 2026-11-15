// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|buy|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and
// sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponSet, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createMatch, ROUND_TIME, BUY_TIME, PLANT_TIME, DEFUSE_TIME } from './game.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { hasLineOfSight } from './physics.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 22, 55);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const match = createMatch();
const player = createPlayer(world.colliders, world.spawns.attackers[0]);
scene.add(player.hitGroup);
const weapons = createWeaponSet(camera);
const bots = createBots(scene, world, rng);
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 140;
const shootables = world.occluders.slice();
for (const bot of bots.list) shootables.push(...bot.hitMeshes);
shootables.push(...player.hitMeshes);

const tmpDir = new THREE.Vector3();
const tmpEye = new THREE.Vector3();
const tmpPoint = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

// Tracers: a small pool of lines, reused, never allocated per shot.
const tracers = [];
for (let i = 0; i < 10; i += 1) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }));
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
function showTracer(from, to) {
  const tracer = tracers.find((t) => t.life <= 0) || tracers[0];
  const positions = tracer.line.geometry.attributes.position;
  positions.setXYZ(0, from.x, from.y, from.z);
  positions.setXYZ(1, to.x, to.y, to.z);
  positions.needsUpdate = true;
  tracer.line.material.opacity = 0.9;
  tracer.life = 0.07;
}

// Grenades in flight.
const grenades = [];
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.4, metalness: 0.7 });

let started = false;
let paused = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let elapsed = 0;
let prevPhase = match.state.phase;
let kills = 0;
let plantBeepAt = 0;

hud.setAmmo(weapons.current.mag, weapons.current.reserve, weapons.current.def.name);
hud.setMoney(match.state.money);
hud.setScore(0, 0);
hud.setRound(1);
hud.setTimer(ROUND_TIME);
hud.setAlive(4, 4);
hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (match.state.phase === 'matchEnd') {
    restartMatch();
    return;
  }
  if (match.state.phase === 'menu') {
    match.startMatch();
    resetPositions();
  }
  input.requestLock();
});

function restartMatch() {
  kills = 0;
  match.startMatch();
  resetPositions();
  hud.hideOverlay();
  input.requestLock();
}

function resetPositions() {
  player.reset(world.spawns.attackers[0]);
  const carrier = bots.resetRound(match.state.round);
  match.setCarrier(carrier);
  weapons.refillAmmo();
  hud.setHealth(100, 0);
  hud.setAmmo(weapons.current.mag, weapons.current.reserve, weapons.current.def.name);
  hud.setGrenades(weapons.grenades);
  hud.setScore(match.state.score.ember, match.state.score.ash);
  hud.setRound(match.state.round);
  hud.setMoney(match.state.money);
  syncCamera();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    paused = false;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (match.state.phase === 'round' || match.state.phase === 'buy') {
    paused = true;
    hud.showOverlay('paused', null);
  }
}

function syncCamera() {
  if (!player.state.alive) {
    const ally = bots.list.find((b) => b.team === 'ember' && b.alive);
    if (ally) {
      camera.position.set(ally.body.position.x, ally.body.position.y + 1.5, ally.body.position.z);
      camera.rotation.set(0, ally.yaw, 0, 'YXZ');
      return;
    }
  }
  camera.position.set(player.body.position.x, player.body.position.y + player.body.eye, player.body.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const eye = player.eyePosition(tmpEye);
  const dx = point.x - eye.x;
  const dy = point.y - eye.y;
  const dz = point.z - eye.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

// Raycast helper: the first hit that is not the shooter's own hitbox.
// (A ray starts inside the shooter's own head box, so it must be skipped.)
function firstHit(exclude) {
  const hits = raycaster.intersectObjects(shootables, false);
  for (const hit of hits) {
    if (hit.object.userData.bot === exclude) continue;
    if (exclude === 'player' && hit.object.userData.fighter === 'player') continue;
    return hit;
  }
  return null;
}

// One hitscan shot from the player. Returns true when a round was fired.
function playerShoot() {
  const def = weapons.current.def;
  if (!weapons.takeRound()) {
    audio.dryClick();
    return false;
  }
  camera.getWorldDirection(tmpDir);
  const spread = weapons.spread(player.groundSpeed(), player.state.crouching, !player.body.onGround);
  const pellets = def.pellets || 1;
  let hitAny = false;
  for (let p = 0; p < pellets; p += 1) {
    tmpVec.copy(tmpDir);
    tmpVec.x += (rng() * 2 - 1) * spread;
    tmpVec.y += (rng() * 2 - 1) * spread;
    tmpVec.z += (rng() * 2 - 1) * spread;
    tmpVec.normalize();
    raycaster.set(camera.position, tmpVec);
    raycaster.far = def.range;
    const hit = firstHit('player');
    const end = hit ? hit.point : tmpPoint.copy(camera.position).addScaledVector(tmpVec, def.range);
    tmpVec.copy(camera.position).addScaledVector(tmpDir, 0.5);
    showTracer(tmpVec, end);
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      if (bot.alive) {
        const damage = def.damage * (hit.object.userData.part === 'head' ? def.headMult : 1);
        const wasAlive = bot.alive;
        bots.damage(bot, damage);
        hitAny = true;
        hud.hitMarker(!bot.alive, 400);
        audio.hit(!bot.alive);
        if (wasAlive && !bot.alive) onBotKilled(bot, 'player', hit.object.userData.part === 'head');
      }
    } else if (hit) {
      hitAny = true;
    }
  }
  weapons.pullTrigger();
  player.recoil(0.009 + rng() * 0.004, (rng() * 2 - 1) * 0.004);
  audio.shot(def.kind);
  hud.setAmmo(weapons.current.mag, weapons.current.reserve, def.name);
  return hitAny;
}

// One shot from a bot, resolved with a real raycast against bodies.
function botShoot(bot, targetPos, spread) {
  const from = tmpEye.set(bot.body.position.x, bot.body.position.y + 1.5, bot.body.position.z);
  tmpDir.copy(targetPos).sub(from).normalize();
  tmpDir.x += (rng() * 2 - 1) * spread;
  tmpDir.y += (rng() * 2 - 1) * spread;
  tmpDir.z += (rng() * 2 - 1) * spread;
  tmpDir.normalize();
  raycaster.set(from, tmpDir);
  raycaster.far = bot.weapon.range;
  const hit = firstHit(bot);
  const end = hit ? hit.point : tmpPoint.copy(from).addScaledVector(tmpDir, bot.weapon.range);
  tmpVec.copy(from).addScaledVector(tmpDir, 0.6);
  showTracer(tmpVec, end);
  const distToPlayer = from.distanceTo(player.body.position);
  if (distToPlayer < 30) audio.shot(bot.weapon.kind);
  else audio.distantShot();
  if (!hit) return;
  if (hit.object.userData.fighter === 'player' && player.state.alive) {
    const damage = bot.weapon.damage * (hit.object.userData.part === 'head' ? bot.weapon.headMult : 1);
    player.damage(damage);
    hud.damageFlash();
    audio.hurt();
    hud.setHealth(player.state.health, player.state.armor);
    if (!player.state.alive) onPlayerKilled(bot);
  } else if (hit.object.userData.bot) {
    const victim = hit.object.userData.bot;
    if (victim.alive && victim.team !== bot.team) {
      const damage = bot.weapon.damage * (hit.object.userData.part === 'head' ? bot.weapon.headMult : 1);
      const wasAlive = victim.alive;
      bots.damage(victim, damage);
      if (wasAlive && !victim.alive) onBotKilled(victim, bot, hit.object.userData.part === 'head');
    }
  }
}

function onBotKilled(bot, killer, headshot) {
  const killerName = killer === 'player' ? 'You' : killer.name;
  hud.feed(`<b>${killerName}</b> ${headshot ? '<span class="head">⌖</span> ' : ''}<b>${bot.name}</b>`);
  if (killer === 'player') {
    kills += 1;
    match.onKill('ember');
    hud.setMoney(match.state.money);
  }
  if (match.state.bomb.carrier === bot) {
    match.dropBomb(bot.body.position);
    hud.toast('Bomb dropped — pick it up');
  }
  if (bot.isCarrier) bot.isCarrier = false;
}

function onPlayerKilled(killer) {
  hud.feed(`<b>${killer.name}</b> <b>You</b>`);
  hud.toast('You are down — your team fights on');
  if (match.state.bomb.carrier === 'player') {
    match.dropBomb(player.body.position);
  }
}

function throwGrenade() {
  if (!weapons.takeGrenade()) return;
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.castShadow = true;
  camera.getWorldDirection(tmpDir);
  const start = camera.position.clone().addScaledVector(tmpDir, 0.5);
  mesh.position.copy(start);
  scene.add(mesh);
  const velocity = tmpDir.clone().multiplyScalar(15).add(player.body.velocity);
  velocity.y += 3.5;
  grenades.push({ mesh, velocity, timer: 1.8, owner: 'player' });
  hud.setGrenades(weapons.grenades);
}

function explodeGrenade(grenade) {
  const center = grenade.mesh.position.clone();
  scene.remove(grenade.mesh);
  audio.explosion();
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 12, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 }),
  );
  flash.position.copy(center);
  scene.add(flash);
  let flashLife = 0.25;
  const flashStep = () => {
    flashLife -= 0.016;
    if (flashLife <= 0) {
      scene.remove(flash);
      return;
    }
    flash.scale.multiplyScalar(1.35);
    flash.material.opacity = flashLife * 3;
    requestAnimationFrame(flashStep);
  };
  flashStep();
  const radius = 7;
  const fighters = [player, ...bots.list];
  for (const fighter of fighters) {
    const isPlayer = fighter === player;
    const alive = isPlayer ? player.state.alive : fighter.alive;
    if (!alive) continue;
    const eye = isPlayer
      ? player.eyePosition(new THREE.Vector3())
      : new THREE.Vector3(fighter.body.position.x, fighter.body.position.y + 1.5, fighter.body.position.z);
    const distance = center.distanceTo(eye);
    if (distance > radius) continue;
    if (!hasLineOfSight(raycaster, center, eye, world.occluders)) continue;
    const damage = Math.max(15, 120 * (1 - distance / radius));
    if (isPlayer) {
      player.damage(damage);
      hud.damageFlash();
      audio.hurt();
      hud.setHealth(player.state.health, player.state.armor);
      if (!player.state.alive) hud.toast('You are down — your team fights on');
    } else {
      const wasAlive = fighter.alive;
      bots.damage(fighter, damage);
      if (wasAlive && !fighter.alive) onBotKilled(fighter, 'player', false);
    }
  }
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const grenade = grenades[i];
    grenade.timer -= dt;
    grenade.velocity.y -= 20 * dt;
    grenade.mesh.position.addScaledVector(grenade.velocity, dt);
    if (grenade.mesh.position.y <= 0.09) {
      grenade.mesh.position.y = 0.09;
      grenade.velocity.y *= -0.4;
      grenade.velocity.x *= 0.6;
      grenade.velocity.z *= 0.6;
    }
    if (grenade.timer <= 0) {
      explodeGrenade(grenade);
      grenades.splice(i, 1);
    }
  }
}

function enemiesOf(bot) {
  const out = [];
  if (player.state.alive) {
    out.push({
      alive: true,
      body: player.body,
      eyePosition: (target) => player.eyePosition(target),
      name: 'You',
    });
  }
  for (const other of bots.list) {
    if (other.team !== bot.team && other.alive) out.push(other);
  }
  return out;
}

function botContext() {
  return {
    time: elapsed,
    raycaster,
    bomb: match.state.bomb,
    enemiesOf,
    fireShot: botShoot,
    onPlant(bot) {
      match.onPlant('ember');
      hud.setBomb(`Bomb planted at ${match.state.bomb.siteKey} — ${Math.ceil(match.state.bomb.timer)}s`, 'planted');
      hud.feed(`<b>${bot.name}</b> planted the bomb`);
      audio.plantBeep();
    },
    onDefuse(bot) {
      match.onDefuse('ash');
      hud.feed(`<b>${bot.name}</b> defused the bomb`);
    },
  };
}

function handlePhaseChange() {
  const phase = match.state.phase;
  if (phase === prevPhase) return;
  prevPhase = phase;
  if (phase === 'buy') {
    resetPositions();
    hud.setBomb('', null);
    hud.setPlant(null);
    showBuyMenu();
    hud.setTimer(ROUND_TIME);
  } else if (phase === 'round') {
    hud.hideBuy();
    hud.hideOverlay();
    hud.toast(match.state.round === 1 ? 'Round 1 — plant the bomb at A or B' : `Round ${match.state.round}`);
  } else if (phase === 'roundEnd') {
    hud.hideBuy();
    hud.setPlant(null);
    const winner = match.state.lastWinner;
    const reasonText = {
      elimination: winner === 'ember' ? 'Ash team eliminated.' : 'Ember team eliminated.',
      time: 'Time expired — Ash holds the yard.',
      detonation: 'The bomb detonated — Ember takes the round.',
      defuse: 'The bomb was defused — Ash holds the yard.',
    }[match.state.lastReason] || '';
    if (winner === 'ember') audio.roundWin();
    else audio.roundLose();
    hud.showOverlay('roundEnd', {
      winner,
      reason: reasonText,
      stats: `Score  Ember ${match.state.score.ember} — ${match.state.score.ash} Ash\nYour kills this match: ${kills}\nMoney: $${match.state.money}`,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (phase === 'matchEnd') {
    const winner = match.state.score.ember > match.state.score.ash ? 'ember' : 'ash';
    hud.showOverlay('matchEnd', {
      winner,
      reason: `Final score  Ember ${match.state.score.ember} — ${match.state.score.ash} Ash`,
      stats: `Your kills: ${kills}\nMoney: $${match.state.money}`,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function showBuyMenu() {
  const items = [];
  for (const def of [WEAPONS.rifle, WEAPONS.smg, WEAPONS.shotgun, WEAPONS.sniper]) {
    items.push({
      id: def.id,
      name: def.name,
      detail: `${def.damage} dmg · ${def.mag} rounds`,
      price: def.price,
      disabled: match.state.money < def.price,
    });
  }
  items.push({ id: 'armor', name: 'Kevlar vest', detail: '+100 armour', price: ARMOR_PRICE, disabled: match.state.money < ARMOR_PRICE || player.state.armor >= 100 });
  items.push({ id: 'grenade', name: 'Frag grenade', detail: 'throw with G', price: GRENADE_PRICE, disabled: match.state.money < GRENADE_PRICE || weapons.grenades >= 2 });
  hud.showBuy(items, (id) => {
    if (id === 'armor') {
      if (match.buyArmor()) {
        player.state.armor = 100;
        audio.buy();
        hud.setHealth(player.state.health, player.state.armor);
      }
    } else if (id === 'grenade') {
      if (match.buyGrenade()) {
        weapons.addGrenade();
        audio.buy();
        hud.setGrenades(weapons.grenades);
      }
    } else if (match.buyWeapon(id)) {
      weapons.buy(id);
      weapons.switchTo(id);
      audio.buy();
      hud.setAmmo(weapons.current.mag, weapons.current.reserve, weapons.current.def.name);
    }
    hud.setMoney(match.state.money);
    showBuyMenu();
  });
}

function step(dt) {
  elapsed += dt;
  const phase = match.state.phase;

  // Buy-phase and round input, frozen during the buy countdown.
  const frozen = phase === 'buy' || phase === 'menu';
  if (phase === 'round' || phase === 'buy') {
    const look = input.takeLook();
    // Arrow keys turn without a mouse, so the game plays headless too.
    const keys = input.state.keys;
    const arrowX = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    const arrowY = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    player.look(look.x + arrowX * 3.2, look.y + arrowY * 3.2);
    if (player.state.alive) player.step(dt, keys, frozen);
    weapons.step(dt);
  }

  const pressed = input.takePressed();
  if (phase === 'round' && player.state.alive) {
    if (pressed.has('KeyR')) weapons.reload();
    if (pressed.has('KeyG')) throwGrenade();
    if (pressed.has('Digit1')) weapons.switchTo('rifle');
    if (pressed.has('Digit2')) weapons.switchTo('pistol');
    if (pressed.has('Digit3')) weapons.switchTo('smg');
    if (pressed.has('Digit4')) weapons.switchTo('sniper');
    if (pressed.has('Digit5')) weapons.switchTo('shotgun');
    if (input.state.firing && weapons.ready()) playerShoot();
    else if (input.state.firing && weapons.current.mag === 0 && weapons.state.cooldown === 0) weapons.reload();
  }
  if (pressed.has('KeyB') && phase === 'buy') {
    hud.hideBuy();
  }

  // Zoom: right mouse button, only for the sniper.
  if (weapons.current.def.id === 'sniper' && input.state.keys.has('Mouse2')) {
    if (!weapons.zoomed) {
      weapons.setZoomed(true);
      camera.fov = 30;
      camera.updateProjectionMatrix();
    }
  } else if (weapons.zoomed) {
    weapons.setZoomed(false);
    camera.fov = 74;
    camera.updateProjectionMatrix();
  }

  // Plant / defuse with E held.
  const holdingE = input.state.keys.has('KeyE');
  if (phase === 'round' && player.state.alive && holdingE) {
    const site = nearestSite(player.body.position);
    if (site) {
      if (match.state.bomb.carrier === 'player' && match.state.bomb.status === 'carried') {
        match.state.plantProgress += dt;
        hud.setPlant(match.state.plantProgress / PLANT_TIME, `Planting at ${site.key}…`);
        if (elapsed > plantBeepAt) {
          plantBeepAt = elapsed + 0.5;
          audio.plantBeep();
        }
        if (match.state.plantProgress >= PLANT_TIME) {
          match.state.bomb.siteKey = site.key;
          match.state.bomb.site = site.site;
          match.onPlant('ember');
          hud.setPlant(null);
          hud.setBomb(`Bomb planted at ${site.key} — ${Math.ceil(match.state.bomb.timer)}s`, 'planted');
          hud.feed('<b>You</b> planted the bomb');
        }
      } else if (match.state.bomb.status === 'planted' && match.state.bomb.siteKey === site.key) {
        match.state.defuseProgress += dt;
        hud.setPlant(match.state.defuseProgress / DEFUSE_TIME, 'Defusing…');
        if (match.state.defuseProgress >= DEFUSE_TIME) {
          match.onDefuse('ash');
          hud.setPlant(null);
        }
      }
    } else {
      hud.setPlant(null);
      match.state.plantProgress = 0;
      match.state.defuseProgress = 0;
    }
  } else if (phase === 'round') {
    hud.setPlant(null);
    match.state.plantProgress = 0;
    match.state.defuseProgress = 0;
  }

  // Dropped bomb: the player or the nearest attacker picks it up.
  if (match.state.bomb.status === 'dropped' && match.state.bomb.position) {
    const pos = match.state.bomb.position;
    if (player.state.alive && Math.hypot(player.body.position.x - pos.x, player.body.position.z - pos.z) < 1.4) {
      match.pickUpBomb('player');
      hud.toast('You picked up the bomb — plant it at A or B');
    } else {
      let best = null;
      let bestDist = Infinity;
      for (const bot of bots.list) {
        if (bot.team !== 'ember' || !bot.alive || bot.isCarrier) continue;
        const d = Math.hypot(bot.body.position.x - pos.x, bot.body.position.z - pos.z);
        if (d < bestDist) {
          bestDist = d;
          best = bot;
        }
      }
      if (best && bestDist < 1.4) {
        best.isCarrier = true;
        match.pickUpBomb(best);
      } else if (best && bestDist < 12 && best.state !== 'engage') {
        bots.investigate(best, pos.x, pos.z);
      }
    }
  }

  // Defenders that reach the planted site defuse when nobody threatens them.
  if (match.state.bomb.status === 'planted' && match.state.bomb.site) {
    for (const bot of bots.list) {
      if (bot.team !== 'ash' || !bot.alive) continue;
      const site = match.state.bomb.site;
      const d = Math.hypot(bot.body.position.x - site.center.x, bot.body.position.z - site.center.z);
      if (d < site.radius && !bot.target) {
        bot.state = 'defuse';
        bot.defuseProgress = 0;
      }
    }
  }

  // Bots and grenades only move while a round runs; the buy phase is a
  // freeze, as in the genre.
  if (phase === 'round') {
    bots.step(dt, botContext());
    stepGrenades(dt);
  }
  match.tick(dt, {
    playerAlive: player.state.alive,
    botsAlive: (team) => bots.aliveCount(team),
  });

  // HUD: cheap, every step.
  hud.setHealth(player.state.health, player.state.armor);
  hud.setAmmo(weapons.current.mag, weapons.current.reserve, weapons.current.def.name);
  hud.setGrenades(weapons.grenades);
  hud.setMoney(match.state.money);
  hud.setTimer(match.state.phase === 'buy' ? match.state.phaseTime : match.state.timer);
  hud.setScore(match.state.score.ember, match.state.score.ash);
  hud.setAlive(
    (player.state.alive ? 1 : 0) + bots.aliveCount('ember'),
    bots.aliveCount('ash'),
  );
  hud.setRound(Math.max(1, match.state.round));
  hud.setCrosshairGap(5 + weapons.spread(player.groundSpeed(), player.state.crouching, !player.body.onGround) * 600);
  if (match.state.phase === 'buy') hud.setBuyTimer(match.state.phaseTime);
  if (match.state.bomb.status === 'planted') {
    hud.setBomb(`Bomb planted at ${match.state.bomb.siteKey} — ${Math.ceil(match.state.bomb.timer)}s`, 'planted');
  }
  for (const tracer of tracers) {
    if (tracer.life > 0) {
      tracer.life -= dt;
      if (tracer.life <= 0) tracer.line.material.opacity = 0;
    }
  }
  handlePhaseChange();
}

function nearestSite(position) {
  for (const key of ['A', 'B']) {
    const site = world.sites[key];
    if (Math.hypot(position.x - site.center.x, position.z - site.center.z) < site.radius) {
      return { key, site };
    }
  }
  return null;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && !paused && match.state.phase !== 'menu') {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  // Staged shots fire before the first render, so refresh world matrices
  // here — otherwise raycasts hit geometry still sitting at the origin.
  scene.updateMatrixWorld(true);
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  match.startMatch();
  resetPositions();
  if (name === 'start') {
    player.body.position.set(0, 0, 12);
    player.state.yaw = 0;
    player.state.pitch = 0;
    settle(10);
    aimAt(new THREE.Vector3(0, 1.5, -10));
    hud.showOverlay('start', null);
    hud.hideBuy();
  } else if (name === 'buy') {
    player.body.position.set(0, 0, 12);
    player.state.yaw = 0;
    settle(10);
    aimAt(new THREE.Vector3(0, 1.5, -10));
    showBuyMenu();
  } else if (name === 'play' || name === 'end') {
    // Skip the buy phase: jump straight into the round, mid-fight.
    match.state.phase = 'round';
    match.state.phaseTime = 0;
    prevPhase = 'round';
    player.body.position.set(0, 0, 4);
    player.state.yaw = 0;
    settle(30);
    // Stage the rifle and put an enemy bot in the open lane ahead.
    weapons.buy('rifle');
    weapons.switchTo('rifle');
    const enemy = bots.list.find((b) => b.team === 'ash');
    const stageEnemy = () => {
      enemy.body.position.set(3, 0, -8);
      enemy.yaw = Math.PI;
      enemy.mesh.position.set(3, 0, -8);
      enemy.mesh.rotation.y = Math.PI;
      scene.updateMatrixWorld(true);
      return new THREE.Vector3(enemy.body.position.x, enemy.body.position.y + 1.5, enemy.body.position.z);
    };
    stageEnemy();
    settle(10);
    let eye = stageEnemy();
    aimAt(eye);
    if (name === 'play') {
      playerShoot();
      settle(6);
      eye = stageEnemy();
      aimAt(eye);
      settle(4);
    } else {
      for (let i = 0; i < 3; i += 1) {
        eye = stageEnemy();
        aimAt(eye);
        playerShoot();
        settle(6);
      }
      settle(20);
      // The staged round ends by elimination: drop the remaining Ash bots
      // so the topbar count matches the "Ash team eliminated" result.
      for (const b of bots.list) if (b.team === 'ash' && b.alive) bots.damage(b, 1000);
      settle(2);
      match.endRound('ember', 'elimination');
      handlePhaseChange();
      settle(2);
    }
    hud.setScore(match.state.score.ember, match.state.score.ash);
    hud.setAmmo(weapons.current.mag, weapons.current.reserve, weapons.current.def.name);
  }
  syncCamera();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('mousedown', (event) => {
  if (event.button === 2) input.state.keys.add('Mouse2');
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 2) input.state.keys.delete('Mouse2');
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
