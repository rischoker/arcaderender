// Escenario: cielo, terreno, bosque, montañas y el castillo (murallas por tramos con daño).
import * as THREE from 'three';
import * as A from './assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HALF = 12;          // medio lado del castillo
export const WALL_H = 4.6;       // altura de la muralla
export const WALK_Y = 3.75;      // altura del adarve (donde se paran los defensores)
export const GATE_POS = new THREE.Vector3(5, 0, HALF);
const rnd = (a, b) => a + Math.random() * (b - a);

export function buildSky(scene) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#3d7fd1'); gr.addColorStop(0.45, '#8fc3f0'); gr.addColorStop(0.75, '#f6d9a8'); gr.addColorStop(1, '#f0b77a');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
  scene.fog = new THREE.Fog(0xcfe0e8, 90, 230);
}

export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(0xdcefff, 0x5a6b3a, 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(-30, 55, 35); sun.castShadow = true;
  sun.shadow.mapSize.set(window.__weakGPU ? 1024 : 2048, window.__weakGPU ? 1024 : 2048);
  const s = sun.shadow.camera; s.left = -42; s.right = 42; s.top = 42; s.bottom = -42; s.near = 5; s.far = 140;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun);
  return { hemi, sun };
}

// ---------- Relieve ----------
// El castillo está sobre una meseta plana; alrededor el terreno baja hacia el campo de batalla,
// lo cruza un río por el sur y al fondo sube hacia las montañas.
export const RIVER_Z = x => 43 + Math.sin(x * 0.045) * 4 + Math.sin(x * 0.13) * 1.2;
export const ROAD_X = z => GATE_POS.x + Math.sin(z * 0.08) * 3;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function baseY(x, z) {
  const d = Math.pow(Math.pow(Math.abs(x), 4) + Math.pow(Math.abs(z), 4), 0.25); // distancia "cuadrada redondeada"
  const t = smooth(17, 31, d);
  const n = Math.sin(x * 0.11) * Math.cos(z * 0.13) * 0.8 + Math.sin(x * 0.031 + z * 0.047) * 0.7 + Math.sin(x * 0.27 + 1.3) * Math.sin(z * 0.23) * 0.25;
  const r = Math.hypot(x, z);
  return -3.2 * t + t * n * 1.1 + Math.max(0, r - 95) * 0.11;
}
export function groundY(x, z) {
  let y = baseY(x, z);
  const dz = z - RIVER_Z(x), w = 4.2;
  if (Math.abs(dz) < w) y -= (1 - (dz / w) ** 2) * 1.8;
  return y;
}
export function waterY(x) { return baseY(x, RIVER_Z(x)) - 0.95; }

// textura de detalle (pasto) que se repite sobre los colores del terreno
function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, l = 3 + Math.random() * 7, v = Math.random();
    g.strokeStyle = v < 0.5 ? `rgba(40,60,20,${0.08 + Math.random() * 0.12})` : `rgba(255,255,230,${0.1 + Math.random() * 0.15})`;
    g.lineWidth = 1 + Math.random(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y - l); g.stroke();
  }
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 14, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70, 70); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildGround(scene) {
  const geo = new THREE.PlaneGeometry(520, 520, 230, 230);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = [];
  const c1 = new THREE.Color(0x6fae4a), c2 = new THREE.Color(0x9cc75a), c3 = new THREE.Color(0x4a8a36), dirt = new THREE.Color(0x9a7a50), mud = new THREE.Color(0x5e4a34), sand = new THREE.Color(0xc9b27a), burnt = new THREE.Color(0x3a3228);
  // manchas quemadas / cráteres del campo de batalla
  const scorch = Array.from({ length: 40 }, () => { const a = Math.random() * 6.28, r = 20 + Math.random() * 38; return [Math.cos(a) * r, Math.sin(a) * r, 1.5 + Math.random() * 3.5]; });
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = groundY(x, z);
    pos.setY(i, y);
    const n = Math.sin(x * 0.11) * Math.cos(z * 0.13) + Math.sin(x * 0.031 + z * 0.047) * 0.8 + Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.3;
    const c = c1.clone().lerp(n > 0 ? c2 : c3, Math.min(1, Math.abs(n) * 0.55));
    const d = Math.pow(Math.pow(Math.abs(x), 4) + Math.pow(Math.abs(z), 4), 0.25);
    // tierra pisoteada alrededor del castillo y barro del campo de batalla
    if (d < HALF + 6) c.lerp(dirt, Math.max(0, 1 - (d - HALF) / 6) * 0.6);
    const field = smooth(16, 26, d) * (1 - smooth(52, 66, Math.hypot(x, z)));
    c.lerp(mud, field * (0.25 + 0.2 * Math.max(0, Math.sin(x * 0.4 + z * 0.3))));
    for (const [sx, sz, sr] of scorch) { const k = 1 - Math.hypot(x - sx, z - sz) / sr; if (k > 0) c.lerp(burnt, k * 0.6); }
    // camino al portón y orillas del río
    if (z > HALF && Math.abs(x - ROAD_X(z)) < 3.2) c.lerp(dirt, 0.8);
    const dz = Math.abs(z - RIVER_Z(x)); if (dz < 6) c.lerp(sand, (1 - dz / 6) * 0.7);
    if (y > 4) c.lerp(new THREE.Color(0x8a8f7a), Math.min(0.6, (y - 4) * 0.05));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: grassTexture() }));
  ground.receiveShadow = true; scene.add(ground);
  // patio interior empedrado
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshStandardMaterial({ color: 0xb9a383, roughness: 1 }));
  yard.rotation.x = -Math.PI / 2; yard.position.y = 0.02; yard.receiveShadow = true; scene.add(yard);
  // río
  const pts = [], uvs = [], idx = [];
  const N = 260;
  for (let i = 0; i <= N; i++) {
    const x = -260 + i * 520 / N, z = RIVER_Z(x), y = waterY(x);
    pts.push(x, y, z - 4.2, x, y, z + 4.2); uvs.push(i * 0.5, 0, i * 0.5, 1);
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); wg.setIndex(idx); wg.computeVertexNormals();
  const wc = document.createElement('canvas'); wc.width = wc.height = 128; const wgx = wc.getContext('2d');
  wgx.fillStyle = '#3d86b8'; wgx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) { wgx.strokeStyle = `rgba(220,240,255,${0.15 + Math.random() * 0.3})`; wgx.lineWidth = 1 + Math.random() * 2; const y0 = Math.random() * 128; wgx.beginPath(); wgx.moveTo(Math.random() * 128, y0); wgx.lineTo(Math.random() * 128, y0 + (Math.random() - 0.5) * 6); wgx.stroke(); }
  const wtex = new THREE.CanvasTexture(wc); wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping; wtex.colorSpace = THREE.SRGBColorSpace;
  const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: wtex, transparent: true, opacity: 0.88, roughness: 0.25, metalness: 0.1 }));
  water.receiveShadow = true; scene.add(water);
  return { ground, water, wtex };
}

// Une muchos objetos estáticos en pocas mallas (muchas menos llamadas de dibujo = más FPS)
function mergeStatic(root, scene, castShadow) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material, img = m.map && m.map.image;
    const key = m.name + '|' + (img ? img.width + 'x' + img.height : 'c' + m.color.getHex()) + '|' + m.transparent;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!buckets.has(key)) buckets.set(key, { mat: m, geos: [] });
    buckets.get(key).geos.push(g);
  });
  for (const { mat, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = castShadow; mesh.receiveShadow = true; scene.add(mesh);
  }
}

function place(key, x, z, { s = 1, ry = 0, y = null, scene, shadow = true } = {}) {
  const o = A.clone(key); o.scale.setScalar(s); o.position.set(x, y ?? groundY(x, z) - 0.05, z); o.rotation.y = ry;
  if (!shadow) o.traverse(m => { if (m.isMesh) m.castShadow = false; });
  scene.add(o); return o;
}

export function buildScenery(realScene) {
  const clouds = [], fires = [];
  const far = new THREE.Group(), near = new THREE.Group();
  let scene = far;
  // montañas al fondo (norte y lados)
  const mts = ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees', 'mountain_A', 'mountain_B', 'mountain_C'];
  for (let i = 0; i < 30; i++) {
    const a = Math.PI * (1.02 + i / 29 * 0.96) + rnd(-0.03, 0.03), r = rnd(125, 175);
    place('deco/' + mts[i % mts.length], Math.cos(a) * r, Math.sin(a) * r, { s: rnd(18, 30), ry: rnd(0, 6), scene, shadow: false });
  }
  for (let i = 0; i < 16; i++) {
    const a = Math.PI * (0.05 + i / 15 * 0.9) + rnd(-0.05, 0.05), r = rnd(130, 175);
    place('deco/hills_' + 'ABC'[i % 3] + '_trees', Math.cos(a) * r, Math.sin(a) * r, { s: rnd(14, 22), ry: rnd(0, 6), scene, shadow: false });
  }
  // bosque: lejos por el frente y los lados (campo de batalla abierto), más cerca por detrás
  const trees = A.MODELS.nature.filter(n => n.startsWith('Tree'));
  for (let i = 0; i < 520; i++) {
    const a = rnd(0, Math.PI * 2), dirZ = Math.sin(a);
    const minR = dirZ > -0.35 ? 70 : 44;
    const r = minR + Math.pow(Math.random(), 0.8) * (125 - minR);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(z - RIVER_Z(x)) < 6) continue;
    if (z > 20 && Math.abs(x - ROAD_X(z)) < 9) continue;
    place('nature/' + trees[(Math.random() * trees.length) | 0], x, z, { s: rnd(1.8, 3.2), ry: rnd(0, 6), scene: r < 80 ? near : far });
  }
  // bosquecillos sueltos en el campo
  for (let k = 0; k < 6; k++) {
    const a = rnd(-0.2, 3.4), r = rnd(52, 64), cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (Math.abs(cz - RIVER_Z(cx)) < 8 || (cz > 20 && Math.abs(cx - ROAD_X(cz)) < 12)) continue;
    for (let i = 0; i < 5; i++) place('nature/' + trees[(Math.random() * trees.length) | 0], cx + rnd(-5, 5), cz + rnd(-5, 5), { s: rnd(1.8, 2.8), ry: rnd(0, 6), scene: near });
  }
  const small = ['Bush_1_A', 'Bush_2_A', 'Bush_3_A', 'Bush_4_A', 'Rock_1_A', 'Rock_2_A', 'Rock_3_A', 'Grass_1_A', 'Grass_2_A', 'Grass_1_A', 'Grass_2_A', 'Grass_1_A'];
  scene = far;
  for (let i = 0; i < 420; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(HALF + 8, 95);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > HALF && Math.abs(x - ROAD_X(z)) < 4) continue;
    if (Math.abs(z - RIVER_Z(x)) < 3.5) continue;
    place('nature/' + small[(Math.random() * small.length) | 0], x, z, { s: rnd(1.2, 2.4), ry: rnd(0, 6), scene, shadow: false });
  }
  // rocas grandes en las laderas
  for (let i = 0; i < 26; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(22, 34), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > HALF && Math.abs(x - ROAD_X(z)) < 5) continue;
    place('deco/rock_single_' + 'ACE'[i % 3], x, z, { s: rnd(3.5, 6.5), ry: rnd(0, 6), scene: near });
  }
  // aldea al otro lado del río (de ahí vienen los aldeanos)
  const village = [['castle/home_A', -6, 54], ['castle/home_B', 17, 52], ['castle/windmill', -15, 62], ['castle/home_A', 19, 63], ['castle/grain', -4, 64], ['castle/home_B', -13, 51], ['castle/church', 28, 58], ['castle/home_A', 30, 49], ['castle/blacksmith', -22, 55]];
  for (const [k, x, z] of village) place(k, x, z, { s: 4, ry: Math.atan2(GATE_POS.x - x, HALF - z), scene: near });
  // campamentos enemigos en el borde del bosque: tiendas, estandartes y fogatas
  for (let k = 0; k < 9; k++) {
    const a = -0.25 + k / 8 * 3.6 + rnd(-0.1, 0.1), r = rnd(64, 70), cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (Math.abs(cz - RIVER_Z(cx)) < 9 || (cz > 20 && Math.abs(cx - ROAD_X(cz)) < 10)) continue;
    for (let i = 0; i < 3; i++) place(i ? 'kn/e-tent' : 'deco/tent', cx + rnd(-5, 5), cz + rnd(-4, 4), { s: i ? rnd(3.6, 4.4) : rnd(6, 8), ry: rnd(0, 6), scene: near });
    for (let i = 0; i < 2; i++) place('kn/e-flag-wide', cx + rnd(-6, 6), cz + rnd(-5, 5), { s: rnd(3.6, 4.4), ry: Math.atan2(-cx, -cz) + Math.PI / 2, scene: near });
    place('res/Wood_Log_Stack', cx, cz, { s: 1.3, ry: rnd(0, 6), scene: near });
    fires.push(new THREE.Vector3(cx, groundY(cx, cz) + 0.6, cz));
  }
  // puente sobre el río en el camino
  const bz = RIVER_Z(ROAD_X(43)), bx = ROAD_X(bz);
  place('castle/bridge_A', bx, bz, { s: 4.2, ry: Math.PI / 2, y: waterY(bx) + 0.15, scene: near });
  scene = near;
  // ruinas de asedios anteriores en el campo de batalla
  const wrecks = ['e-siege-catapult-demolished', 'e-siege-trebuchet-demolished', 'e-siege-ram-demolished', 'e-siege-tower-demolished'];
  for (let i = 0; i < 7; i++) {
    const a = rnd(-0.3, 3.45), r = rnd(37, 56), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(z - RIVER_Z(x)) < 7 || (z > 15 && Math.abs(x - ROAD_X(z)) < 7)) continue;
    place('kn/' + wrecks[i % 4], x, z, { s: rnd(2.8, 3.4), ry: rnd(0, 6), scene });
  }
  // peñascos, troncos y piedras en las laderas
  for (let i = 0; i < 18; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(26, 60), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(z - RIVER_Z(x)) < 6 || (z > 12 && Math.abs(x - ROAD_X(z)) < 6)) continue;
    place('kn/' + ['rocks-high', 'rocks-low', 'rocks-ramp', 'tree-log', 'rocks-low', 'tree-trunk'][i % 6], x, z, { s: rnd(3, 4.5), ry: rnd(0, 6), scene });
  }
  // parches de tierra y pasto (relieve suave sobre el terreno)
  scene = far;
  for (let i = 0; i < 24; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(HALF + 6, 70), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(z - RIVER_Z(x)) < 5) continue;
    place('kn/patch-grass', x, z, { s: rnd(3, 5.5), ry: rnd(0, 6), scene, shadow: false, y: groundY(x, z) - 0.25 });
  }
  scene = near;
  // la aldea cobra vida: mercado, fuente, faroles, cercas, carretas y un molino de agua
  const vill = [['kn/fountain-round-detail', 9, 57, 2.6, 0], ['kn/stall-red', -1, 50, 3, 0.3], ['kn/stall-green', 12, 49, 3, -0.4], ['kn/stall', 6, 63, 3, 2.8], ['kn/stall-bench', -2, 59, 3, 1.2],
    ['kn/cart-high', 14, 58, 3, 0.8], ['kn/cart', -9, 58, 3, 2], ['kn/hedge-large', 23, 54, 3.5, 1.57], ['kn/hedge-large', 23, 57.5, 3.5, 1.57], ['kn/banner-red', 3, 55, 3, 0], ['kn/banner-green', 15, 54, 3, 0],
    ['kn/tree-high-round', 25, 66, 4, 0], ['kn/tree-crooked', -18, 66, 3.5, 0], ['kn/planks', -20, 50, 3, 0.4], ['kn/wheel', -19, 51, 3, 1]];
  for (const [k, x, z, sc, ry] of vill) place(k, x, z, { s: sc, ry, scene });
  for (let i = 0; i < 9; i++) place('kn/fence', -30 + i * 3, 70, { s: 3, ry: Math.PI / 2, scene });
  for (let i = 0; i < 6; i++) place('kn/fence', 34, 46 + i * 3, { s: 3, ry: 0, scene });
  const wx = -30, wz = RIVER_Z(wx) + 3.4; place('kn/watermill', wx, wz, { s: 3.6, ry: Math.PI / 2, y: waterY(wx) - 0.6, scene });
  // faroles a lo largo del camino
  for (let z = 17; z < 66; z += 7) { if (Math.abs(z - RIVER_Z(ROAD_X(z))) < 6) continue; for (const sd of [-1, 1]) { const x = ROAD_X(z) + sd * 3.6; place('kn/lantern', x, z, { s: 1.9, scene }); } }
  mergeStatic(near, realScene, true); mergeStatic(far, realScene, false);
  // estacas (barricadas) en el campo de batalla: una sola malla instanciada
  const stakeGeo = mergeGeometries([new THREE.CylinderGeometry(0.2, 0.22, 2.2, 5).translate(0, 1.1, 0), new THREE.ConeGeometry(0.2, 0.7, 5).translate(0, 2.55, 0)]);
  const stakes = [];
  for (let row = 0; row < 2; row++) for (let i = 0; i < 180; i++) {
    const a = i / 180 * Math.PI * 2 + row * 0.012, base = 23 + row * 1.2;
    if (Math.floor(i / 6) % 3 === 0) continue; // huecos entre barricadas
    const x = Math.cos(a) * base * 1.05, z = Math.sin(a) * base * 1.05;
    if (z > 10 && Math.abs(x - ROAD_X(z)) < 4.5) continue;
    stakes.push([x, z, a]);
  }
  const stakeMesh = new THREE.InstancedMesh(stakeGeo, new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 1 }), stakes.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  stakes.forEach(([x, z, a], i) => { e.set(0.5, Math.atan2(Math.cos(a), Math.sin(a)) + (Math.random() - 0.5) * 0.3, 0, 'YXZ'); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, groundY(x, z) - 0.2, z), q, new THREE.Vector3(1, 1 + Math.random() * 0.3, 1)); stakeMesh.setMatrixAt(i, m4); });
  stakeMesh.castShadow = true; stakeMesh.receiveShadow = true; realScene.add(stakeMesh);
  scene = realScene;
  for (let i = 0; i < 12; i++) {
    // nubes altas y lejos (por detrás del castillo), para que nunca tapen la batalla
    const c = place('deco/cloud_' + (i % 3 ? 'big' : 'small'), rnd(-170, 170), rnd(-170, -95), { s: rnd(14, 24), y: rnd(70, 95), scene, shadow: false });
    clouds.push(c);
  }
  return { clouds, fires };
}

// ---------- Ballesta de asedio (modelo Kenney; gira en yaw/pitch) ----------
export function makeBallista() {
  const root = new THREE.Group();
  const yaw = new THREE.Group(); root.add(yaw);
  const pitch = new THREE.Group(); pitch.position.y = 0.55; yaw.add(pitch);
  const m = A.clone('kn/siege-ballista'); m.scale.setScalar(1.65); m.rotation.y = -Math.PI / 2; m.position.y = -0.55; pitch.add(m);
  let bolt = null; m.traverse(o => { if (o.name === 'arrow') bolt = o; });
  // cuerpo + ruedas en una sola malla (el virote queda aparte para esconderlo al disparar)
  if (bolt) {
    root.updateMatrixWorld(true);
    const rel = pitch.matrixWorld.clone().invert().multiply(bolt.matrixWorld);
    bolt.removeFromParent();
    const tmp = new THREE.Group(); mergeStatic(m, tmp, true); m.removeFromParent();
    for (const c of [...tmp.children]) { c.position.y = -0.55; pitch.add(c); }
    rel.decompose(bolt.position, bolt.quaternion, bolt.scale); pitch.add(bolt);
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  root.userData = { yaw, pitch, bolt: bolt || new THREE.Group() };
  return root;
}
export function makeBoltMesh() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5), new THREE.MeshStandardMaterial({ color: 0x5b3a1e }));
  shaft.rotation.x = Math.PI / 2; g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.7, roughness: 0.3 }));
  head.rotation.x = Math.PI / 2; head.position.z = 1.05; g.add(head);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.3), new THREE.MeshStandardMaterial({ color: 0xd94b3a })); fl.position.z = -0.8; g.add(fl);
  return g;
}

// ---------- Castillo ----------
export function buildCastle(scene) {
  const castle = { segments: [], towers: [], keep: null, princessSpot: null, gate: null, yardSpots: [] };
  const sides = [
    { n: new THREE.Vector3(0, 0, 1), along: new THREE.Vector3(1, 0, 0), ry: 0 },              // sur (frente)
    { n: new THREE.Vector3(1, 0, 0), along: new THREE.Vector3(0, 0, -1), ry: Math.PI / 2 },   // este
    { n: new THREE.Vector3(0, 0, -1), along: new THREE.Vector3(-1, 0, 0), ry: Math.PI },      // norte
    { n: new THREE.Vector3(-1, 0, 0), along: new THREE.Vector3(0, 0, 1), ry: -Math.PI / 2 },  // oeste
  ];
  let id = 0;
  for (const [si, sd] of sides.entries()) {
    for (const off of [-5, 5]) {
      const center = sd.n.clone().multiplyScalar(HALF).addScaledVector(sd.along, off);
      const isGate = si === 0 && off === 5;
      const grp = new THREE.Group(); grp.position.copy(center); grp.rotation.y = sd.ry; scene.add(grp);
      const wall = A.clone(isGate ? 'castle/wall_straight_gate' : 'castle/wall_straight');
      wall.scale.set(5, 4.2, 4); grp.add(wall);
      // materiales propios para poder oscurecer el tramo cuando se daña
      wall.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.userData.baseColor = o.material.color.clone(); } });
      const seg = {
        id: id++, side: si, center, n: sd.n.clone(), along: sd.along.clone(), ry: sd.ry, grp, wall, isGate,
        hp: 100, maxHp: 100, state: 0, emitT: 0, attackers: 0,
        outer: center.clone().addScaledVector(sd.n, 2.2), inner: center.clone().addScaledVector(sd.n, -3.2),
        top: center.clone().setY(WALK_Y),
      };
      if (isGate) {
        castle.gate = { seg, open: 0, target: 0, doors: [] };
        wall.traverse(o => { if (/door_left/.test(o.name)) castle.gate.doors.push({ o, dir: 1 }); if (/door_right/.test(o.name)) castle.gate.doors.push({ o, dir: -1 }); });
      }
      // ballesta encima de cada tramo (en el portón, sobre el arco)
      const b = makeBallista(); b.scale.setScalar(1.15);
      b.position.copy(center).addScaledVector(sd.n, 0.3).setY(isGate ? WALL_H + 0.55 : WALK_Y + 0.15);
      b.rotation.y = Math.atan2(sd.n.x, sd.n.z); scene.add(b);
      seg.ballista = { obj: b, cd: Math.random(), target: null, recoil: 0, aim: b.rotation.y };
      // estandartes azules colgando por fuera del muro (se caen con la brecha)
      seg.deco = new THREE.Group(); scene.add(seg.deco); const bannerGrp = new THREE.Group();
      for (const off2 of isGate ? [-3.2] : [-2.7, 2.7]) {
        const bn = A.clone('kn/flag-banner-long'); bn.scale.setScalar(1.75);
        bn.position.copy(center).addScaledVector(sd.n, 2.08).addScaledVector(sd.along, off2).setY(0.7);
        bn.rotation.y = Math.atan2(-sd.n.z, sd.n.x); bannerGrp.add(bn);
      }
      mergeStatic(bannerGrp, seg.deco, true);
      seg.crew = center.clone().addScaledVector(sd.n, -1.3).addScaledVector(sd.along, 1.2).setY(isGate ? WALL_H + 0.4 : WALK_Y);
      castle.segments.push(seg);
    }
  }
  // torres en las esquinas
  for (const [x, z] of [[HALF, HALF], [HALF, -HALF], [-HALF, -HALF], [-HALF, HALF]]) {
    const t = A.clone('castle/tower_A'); t.scale.setScalar(4.6); t.position.set(x, 0, z); t.rotation.y = Math.atan2(x, z); scene.add(t);
    castle.towers.push(t);
    const f = A.clone('deco/flag_red'); f.scale.setScalar(9); f.position.set(x, 10.1, z); scene.add(f);
  }
  // torre del homenaje y torre de la princesa
  const keep = A.clone('castle/castle'); keep.scale.setScalar(3.6); keep.position.set(1.5, 0, -5); scene.add(keep); castle.keep = keep;
  const pt = A.clone('castle/tower_B'); pt.scale.setScalar(6.6); pt.position.set(-6.2, 0, -3); pt.rotation.y = 0.5; scene.add(pt);
  castle.princessTower = pt;
  // sin techo: así la princesa se ve desde la cámara alta
  pt.traverse(o => { if (/top/i.test(o.name) && o.isMesh) o.visible = false; });
  const banner = A.clone('deco/flag_yellow'); banner.scale.setScalar(14); banner.position.set(-6.2 + 0.6, 2.49 * 6.6 * 0.585, -3 - 1.2); scene.add(banner);
  castle.princessSpot = new THREE.Vector3(-6.2 - 0.5 * 3.35, 2.49 * 6.6 * 0.585, -3 + 0.86 * 3.35);
  // mercado y faroles en el patio
  for (const [k, x, z, sc, ry] of [['kn/stall-green', 9.7, -2.5, 2.4, -Math.PI / 2], ['kn/cart', 9.9, 3.4, 2.4, 0.2], ['kn/lantern', 2.2, 10.6, 2, 0], ['kn/lantern', 7.8, 10.6, 2, 0]])
    place(k, x, z, { s: sc, ry, scene, y: 0 });
  // utilería del patio
  const props = [['deco/well', 'castle/well', 4.5, -3.5, 7, 3], ['deco/tent', 'deco/tent', -7, 7, 6, 0.4], ['', 'deco/crate_A_big', 7.5, 7.5, 7, 0], ['', 'deco/crate_B_big', 8.4, 6.2, 7, 0.5], ['', 'deco/barrel', 6.5, 8.6, 7, 0],
    ['', 'deco/bucket_arrows', -2, 8.8, 9, 0], ['', 'deco/weaponrack', -9.5, 2, 8, Math.PI / 2], ['', 'res/Wood_Log_Stack', 9, -8, 1.6, 0.3], ['', 'res/Stone_Bricks_Stack_Small', 9.5, 1, 1.8, 0], ['', 'deco/wheelbarrow', 3, 9, 7, 2.5],
    ['', 'deco/sack', -4, 9.5, 8, 0], ['', 'deco/crate_long_A', -9, -8.5, 7, 0.4], ['', 'deco/target', -9.4, -4, 7, Math.PI / 2]];
  for (const [, k, x, z, s, ry] of props) place(k, x, z, { s, ry, scene });
  // puntos donde trabajan los jugadores en el patio
  castle.yardSpots = [
    { p: new THREE.Vector3(8.2, 0, -6.5), anim: 'Chopping', face: new THREE.Vector3(9, 0, -8) },
    { p: new THREE.Vector3(3.5, 0, -1.5), anim: 'Working_A', face: new THREE.Vector3(4.5, 0, -3.5) },
    { p: new THREE.Vector3(8, 0, 2.5), anim: 'Hammering', face: new THREE.Vector3(9.5, 0, 1) },
    { p: new THREE.Vector3(-8, 0, 2), anim: 'Sawing', face: new THREE.Vector3(-9.5, 0, 2) },
    { p: new THREE.Vector3(-7.5, 0, -4), anim: 'Ranged_2H_Aiming', face: new THREE.Vector3(-9.4, 0, -4) },
    { p: new THREE.Vector3(-1, 0, 7), anim: 'PickUp', face: new THREE.Vector3(-2, 0, 8.8) },
    { p: new THREE.Vector3(5.5, 0, 6.5), anim: 'Lockpicking', face: new THREE.Vector3(7.5, 0, 7.5) },
    { p: new THREE.Vector3(-4.5, 0, 4.5), anim: 'Digging', face: new THREE.Vector3(-4.5, 0, 6) },
    { p: new THREE.Vector3(-8, 0, -7), anim: 'Pickaxing', face: new THREE.Vector3(-9, 0, -8.5) },
    { p: new THREE.Vector3(1, 0, 4), anim: 'Cheering', face: new THREE.Vector3(1, 0, 10) },
  ];
  return castle;
}

// Aplica el aspecto visual según la vida del tramo
export function setSegmentLook(seg) {
  const k = seg.hp / seg.maxHp;
  const st = k <= 0 ? 3 : k < 0.34 ? 2 : k < 0.67 ? 1 : 0;
  const dark = [0, 0.25, 0.5, 0.7][st];
  seg.wall.traverse(o => { if (o.isMesh && o.userData.baseColor) o.material.color.copy(o.userData.baseColor).lerp(new THREE.Color(0x2b2420), dark); });
  if (st === seg.state) return false;
  const prev = seg.state; seg.state = st;
  // brecha: el muro desaparece y quedan escombros
  if (st === 3) {
    seg.wall.visible = false;
    if (!seg.rubble) {
      seg.rubble = new THREE.Group();
      for (let i = 0; i < 3; i++) { const r = A.clone('castle/destroyed'); r.scale.setScalar(3.2); r.position.set((i - 1) * 3.3, 0, rnd(-0.5, 0.5)); r.rotation.y = rnd(0, 6); seg.rubble.add(r); }
      seg.grp.add(seg.rubble);
    }
    seg.rubble.visible = true; seg.ballista.obj.visible = false; if (seg.deco) seg.deco.visible = false;
    if (!seg.ballistaWreck) { const w = A.clone('kn/siege-ballista-demolished'); w.scale.setScalar(1.9); w.position.copy(seg.ballista.obj.position).setY(0.1); w.position.addScaledVector(seg.n, 1.4); w.rotation.y = Math.random() * 6; seg.grp.parent.add(w); seg.ballistaWreck = w; }
    seg.ballistaWreck.visible = true;
  } else {
    seg.wall.visible = true; if (seg.rubble) seg.rubble.visible = false; seg.ballista.obj.visible = true; if (seg.deco) seg.deco.visible = true; if (seg.ballistaWreck) seg.ballistaWreck.visible = false;
  }
  // grietas: piedras sueltas en la base
  if (st >= 1 && !seg.chunks) {
    seg.chunks = new THREE.Group();
    for (let i = 0; i < 4; i++) { const c = A.clone('res/Stone_Chunks_Large'); c.scale.setScalar(rnd(1.4, 2.2)); c.position.set(rnd(-4, 4), 0, rnd(1.8, 2.8)); c.rotation.y = rnd(0, 6); seg.chunks.add(c); }
    seg.grp.add(seg.chunks);
  }
  if (seg.chunks) seg.chunks.visible = st >= 1;
  return st > prev ? 'worse' : 'better';
}
