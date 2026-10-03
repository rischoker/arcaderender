// Importa modelos de los packs Kenney (castillo/asedio, pueblo, bosque) a public/assets/kn/
// con la textura ajustada (toned) o la variante enemiga (azul -> rojo) incrustada en el .glb.
// Antes: python3 tools/kenney-tex.py
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import fs from 'fs';
const K = '/home/claude/assets/kenney', OUT = '/home/claude/castle/public/assets/kn';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
// [pack, modelo, textura, nombre final]
const L = [];
const add = (pack, tex, names, prefix = '') => names.forEach(n => L.push([pack, n, tex, prefix + n]));
add('siege', 'enemy', ['siege-catapult', 'siege-catapult-demolished', 'siege-trebuchet', 'siege-trebuchet-demolished', 'siege-ram', 'siege-ram-demolished', 'siege-tower', 'siege-tower-demolished', 'flag-wide', 'flag-pennant', 'flag-banner-short'], 'e-');
add('siege', 'toned', ['siege-ballista', 'siege-ballista-demolished', 'flag-banner-long', 'flag-banner-short', 'flag-pennant', 'flag', 'metal-gate', 'rocks-large', 'rocks-small', 'tree-log', 'tree-trunk']);
add('struct', 'toned', ['cart', 'cart-high', 'lantern', 'stall', 'stall-green', 'stall-red', 'stall-bench', 'stall-stool', 'fountain-round-detail', 'hedge', 'hedge-large', 'hedge-curved', 'fence', 'fence-broken', 'fence-curved', 'fence-gate', 'watermill', 'wheel', 'planks', 'planks-half', 'poles', 'banner-red', 'banner-green', 'overhang', 'pillar-wood', 'rock-large', 'rock-wide', 'tree-high-round', 'tree-crooked', 'chimney']);
add('forest', 'toned', ['patch-dirt', 'patch-grass', 'plant', 'rocks-high', 'rocks-low', 'rocks-ramp', 'stones', 'target', 'tree', 'tree-high', 'building-platform', 'building-roof', 'building-structure', 'ladder', 'fence']);
add('forest', 'enemy', ['tent', 'flag'], 'e-');
fs.mkdirSync(OUT, { recursive: true });
const png = {};
for (const [pack, name, tex, out] of L) {
  const doc = await io.read(`${K}/${pack}/${name}.glb`);
  const key = pack + '/' + tex; png[key] ||= fs.readFileSync(`${K}/${pack}/Textures/${tex}.png`);
  for (const t of doc.getRoot().listTextures()) { t.setImage(png[key]); t.setMimeType('image/png'); t.setURI(''); }
  // nombre de material = pack+textura: el juego comparte un solo material por textura (menos llamadas de dibujo)
  for (const m of doc.getRoot().listMaterials()) m.setName(`kn-${pack}-${tex}-${m.getName()}`);
  await doc.transform(dedup(), prune());
  await io.write(`${OUT}/${pack === 'forest' && name === 'fence' ? 'fence-rope' : out}.glb`, doc);
}
console.log(L.length, 'modelos ->', OUT);
