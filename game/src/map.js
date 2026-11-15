// map.js — RUST HARBOR: a dusk container terminal. Builds meshes, static
// colliders, the bot nav graph, spawns and bomb sites. All geometry is
// authored here; nothing is loaded from disk.
import * as THREE from 'three';
import { makeBox } from './collide.js';
import { asphaltTexture, containerTexture, wallTexture } from './texture.js';

const CONTAINER_COLORS = [0x9e4a2f, 0x2f6d6a, 0xb98a2f, 0x5d6b7a, 0x7a3b34, 0x4a6b8a];

// Containers: [cx, cz, alongX (true = length on X), stacked (true = two high), colorIdx]
// Lane centres stay clear: north z=-14, mid z=0, south z=14.
const CONTAINERS = [
  // north lane flanks
  [-32, -17.5, true, false, 0], [-32, -10.5, true, false, 1],
  [-14, -17.5, true, true, 2], [-14, -10.5, true, false, 3],
  [4, -17.5, true, false, 4], [4, -10.5, true, false, 0],
  [22, -17.5, true, false, 5], [22, -10.5, true, true, 1],
  // mid lane flanks (corridor z -1.5..1.5 stays clear)
  [-24, -4.5, false, false, 2], [-24, 4.5, false, false, 3],
  [-6, -4.5, false, false, 4], [-6, 4.5, false, true, 0],
  [12, -4.5, false, false, 5], [12, 4.5, false, false, 1],
  [26, -4.5, false, false, 2], [26, 4.5, false, false, 4],
  // south lane flanks
  [-32, 10.5, true, false, 3], [-32, 17.5, true, false, 4],
  [-14, 10.5, true, false, 5], [-14, 17.5, true, true, 0],
  [4, 10.5, true, false, 1], [4, 17.5, true, false, 2],
  [22, 10.5, true, true, 3], [22, 17.5, true, false, 5],
  // site cover (kept out of the lane corridors and site approaches)
  [-33, -24, true, false, 1], [-20, -25, true, false, 0],
  [33, 24, true, false, 4], [20, 25, true, false, 2],
  [-38, -26, true, false, 3], [38, 26, true, false, 5],
];

// Warehouse walls: [cx, cz, w, d, h] (axis-aligned boxes, h=5).
const WALLS = [
  // perimeter
  [0, -31, 92, 1, 6], [0, 31, 92, 1, 6], [-45, 0, 1, 62, 6], [45, 0, 1, 62, 6],
  // site A yard (open to the south and through a gap in the east wall;
  // the west wall stops short of the north lane so the lane stays open)
  [-28, -26.5, 17, 1, 5], [-36.5, -21.75, 1, 9.5, 5], [-20, -23.5, 1, 6, 5],
  // site B yard (open to the north and through a gap in the west wall;
  // the east wall stops short of the south lane so the lane stays open)
  [28, 26.5, 17, 1, 5], [36.5, 21.75, 1, 9.5, 5], [20, 23.5, 1, 6, 5],
];

// Barrels: [x, z] small cover — kept clear of the lane centre lines.
const BARRELS = [[-10, -8], [10, 8], [-25, -11], [25, 11], [0, -20], [0, 20]];

// Nav graph nodes: [x, z]. Edges are index pairs. Nodes 22-25 are the
// west/east lane gates: bots enter a lane from the open ends, never on a
// diagonal that clips a container corner.
export const NAV_NODES = [
  [-40, 0], [-32, -14], [-14, -14], [4, -14], [22, -14],
  [-32, 14], [-14, 14], [4, 14], [22, 14],
  [-24, 0], [-8, 0], [8, 0], [24, 0],
  [-28, -19], [-28, -8], [28, 19], [28, 8],
  [40, 0], [32, -14], [32, 14], [0, -14], [0, 14],
  [-38, -14], [-38, 14], [38, -14], [38, 14],
];
const NAV_EDGES = [
  [0, 9], [0, 22], [0, 23], [22, 1], [23, 5], [22, 23],
  [1, 2], [2, 3], [3, 4], [4, 18], [18, 24], [24, 17], [24, 25],
  [5, 6], [6, 7], [7, 8], [8, 19], [19, 25], [25, 17],
  [9, 10], [10, 11], [11, 12], [12, 17],
  [2, 14], [14, 13], [13, 2],
  [3, 20], [20, 2], [20, 4],
  [7, 21], [21, 6], [21, 8],
  [16, 15], [16, 19], [15, 19], [15, 16],
  [10, 9], [11, 12], [6, 5], [3, 2], [7, 6], [4, 3], [8, 7],
];

export const SITES = {
  A: { x: -28, z: -19, label: 'A', node: 13, approach: 14 },
  B: { x: 28, z: 19, label: 'B', node: 15, approach: 16 },
};
export const SPAWNS = {
  jackals: [
    { x: -40, z: -4, yaw: -Math.PI / 2 }, { x: -41, z: 0, yaw: -Math.PI / 2 },
    { x: -40, z: 4, yaw: -Math.PI / 2 }, { x: -38, z: -2, yaw: -Math.PI / 2 },
    { x: -38, z: 2, yaw: -Math.PI / 2 },
  ],
  wardens: [
    { x: 40, z: -4, yaw: Math.PI / 2 }, { x: 41, z: 0, yaw: Math.PI / 2 },
    { x: 40, z: 4, yaw: Math.PI / 2 }, { x: 38, z: -2, yaw: Math.PI / 2 },
    { x: 38, z: 2, yaw: Math.PI / 2 },
  ],
};

export function buildNav() {
  const links = NAV_NODES.map(() => []);
  for (const [a, b] of NAV_EDGES) {
    if (!links[a].includes(b)) links[a].push(b);
    if (!links[b].includes(a)) links[b].push(a);
  }
  return links;
}

// BFS route from node a to node b. Returns an array of node indices.
export function findRoute(links, a, b) {
  if (a === b) return [a];
  const prev = new Array(links.length).fill(-1);
  const queue = [a];
  prev[a] = a;
  while (queue.length) {
    const n = queue.shift();
    for (const m of links[n]) {
      if (prev[m] === -1) {
        prev[m] = n;
        if (m === b) {
          const path = [b];
          let cur = b;
          while (cur !== a) { cur = prev[cur]; path.unshift(cur); }
          return path;
        }
        queue.push(m);
      }
    }
  }
  return [a];
}

export function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < NAV_NODES.length; i++) {
    const dx = NAV_NODES[i][0] - x, dz = NAV_NODES[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function buildMap(scene) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  const asphalt = asphaltTexture();
  const containerTex = containerTexture();
  const wallTex = wallTexture();

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(92, 64),
    new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95, metalness: 0.0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const boxGeoCache = new Map();
  function box(w, h, d, mat) {
    const key = `${w}|${h}|${d}`;
    let geo = boxGeoCache.get(key);
    if (!geo) { geo = new THREE.BoxGeometry(w, h, d); boxGeoCache.set(key, geo); }
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  const containerMats = CONTAINER_COLORS.map((c) => new THREE.MeshStandardMaterial({
    map: containerTex, color: c, roughness: 0.72, metalness: 0.35,
  }));

  // Containers
  for (const [cx, cz, alongX, stacked, ci] of CONTAINERS) {
    const w = alongX ? 6 : 2.5, d = alongX ? 2.5 : 6;
    const h = stacked ? 5.2 : 2.6;
    const mesh = box(w, h, d, containerMats[ci]);
    mesh.position.set(cx, h / 2, cz);
    group.add(mesh);
    colliders.push(makeBox(cx - w / 2, 0, cz - d / 2, cx + w / 2, h, cz + d / 2));
  }

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0.05 });
  for (const [cx, cz, w, d, h] of WALLS) {
    const mesh = box(w, h, d, wallMat);
    mesh.position.set(cx, h / 2, cz);
    group.add(mesh);
    colliders.push(makeBox(cx - w / 2, 0, cz - d / 2, cx + w / 2, h, cz + d / 2));
  }

  // Barrels
  const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.6, metalness: 0.5 });
  for (const [x, z] of BARRELS) {
    const m = new THREE.Mesh(barrelGeo, barrelMat);
    m.position.set(x, 0.55, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push(makeBox(x - 0.55, 0, z - 0.55, x + 0.55, 1.1, z + 0.55));
  }

  // Gantry crane over mid (decorative legs collide, beam does not)
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xc7a23a, roughness: 0.55, metalness: 0.6 });
  for (const z of [-9, 9]) {
    const leg = box(1.2, 13, 1.2, craneMat);
    leg.position.set(0, 6.5, z);
    group.add(leg);
    colliders.push(makeBox(-0.6, 0, z - 0.6, 0.6, 13, z + 0.6));
  }
  const beam = box(1.6, 1.4, 20, craneMat);
  beam.position.set(0, 13.4, 0);
  group.add(beam);
  const trolley = box(2.2, 1.6, 2.2, new THREE.MeshStandardMaterial({ color: 0x333a44, roughness: 0.5, metalness: 0.7 }));
  trolley.position.set(0, 12.2, 3);
  group.add(trolley);

  // Site markers: flat letter plates + a low glowing ring
  function sitePlate(site) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(232,226,210,0.85)';
    g.font = 'bold 190px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(site.label, 128, 138);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false })
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(site.x, 0.03, site.z);
    group.add(plate);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 3.8, 40),
      new THREE.MeshBasicMaterial({ color: 0xd6b25a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.04, site.z);
    group.add(ring);
  }
  sitePlate(SITES.A);
  sitePlate(SITES.B);

  // Lamp posts with warm pools of light at the two sites and mid
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2c313a, roughness: 0.5, metalness: 0.7 });
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb45e, emissiveIntensity: 2.2 });
  for (const [x, z] of [[-28, -24], [28, 24], [0, -6]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 8), lampMat);
    pole.position.set(x, 2.7, z);
    pole.castShadow = true;
    group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.4), lampHeadMat);
    head.position.set(x, 5.5, z);
    group.add(head);
    const light = new THREE.PointLight(0xffa94d, 55, 26, 2);
    light.position.set(x, 5.2, z);
    group.add(light);
  }

  // Distant skyline silhouettes in the fog
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x232a3a });
  const skyline = [
    [-58, -20, 10, 18], [-58, 8, 14, 26], [-30, -48, 12, 14], [8, -50, 16, 22],
    [40, -46, 10, 12], [60, -12, 12, 20], [60, 18, 9, 15], [30, 48, 14, 18],
    [-6, 50, 11, 13], [-38, 48, 13, 24], [-60, 34, 10, 16], [56, -38, 12, 17],
  ];
  for (const [x, z, w, h] of skyline) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skyMat);
    m.position.set(x, h / 2 - 1, z);
    group.add(m);
  }

  return { colliders, links: buildNav(), nav: NAV_NODES, sites: SITES, spawns: SPAWNS, group };
}

// Dev check: every nav node and spawn must sit clear of every collider.
export function validateMap(colliders) {
  const bad = [];
  const pts = [];
  NAV_NODES.forEach(([x, z], i) => pts.push([`node${i}`, x, z]));
  for (const team of ['jackals', 'wardens']) {
    SPAWNS[team].forEach((s, i) => pts.push([`${team}spawn${i}`, s.x, s.z]));
  }
  pts.push(['siteA', SITES.A.x, SITES.A.z], ['siteB', SITES.B.x, SITES.B.z]);
  for (const [name, x, z] of pts) {
    for (const b of colliders) {
      if (x + 0.4 > b.minX && x - 0.4 < b.maxX && z + 0.4 > b.minZ && z - 0.4 < b.maxZ && b.minY < 1.7) {
        bad.push(`${name} (${x},${z}) inside box ${b.minX}..${b.maxX}, ${b.minZ}..${b.maxZ}`);
      }
    }
  }
  return bad;
}
