// Carga y clona modelos GLB. Los personajes KayKit comparten el rig "Rig_Medium",
// así que sus animaciones vienen de los archivos de /assets/anims.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map();
export const kayClips = {};

export const MODELS = {
  castle: ['wall_straight', 'wall_straight_gate', 'destroyed', 'scaffolding', 'tower_A', 'tower_B', 'castle', 'tower_catapult', 'well', 'home_A', 'home_B', 'windmill', 'barracks', 'blacksmith', 'church', 'grain', 'fence_wood_straight', 'bridge_A'],
  deco: ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees', 'mountain_A', 'mountain_B', 'mountain_C', 'hills_A_trees', 'hills_B_trees', 'hills_C_trees', 'cloud_big', 'cloud_small', 'rock_single_A', 'rock_single_C', 'rock_single_E', 'barrel', 'bucket_arrows', 'crate_A_big', 'crate_B_big', 'crate_long_A', 'crate_open', 'flag', 'flag_red', 'flag_yellow', 'flag_green', 'ladder', 'sack', 'tent', 'weaponrack', 'wheelbarrow', 'resource_stone', 'resource_lumber', 'target'],
  nature: ['Tree_1_A', 'Tree_1_B', 'Tree_1_C', 'Tree_2_A', 'Tree_2_B', 'Tree_2_C', 'Tree_3_A', 'Tree_3_B', 'Tree_3_C', 'Tree_4_A', 'Tree_4_B', 'Tree_4_C', 'Tree_Bare_1_A', 'Bush_1_A', 'Bush_2_A', 'Bush_3_A', 'Bush_4_A', 'Rock_1_A', 'Rock_2_A', 'Rock_3_A', 'Grass_1_A', 'Grass_2_A'],
  res: ['Stone_Bricks_Stack_Small', 'Wood_Planks_Stack_Small', 'Gold_Bars_Stack_Small', 'Iron_Bars_Stack_Small', 'Stone_Chunks_Large', 'Wood_Log_Stack', 'Textiles_Stack_Small'],
  weapons: ['sword_A', 'sword_B', 'axe_A', 'axe_B', 'shield_A', 'shield_B', 'staff_A', 'staff_B', 'dagger_A', 'dagger_B', 'bow_A_withString', 'spear_A', 'hammer_A', 'halberd', 'arrow_A'],
  chars: ['Barbarian', 'Knight', 'Mage', 'Ranger', 'Rogue', 'Rogue_Hooded', 'Skeleton_Mage', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior', 'peasant'],
  // packs Kenney (castillo/asedio, pueblo, bosque): ver tools/build-kenney.mjs
  kn: ['e-siege-catapult', 'e-siege-catapult-demolished', 'e-siege-trebuchet', 'e-siege-trebuchet-demolished', 'e-siege-ram', 'e-siege-ram-demolished', 'e-siege-tower', 'e-siege-tower-demolished', 'e-flag-wide', 'e-flag-pennant', 'e-flag-banner-short', 'e-tent', 'e-flag',
    'siege-ballista', 'siege-ballista-demolished', 'flag-banner-long', 'flag-banner-short', 'flag-pennant', 'flag', 'metal-gate', 'rocks-large', 'rocks-small', 'tree-log', 'tree-trunk',
    'cart', 'cart-high', 'lantern', 'stall', 'stall-green', 'stall-red', 'stall-bench', 'stall-stool', 'fountain-round-detail', 'hedge', 'hedge-large', 'hedge-curved', 'fence', 'fence-broken', 'fence-curved', 'fence-gate', 'watermill', 'wheel', 'planks', 'planks-half', 'poles', 'banner-red', 'banner-green', 'overhang', 'pillar-wood', 'rock-large', 'rock-wide', 'tree-high-round', 'tree-crooked', 'chimney',
    'patch-dirt', 'patch-grass', 'plant', 'rocks-high', 'rocks-low', 'rocks-ramp', 'stones', 'target', 'tree', 'tree-high', 'building-platform', 'building-roof', 'building-structure', 'ladder', 'fence-rope'],
  enemies: ['zombie_a', 'zombie_b', 'goblin', 'imp', 'orc', 'ogre', 'mimic', 'dragon', 'monkey', 'batwing'],
};
const ANIM_FILES = ['General', 'MovementBasic', 'Simulation', 'Tools', 'CombatRanged', 'CombatMelee', 'Special'];

export async function loadAll(onProgress) {
  const jobs = [];
  for (const [cat, names] of Object.entries(MODELS)) for (const n of names) jobs.push([`${cat}/${n}`, `/assets/${cat}/${n}.glb`]);
  for (const a of ANIM_FILES) jobs.push([`anims/${a}`, `/assets/anims/${a}.glb`]);
  let done = 0;
  const run = async ([key, url]) => {
    try { cache.set(key, await loader.loadAsync(url)); } catch (e) { console.warn('No se pudo cargar', url, e); }
    onProgress && onProgress(++done / jobs.length);
  };
  // 6 descargas en paralelo
  const queue = jobs.slice();
  await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await run(queue.shift()); }));
  for (const a of ANIM_FILES) { const g = cache.get('anims/' + a); if (g) for (const c of g.animations) kayClips[c.name] = c; }
  // Kenney: un solo material por textura (así se pueden unir en pocas mallas)
  const shared = {};
  for (const [k, g] of cache) if (k.startsWith('kn/')) g.scene.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material; if (!m.name.startsWith('kn-')) return;
    if (!shared[m.name]) { shared[m.name] = m; m.roughness = 0.95; m.metalness = 0; if (m.map) m.map.anisotropy = 4; }
    o.material = shared[m.name];
  });
  // las mallas de los modelos estáticos proyectan sombra
  for (const [k, g] of cache) g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = !k.startsWith('chars') && !k.startsWith('enemies'); } });
}

export function has(key) { return cache.has(key); }
export function clips(key) { return cache.get(key)?.animations || []; }

// Clona un modelo; los animados usan SkeletonUtils para que cada copia tenga su propio esqueleto.
export function clone(key, { skinned = false } = {}) {
  const g = cache.get(key);
  if (!g) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff00ff })); return m; }
  return skinned ? SkeletonUtils.clone(g.scene) : g.scene.clone(true);
}

// Clona y tiñe los materiales (para enemigos o variantes de color)
export function tint(obj, color, amount = 0.5, emissive) {
  const c = new THREE.Color(color);
  obj.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const nm = mats.map(m => { const n = m.clone(); n.color = n.color.clone().lerp(c, amount); if (emissive) { n.emissive = new THREE.Color(emissive); n.emissiveIntensity = 0.35; } return n; });
    o.material = Array.isArray(o.material) ? nm : nm[0];
  });
  return obj;
}

// Busca un clip por nombre ignorando prefijos tipo "CharacterArmature|"
export function findClip(list, ...names) {
  for (const n of names) {
    const c = list.find(c => c.name === n || c.name.endsWith('|' + n));
    if (c) return c;
  }
  return null;
}

// Escala un objeto para que mida `h` de alto y queda apoyado en el suelo.
export function fitHeight(obj, h) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  const s = h / Math.max(0.001, b.max.y - b.min.y);
  obj.scale.multiplyScalar(s);
  return s;
}
