// Bots: the other seven fighters of a 4v4 round. Each bot is a body that
// moves against the world's colliders, a mesh the player can shoot, and a
// small state machine: follow a route through the waypoint graph, hold an
// angle, engage what it sees, plant the bomb or defuse it, and investigate
// noises. Shooting itself is resolved by main.js (one raycast per shot);
// a bot only decides when and where to fire.
import * as THREE from 'three';
import { createBody, moveBody, hasLineOfSight } from './physics.js';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';

const BOT_NAMES = {
  ember: ['Vex', 'Rook', 'Mira'],
  ash: ['Sable', 'Onyx', 'Flint', 'Wren'],
};
const BOT_WEAPON = {
  ember: ['rifle', 'smg', 'shotgun'],
  ash: ['rifle', 'rifle', 'smg', 'sniper'],
};
const WALK_SPEED = 3.6;
const ROTATE_SPEED = 4.6;
const EYE_HEIGHT = 1.5;
const SIGHT_RANGE = 42;
const SIGHT_HALF_ANGLE = 0.96; // ~55 degrees
const REACTION_BASE = 0.65;
const BURST_MIN = 3;
const BURST_MAX = 5;

function nearestNode(waypoints, x, z) {
  let best = waypoints.nodes[0];
  let bestDist = Infinity;
  for (const node of waypoints.nodes) {
    const d = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

// Breadth-first route through the waypoint graph, as a list of positions.
export function findRoute(waypoints, fromId, toId) {
  if (fromId === toId) return [];
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of waypoints.adjacency.get(current) || []) {
      if (prev.has(next)) continue;
      prev.set(next, current);
      if (next === toId) {
        const path = [];
        let step = next;
        while (step !== null) {
          path.unshift(step);
          step = prev.get(step);
        }
        return path.slice(1).map((id) => waypoints.nodes.find((n) => n.id === id));
      }
      queue.push(next);
    }
  }
  return [];
}

function buildMesh(team) {
  const teamColor = team === 'ember' ? PALETTE.ember : PALETTE.ash;
  const group = new THREE.Group();
  const teamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.7, metalness: 0.1 });
  const vestMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.vest), roughness: 0.8, metalness: 0.1 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.skin), roughness: 0.8, metalness: 0 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.6, metalness: 0.4 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.32), teamMat);
  torso.position.y = 1.02;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.36), vestMat);
  vest.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
  head.position.y = 1.56;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.1), darkMat);
  visor.position.set(0, 1.58, -0.14);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.24), vestMat);
  legL.position.set(-0.15, 0.31, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.24), vestMat);
  legR.position.set(0.15, 0.31, 0);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), darkMat);
  gun.position.set(0.2, 1.15, -0.3);
  group.add(torso, vest, head, visor, legL, legR, gun);
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
    }
  });
  return { group, torso, head, gun };
}

export function createBots(scene, world, rng) {
  const bots = [];
  const tmpEye = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();

  function makeBot(team, index, spawn) {
    const weaponId = BOT_WEAPON[team][index % BOT_WEAPON[team].length];
    const parts = buildMesh(team);
    parts.head.userData = { bot: null, part: 'head' };
    parts.torso.userData = { bot: null, part: 'body' };
    scene.add(parts.group);
    const bot = {
      team,
      name: BOT_NAMES[team][index],
      weapon: WEAPONS[weaponId],
      body: createBody(spawn.x, spawn.z, 0.34, 1.72),
      yaw: team === 'ember' ? Math.PI : 0,
      pitch: 0,
      health: 100,
      alive: true,
      skill: 0.55 + rng() * 0.4,
      state: 'route',
      path: [],
      pathIndex: 0,
      holdUntil: 0,
      holdYaw: 0,
      target: null,
      lastSeen: null,
      reaction: 0,
      burstLeft: 0,
      burstPause: 0,
      shotCooldown: 0,
      senseTimer: rng() * 0.12,
      strafeDir: 1,
      strafeTimer: 0,
      isCarrier: false,
      plantProgress: 0,
      defuseProgress: 0,
      investigate: null,
      site: null,
      deathTimer: 0,
      mesh: parts.group,
      gun: parts.gun,
      hitMeshes: [parts.head, parts.torso],
    };
    parts.head.userData.bot = bot;
    parts.torso.userData.bot = bot;
    return bot;
  }

  function spawnBots() {
    bots.length = 0;
    world.spawns.attackers.forEach((spawn, i) => {
      if (i === 0) return; // index 0 is the player's spawn
      bots.push(makeBot('ember', i - 1, spawn));
    });
    world.spawns.defenders.forEach((spawn, i) => {
      bots.push(makeBot('ash', i, spawn));
    });
  }

  function resetRound(round, carrierTeam) {
    const emberSpawns = world.spawns.attackers.slice(1);
    const ashSpawns = world.spawns.defenders;
    let ei = 0;
    let ai = 0;
    for (const bot of bots) {
      const spawn = bot.team === 'ember' ? emberSpawns[ei++] : ashSpawns[ai++];
      bot.body.position.set(spawn.x, 0, spawn.z);
      bot.body.velocity.set(0, 0, 0);
      bot.yaw = bot.team === 'ember' ? Math.PI : 0;
      bot.health = 100;
      bot.alive = true;
      bot.state = 'route';
      bot.path = [];
      bot.pathIndex = 0;
      bot.target = null;
      bot.lastSeen = null;
      bot.reaction = 0;
      bot.burstLeft = 0;
      bot.burstPause = 0;
      bot.isCarrier = false;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.investigate = null;
      bot.deathTimer = 0;
      bot.mesh.rotation.set(0, bot.yaw, 0);
      bot.mesh.visible = true;
      bot.site = null;
      if (bot.team === 'ember') {
        bot.site = rng() < 0.5 ? 'A' : 'B';
      } else {
        bot.site = rng() < 0.45 ? 'A' : rng() < 0.9 ? 'B' : 'mid';
      }
    }
    // One attacker carries the bomb; prefer a bot, so the player may pick
    // it up after a death instead of always starting with it.
    const carriers = bots.filter((b) => b.team === 'ember');
    const carrier = carriers[Math.floor(rng() * carriers.length)];
    carrier.isCarrier = true;
    return carrier;
  }

  function setRoute(bot, toId) {
    const from = nearestNode(world.waypoints, bot.body.position.x, bot.body.position.z);
    bot.path = findRoute(world.waypoints, from.id, toId);
    bot.pathIndex = 0;
  }

  function faceToward(bot, x, z, dt) {
    const targetYaw = Math.atan2(-(x - bot.body.position.x), -(z - bot.body.position.z));
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    bot.yaw += turn;
  }

  function eyeOf(bot, out) {
    out.set(bot.body.position.x, bot.body.position.y + EYE_HEIGHT, bot.body.position.z);
    return out;
  }

  function canSee(bot, fighter, raycaster) {
    const from = eyeOf(bot, tmpEye);
    const to = fighter.eyePosition ? fighter.eyePosition(tmpTarget) : tmpTarget.set(fighter.body.position.x, fighter.body.position.y + 1.5, fighter.body.position.z);
    tmpDir.copy(to).sub(from);
    const distance = tmpDir.length();
    if (distance > SIGHT_RANGE) return null;
    tmpDir.multiplyScalar(1 / distance);
    const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    const dot = facing.x * tmpDir.x + facing.z * tmpDir.z;
    if (dot < Math.cos(SIGHT_HALF_ANGLE) && distance > 8) return null;
    if (!hasLineOfSight(raycaster, from, to, world.occluders)) return null;
    return { distance, position: to.clone() };
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      if (bot.deathTimer < 0.5) {
        bot.deathTimer += dt;
        bot.mesh.rotation.x = -Math.PI / 2 * Math.min(1, bot.deathTimer / 0.5);
      }
      return;
    }
    bot.senseTimer -= dt;
    bot.shotCooldown = Math.max(0, bot.shotCooldown - dt);
    bot.burstPause = Math.max(0, bot.burstPause - dt);

    // Sense: the nearest visible enemy, re-checked a few times a second.
    if (bot.senseTimer <= 0) {
      bot.senseTimer = 0.12 + rng() * 0.06;
      bot.target = null;
      let bestDist = Infinity;
      for (const enemy of ctx.enemiesOf(bot)) {
        if (!enemy.alive) continue;
        const seen = canSee(bot, enemy, ctx.raycaster);
        if (seen && seen.distance < bestDist) {
          bestDist = seen.distance;
          bot.target = { fighter: enemy, distance: seen.distance, position: seen.position };
          bot.lastSeen = seen.position.clone();
        }
      }
      if (bot.target) {
        if (bot.state !== 'engage') bot.reaction = REACTION_BASE * (1.2 - bot.skill * 0.5) + rng() * 0.25;
        bot.state = 'engage';
      } else if (bot.state === 'engage') {
        bot.state = bot.investigate ? 'investigate' : 'route';
      }
    }

    // Planting or defusing: stand still, channel, finish.
    if (bot.state === 'plant') {
      bot.plantProgress += dt;
      faceToward(bot, ctx.bomb.site.center.x, ctx.bomb.site.center.z, dt);
      if (bot.plantProgress >= 3) ctx.onPlant(bot);
      return;
    }
    if (bot.state === 'defuse') {
      bot.defuseProgress += dt;
      if (bot.defuseProgress >= 5) ctx.onDefuse(bot);
      return;
    }

    // Engaging: face the target, strafe, fire in bursts.
    if (bot.state === 'engage' && bot.target) {
      const target = bot.target;
      faceToward(bot, target.position.x, target.position.z, dt);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = 0.7 + rng() * 0.9;
        bot.strafeDir = rng() < 0.5 ? -1 : 1;
      }
      const strafe = bot.strafeDir * 1.6;
      const sin = Math.sin(bot.yaw);
      const cos = Math.cos(bot.yaw);
      bot.body.velocity.x = cos * strafe;
      bot.body.velocity.z = -sin * strafe;
      moveBody(bot.body, dt, world.colliders);
      bot.reaction -= dt;
      if (bot.reaction <= 0 && bot.burstPause <= 0) {
        if (bot.burstLeft <= 0) {
          bot.burstLeft = BURST_MIN + Math.floor(rng() * (BURST_MAX - BURST_MIN + 1));
          bot.burstPause = 0.45 + rng() * 0.45;
        }
        if (bot.shotCooldown <= 0 && bot.burstLeft > 0) {
          bot.burstLeft -= 1;
          bot.shotCooldown = bot.weapon.fireGap;
          const spread = 0.012 + target.distance * 0.0011 + (1 - bot.skill) * 0.014;
          ctx.fireShot(bot, target.position, spread);
        }
      }
      return;
    }

    // Routing: follow the waypoint path, or pick a new one.
    if (bot.state === 'route' || bot.state === 'investigate') {
      if (bot.pathIndex >= bot.path.length) {
        if (bot.state === 'investigate') {
          bot.investigate = null;
          bot.state = 'hold';
          bot.holdUntil = ctx.time + 3;
          bot.holdYaw = bot.yaw;
        } else if (bot.team === 'ember') {
          const site = bot.site;
          const atSite = site === 'A' ? world.sites.A : world.sites.B;
          const dx = bot.body.position.x - atSite.center.x;
          const dz = bot.body.position.z - atSite.center.z;
          if (Math.hypot(dx, dz) < atSite.radius) {
            if (bot.isCarrier && ctx.bomb.status === 'carried') {
              bot.state = 'plant';
              bot.plantProgress = 0;
            } else {
              bot.state = 'hold';
              bot.holdUntil = ctx.time + 4 + rng() * 4;
              bot.holdYaw = bot.yaw + (rng() - 0.5) * 2;
            }
          } else {
            setRoute(bot, site === 'A' ? 'siteA' : 'siteB');
          }
        } else {
          bot.state = 'hold';
          bot.holdUntil = ctx.time + 5 + rng() * 5;
          bot.holdYaw = bot.team === 'ash' ? 0 : Math.PI;
        }
      } else {
        const node = bot.path[bot.pathIndex];
        const dx = node.x - bot.body.position.x;
        const dz = node.z - bot.body.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.6) {
          bot.pathIndex += 1;
        } else {
          const speed = bot.state === 'investigate' ? ROTATE_SPEED : WALK_SPEED;
          bot.body.velocity.x = (dx / distance) * speed;
          bot.body.velocity.z = (dz / distance) * speed;
          faceToward(bot, node.x, node.z, dt);
          moveBody(bot.body, dt, world.colliders);
        }
      }
      return;
    }

    // Holding: stand, watch the assigned angle, occasionally shift.
    if (bot.state === 'hold') {
      bot.body.velocity.x = 0;
      bot.body.velocity.z = 0;
      const diff = bot.holdYaw - bot.yaw;
      bot.yaw += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
      if (ctx.time > bot.holdUntil) {
        if (bot.team === 'ash' && ctx.bomb.status === 'planted') {
          const site = ctx.bomb.siteKey;
          setRoute(bot, site === 'A' ? 'siteA' : 'siteB');
          bot.state = 'route';
        } else if (bot.team === 'ember' && ctx.bomb.status === 'planted') {
          bot.state = 'hold';
          bot.holdUntil = ctx.time + 4;
        } else if (bot.team === 'ash') {
          // Defenders drift between their site and mid.
          const options = bot.site === 'A' ? ['siteA', 'midN'] : bot.site === 'B' ? ['siteB', 'midN'] : ['mid', 'midN'];
          setRoute(bot, options[Math.floor(rng() * options.length)]);
          bot.state = 'route';
        } else {
          bot.state = 'hold';
          bot.holdUntil = ctx.time + 4 + rng() * 4;
        }
      }
    }
  }

  function investigate(bot, x, z) {
    if (!bot.alive || bot.state === 'engage' || bot.state === 'plant' || bot.state === 'defuse') return;
    const node = nearestNode(world.waypoints, x, z);
    bot.investigate = { x, z };
    setRoute(bot, node.id);
    bot.state = 'investigate';
  }

  function damage(bot, amount) {
    if (!bot.alive) return 0;
    bot.health -= amount;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.deathTimer = 0;
      bot.mesh.rotation.x = 0;
      return amount;
    }
    return amount;
  }

  function aliveCount(team) {
    let count = 0;
    for (const bot of bots) if (bot.team === team && bot.alive) count += 1;
    return count;
  }

  function step(dt, ctx) {
    for (const bot of bots) stepBot(bot, dt, ctx);
    // Separation: bots never stack on each other.
    for (let i = 0; i < bots.length; i += 1) {
      const a = bots[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < bots.length; j += 1) {
        const b = bots[j];
        if (!b.alive) continue;
        const dx = b.body.position.x - a.body.position.x;
        const dz = b.body.position.z - a.body.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (0.8 - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          a.body.position.x -= nx * push;
          a.body.position.z -= nz * push;
          b.body.position.x += nx * push;
          b.body.position.z += nz * push;
        }
      }
    }
    // Meshes follow bodies.
    for (const bot of bots) {
      bot.mesh.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
      if (bot.alive) bot.mesh.rotation.y = bot.yaw;
    }
  }

  spawnBots();
  return {
    list: bots,
    step,
    resetRound,
    investigate,
    damage,
    aliveCount,
    findRoute,
  };
}
