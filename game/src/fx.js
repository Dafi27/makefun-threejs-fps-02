// fx.js — pooled visual effects: tracers, muzzle flashes, impact puffs and
// explosion bursts. Pools are preallocated; the hot loop never news objects.
import * as THREE from 'three';

const TRACER_POOL = 24;
const PUFF_POOL = 40;

export function createFX(scene) {
  const fx = { scene, tracers: [], puffs: [], flashT: 0, boomT: 0, tracerCursor: 0, puffCursor: 0 };

  // Tracers: one LineSegments pool, each tracer owns a pair of vertices.
  const tracerGeo = new THREE.BufferGeometry();
  const tPos = new Float32Array(TRACER_POOL * 6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  const tracerLines = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({
    color: 0xffc46b, transparent: true, opacity: 0.9,
  }));
  tracerLines.frustumCulled = false;
  scene.add(tracerLines);
  fx.tracerGeo = tracerGeo;
  fx.tracerAttr = tPos;
  for (let i = 0; i < TRACER_POOL; i++) {
    fx.tracers.push({ life: 0, x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 });
  }

  // Impact puffs: small billboards that grow and fade.
  const puffGeo = new THREE.PlaneGeometry(0.3, 0.3);
  for (let i = 0; i < PUFF_POOL; i++) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
      color: 0xcfc8b8, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    m.visible = false;
    scene.add(m);
    fx.puffs.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
  }

  // Muzzle flash: a light + quad at the gun, flashed for 45 ms.
  fx.flashLight = new THREE.PointLight(0xffc46b, 0, 9, 2);
  scene.add(fx.flashLight);
  fx.flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  );
  scene.add(fx.flash);

  // Explosion: an expanding transparent sphere + light.
  fx.boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff9d3c, transparent: true, opacity: 0, depthWrite: false })
  );
  scene.add(fx.boom);
  fx.boomLight = new THREE.PointLight(0xff8a2a, 0, 30, 2);
  scene.add(fx.boomLight);

  return fx;
}

export function spawnTracer(fx, x1, y1, z1, x2, y2, z2) {
  const t = fx.tracers[fx.tracerCursor];
  fx.tracerCursor = (fx.tracerCursor + 1) % TRACER_POOL;
  t.life = 0.09; t.x1 = x1; t.y1 = y1; t.z1 = z1; t.x2 = x2; t.y2 = y2; t.z2 = z2;
}

export function spawnPuff(fx, x, y, z) {
  const p = fx.puffs[fx.puffCursor];
  fx.puffCursor = (fx.puffCursor + 1) % PUFF_POOL;
  p.life = 0.5;
  p.mesh.position.set(x, y, z);
  p.mesh.visible = true;
  p.mesh.scale.setScalar(0.6);
  p.vx = (Math.random() - 0.5) * 0.8; p.vy = Math.random() * 0.9; p.vz = (Math.random() - 0.5) * 0.8;
}

export function muzzle(fx, x, y, z) {
  fx.flashLight.position.set(x, y, z);
  fx.flashLight.intensity = 26;
  fx.flashT = 0.045;
  fx.flash.position.set(x, y, z);
  fx.flash.material.opacity = 0.95;
}

export function explosion(fx, x, y, z) {
  fx.boom.position.set(x, y + 0.4, z);
  fx.boomT = 0.5;
  fx.boomLight.position.set(x, y + 1.5, z);
  fx.boomLight.intensity = 220;
}

export function stepFX(fx, dt, camera) {
  const arr = fx.tracerAttr;
  for (let i = 0; i < TRACER_POOL; i++) {
    const t = fx.tracers[i];
    if (t.life > 0) t.life -= dt;
    const o = i * 6;
    if (t.life > 0) {
      arr[o] = t.x1; arr[o + 1] = t.y1; arr[o + 2] = t.z1;
      arr[o + 3] = t.x2; arr[o + 4] = t.y2; arr[o + 5] = t.z2;
    } else {
      arr[o] = 0; arr[o + 1] = -100; arr[o + 2] = 0;
      arr[o + 3] = 0; arr[o + 4] = -100; arr[o + 5] = 0;
    }
  }
  fx.tracerGeo.attributes.position.needsUpdate = true;

  for (const p of fx.puffs) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.lookAt(camera.position);
    p.mesh.scale.setScalar(Math.max(0.1, 0.6 + (0.5 - p.life) * 1.6));
    p.mesh.material.opacity = Math.max(0, p.life * 1.6);
    if (p.life <= 0) p.mesh.visible = false;
  }

  if (fx.flashT > 0) {
    fx.flashT -= dt;
    fx.flashLight.intensity = Math.max(0, fx.flashT * 500);
    fx.flash.material.opacity = Math.max(0, fx.flashT * 20);
  } else {
    fx.flashLight.intensity = 0;
    fx.flash.material.opacity = 0;
  }

  if (fx.boomT > 0) {
    fx.boomT -= dt;
    const k = 1 - fx.boomT / 0.5;
    fx.boom.scale.setScalar(0.5 + k * 6);
    fx.boom.material.opacity = Math.max(0, 0.75 * (1 - k));
    fx.boomLight.intensity = Math.max(0, 220 * (1 - k));
  } else {
    fx.boom.material.opacity = 0;
    fx.boomLight.intensity = 0;
  }
}
