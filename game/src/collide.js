// collide.js — plain AABB / ray math. No allocations in hot paths: callers
// pass scratch objects where noted. Boxes are plain {minX,minY,minZ,maxX,maxY,maxZ}.
export function makeBox(minX, minY, minZ, maxX, maxY, maxZ) {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

// Slab ray vs AABB. Returns the smallest t >= 0 of the hit, or -1.
// Origin (ox,oy,oz), unit direction (dx,dy,dz). maxT caps the search.
export function rayAABB(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0, tmax = maxT;
  let o, d, mn, mx, inv, t1, t2, tmp;
  o = ox; d = dx; mn = b.minX; mx = b.maxX;
  if (d === 0) { if (o < mn || o > mx) return -1; }
  else { inv = 1 / d; t1 = (mn - o) * inv; t2 = (mx - o) * inv; if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  o = oy; d = dy; mn = b.minY; mx = b.maxY;
  if (d === 0) { if (o < mn || o > mx) return -1; }
  else { inv = 1 / d; t1 = (mn - o) * inv; t2 = (mx - o) * inv; if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  o = oz; d = dz; mn = b.minZ; mx = b.maxZ;
  if (d === 0) { if (o < mn || o > mx) return -1; }
  else { inv = 1 / d; t1 = (mn - o) * inv; t2 = (mx - o) * inv; if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  return tmin;
}

// Ray vs sphere. Returns smallest t >= 0 or -1.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const t = tca - Math.sqrt(r2 - d2);
  return t <= maxT ? t : -1;
}

// Move an axis-aligned body (feet position p, half extents h) by (mx, mz) on
// the ground plane, sliding along static boxes. Mutates p. Returns true if
// either axis was blocked.
export function moveXZ(p, hx, hz, mx, mz, boxes) {
  let blocked = false;
  // X axis
  if (mx !== 0) {
    const nx = p.x + mx;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (nx + hx > b.minX && nx - hx < b.maxX && p.y + 1.7 > b.minY && p.y < b.maxY && p.z + hz > b.minZ && p.z - hz < b.maxZ) {
        blocked = true;
        p.x = mx > 0 ? b.minX - hx - 0.001 : b.maxX + hx + 0.001;
        mx = 0;
        break;
      }
    }
    if (mx !== 0) p.x = nx;
  }
  // Z axis
  if (mz !== 0) {
    const nz = p.z + mz;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (p.x + hx > b.minX && p.x - hx < b.maxX && p.y + 1.7 > b.minY && p.y < b.maxY && nz + hz > b.minZ && nz - hz < b.maxZ) {
        blocked = true;
        p.z = mz > 0 ? b.minZ - hz - 0.001 : b.maxZ + hz + 0.001;
        mz = 0;
        break;
      }
    }
    if (mz !== 0) p.z = nz;
  }
  return blocked;
}

// Point-in-box test (used for site zones, bomb radius checks).
export function pointInBox(x, y, z, b) {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ;
}

// 2D distance squared on the ground plane.
export function dist2XZ(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

// Deterministic PRNG (mulberry32) for seeded staging.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
