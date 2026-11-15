// EMBER YARD: an original industrial yard at dusk, built for 4v4 rounds.
// Attackers spawn south, defenders north. Two bomb sites: A "Silo" in the
// north-east, B "Crane" in the north-west. Three lanes run north: A-long
// along the east wall, B-long along the west wall, and mid through the yard,
// with connectors between them. Every structure is a box collider the
// simulation moves against and an occluder the sight checks raycast against.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const YARD_X = 24;
const YARD_Z = 18;
const WALL_H = 4.5;

function mat(color, roughness = 0.85, metalness = 0.1) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness });
}

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = color;
  ctx.font = 'bold 92px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

export function createWorld(scene) {
  const colliders = [];
  const occluders = [];
  const groups = { structures: new THREE.Group(), markers: new THREE.Group() };
  scene.add(groups.structures, groups.markers);

  const materials = {
    ground: mat(PALETTE.ground, 0.95, 0),
    concrete: mat(PALETTE.concrete, 0.9, 0.05),
    concreteDark: mat(PALETTE.concreteDark, 0.9, 0.05),
    steel: mat(PALETTE.steel, 0.55, 0.55),
    steelDark: mat(PALETTE.steelDark, 0.6, 0.5),
    rust: mat(PALETTE.rust, 0.8, 0.25),
    rustDark: mat(PALETTE.rustDark, 0.85, 0.2),
    containerA: mat(PALETTE.containerA, 0.7, 0.3),
    containerB: mat(PALETTE.containerB, 0.7, 0.3),
    containerC: mat(PALETTE.containerC, 0.7, 0.3),
    hazard: mat(PALETTE.hazard, 0.7, 0.1),
  };

  function box(x, y, z, w, h, d, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    groups.structures.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3(
        new THREE.Vector3(x - w / 2, y, z - d / 2),
        new THREE.Vector3(x + w / 2, y + h, z + d / 2),
      ));
      occluders.push(mesh);
    }
    return mesh;
  }

  function cylinder(x, z, radius, height, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), material);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    groups.structures.add(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - radius, 0, z - radius),
      new THREE.Vector3(x + radius, height, z + radius),
    ));
    occluders.push(mesh);
    return mesh;
  }

  // Ground and outer walls.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(YARD_X * 2 + 8, YARD_Z * 2 + 8), materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  box(0, 0, -YARD_Z - 0.5, YARD_X * 2 + 2, WALL_H, 1, materials.concrete);
  box(0, 0, YARD_Z + 0.5, YARD_X * 2 + 2, WALL_H, 1, materials.concrete);
  box(-YARD_X - 0.5, 0, 0, 1, WALL_H, YARD_Z * 2 + 2, materials.concrete);
  box(YARD_X + 0.5, 0, 0, 1, WALL_H, YARD_Z * 2 + 2, materials.concrete);

  // Yard markings: centre line and site zones on the floor.
  function floorMark(x, z, w, d, color) {
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.35 }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(x, 0.02, z);
    groups.markers.add(mark);
  }
  floorMark(0, 0, 0.4, YARD_Z * 2, PALETTE.hazard);
  floorMark(16, -12, 10, 8, PALETTE.siteA);
  floorMark(-16, -12, 10, 8, PALETTE.siteB);

  // Site letters on floating boards.
  function siteBoard(x, z, letter, color) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: letterTexture(letter, color), transparent: true, side: THREE.DoubleSide }),
    );
    board.position.set(x, 4.4, z);
    groups.markers.add(board);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 8), materials.steelDark);
    pole.position.set(x, 2.2, z);
    groups.structures.add(pole);
  }
  siteBoard(16, -12, 'A', PALETTE.siteA);
  siteBoard(-16, -12, 'B', PALETTE.siteB);

  // Site A — Silo: two tall silos and a low bunker.
  cylinder(19, -14, 2.2, 7, materials.steel);
  cylinder(13.5, -15, 1.8, 5.5, materials.rust);
  box(16, 0, -9.5, 6, 1.4, 2, materials.concreteDark);
  box(11, 0, -12, 2, 1.2, 1.2, materials.steelDark);

  // Site B — Crane: a gantry frame and stacked containers.
  box(-19, 0, -14, 1, 6, 1, materials.hazard);
  box(-13, 0, -14, 1, 6, 1, materials.hazard);
  box(-16, 5.4, -14, 7, 0.8, 1, materials.hazard);
  box(-16, 0, -9.5, 6, 2.6, 2.4, materials.containerB);
  box(-16, 2.6, -9.5, 6, 2.6, 2.4, materials.containerC);
  box(-20.5, 0, -9, 2, 1.2, 1.2, materials.steelDark);

  // Mid: a long low wall with a gap, crates and a forklift-shaped block.
  box(-4, 0, 2, 8, 1.3, 1, materials.concreteDark);
  box(7, 0, 2, 6, 1.3, 1, materials.concreteDark);
  box(-1, 0, -3, 1.4, 1.4, 1.4, materials.rust);
  box(1.5, 0, -3, 1.4, 1.4, 1.4, materials.rust);
  box(0.25, 1.4, -3, 1.4, 1.4, 1.4, materials.rustDark);
  box(-8, 0, 5, 2.2, 1.1, 3.2, materials.steelDark);

  // A-long cover: containers and crates along the east lane.
  box(20, 0, 6, 2.4, 2.6, 6, materials.containerA);
  box(20, 0, -2, 1.4, 1.4, 1.4, materials.rust);
  box(20, 1.4, -2, 1.4, 1.4, 1.4, materials.rustDark);
  box(14, 0, 4, 3, 1.2, 1.2, materials.concreteDark);

  // B-long cover: containers and crates along the west lane.
  box(-20, 0, 6, 2.4, 2.6, 6, materials.containerC);
  box(-20, 0, -2, 1.4, 1.4, 1.4, materials.rust);
  box(-14, 0, 4, 3, 1.2, 1.2, materials.concreteDark);

  // Connector cover between mid and the sites.
  box(9, 0, -8, 2, 1.3, 3, materials.steelDark);
  box(-9, 0, -8, 2, 1.3, 3, materials.steelDark);
  box(0, 0, -10, 4, 1.1, 1.1, materials.concreteDark);

  // Barrels near the spawns.
  cylinder(6, 15, 0.55, 1.1, materials.rust);
  cylinder(7.2, 15, 0.55, 1.1, materials.rustDark);
  cylinder(-6, -15, 0.55, 1.1, materials.rust);
  cylinder(-7.2, -15, 0.55, 1.1, materials.rustDark);

  // Lighting: low dusk sun plus a warm hemisphere.
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.8);
  sun.position.set(-18, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(new THREE.Color('#8d97ad'), new THREE.Color('#2a241d'), 1.3));
  const lampA = new THREE.PointLight(new THREE.Color(PALETTE.siteA), 12, 18);
  lampA.position.set(16, 5, -12);
  scene.add(lampA);
  const lampB = new THREE.PointLight(new THREE.Color(PALETTE.siteB), 12, 18);
  lampB.position.set(-16, 5, -12);
  scene.add(lampB);

  // Waypoint graph the bots navigate: nodes and the edges between them.
  const nodes = [
    { id: 'atk', x: 0, z: 14 },
    { id: 'midS', x: 0, z: 8 },
    { id: 'mid', x: 0, z: 0 },
    { id: 'midN', x: 0, z: -7 },
    { id: 'aS', x: 20, z: 8 },
    { id: 'aM', x: 20, z: 0 },
    { id: 'aN', x: 20, z: -8 },
    { id: 'siteA', x: 16, z: -12 },
    { id: 'bS', x: -20, z: 8 },
    { id: 'bM', x: -20, z: 0 },
    { id: 'bN', x: -20, z: -8 },
    { id: 'siteB', x: -16, z: -12 },
    { id: 'conA', x: 9, z: -8 },
    { id: 'conB', x: -9, z: -8 },
    { id: 'def', x: 0, z: -14 },
    { id: 'aMid', x: 10, z: 2 },
    { id: 'bMid', x: -10, z: 2 },
  ];
  const edges = [
    ['atk', 'midS'], ['atk', 'aS'], ['atk', 'bS'],
    ['midS', 'mid'], ['midS', 'aMid'], ['midS', 'bMid'],
    ['mid', 'midN'], ['mid', 'aMid'], ['mid', 'bMid'],
    ['midN', 'conA'], ['midN', 'conB'], ['midN', 'def'],
    ['aS', 'aM'], ['aM', 'aN'], ['aN', 'siteA'], ['aN', 'conA'],
    ['bS', 'bM'], ['bM', 'bN'], ['bN', 'siteB'], ['bN', 'conB'],
    ['conA', 'siteA'], ['conB', 'siteB'], ['conA', 'def'], ['conB', 'def'],
    ['aMid', 'aS'], ['bMid', 'bS'], ['aMid', 'conA'], ['bMid', 'conB'],
  ];
  const adjacency = new Map(nodes.map((n) => [n.id, []]));
  for (const [a, b] of edges) {
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }

  return {
    colliders,
    occluders,
    sites: {
      A: { center: new THREE.Vector3(16, 0, -12), radius: 4.5 },
      B: { center: new THREE.Vector3(-16, 0, -12), radius: 4.5 },
    },
    spawns: {
      attackers: [
        new THREE.Vector3(-3, 0, 15), new THREE.Vector3(-1, 0, 15.5),
        new THREE.Vector3(1, 0, 15.5), new THREE.Vector3(3, 0, 15),
      ],
      defenders: [
        new THREE.Vector3(-3, 0, -15), new THREE.Vector3(-1, 0, -15.5),
        new THREE.Vector3(1, 0, -15.5), new THREE.Vector3(3, 0, -15),
      ],
    },
    waypoints: { nodes, adjacency },
  };
}
