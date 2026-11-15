// guns.js — weapon definitions and the hitscan firing model shared by the
// player and the bots. Damage falls with distance; headshots pay double;
// spread grows while moving and with each shot, and recoil kicks the aim.
import { rayAABB, raySphere } from './collide.js';

export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'P9 Sidearm', kind: 'pistol', price: 0, auto: false,
    damage: 26, headMult: 2.0, rate: 0.22, mag: 12, reserve: 36,
    spread: 0.011, moveSpread: 0.020, bloom: 0.006, range: 45, reload: 1.1,
    kick: 0.011, tracer: 0xffd27a,
  },
  carbine: {
    id: 'carbine', name: 'KR-7 Carbine', kind: 'rifle', price: 2700, auto: true,
    damage: 30, headMult: 2.0, rate: 0.115, mag: 25, reserve: 75,
    spread: 0.014, moveSpread: 0.030, bloom: 0.009, range: 70, reload: 2.0,
    kick: 0.016, tracer: 0xffc46b,
  },
  smg: {
    id: 'smg', name: 'VSK-9 Spray', kind: 'smg', price: 1800, auto: true,
    damage: 20, headMult: 2.0, rate: 0.075, mag: 30, reserve: 90,
    spread: 0.020, moveSpread: 0.036, bloom: 0.008, range: 40, reload: 1.8,
    kick: 0.012, tracer: 0xffe9a8,
  },
  breacher: {
    id: 'breacher', name: 'Breacher-12', kind: 'shotgun', price: 2200, auto: false,
    damage: 11, headMult: 1.8, rate: 0.95, mag: 5, reserve: 20, pellets: 6,
    spread: 0.05, moveSpread: 0.06, bloom: 0.012, range: 26, reload: 2.4,
    kick: 0.05, tracer: 0xff9d5c,
  },
  grenade: {
    id: 'grenade', name: 'Surge Grenade', kind: 'grenade', price: 400,
    damage: 95, radius: 6, fuse: 1.6,
  },
};

export function createWeaponState(defId) {
  const def = WEAPONS[defId];
  return {
    def, ammo: def.mag, reserve: def.reserve, cooldown: 0,
    reloading: 0, bloom: 0, grenades: 0,
  };
}

// Current spread in radians for a shot, given movement and bloom.
export function currentSpread(w, moving, crouched) {
  let s = w.spread + (moving ? w.moveSpread : 0) + w.bloom;
  if (crouched) s *= 0.7;
  return s;
}

// Hitscan against the world and every living actor except the shooter.
// origin/direction are plain {x,y,z} (direction must be unit length).
// Returns { t, kind: 'wall'|'actor'|null, actor, part, x, y, z }.
export function hitscan(ox, oy, oz, dx, dy, dz, maxDist, colliders, actors, ignore) {
  let bestT = maxDist, best = null;
  for (let i = 0; i < colliders.length; i++) {
    const t = rayAABB(ox, oy, oz, dx, dy, dz, colliders[i], maxDist);
    if (t >= 0 && t < bestT) bestT = t;
  }
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    if (!a.alive || a === ignore) continue;
    // head sphere
    const ht = raySphere(ox, oy, oz, dx, dy, dz, a.pos.x, a.pos.y + 1.52, a.pos.z, 0.17, maxDist);
    if (ht >= 0 && ht < bestT) { bestT = ht; best = { actor: a, part: 'head' }; }
    // body box (feet to shoulders)
    const bt = rayAABB(ox, oy, oz, dx, dy, dz, {
      minX: a.pos.x - 0.36, maxX: a.pos.x + 0.36,
      minY: a.pos.y, maxY: a.pos.y + 1.38,
      minZ: a.pos.z - 0.36, maxZ: a.pos.z + 0.36,
    }, maxDist);
    if (bt >= 0 && bt < bestT) { bestT = bt; best = { actor: a, part: 'body' }; }
  }
  const x = ox + dx * bestT, y = oy + dy * bestT, z = oz + dz * bestT;
  if (best) return { t: bestT, kind: 'actor', actor: best.actor, part: best.part, x, y, z };
  if (bestT < maxDist) return { t: bestT, kind: 'wall', actor: null, part: null, x, y, z };
  return { t: maxDist, kind: null, actor: null, part: null, x, y, z };
}

// Distance falloff: full damage inside 40% of range, half at max range.
export function falloff(damage, dist, range) {
  const f = dist / range;
  if (f <= 0.4) return damage;
  if (f >= 1) return damage * 0.5;
  return damage * (1 - 0.5 * ((f - 0.4) / 0.6));
}

// A thrown grenade: simple ballistic point with bounce. Returns nothing;
// callers step it with stepGrenade and read g.dead / g.exploded.
export function throwGrenade(x, y, z, vx, vy, vz) {
  return { x, y, z, vx, vy, vz, fuse: WEAPONS.grenade.fuse, dead: false, exploded: false };
}

export function stepGrenade(g, dt, colliders) {
  if (g.dead) return;
  g.vy -= 9.8 * dt;
  let nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt;
  // bounce off static boxes (cheap point test with a small radius)
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    if (nx > b.minX - 0.12 && nx < b.maxX + 0.12 && ny > b.minY - 0.12 && ny < b.maxY + 0.12 && nz > b.minZ - 0.12 && nz < b.maxZ + 0.12) {
      // decide which face by the smallest penetration
      const px = Math.min(nx - (b.minX - 0.12), (b.maxX + 0.12) - nx);
      const py = Math.min(ny - (b.minY - 0.12), (b.maxY + 0.12) - ny);
      const pz = Math.min(nz - (b.minZ - 0.12), (b.maxZ + 0.12) - nz);
      if (px <= py && px <= pz) { g.vx = -g.vx * 0.45; nx = g.x; }
      else if (py <= pz) { g.vy = -g.vy * 0.45; ny = g.y; if (Math.abs(g.vy) < 0.8) g.vy = 0; }
      else { g.vz = -g.vz * 0.45; nz = g.z; }
      g.vx *= 0.9; g.vz *= 0.9;
    }
  }
  if (ny < 0.12) { ny = 0.12; g.vy = -g.vy * 0.4; if (Math.abs(g.vy) < 0.8) g.vy = 0; g.vx *= 0.85; g.vz *= 0.85; }
  g.x = nx; g.y = ny; g.z = nz;
  g.fuse -= dt;
  if (g.fuse <= 0) { g.dead = true; g.exploded = true; }
}
