// Shared movement physics: a body is a vertical box (a circle in plan)
// that moves against the world's axis-aligned colliders one axis at a time,
// so a wall never swallows it and sliding along a wall just works.
// Everything the sim moves — the player and every bot — is one of these.
import * as THREE from 'three';

export const GRAVITY = 20;

export function createBody(x, z, radius, height) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    radius,
    height,
    eye: 1.6,
    onGround: true,
  };
}

// Move the body by its velocity for dt, resolving each axis separately.
// Returns the collider hit on the horizontal axes, if any.
export function moveBody(body, dt, colliders) {
  const probe = moveBody._probe || (moveBody._probe = new THREE.Box3());
  let hit = null;

  // X axis.
  body.position.x += body.velocity.x * dt;
  probe.min.set(body.position.x - body.radius, body.position.y + 0.05, body.position.z - body.radius);
  probe.max.set(body.position.x + body.radius, body.position.y + body.height - 0.05, body.position.z + body.radius);
  for (const box of colliders) {
    if (probe.intersectsBox(box)) {
      body.position.x -= body.velocity.x * dt;
      body.velocity.x = 0;
      hit = box;
      break;
    }
  }
  // Z axis.
  body.position.z += body.velocity.z * dt;
  probe.min.set(body.position.x - body.radius, body.position.y + 0.05, body.position.z - body.radius);
  probe.max.set(body.position.x + body.radius, body.position.y + body.height - 0.05, body.position.z + body.radius);
  for (const box of colliders) {
    if (probe.intersectsBox(box)) {
      body.position.z -= body.velocity.z * dt;
      body.velocity.z = 0;
      hit = box;
      break;
    }
  }
  // Y axis: gravity and the floor at y = 0.
  body.velocity.y -= GRAVITY * dt;
  body.position.y += body.velocity.y * dt;
  if (body.position.y <= 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  } else {
    body.onGround = false;
  }
  return hit;
}

// True when the straight line from `from` to `to` is not blocked by any
// occluder mesh (used for sight checks). `raycaster` is reused by callers.
export function hasLineOfSight(raycaster, from, to, occluders) {
  const direction = hasLineOfSight._dir || (hasLineOfSight._dir = new THREE.Vector3());
  direction.copy(to).sub(from);
  const distance = direction.length();
  if (distance < 0.001) return true;
  direction.multiplyScalar(1 / distance);
  raycaster.set(from, direction);
  raycaster.far = distance;
  const hit = raycaster.intersectObjects(occluders, false)[0];
  return !hit;
}
