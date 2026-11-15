// bots.js — the nine AI opponents and teammates. Perception (sight cone +
// line of sight + hearing gunfire), waypoint routes, hold/patrol/push,
// bursts with real hitscan aim error, planting and defusing.
import * as THREE from 'three';
import { moveXZ, rayAABB, dist2XZ } from './collide.js';
import { nearestNode, findRoute } from './map.js';
import { WEAPONS, createWeaponState, hitscan, falloff } from './guns.js';
import { TEAM_COLOR } from './state.js';

const BOT_NAMES = {
  jackals: ['Mara', 'Kip', 'Rook', 'Vex'],
  wardens: ['Hale', 'Bram', 'Sable', 'Ivo', 'Nia'],
};
const BOT_LOADOUT = {
  jackals: ['carbine', 'smg', 'carbine', 'breacher'],
  wardens: ['carbine', 'smg', 'carbine', 'smg', 'carbine'],
};

function buildBotMesh(team, scene) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: TEAM_COLOR[team], roughness: 0.8, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.85, metalness: 0.1 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a586, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), cloth);
  torso.position.y = 1.02; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.56; head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.06), dark);
  visor.position.set(0, 1.58, -0.16);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.26), dark);
  legL.position.set(-0.16, 0.31, 0); legL.castShadow = true;
  const legR = legL.clone();
  legR.position.x = 0.16;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.85), dark);
  gun.position.set(0.28, 1.18, -0.4); gun.castShadow = true;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, 0.36),
    new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team] }));
  stripe.position.y = 1.3;
  g.add(torso, head, visor, legL, legR, gun, stripe);
  scene.add(g);
  return { group: g, legL, legR, head };
}

export function createBot(id, team, spawn, scene, weaponId, skill) {
  const bot = {
    id, kind: 'bot', name: BOT_NAMES[team][id % BOT_NAMES[team].length], team,
    pos: { x: spawn.x, y: 0, z: spawn.z }, yaw: spawn.yaw, pitch: 0,
    hp: 100, alive: true, skill,
    weapon: createWeaponState(weaponId),
    state: 'hold', route: [], routeIdx: 0, routeTarget: -1,
    holdNode: -1, patrolA: -1, patrolB: -1, patrolTo: -1, waitT: 0,
    target: null, reactT: 0, burstLeft: 0, burstT: 0, pauseT: 0,
    plantT: 0, defuseT: 0, stuckT: 0, sideT: 0, sideDir: 1,
    offX: (Math.random() * 2 - 1) * 0.5, offZ: (Math.random() * 2 - 1) * 0.5,
    lastX: spawn.x, lastZ: spawn.z,
    speed: 3.1 + Math.random() * 0.6, stepT: 0, walkPhase: Math.random() * 6,
    alertX: 0, alertZ: 0, alertT: -10, carrier: false,
    kills: 0, deaths: 0, lastDamageT: 0, lastDamageFrom: null,
  };
  bot.mesh = buildBotMesh(team, scene);
  return bot;
}

export function spawnBots(state, scene, mapData) {
  const bots = [];
  let n = 0;
  for (let i = 0; i < 4; i++) {
    const s = mapData.spawns.jackals[i + 1];
    bots.push(createBot(n++, 'jackals', s, scene, BOT_LOADOUT.jackals[i], 0.62 + Math.random() * 0.25));
  }
  for (let i = 0; i < 5; i++) {
    const s = mapData.spawns.wardens[i];
    bots.push(createBot(n++, 'wardens', s, scene, BOT_LOADOUT.wardens[i], 0.62 + Math.random() * 0.25));
  }
  return bots;
}

export function resetBot(bot, spawn) {
  bot.pos.x = spawn.x; bot.pos.z = spawn.z; bot.pos.y = 0;
  bot.yaw = spawn.yaw; bot.hp = 100; bot.alive = true;
  bot.weapon = createWeaponState(bot.weapon.def.id);
  bot.state = 'hold'; bot.route = []; bot.routeIdx = 0;
  bot.target = null; bot.burstLeft = 0; bot.plantT = 0; bot.defuseT = 0;
  bot.carrier = false; bot.waitT = Math.random() * 2;
  bot.mesh.group.visible = true;
  bot.mesh.group.rotation.set(0, 0, 0);
  bot.mesh.group.position.set(bot.pos.x, 0, bot.pos.z);
}

// Line of sight: true when no static box blocks eye->chest.
function canSee(bot, enemy, colliders) {
  const dx = enemy.pos.x - bot.pos.x, dz = enemy.pos.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 46) return false;
  const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
  if ((dx * fx + dz * fz) / Math.max(0.001, dist) < 0.35) return false;
  const eyeY = bot.pos.y + 1.5, chestY = enemy.pos.y + 1.15;
  const dirX = dx / dist, dirZ = dz / dist;
  const dirY = (chestY - eyeY) / Math.max(0.001, dist);
  const len = Math.hypot(dirX, dirY, dirZ);
  for (let i = 0; i < colliders.length; i++) {
    const hit = rayAABB(bot.pos.x, eyeY, bot.pos.z, dirX / len, dirY / len, dirZ / len, colliders[i], dist);
    if (hit >= 0) return false;
  }
  return true;
}

function nearestVisibleEnemy(bot, actors, colliders) {
  let best = null, bd = Infinity;
  for (const a of actors) {
    if (a === bot || !a.alive || a.team === bot.team) continue;
    const d2 = dist2XZ(bot.pos.x, bot.pos.z, a.pos.x, a.pos.z);
    if (d2 > bd) continue;
    if (canSee(bot, a, colliders)) { best = a; bd = d2; }
  }
  return best;
}

function faceToward(bot, x, z, dt, rate) {
  const want = Math.atan2(-(x - bot.pos.x), -(z - bot.pos.z));
  let d = want - bot.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
}

function followRoute(bot, dt, colliders, ctx) {
  if (bot.routeIdx >= bot.route.length) return true;
  const node = ctx.mapData.nav[bot.route[bot.routeIdx]];
  // each bot aims for its own small offset around the waypoint so the squad
  // does not stack on one point
  const tx = node[0] + bot.offX, tz = node[1] + bot.offZ;
  const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.7) { bot.routeIdx++; return bot.routeIdx >= bot.route.length; }
  faceToward(bot, tx, tz, dt, 6);
  bot.state = 'move';
  const sp = bot.speed * dt;
  let blocked;
  if (bot.sideT > 0) {
    // sidestepping around something that blocked the direct line
    bot.sideT -= dt;
    const px = -dz / d * bot.sideDir, pz = dx / d * bot.sideDir;
    blocked = moveXZ(bot.pos, 0.35, 0.35, px * sp, pz * sp, colliders);
  } else {
    blocked = moveXZ(bot.pos, 0.35, 0.35, (dx / d) * sp, (dz / d) * sp, colliders);
  }
  if (blocked) {
    bot.stuckT += dt;
    if (bot.stuckT > 0.8) {
      // sidestep sideways for a moment instead of re-routing (a re-route to
      // the same destination just replays the same blocked line)
      bot.stuckT = 0;
      bot.sideT = 0.6;
      bot.sideDir = -bot.sideDir;
    }
  } else bot.stuckT = 0;
  bot.walkPhase += dt * bot.speed * 2.2;
  bot.stepT += dt;
  if (bot.stepT > 0.42) { bot.stepT = 0; if (ctx.onStep) ctx.onStep(bot); }
  return false;
}

function setRoute(bot, ctx, destNode) {
  const from = nearestNode(bot.pos.x, bot.pos.z);
  bot.route = findRoute(ctx.mapData.links, from, destNode);
  bot.routeIdx = 0;
  bot.routeTarget = destNode;
}

function botShoot(bot, dt, ctx) {
  const w = bot.weapon;
  if (w.cooldown > 0) { w.cooldown -= dt; return; }
  if (w.reloading > 0) {
    w.reloading -= dt;
    if (w.reloading <= 0) {
      const need = w.def.mag - w.ammo, take = Math.min(need, w.reserve);
      w.ammo += take; w.reserve -= take;
    }
    return;
  }
  if (w.ammo <= 0) { w.reloading = w.def.reload; return; }
  if (bot.burstLeft <= 0) {
    if (bot.pauseT > 0) { bot.pauseT -= dt; return; }
    bot.burstLeft = 3 + Math.floor(Math.random() * 2);
    bot.pauseT = 0.5 + Math.random() * 0.5;
  }
  if (bot.burstT > 0) { bot.burstT -= dt; return; }
  bot.burstT = w.def.rate;
  bot.burstLeft -= 1;
  w.ammo -= 1;
  w.cooldown = 0;
  // aim with error: worse at range, against moving targets, better with skill
  const t = bot.target;
  const dx = t.pos.x - bot.pos.x, dz = t.pos.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  const tSpeed = t.kind === 'player' ? (t.speed2d || 0) : 2.5;
  const err = (0.010 + dist * 0.00045 + tSpeed * 0.002) / Math.max(0.4, bot.skill);
  const baseYaw = Math.atan2(-dx, -dz);
  const aimYaw = baseYaw + (Math.random() * 2 - 1) * err * 1.2;
  const aimPitch = ((t.pos.y + 1.2) - (bot.pos.y + 1.45)) / Math.max(1, dist) + (Math.random() * 2 - 1) * err;
  const ddx = -Math.sin(aimYaw) * Math.cos(aimPitch);
  const ddy = Math.sin(aimPitch);
  const ddz = -Math.cos(aimYaw) * Math.cos(aimPitch);
  const eyeY = bot.pos.y + 1.45;
  const hit = hitscan(bot.pos.x, eyeY, bot.pos.z, ddx, ddy, ddz, w.def.range, ctx.colliders, ctx.actors, bot);
  ctx.onShot(bot, w, bot.pos.x, eyeY, bot.pos.z, hit);
  if (hit.kind === 'actor' && hit.actor.team !== bot.team) {
    const dmg = falloff(w.def.damage, hit.t, w.def.range) * (hit.part === 'head' ? w.def.headMult : 1);
    ctx.onDamage(hit.actor, dmg, bot, hit.part);
  }
}

export function stepBot(bot, dt, ctx) {
  if (!bot.alive) return;
  const state = ctx.state;
  // perception
  const enemy = nearestVisibleEnemy(bot, ctx.actors, ctx.colliders);
  if (enemy) {
    if (bot.target !== enemy) { bot.target = enemy; bot.reactT = 0.35 + Math.random() * 0.35 / Math.max(0.5, bot.skill); }
  } else if (bot.target) {
    bot.target = null;
  }
  // hearing: recent enemy gunfire within 25 m pulls the bot to investigate
  if (!bot.target && ctx.shots) {
    for (let i = ctx.shots.length - 1; i >= 0; i--) {
      const s = ctx.shots[i];
      if (s.team !== bot.team && state.time - s.t < 1.2) {
        const d2 = dist2XZ(bot.pos.x, bot.pos.z, s.x, s.z);
        if (d2 < 625) {
          bot.alertX = s.x; bot.alertZ = s.z; bot.alertT = state.time;
          setRoute(bot, ctx, nearestNode(s.x, s.z));
          bot.state = 'push';
          break;
        }
      }
    }
  }

  if (bot.target) {
    // engage: face and shoot in bursts
    const t = bot.target;
    faceToward(bot, t.pos.x, t.pos.z, dt, 8);
    bot.state = 'engage';
    if (bot.reactT > 0) bot.reactT -= dt;
    else botShoot(bot, dt, ctx);
    // close the distance when the fight is at long range, so duels resolve
    const tdx = t.pos.x - bot.pos.x, tdz = t.pos.z - bot.pos.z;
    const td = Math.hypot(tdx, tdz);
    if (td > 18) {
      moveXZ(bot.pos, 0.35, 0.35, (tdx / td) * bot.speed * 0.55 * dt, (tdz / td) * bot.speed * 0.55 * dt, ctx.colliders);
    }
    // strafe a little while fighting
    if (Math.random() < dt * 0.4) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const fx = Math.cos(bot.yaw) * side, fz = -Math.sin(bot.yaw) * side;
      moveXZ(bot.pos, 0.35, 0.35, fx * 1.2 * dt, fz * 1.2 * dt, ctx.colliders);
    }
    bot.plantT = 0; bot.defuseT = 0;
  } else if (bot.team === 'wardens') {
    // defenders: hold their site, or rotate to the planted bomb
    if (state.bomb.state === 'planted') {
      const site = state.bomb.site;
      const d2 = dist2XZ(bot.pos.x, bot.pos.z, state.bomb.x, state.bomb.z);
      if (d2 < 6.25) {
        bot.defuseT += dt;
        faceToward(bot, state.bomb.x, state.bomb.z, dt, 6);
        if (bot.defuseT >= 5) ctx.onDefuse(bot);
      } else {
        bot.defuseT = 0;
        if (bot.routeTarget !== site.node) setRoute(bot, ctx, site.node);
        followRoute(bot, dt, ctx.colliders, ctx);
      }
    } else {
      if (bot.holdNode < 0) {
        const site = state.plan === 'A' ? ctx.mapData.sites.A : ctx.mapData.sites.B;
        bot.holdNode = site.node;
        bot.patrolA = site.node; bot.patrolB = site.approach;
        bot.patrolTo = bot.patrolB;
        setRoute(bot, ctx, bot.patrolA);
      }
      if (bot.routeIdx < bot.route.length) {
        followRoute(bot, dt, ctx.colliders, ctx);
      } else {
        bot.state = 'hold';
        bot.waitT -= dt;
        // slow scan while holding
        bot.yaw += Math.sin(state.time * 0.5 + bot.id) * 0.25 * dt;
        if (bot.waitT <= 0) {
          bot.waitT = 2 + Math.random() * 3;
          bot.patrolTo = bot.patrolTo === bot.patrolA ? bot.patrolB : bot.patrolA;
          setRoute(bot, ctx, bot.patrolTo);
        }
      }
    }
  } else {
    // attackers: push the planned site; the carrier plants when it is safe
    const site = state.plan === 'A' ? ctx.mapData.sites.A : ctx.mapData.sites.B;
    if (bot.carrier) {
      const d2 = dist2XZ(bot.pos.x, bot.pos.z, site.x, site.z);
      if (d2 < 12.25) {
        bot.plantT += dt;
        faceToward(bot, site.x, site.z, dt, 6);
        if (bot.plantT >= 3.5) ctx.onPlant(bot);
        return;
      }
      bot.plantT = 0;
    }
    if (bot.routeTarget !== site.node || bot.routeIdx >= bot.route.length) {
      setRoute(bot, ctx, site.node);
    }
    followRoute(bot, dt, ctx.colliders, ctx);
  }

  // mesh sync
  const m = bot.mesh.group;
  m.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
  m.rotation.y = bot.yaw;
  const swing = Math.sin(bot.walkPhase) * 0.45;
  bot.mesh.legL.rotation.x = swing;
  bot.mesh.legR.rotation.x = -swing;
}

export function killBotMesh(bot) {
  bot.mesh.group.rotation.z = Math.PI / 2;
  bot.mesh.group.position.y = 0.25;
}
