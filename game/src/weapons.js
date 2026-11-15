// Weapons: five guns and a frag grenade. Each definition owns its numbers —
// damage, headshot multiplier, magazine, fire rate, reload, spread and
// price — and the view model that shows it in the player's hands. Firing
// and damage live in main.js; this module owns state, the model and the
// spread that punishes firing on the move.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', slot: 2, price: 0,
    damage: 26, headMult: 4, mag: 12, reserve: 36,
    fireGap: 0.16, auto: false, reloadTime: 1.4,
    spreadStill: 0.004, spreadMove: 0.02, range: 60,
    kind: 'pistol', barrel: 0.22,
  },
  smg: {
    id: 'smg', name: 'VK-9 SMG', slot: 3, price: 1500,
    damage: 22, headMult: 4, mag: 32, reserve: 128,
    fireGap: 0.075, auto: true, reloadTime: 1.8,
    spreadStill: 0.006, spreadMove: 0.032, range: 45,
    kind: 'smg', barrel: 0.3,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Rifle', slot: 1, price: 2700,
    damage: 34, headMult: 4, mag: 30, reserve: 90,
    fireGap: 0.096, auto: true, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMove: 0.028, range: 80,
    kind: 'rifle', barrel: 0.42,
  },
  sniper: {
    id: 'sniper', name: 'LR-50 Longshot', slot: 4, price: 4750,
    damage: 95, headMult: 2, mag: 5, reserve: 15,
    fireGap: 1.1, auto: false, reloadTime: 2.8,
    spreadStill: 0.0008, spreadMove: 0.05, range: 120,
    kind: 'sniper', barrel: 0.62,
  },
  shotgun: {
    id: 'shotgun', name: 'M12 Breacher', slot: 5, price: 1700,
    damage: 9, headMult: 2, mag: 6, reserve: 18, pellets: 8,
    fireGap: 0.85, auto: false, reloadTime: 2.6,
    spreadStill: 0.03, spreadMove: 0.05, range: 25,
    kind: 'shotgun', barrel: 0.4,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

export function createWeaponSet(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.55, metalness: 0.5 });

  const model = new THREE.Group();
  model.position.set(0.26, -0.25, -0.55);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.23, -1.08);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let modelParts = [];
  function buildModel(def) {
    for (const part of modelParts) model.remove(part);
    modelParts = [];
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.34), bodyMat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, def.barrel), grip);
    barrel.position.set(0, 0.025, -0.17 - def.barrel / 2);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
    stock.position.set(0, -0.02, 0.26);
    modelParts.push(receiver, barrel, stock);
    if (def.kind === 'sniper') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10), dark);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.08, 0);
      modelParts.push(scope);
    } else if (def.kind === 'shotgun') {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.2), dark);
      pump.position.set(0, -0.03, -0.3);
      modelParts.push(pump);
    } else if (def.kind === 'smg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), dark);
      mag.position.set(0, -0.12, -0.02);
      modelParts.push(mag);
    }
    for (const part of modelParts) model.add(part);
    flash.position.z = -0.68 - def.barrel;
  }

  const owned = {
    pistol: { def: WEAPONS.pistol, mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
  };
  let current = owned.pistol;
  let grenades = 0;
  buildModel(current.def);

  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, zoomed: false };

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.55 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (current.def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = current.def.mag - current.mag;
        const take = Math.min(need, current.reserve);
        current.mag += take;
        current.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    get current() { return current; },
    get grenades() { return grenades; },
    addGrenade() { grenades += 1; },
    takeGrenade() {
      if (grenades <= 0) return false;
      grenades -= 1;
      return true;
    },
    ready() {
      return current.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = current.def.fireGap;
      state.flash = 0.06;
      state.kick = current.def.kind === 'sniper' ? 0.11 : current.def.kind === 'shotgun' ? 0.09 : 0.055;
    },
    takeRound() {
      if (current.mag <= 0) return false;
      current.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || current.mag === current.def.mag || current.reserve === 0) return;
      state.reloadLeft = current.def.reloadTime;
    },
    spread(speed, crouched, airborne) {
      const base = current.def.spreadStill + Math.min(1, speed / 5.2) * current.def.spreadMove;
      return base * (crouched ? 0.7 : 1) * (airborne ? 2.2 : 1) * (state.zoomed ? 0.35 : 1);
    },
    switchTo(id) {
      if (!owned[id] || current.def.id === id) return false;
      current = owned[id];
      state.reloadLeft = 0;
      state.cooldown = 0.25;
      buildModel(current.def);
      return true;
    },
    buy(id) {
      if (owned[id]) return false;
      owned[id] = { def: WEAPONS[id], mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      return true;
    },
    refillAmmo() {
      for (const key of Object.keys(owned)) {
        owned[key].mag = owned[key].def.mag;
        owned[key].reserve = owned[key].def.reserve;
      }
      state.reloadLeft = 0;
      state.cooldown = 0;
    },
    dropWeapons() {
      for (const key of Object.keys(owned)) if (key !== 'pistol') delete owned[key];
      current = owned.pistol;
      buildModel(current.def);
      grenades = 0;
    },
    setZoomed(value) { state.zoomed = value; },
    get zoomed() { return state.zoomed; },
  };
}
