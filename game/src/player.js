// player.js — the human actor: FPS look, acceleration movement, crouch,
// collision, health, weapons and the plant/defuse channel.
import { moveXZ } from './collide.js';
import { WEAPONS, createWeaponState, currentSpread, hitscan, falloff } from './guns.js';

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.08;

export function createPlayer(spawn) {
  return {
    id: 'player', kind: 'player', name: 'YOU', team: 'jackals',
    pos: { x: spawn.x, y: 0, z: spawn.z },
    yaw: spawn.yaw, pitch: 0,
    vel: { x: 0, z: 0 },
    hp: 100, alive: true,
    crouched: false, moving: false, speed2d: 0,
    primary: null, sidearm: createWeaponState('sidearm'), grenades: 0,
    weapon: null, // active weapon state (primary or sidearm)
    kills: 0, deaths: 0,
    planting: 0, defusing: 0,
    lastDamageT: 0, lastDamageFrom: null,
  };
}

export function equipPrimary(player, defId) {
  player.primary = createWeaponState(defId);
  player.weapon = player.primary;
}

export function activeWeapon(player) {
  return player.weapon || player.sidearm;
}

// One fixed step of the player controller. ctx carries the world the
// controller needs; fireHit is called with the hitscan result of each shot.
export function stepPlayer(p, input, dt, ctx) {
  if (!p.alive) return;
  const { dx, dy } = input.consumeMouse();
  p.yaw -= dx * 0.0022;
  p.pitch -= dy * 0.0022;
  p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));

  const k = input.keys;
  p.crouched = k.has('KeyC') || k.has('ControlLeft');
  const walk = k.has('ShiftLeft') || k.has('ShiftRight');
  let fx = 0, fz = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
  const len = Math.hypot(fx, fz) || 1;
  fx /= len; fz /= len;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  // camera forward is (-sin, 0, -cos); right is (cos, 0, -sin)
  const wx = (-sin * -fz + cos * fx);
  const wz = (-cos * -fz + -sin * fx);
  const target = p.crouched ? 2.0 : walk ? 2.6 : 4.3;
  const rate = (fx !== 0 || fz !== 0) ? 7 : 11; // accelerate in, stop fast
  p.vel.x += (wx * target - p.vel.x) * Math.min(1, rate * dt);
  p.vel.z += (wz * target - p.vel.z) * Math.min(1, rate * dt);
  p.speed2d = Math.hypot(p.vel.x, p.vel.z);
  p.moving = p.speed2d > 0.4;
  moveXZ(p.pos, 0.35, 0.35, p.vel.x * dt, p.vel.z * dt, ctx.colliders);

  // weapon timers
  const w = activeWeapon(p);
  if (w) {
    if (w.cooldown > 0) w.cooldown -= dt;
    if (w.reloading > 0) {
      w.reloading -= dt;
      if (w.reloading <= 0) {
        const need = w.def.mag - w.ammo;
        const take = Math.min(need, w.reserve);
        w.ammo += take; w.reserve -= take;
      }
    }
    w.bloom = Math.max(0, w.bloom - dt * 0.03);
    // firing
    if (input.firing && w.cooldown <= 0 && w.reloading <= 0 && ctx.phase === 'live') {
      if (w.ammo <= 0) {
        ctx.onDryFire(p);
        w.cooldown = 0.3;
      } else {
        firePlayerWeapon(p, w, ctx);
      }
    }
  }
}

function firePlayerWeapon(p, w, ctx) {
  const def = w.def;
  w.ammo -= 1;
  w.cooldown = def.rate;
  w.bloom = Math.min(0.05, w.bloom + def.bloom);
  p.pitch += def.kick * (0.7 + Math.random() * 0.6);
  const spread = currentSpread(w, p.moving, p.crouched);
  const eyeY = p.pos.y + (p.crouched ? EYE_CROUCH : EYE_STAND);
  const pellets = def.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    const sx = (Math.random() * 2 - 1) * spread;
    const sy = (Math.random() * 2 - 1) * spread;
    const yaw = p.yaw + sx, pitch = p.pitch + sy;
    const dx = -Math.sin(yaw) * Math.cos(pitch);
    const dy = Math.sin(pitch);
    const dz = -Math.cos(yaw) * Math.cos(pitch);
    const hit = hitscan(p.pos.x, eyeY, p.pos.z, dx, dy, dz, def.range, ctx.colliders, ctx.actors, p);
    ctx.onShot(p, w, p.pos.x, eyeY, p.pos.z, hit);
    if (hit.kind === 'actor') {
      const dmg = falloff(def.damage, hit.t, def.range) * (hit.part === 'head' ? def.headMult : 1);
      ctx.onDamage(hit.actor, dmg, p, hit.part);
    }
  }
  if (w.ammo === 0) ctx.onEmpty(p);
}

export function startReload(p) {
  const w = activeWeapon(p);
  if (!w || w.reloading > 0 || w.ammo >= w.def.mag || w.reserve <= 0) return false;
  w.reloading = w.def.reload;
  return true;
}

export function switchWeapon(p, slot) {
  if (slot === 1 && p.primary) p.weapon = p.primary;
  else if (slot === 2) p.weapon = p.sidearm;
}

export function eyePos(p, out) {
  out.x = p.pos.x;
  out.y = p.pos.y + (p.crouched ? EYE_CROUCH : EYE_STAND);
  out.z = p.pos.z;
  return out;
}
