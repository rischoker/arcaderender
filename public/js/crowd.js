// Multitudes baratas de dibujar: la horda del fondo y los arqueros de las murallas.
// Truco: "horneamos" unas pocas poses de la animación en mallas fijas y las dibujamos con
// InstancedMesh (cientos de soldados con muy pocas llamadas de dibujo, ideal para PCs de oficina).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Unit } from './units.js';
import { groundY, RIVER_Z, ROAD_X, HALF, WALK_Y, WALL_H } from './world.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();

function makeBowGeo() {
  const arc = new THREE.TorusGeometry(0.42, 0.035, 4, 10, Math.PI * 0.9).rotateZ(Math.PI / 2 - Math.PI * 0.45);
  const str = new THREE.CylinderGeometry(0.008, 0.008, 0.78, 3);
  const g = mergeGeometries([arc.toNonIndexed(), str.toNonIndexed()]);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  const brown = new THREE.Color(0x5a3418);
  for (let i = 0; i < n; i++) { col[i * 3] = brown.r; col[i * 3 + 1] = brown.g; col[i * 3 + 2] = brown.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  g.deleteAttribute('normal');
  return g;
}

// Devuelve { groups: [{ mat, frames: [geometry…] }] } con las poses horneadas
export function bake(key, { anim, frames = 6, height = 2, poses = null, bow = false, tint = null, weapons = true }) {
  const u = new Unit(key, { height, weapons });
  u.root.updateMatrixWorld(true);
  const act = anim ? u.action(anim) : null;
  const dur = act ? act.getClip().duration : 1;
  const times = poses || (act ? Array.from({ length: frames }, (_, i) => dur * i / frames) : [0]);
  const groups = new Map();
  const bowGeo = bow ? makeBowGeo() : null;
  for (let [fi, t] of times.entries()) {
    let a = act;
    if (poses && Array.isArray(t)) { a = u.action(t[0]); t = t[1]; }
    if (a) { u.mixer.stopAllAction(); a.reset(); a.play(); a.setEffectiveWeight(1); u.mixer.setTime(typeof t === 'number' ? t : 0); }
    u.root.updateMatrixWorld(true);
    const parts = new Map();
    u.model.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const src = o.geometry, n = src.attributes.position.count;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        o.getVertexPosition(i, _v); _v.applyMatrix4(o.matrixWorld);
        pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', src.attributes.uv ? src.attributes.uv.clone() : new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      if (src.attributes.color) g.setAttribute('color', src.attributes.color.clone());
      else { const c = o.material.color || new THREE.Color(1, 1, 1), col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
      if (src.index) g.setIndex(src.index.clone());
      const gk = o.material.map ? 'map:' + o.material.map.uuid : 'col';
      if (!parts.has(gk)) parts.set(gk, { map: o.material.map || null, geos: [] });
      parts.get(gk).geos.push(g.index ? g.toNonIndexed() : g);
    });
    if (bowGeo) {
      let hand = null; u.model.traverse(o => { if (o.isBone && o.name === 'handslot.l') hand = o; });
      if (hand) {
        const bg = bowGeo.clone();
        const ws = new THREE.Vector3(); hand.getWorldScale(ws);
        _m.copy(hand.matrixWorld).multiply(new THREE.Matrix4().makeScale(1 / ws.x * 1.1, 1 / ws.y * 1.1, 1 / ws.z * 1.1));
        bg.applyMatrix4(_m);
        if (!parts.has('col')) parts.set('col', { map: null, geos: [] });
        parts.get('col').geos.push(bg);
      }
    }
    for (const [gk, p] of parts) {
      // volvemos a compartir vértices: ~5 veces menos trabajo para la tarjeta gráfica por soldado
      let merged = mergeGeometries(p.geos, false); merged.computeVertexNormals(); merged = mergeVertices(merged, 1e-4);
      if (!groups.has(gk)) {
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: p.map, roughness: 0.85 });
        if (tint) mat.color.set(tint);
        groups.set(gk, { mat, frames: [] });
      }
      groups.get(gk).frames[fi] = merged;
    }
  }
  u.dispose();
  return { groups: [...groups.values()] };
}

// Conjunto de InstancedMesh (uno por pose y grupo de material)
class InstancedSet {
  constructor(scene, baked, cap, { shadow = false } = {}) {
    this.cap = cap; this.meshes = [];
    for (const g of baked.groups) {
      const row = g.frames.map(geo => { const m = new THREE.InstancedMesh(geo, g.mat, cap); m.count = 0; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = false; scene.add(m); return m; });
      this.meshes.push(row);
    }
    this.frames = baked.groups[0].frames.length;
  }
  begin() { this.counts = new Array(this.frames).fill(0); }
  push(frame, matrix) {
    const c = this.counts[frame]; if (c >= this.cap) return;
    for (const row of this.meshes) row[frame].setMatrixAt(c, matrix);
    this.counts[frame] = c + 1;
  }
  end() {
    for (const row of this.meshes) row.forEach((m, f) => { m.count = this.counts[f]; m.instanceMatrix.needsUpdate = true; });
  }
}

function glowTexture(inner = 'rgba(255,220,140,1)', outer = 'rgba(255,90,0,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(0.35, 'rgba(255,150,40,.6)'); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const GLOW_TEX = glowTexture();

// ---------- La horda ----------
const HORDE_TYPES = [
  { key: 'enemies/zombie_b', anim: 'walk', h: 2.3, from: 0 },
  { key: 'enemies/zombie_a', anim: 'walk', h: 2.3, from: 0 },
  { key: 'chars/Skeleton_Warrior', anim: 'walk', h: 2.4, from: 1 },
  { key: 'chars/Skeleton_Minion', anim: 'walk', h: 2.4, from: 1 },
  { key: 'enemies/imp', anim: null, h: 2.0, from: 2 },
  { key: 'enemies/orc', anim: 'walk', h: 2.9, from: 3 },
];

export class Horde {
  constructor(scene, { max = 320 } = {}) {
    this.scene = scene; this.max = max; this.members = []; this.wave = 0; this.active = false; this.time = 0;
    this.types = HORDE_TYPES.map(T => {
      const baked = bake(T.key, { anim: T.anim, frames: T.anim ? 6 : 1, height: T.h });
      return { ...T, set: new InstancedSet(scene, baked, max) };
    });
    this.buildSlots();
    // antorchas (un solo objeto de puntos brillantes)
    this.torchGeo = new THREE.BufferGeometry();
    this.torchPos = new Float32Array(max * 3);
    this.torchGeo.setAttribute('position', new THREE.BufferAttribute(this.torchPos, 3));
    this.torchMat = new THREE.PointsMaterial({ size: 2.4, map: GLOW_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffb060 });
    this.torches = new THREE.Points(this.torchGeo, this.torchMat); this.torches.frustumCulled = false; scene.add(this.torches);
    // estandartes de guerra
    const pole = new THREE.CylinderGeometry(0.06, 0.06, 5, 4).translate(0, 2.5, 0);
    const flag = new THREE.PlaneGeometry(1.4, 1.8).translate(0.7, 4.0, 0);
    const pc = new THREE.Color(0x3a2a1a), fc = new THREE.Color(0x7a1010);
    const colorize = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.toNonIndexed(); };
    const bannerGeo = mergeGeometries([colorize(pole, pc), colorize(flag, fc)]);
    this.banners = new THREE.InstancedMesh(bannerGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), this.blocks.length);
    this.blocks.forEach((b, i) => { _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot); _m.compose(new THREE.Vector3(b.bx, groundY(b.bx, b.bz) - 0.2, b.bz), _q, new THREE.Vector3(1, 1, 1)); this.banners.setMatrixAt(i, _m); });
    this.banners.visible = false; scene.add(this.banners);
  }
  buildSlots() {
    this.slots = []; this.blocks = [];
    const sp = 1.75;
    const nb = 18;
    for (let b = 0; b < nb; b++) {
      const a = -0.35 + (b + 0.2 + Math.random() * 0.6) / nb * 3.85;    // del este, por el frente, hasta el oeste
      // justo detrás de las estacas; por el frente se quedan antes del río
      const front = Math.sin(a) > 0.6;
      const r = (front ? rnd(29, 31) : rnd(31, 34)) + (b % 2) * (front ? 2 : 5);
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), right = new THREE.Vector3(-out.z, 0, out.x);
      const cols = 6 + (Math.random() * 4 | 0), rows = front ? 3 + (Math.random() * 2 | 0) : 4 + (Math.random() * 3 | 0);
      const rot = Math.atan2(-out.x, -out.z);
      const block = { a, rot, bx: cx + out.x * (rows * sp + 1), bz: cz + out.z * (rows * sp + 1) };
      this.blocks.push(block);
      for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c++) {
        const x = cx + right.x * (c - cols / 2) * sp + out.x * row * sp + rnd(-0.3, 0.3);
        const z = cz + right.z * (c - cols / 2) * sp + out.z * row * sp + rnd(-0.3, 0.3);
        if (z > 18 && Math.abs(x - ROAD_X(z)) < 6) continue;
        if (Math.hypot(x, z) < 25.5) continue;
        if (Math.abs(z - RIVER_Z(x)) < 5.5) continue;
        this.slots.push({ x, z, a: Math.atan2(z, x), rot, taken: null, row });
      }
    }
    this.slots.sort((p, q) => p.row - q.row || Math.random() - 0.5);
  }
  target() {
    if (!this.active) return 0;
    return Math.min(this.max * (this.quality ?? 1), this.slots.length, Math.round(80 + 48 * Math.min(this.wave, 6)));
  }
  start() { this.active = true; this.banners.visible = true; }
  reset() { this.active = false; this.banners.visible = false; this.members = []; for (const s of this.slots) s.taken = null; }
  spawnMember() {
    const free = this.slots.filter(s => !s.taken);
    if (!free.length) return;
    // los nuevos rellenan primero las filas delanteras
    const slot = free[0].row === 0 || Math.random() < 0.6 ? free[0] : free[(Math.random() * free.length) | 0];
    const avail = this.types.filter(t => t.from <= this.wave);
    const T = avail[(Math.random() * avail.length) | 0];
    const out = Math.hypot(slot.x, slot.z), dx = slot.x / out, dz = slot.z / out;
    const m = { T, slot, x: slot.x + dx * rnd(26, 34), z: slot.z + dz * rnd(26, 34), state: 'march', t: 0, phase: Math.random(), torch: Math.random() < 0.28, fall: 0, jump: 0 };
    slot.taken = m; this.members.push(m);
  }
  // Un enemigo "de verdad" sale de la horda: quitamos al soldado más cercano a ese ángulo
  take(angle) {
    let best = null, bd = 0.7;
    for (const m of this.members) {
      if (m.state !== 'hold') continue;
      let d = Math.abs(Math.atan2(Math.sin(m.slot.a - angle), Math.cos(m.slot.a - angle)));
      d += m.slot.row * 0.05;
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return null;
    this.remove(best);
    return new THREE.Vector3(best.x, groundY(best.x, best.z), best.z);
  }
  remove(m) { m.slot.taken = null; const i = this.members.indexOf(m); if (i >= 0) this.members.splice(i, 1); }
  randomTarget(maxDist = 60) {
    const c = this.members.filter(m => m.state === 'hold' && !m.doomed);
    return c.length ? c[(Math.random() * c.length) | 0] : null;
  }
  kill(m) { if (m.state === 'fall') return; m.state = 'fall'; m.t = 0; }
  roar() { for (const m of this.members) if (m.state === 'hold' && Math.random() < 0.5) m.jump = 0.6 + Math.random() * 0.4; }
  update(dt) {
    this.time += dt;
    const want = this.target();
    let alive = this.members.length;
    if (alive < want && Math.random() < dt * 14) this.spawnMember();
    for (const t of this.types) t.set.begin();
    let ti = 0;
    for (let i = this.members.length - 1; i >= 0; i--) {
      const m = this.members[i]; m.t += dt;
      let frame, y = groundY(m.x, m.z), rotX = 0, rot = m.slot.rot;
      const F = m.T.set.frames;
      if (m.state === 'march') {
        const dx = m.slot.x - m.x, dz = m.slot.z - m.z, d = Math.hypot(dx, dz);
        if (d < 0.2) { m.state = 'hold'; } else { const s = Math.min(d, dt * 2.6); m.x += dx / d * s; m.z += dz / d * s; rot = Math.atan2(dx, dz); }
        frame = Math.floor((m.t * 1.6 + m.phase) * F) % F;
      } else if (m.state === 'hold') {
        // pisotean en el sitio, de vez en cuando saltan rugiendo
        frame = Math.floor((m.t * 0.9 + m.phase) * F) % F;
        if (m.jump > 0) { m.jump -= dt; y += Math.abs(Math.sin(m.jump * 10)) * 0.5; }
      } else {
        // abatido por una flecha: cae y se hunde
        frame = 0; m.fall += dt;
        rotX = Math.min(1.5, m.fall * 3.5); y -= Math.max(0, m.fall - 1.2) * 1.5;
        if (m.fall > 2.4) { this.remove(m); continue; }
      }
      if (!m.T.anim) { y += Math.abs(Math.sin((m.t + m.phase) * (m.state === 'march' ? 9 : 4))) * 0.18; frame = 0; }
      _e.set(-rotX, rot, 0, 'YXZ'); _q.setFromEuler(_e);
      _m.compose(_v.set(m.x, y, m.z), _q, _s.set(1, 1, 1));
      m.T.set.push(frame, _m);
      if (m.torch && m.state !== 'fall' && ti < this.max) {
        const fl = Math.sin(this.time * 13 + m.phase * 20) * 0.08;
        this.torchPos[ti * 3] = m.x + Math.cos(rot) * 0.5; this.torchPos[ti * 3 + 1] = y + m.T.h * 1.05 + fl; this.torchPos[ti * 3 + 2] = m.z - Math.sin(rot) * 0.5; ti++;
      }
    }
    for (const t of this.types) t.set.end();
    this.torchGeo.setDrawRange(0, ti); this.torchGeo.attributes.position.needsUpdate = true;
    this.torchMat.size = 2.2 + Math.sin(this.time * 9) * 0.15;
  }
}

// ---------- Arqueros de las murallas ----------
export class Archers {
  constructor(scene, castle) {
    this.scene = scene; this.list = []; this.arrows = []; this.volleyT = 8; this.time = 0;
    const baked = bake('chars/Rogue_Hooded', {
      height: 2.0, bow: false, weapons: { l: 'bow_A_withString' },
      poses: [['Ranged_Bow_Aiming_Idle', 0.2], ['Ranged_Bow_Draw', 0.25], ['Ranged_Bow_Draw', 0.55], ['Ranged_Bow_Release', 0.15]],
    });
    this.set = new InstancedSet(scene, baked, 40);
    for (const seg of castle.segments) {
      for (const off of seg.isGate ? [-2.6, 2.6] : [-3.4, 3.4]) {
        const p = seg.center.clone().addScaledVector(seg.along, off).addScaledVector(seg.n, seg.isGate ? -0.2 : -0.4).setY(seg.isGate ? WALL_H + 0.35 : WALK_Y);
        this.list.push({ seg, p, rot: Math.atan2(seg.n.x, seg.n.z), aim: Math.atan2(seg.n.x, seg.n.z), state: 'idle', t: rnd(0, 3), next: rnd(1.5, 4), target: null, fire: false });
      }
    }
    // flechas: también instanciadas
    const shaft = new THREE.CylinderGeometry(0.03, 0.03, 1.3, 3).rotateX(Math.PI / 2);
    const head = new THREE.ConeGeometry(0.07, 0.22, 4).rotateX(Math.PI / 2).translate(0, 0, 0.72);
    this.arrowMesh = new THREE.InstancedMesh(mergeGeometries([shaft.toNonIndexed(), head.toNonIndexed()]), new THREE.MeshBasicMaterial({ color: 0x3a2a1a }), 160);
    this.arrowMesh.frustumCulled = false; this.arrowMesh.count = 0; scene.add(this.arrowMesh);
  }
  volley() { for (const a of this.list) if (a.seg.hp > 0 && a.state === 'idle') { a.state = 'draw'; a.t = rnd(0, 0.25); a.volley = true; } }
  update(dt, game) {
    this.time += dt;
    const fighting = game.phase === 'playing';
    if (fighting) {
      this.volleyT -= dt;
      if (this.volleyT <= 0) { this.volleyT = rnd(9, 14); this.volley(); game.onVolley && game.onVolley(); }
    }
    this.set.begin();
    for (const a of this.list) {
      const alive = a.seg.hp > 0;
      a.t += dt;
      if (alive && fighting) {
        if (a.state === 'idle' && a.t > a.next) { a.state = 'draw'; a.t = 0; }
        if (a.state === 'draw' && !a.target) a.target = this.pickTarget(a, game);
        if (a.state === 'draw' && a.t > 0.75) { a.state = 'release'; a.t = 0; this.shoot(a, game); }
        if (a.state === 'release' && a.t > 0.35) { a.state = 'idle'; a.t = 0; a.next = rnd(1.8, 4.5); a.target = null; a.volley = false; }
      } else if (a.state !== 'idle') { a.state = 'idle'; a.t = 0; }
      if (a.target) { const tp = a.target.pos || a.target; a.aim = Math.atan2(tp.x - a.p.x, tp.z - a.p.z); }
      a.rot += Math.atan2(Math.sin(a.aim - a.rot), Math.cos(a.aim - a.rot)) * Math.min(1, dt * 5);
      const frame = !alive ? -1 : a.state === 'idle' ? 0 : a.state === 'release' ? 3 : (a.t < 0.35 ? 1 : 2);
      if (frame < 0) continue;
      _q.setFromAxisAngle(_v.set(0, 1, 0), a.rot);
      _m.compose(_s.copy(a.p), _q, new THREE.Vector3(1, 1, 1));
      this.set.push(frame, _m);
    }
    this.set.end();
    // flechas en vuelo
    let n = 0;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const ar = this.arrows[i]; ar.t += dt;
      const k = Math.min(1, ar.t / ar.T);
      const p = _v.copy(ar.from).lerp(ar.to, k); p.y += Math.sin(k * Math.PI) * ar.arc;
      const p2 = ar.from.clone().lerp(ar.to, Math.min(1, k + 0.02)); p2.y += Math.sin(Math.min(1, k + 0.02) * Math.PI) * ar.arc;
      if (ar.fire && Math.random() < 0.5) game.fx.emit('fire', p, 1, { scale: 0.5 });
      if (k >= 1) {
        if (ar.member) { if (ar.member.slot && game.horde.members.includes(ar.member)) game.horde.kill(ar.member); }
        // contra enemigos reales las flechas solo son efecto visual: el daño de verdad sale de las respuestas
        else if (ar.enemy && !ar.enemy.dead) game.fx.emit('spark', ar.to, 3);
        this.arrows.splice(i, 1); continue;
      }
      _m.lookAt(p, p2, _s.set(0, 1, 0)); _m.setPosition(p);
      // lookAt de Matrix4 mira hacia -z: giramos para que la punta vaya hacia adelante
      _m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
      if (n < 160) this.arrowMesh.setMatrixAt(n++, _m);
    }
    this.arrowMesh.count = n; this.arrowMesh.instanceMatrix.needsUpdate = true;
  }
  pickTarget(a, game) {
    // a veces a un enemigo real, casi siempre a la horda (volumen de fuego)
    const real = game.enemies.filter(e => !e.dead && e.state !== 'rise' && e.unit.root.position.distanceTo(a.p) < 34);
    if (real.length && Math.random() < 0.35) { const e = real[(Math.random() * real.length) | 0]; return { enemy: e, pos: e.unit.root.position }; }
    const m = game.horde.randomTarget();
    if (m) { m.doomed = Math.random() < 0.55; return { member: m, pos: new THREE.Vector3(m.x, groundY(m.x, m.z) + 1, m.z) }; }
    return null;
  }
  shoot(a, game) {
    const tg = a.target; if (!tg) return;
    const to = (tg.enemy ? tg.enemy.unit.root.position.clone().add(new THREE.Vector3(0, tg.enemy.D.h * 0.5, 0)) : tg.pos.clone()).add(new THREE.Vector3(rnd(-0.6, 0.6), 0, rnd(-0.6, 0.6)));
    const from = a.p.clone().add(new THREE.Vector3(0, 1.4, 0));
    const d = from.distanceTo(to);
    const hits = tg.enemy || tg.member.doomed;
    if (!hits && tg.member) to.add(new THREE.Vector3(rnd(-2.5, 2.5), 0, rnd(-2.5, 2.5)));
    this.arrows.push({ from, to, t: 0, T: 0.35 + d / 32, arc: d * 0.18, member: hits ? tg.member : null, enemy: tg.enemy || null, fire: game.night > 0.5 });
  }
}
