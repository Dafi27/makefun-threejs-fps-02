// The human player: movement with acceleration and friction, crouching,
// jumping, gravity, and health. Collision runs through physics.moveBody,
// one axis at a time, against the world's colliders.
import * as THREE from 'three';
import { createBody, moveBody } from './physics.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const SLOW_SPEED = 2.6; // Shift: slow, quiet walk.
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders, spawn) {
  const body = createBody(spawn.x, spawn.z, RADIUS, STAND_HEIGHT);
  body.eye = STAND_EYE;
  const state = {
    yaw: 0,
    pitch: 0,
    health: 100,
    armor: 0,
    alive: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const wish = new THREE.Vector3();

  // Invisible hitboxes the bots' raycasts test against: a body box and a
  // head box. They follow the body every frame; the head is worth more.
  const hitGroup = new THREE.Group();
  const bodyBox = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.15, 0.4));
  bodyBox.position.y = 0.85;
  bodyBox.userData = { fighter: 'player', part: 'body' };
  const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.42));
  headBox.position.y = 1.55;
  headBox.userData = { fighter: 'player', part: 'head' };
  const invisible = new THREE.MeshBasicMaterial({ visible: false });
  bodyBox.material = invisible;
  headBox.material = invisible;
  hitGroup.add(bodyBox, headBox);

  function syncHitboxes() {
    hitGroup.position.set(body.position.x, body.position.y, body.position.z);
    hitGroup.rotation.y = state.yaw;
  }

  function overlapsAt(x, y, z, height) {
    const probe = overlapsAt._probe || (overlapsAt._probe = new THREE.Box3());
    probe.min.set(x - RADIUS, y + 0.02, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - 0.02, z + RADIUS);
    for (const box of colliders) if (probe.intersectsBox(box)) return true;
    return false;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function step(dt, keys, frozen) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !state.crouching) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
    } else if (!crouching && state.crouching && !overlapsAt(body.position.x, body.position.y, body.position.z, STAND_HEIGHT)) {
      state.crouching = false;
      state.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if ((forward || strafe) && !frozen) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const slow = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = state.crouching ? CROUCH_SPEED : slow ? SLOW_SPEED : WALK_SPEED;
    const blend = Math.min(1, (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && wish.lengthSq() === 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    if (keys.has('Space') && body.onGround && !frozen) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    moveBody(body, dt, colliders);
    syncHitboxes();
  }

  function groundSpeed() {
    return Math.hypot(body.velocity.x, body.velocity.z);
  }

  function reset(spawnPoint) {
    body.position.set(spawnPoint.x, 0, spawnPoint.z);
    body.velocity.set(0, 0, 0);
    state.yaw = 0;
    state.pitch = 0;
    state.health = 100;
    state.armor = 0;
    state.alive = true;
    state.crouching = false;
    state.height = STAND_HEIGHT;
    body.eye = STAND_EYE;
    syncHitboxes();
  }

  // Damage: armour absorbs half until it is gone, then health takes it all.
  function damage(amount) {
    if (!state.alive) return 0;
    let remaining = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, remaining * 0.5);
      state.armor -= absorbed;
      remaining -= absorbed;
    }
    state.health -= remaining;
    if (state.health <= 0) {
      state.health = 0;
      state.alive = false;
    }
    return remaining;
  }

  return {
    body,
    state,
    hitGroup,
    hitMeshes: [bodyBox, headBox],
    look,
    recoil,
    step,
    groundSpeed,
    reset,
    damage,
    eyePosition(out) {
      out.set(body.position.x, body.position.y + body.eye, body.position.z);
      return out;
    },
  };
}
