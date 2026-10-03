// Lógica del juego: oleadas, enemigos, ballestas, aldeanos, daño al castillo, mejoras y jefes.
import * as THREE from 'three';
import * as A from './assets.js';
import * as S from './audio.js';
import { Unit, makePrincess, makeBraid, swayBraid } from './units.js';
import { HALF, WALL_H, WALK_Y, GATE_POS, setSegmentLook, makeBoltMesh, groundY } from './world.js';
import { Horde, Archers, GLOW_TEX } from './crowd.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const KEEP = V(1.5, 0, -4);

// ---------- Catálogo de enemigos ----------
export const ENEMIES = {
  zombie:   { name: 'Zombies', models: ['enemies/zombie_a', 'enemies/zombie_b'], h: 1.9, hp: 20, speed: 1.5, dps: 4, cost: 20 },
  skeleton: { name: 'Skeletons', models: ['chars/Skeleton_Minion', 'chars/Skeleton_Warrior', 'chars/Skeleton_Rogue'], h: 2.0, hp: 26, speed: 1.9, dps: 5, rise: true, cost: 26 },
  goblin:   { name: 'Armed Goblins', models: ['enemies/imp'], h: 1.6, hp: 22, speed: 3.3, dps: 5, cost: 26 },
  orc:      { name: 'Orcs with Ladders', models: ['enemies/orc'], h: 2.4, hp: 55, speed: 1.6, dps: 7, ladder: true, cost: 60 },
  ogre:     { name: 'Rock-throwing Ogres', models: ['enemies/ogre'], h: 3.8, hp: 120, speed: 1.0, ranged: 'rock', range: 15, dmg: 9, cd: 4.2, tint: 0x7d8f5a, cost: 130 },
  monkey:   { name: 'Flying Monkeys', models: ['enemies/monkey'], h: 1.5, hp: 16, speed: 4.2, flying: true, dps: 2.2, wings: 'bat', cost: 34 },
  ram:      { name: 'Battering Rams', vehicle: 'kn/e-siege-ram', wreck: 'kn/e-siege-ram-demolished', h: 2.6, hp: 150, speed: 1.25, ram: true, dps: 0, cost: 140, max: 2,
              crew: { model: 'enemies/orc', h: 2.9, at: [[-1.5, -2.4], [1.5, -2.4], [0, -3.4]] } },
  catapult: { name: 'Siege Catapults', vehicle: 'kn/e-siege-catapult', wreck: 'kn/e-siege-catapult-demolished', h: 3.0, hp: 90, speed: 1.3, artillery: true, arm: 'catapult', dmg: 7, cd: 7, stopR: [31, 35], cost: 110, max: 3,
              crew: { model: 'enemies/imp', h: 1.9, at: [[-2.1, -0.6], [2.1, -1.2]] } },
  trebuchet: { name: 'Trebuchets', vehicle: 'kn/e-siege-trebuchet', wreck: 'kn/e-siege-trebuchet-demolished', h: 5.2, hp: 160, speed: 0.9, artillery: true, arm: 'arm', big: true, dmg: 12, cd: 9.5, stopR: [34, 37], cost: 170, max: 2,
              crew: { model: 'enemies/orc', h: 2.8, at: [[-2.6, -1], [2.6, -1.6]] } },
  siegetower: { name: 'Siege Towers', vehicle: 'kn/e-siege-tower', wreck: 'kn/e-siege-tower-demolished', h: 6.4, hp: 230, speed: 0.7, tower: true, dps: 5, reach: 2.4, cost: 210, max: 2,
              crew: { model: 'enemies/orc', h: 2.8, at: [[-1.2, -3], [1.2, -3]] } },
  witch:    { name: 'Flying Witches', models: ['chars/Mage'], h: 1.9, hp: 34, speed: 3.2, flying: true, dps: 3.5, broom: true, tint: 0x3d7a3a, tintAmt: 0.55, cost: 45 },
  darkmage: { name: 'Dark Mages', models: ['chars/Skeleton_Mage'], h: 2.1, hp: 40, speed: 1.5, ranged: 'magic', range: 13, dmg: 6, cd: 3, tint: 0x5a2a8a, cost: 55 },
  troll:    { name: 'Stone Trolls', models: ['enemies/goblin'], h: 3.4, hp: 170, speed: 0.9, dps: 14, tint: 0x8a8f9a, tintAmt: 0.3, cost: 170 },
  mimic:    { name: 'Mimics', models: ['enemies/mimic'], h: 1.8, hp: 70, speed: 2.6, dps: 10, hop: true, cost: 75 },
};
export const WAVES = [
  { title: 'The Dead Awaken', mix: { zombie: 1 } },
  { title: 'Bones in the Grass', mix: { zombie: 0.5, skeleton: 1 } },
  { title: 'Goblin Raid', mix: { skeleton: 0.5, zombie: 0.3, goblin: 1, catapult: 0.1 } },
  { title: 'Orcs at the Walls', mix: { goblin: 0.6, skeleton: 0.4, orc: 1, ram: 0.12, catapult: 0.1, siegetower: 0.07 } },
  { title: 'Ogres and Flying Monkeys', mix: { orc: 0.6, goblin: 0.4, ogre: 0.35, monkey: 0.9, ram: 0.12, catapult: 0.08, trebuchet: 0.06, siegetower: 0.07 } },
  { title: 'The Dark Army', mix: { troll: 0.25, witch: 0.6, darkmage: 0.45, mimic: 0.35, orc: 0.5, ogre: 0.2, monkey: 0.4, ram: 0.12, catapult: 0.07, trebuchet: 0.07, siegetower: 0.07 } },
];
export const BOSSES = {
  A1: { name: 'Grumbo the Ogre King', model: 'enemies/ogre', h: 8, tint: 0x6b4a2a, attack: 'rocks', line: 'Grumbo hungry! Grumbo smash castle!' },
  A2: { name: 'The Great Mimic', model: 'enemies/mimic', h: 6, attack: 'slam', hop: true, line: 'Open me... if you dare!' },
  B1: { name: 'Warlord Grashnak', model: 'enemies/orc', h: 6.5, tint: 0x8a2a2a, tintAmt: 0.3, attack: 'summon', summon: 'orc', line: 'Orcs! Climb those walls!' },
  B2: { name: 'Ignis the Dragon', model: 'enemies/dragon', h: 7, attack: 'fire', flying: true, line: 'Your castle will burn!' },
  C1: { name: 'The Lich King', model: 'chars/Skeleton_Mage', h: 6, tint: 0x3a1a5a, tintAmt: 0.45, emissive: 0x6a1aff, attack: 'lich', summon: 'skeleton', line: 'Your exam ends here, mortals!' },
  MIX: { name: 'The Lich King', model: 'chars/Skeleton_Mage', h: 6, tint: 0x3a1a5a, tintAmt: 0.45, emissive: 0x6a1aff, attack: 'lich', summon: 'skeleton', escort: 'B2', line: 'The final exam begins!' },
};
const CHEERS = ['Well done, heroes!', 'Amazing! Keep going!', 'Great answer!', 'You are so clever!', 'Hooray! Supplies are here!', 'Fantastic English!', 'I believe in you!', 'Brilliant work!'];
const SADS = ['Oh no! Please be careful!', 'Think carefully, heroes!', 'Help! The walls are breaking!', 'Please hurry!', 'Don’t give up!'];

export class Game {
  constructor({ scene, camera, castle, fx, hud }) {
    Object.assign(this, { scene, camera, castle, fx, hud });
    this.players = new Map();
    this.villagers = new Map();
    this.enemies = []; this.projectiles = []; this.ladders = [];
    this.phase = 'lobby'; this.time = 0; this.shake = 0; this.timeScale = 1;
    // la horda del fondo y los arqueros (instanciados: baratos de dibujar)
    this.horde = new Horde(scene, { max: window.__lite ? 180 : window.__weakGPU ? 240 : 320 });
    this.archers = new Archers(scene, castle);
    this.reset();
    // princesa en el balcón
    this.princess = makePrincess();
    const ps = castle.princessSpot;
    this.princess.root.position.copy(ps).add(V(0, 0.15, 0)); this.princess.root.rotation.y = -0.5; scene.add(this.princess.root);
    this.princess.play('idle');
    this.braid = makeBraid(ps.clone().add(V(0.35, 1.55, 0.25)), 0.3, V(-0.45, 0, 0.9).normalize()); scene.add(this.braid);
    this.bubble = this.princess.label('', 'bubble hidden', 3.4);
    this.mood = { t: 0, lastCheer: -99, lastSad: -99, window: [], attempts: [] };
  }

  reset() {
    this.hp = 1000; this.maxHp = 1000; this.ammo = 25; this.wave = -1; this.waveT = 0; this.spawnAcc = 0; this.boss = null; this.bossDead = false;
    this.up = { rate: 0, dmg: 0, pierce: 0, fire: 0, range: 0, armor: 0, mason: 0, carts: 0, multi: 0, catapult: 0, frost: 0 };
    this.stats = { correct: 0, wrong: 0, golden: 0, kills: 0 };
    this.catT = 0; this.halfWarned = false; this.lastStand = false; this.punchCd = 0; this.focus = null;
    if (this.mood) this.mood.attempts = [];
    if (this.horde) this.horde.reset();
    if (this.archers) this.archers.arrows = [];
    for (const e of this.enemies) e.unit.dispose(); this.enemies = [];
    for (const p of this.projectiles) p.mesh.removeFromParent(); this.projectiles = [];
    for (const l of this.ladders) l.obj.removeFromParent(); this.ladders = [];
    for (const v of this.villagers.values()) v.unit.dispose(); this.villagers.clear();
    if (this.castle) for (const s of this.castle.segments) { s.hp = s.maxHp; setSegmentLook(s); s.burning = 0; }
  }

  // ---------- Jugadores ----------
  addPlayer(p) {
    let pl = this.players.get(p.id);
    if (pl) { pl.online = p.online; if (pl.char !== p.char) { pl.char = p.char; this.rebuildPlayerUnit(pl); } this.refreshPlate(pl); return pl; }
    pl = { id: p.id, name: p.name, char: p.char, online: p.online !== false, correct: 0, points: 0, streak: 0, idx: this.players.size };
    this.players.set(p.id, pl);
    this.rebuildPlayerUnit(pl);
    if (this.phase === 'lobby') { pl.unit.play('cheer', { once: true }); pl.busy = 1.8; S.sfx('join'); this.fx.emit('gold', pl.unit.root.position.clone().add(V(0, 1, 0)), 14); }
    else this.assignStation(pl, true);
    return pl;
  }
  rebuildPlayerUnit(pl) {
    const old = pl.unit;
    pl.unit = new Unit('chars/' + pl.char, { height: 2.0 });
    if (old) { pl.unit.root.position.copy(old.root.position); pl.unit.root.rotation.copy(old.root.rotation); old.dispose(); }
    this.scene.add(pl.unit.root); pl.unit.play('idle');
    this.refreshPlate(pl);
    if (this.phase === 'lobby') this.layoutLobby(); else this.assignStation(pl, true);
  }
  refreshPlate(pl) { pl.unit.label(`<span>${esc(pl.name)}</span>`, 'nameplate' + (pl.online ? '' : ' off')); }
  removePlayer(id) { const pl = this.players.get(id); if (!pl) return; pl.unit.dispose(); this.players.delete(id); if (this.phase === 'lobby') this.layoutLobby(); }

  layoutLobby() {
    const list = [...this.players.values()];
    const n = list.length;
    list.forEach((pl, i) => {
      const row = Math.floor(i / 10), col = i % 10, inRow = Math.min(10, n - row * 10);
      const x = GATE_POS.x + (col - (inRow - 1) / 2) * 2.2 - 4;
      const z = HALF + 6 + row * 2.8;
      pl.home = V(x, 0, z); pl.station = null;
      pl.unit.root.position.copy(pl.home); pl.unit.root.rotation.y = -0.1;
      pl.unit.root.visible = true;
    });
  }

  assignStation(pl, snap) {
    const list = [...this.players.values()];
    const i = list.indexOf(pl);
    const segs = this.castle.segments;
    let st;
    if (i < 8) { const order = [0, 1, 7, 2, 6, 3, 5, 4]; const seg = segs[order[i]]; st = { kind: 'ballista', seg, pos: seg.crew.clone(), face: seg.crew.clone().add(seg.n), anim: 'aim' }; }
    else if (i < 10) st = { kind: 'gate', pos: V(GATE_POS.x + (i === 8 ? -2.8 : 2.8), 0, HALF - 3.2), face: V(GATE_POS.x, 0, HALF), anim: 'idle' };
    else if (i < 20) { const y = this.castle.yardSpots[i - 10]; st = { kind: 'yard', pos: y.p.clone(), face: y.face, anim: y.anim }; }
    else { const a = (i - 20) * 0.55; st = { kind: 'cheer', pos: V(Math.cos(a) * 5 + 1, 0, Math.sin(a) * 3 + 4), face: V(0, 0, 14), anim: 'cheer' }; }
    pl.station = st;
    if (snap) {
      pl.unit.root.position.copy(st.pos); pl.unit.faceTo(st.face.x, st.face.z); pl.unit.play(st.anim);
      this.fx.emit('dust', st.pos, 6);
    }
  }

  // ---------- Inicio / fin ----------
  start(cfg) {
    this.cfg = cfg; this.reset();
    this.phase = 'playing'; this.time = 0;
    this.waveLen = Math.max(30, (cfg.duration * 60 * 0.85) / WAVES.length);
    this.horde.wave = 0; this.horde.start();
    for (const pl of this.players.values()) { pl.correct = 0; pl.points = 0; pl.streak = 0; this.assignStation(pl, true); }
    this.nextWave();
    S.restartMusic('war');
    this.say('Defend the castle, heroes! Answer well!', 'cheer');
  }
  nextWave() {
    this.wave++;
    if (this.wave >= WAVES.length) return this.startBoss();
    this.waveT = 0; this.breakT = this.wave === 0 ? 3 : 6;
    const w = WAVES[this.wave];
    const names = Object.keys(w.mix).map(k => ENEMIES[k].name);
    const newest = Object.keys(w.mix).filter(k => !WAVES.slice(0, this.wave).some(pw => pw.mix[k]));
    this.hud.banner(`Wave ${this.wave + 1} / ${WAVES.length}`, w.title + (newest.length ? ' — ' + newest.map(k => ENEMIES[k].name).join(', ') : ''));
    S.sfx('horn'); S.say(`Wave ${this.wave + 1}. ${w.title}!`, { who: 'narrator' });
    this.horde.wave = this.wave; setTimeout(() => { this.horde.roar(); S.sfx('warcry'); }, 1200);
  }
  startBoss() {
    const B = BOSSES[this.cfg.level] || BOSSES.A1;
    this.wave = WAVES.length; this.waveT = 0;
    const n = Math.max(1, this.activePlayers());
    const hp = Math.round(Math.max(400, this.expectedDps(true) * (66 + Math.min(14, this.activePlayers()))));
    this.boss = this.spawnBoss(B, hp);
    if (B.escort) this.escortPending = { def: BOSSES[B.escort], hp: Math.round(hp * 0.5) };
    this.hud.banner('BOSS', B.name, 'boss'); S.sfx('roar'); S.restartMusic('boss');
    setTimeout(() => S.say(B.line, { who: 'boss' }), 900);
    this.focus = { t: 3.6, target: this.boss.unit.root, zoom: 1 };
    this.horde.wave = 6; this.horde.roar(); S.sfx('warcry');
    this.say('Oh no! Be brave, heroes!', 'sad');
  }
  // Cada respuesta incorrecta = un golpe directo al castillo. El tamaño depende del grupo:
  // así, en toda la partida, un grupo que acierta poco pierde el castillo aunque sean pocos estudiantes.
  penaltySize() { return Math.min(55, Math.max(4, 62 / Math.max(1, this.activePlayers()))) * ({ easy: 0.75, normal: 1, hard: 1.25 }[this.cfg && this.cfg.difficulty] || 1); }
  penaltyStrike() {
    const amt = this.penaltySize();
    // una roca en llamas sale de la horda hacia un tramo visible
    const segs = this.castle.segments.filter(s => s.side !== 2);
    const seg = pick(segs.filter(s => s.hp > 0).length ? segs.filter(s => s.hp > 0) : segs);
    const ang = Math.atan2(seg.n.z, seg.n.x) + rnd(-0.5, 0.5);
    // si hay catapultas emplazadas, el castigo sale de una de ellas
    const art = this.enemies.filter(e => !e.dead && e.D.artillery && e.state === 'siege' && e.fireT == null);
    if (art.length) { const a = pick(art); this.artilleryShot(a, seg, amt, true); return; }
    const from = V(Math.cos(ang) * 32, 0, Math.sin(ang) * 32); from.y = groundY(from.x, from.z) + 2;
    this.throwRock(from, seg.top.clone().add(V(rnd(-3, 3), 0.5, 0)), amt, seg, { fire: true, penalty: true });
  }
  maxAmmo() { return 30 + 3 * Math.max(1, this.activePlayers()) + 15 * this.up.carts; }
  // daño por segundo que el castillo podría hacer si el grupo acierta el 70% a su ritmo actual
  expectedDps(base) {
    const now = this.time, recent = this.mood.attempts.filter(t => now - t < 60);
    let rate;
    if (now < 40 || recent.length < 4) rate = Math.max(1, this.activePlayers()) / ((this.cfg ? this.cfg.timeBase : 20) * 0.55 + 2.5);
    else rate = recent.length / Math.min(60, now);
    // las mejoras hacen más eficiente cada virote; la presión crece con el 60% de esa ventaja
    const u = this.up, eff = (1 + 0.2 * u.dmg) * (1 + u.multi) * (1 + 0.4 * u.pierce) * (1 + 0.3 * Math.min(1, u.fire));
    // los enemigos se ajustan al acierto real del grupo (así no hay avalanchas imposibles);
    // lo que decide el castillo son los golpes por cada respuesta incorrecta
    const w = this.mood.window, acc = w.length >= 6 ? Math.min(0.9, Math.max(0.3, w.filter(x => x.ok).length / w.length)) : 0.65;
    if (base) return rate * 0.65 * 3 * 10 + 1.5;
    return rate * acc * 3 * 10 * (1 + (eff - 1) * 0.6) + 10 * u.catapult + 1.5;
  }
  onVolley() { S.sfx('volley'); }
  // Regla de la academia: el examen se aprueba con 80% del equipo
  teamAcc() { const s = this.stats, n = s.correct + s.wrong; return n ? s.correct / n * 100 : 0; }
  passed() { const s = this.stats; return s.correct + s.wrong > 0 && Math.round(this.teamAcc()) >= (window.FEEDBACK ? window.FEEDBACK.PASS : 80); }
  bossLimit() { return Math.max(90, (this.cfg ? this.cfg.duration * 60 : 600) * 0.2); }
  activePlayers() { let n = 0; for (const p of this.players.values()) if (p.online) n++; return n; }

  finish(win) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    S.restartMusic('calm'); S.music('off');
    if (win) {
      S.sfx('victory'); this.princess.play('cheer'); this.say('You saved the castle! Thank you, heroes!', 'cheer', true);
      for (const pl of this.players.values()) pl.unit.play('cheer');
      for (let i = 0; i < 12; i++) setTimeout(() => this.fx.emit('star', V(rnd(-10, 10), 6, rnd(-10, 10)), 12), i * 200);
      for (const e of this.enemies) this.killEnemy(e, true);
      // la horda se desmorona
      this.horde.members.forEach((m, i) => setTimeout(() => this.horde.kill(m), Math.random() * 2500));
    } else {
      this.horde.roar(); S.sfx('warcry');
      S.sfx('defeat'); S.sfx('boom'); this.princess.play('sad'); this.say('The castle has fallen...', 'sad', true);
      // por debajo del 80% el castillo se derrumba tramo a tramo
      this.hud.banner('💔 The castle falls…', `Team accuracy ${Math.round(this.teamAcc())}% — 80% was needed`, 'boss');
      this.castle.segments.slice().sort(() => Math.random() - 0.5).forEach((s, i) => setTimeout(() => {
        s.hp = 0; setSegmentLook(s); S.sfx('boom'); this.shake = Math.max(this.shake, 0.9);
        this.fx.emit('dust', s.center.clone().setY(1), 20, { area: 6 }); this.fx.emit('fire', s.center.clone().setY(3), 14, { area: 5 }); this.fx.emit('dark', s.center.clone().setY(3), 10, { area: 6 });
      }, 250 + i * 320));
      this.hp = 0;
      for (const pl of this.players.values()) pl.unit.play('death', { once: true });
      for (const e of this.enemies) e.unit.play('cheer');
      this.shake = 1.5;
    }
    return win;
  }

  // ---------- Preguntas → aldeanos ----------
  onQuestion({ pid, qid, time, golden }) {
    const pl = this.players.get(pid);
    if (!pl || this.phase !== 'playing') return;
    const unit = new Unit('chars/peasant', { height: 1.9, tint: golden ? 0xffd34e : null, tintAmt: 0.35, emissive: golden ? 0x6a4a00 : null, shadow: false });
    const sz = 37 + rnd(-1.5, 1.5); const start = V(GATE_POS.x + Math.sin(sz * 0.08) * 3 + rnd(-1.2, 1.2), 0, sz); start.y = groundY(start.x, start.z);
    unit.root.position.copy(start);
    // carreta (Kenney) que el aldeano jala: sacos de suministros, o lingotes de oro si es dorada
    const cart = A.clone(golden ? 'kn/cart' : 'kn/cart-high'); cart.scale.setScalar(1.9); cart.position.set(0, 0, -1.75); cart.rotation.y = Math.PI; unit.root.add(cart);
    if (golden) { const load = A.clone('res/Gold_Bars_Stack_Small'); load.scale.setScalar(0.6); load.position.set(0, 0.55, -1.75); unit.root.add(load); }
    this.scene.add(unit.root);
    unit.label(`<span>${esc(pl.name)}</span>${golden ? ' ✨' : ''}`, 'vplate' + (golden ? ' gold' : ''));
    unit.play('walk', { speed: 0.9 });
    const v = { pid, qid, unit, golden, state: 'walk', t: 0, time, start, path: this.roadPath(start) };
    this.villagers.set(qid, v);
    if (golden) this.fx.emit('gold', start.clone().setY(1), 20);
  }
  roadPath(start) {
    const pts = [start.clone()];
    for (let z = start.z - 5; z > HALF + 3; z -= 5) { const x = GATE_POS.x + Math.sin(z * 0.08) * 3; pts.push(V(x, groundY(x, z), z)); }
    pts.push(V(GATE_POS.x, 0, HALF + 1.8)); pts.push(V(GATE_POS.x, 0, HALF - 2.5)); pts.push(V(GATE_POS.x - 1, 0, HALF - 7));
    return new THREE.CatmullRomCurve3(pts);
  }
  onResult({ pid, qid, correct, golden, silent, streak, points }) {
    const pl = this.players.get(pid);
    const v = this.villagers.get(qid);
    if (!silent) this.mood.window.push({ t: this.time, ok: correct });
    if (!silent) this.mood.attempts.push(this.time);
    if (pl) { pl.streak = streak ?? pl.streak; if (points != null) pl.points = points; }
    if (correct) {
      this.stats.correct++; if (pl) pl.correct++;
      if (golden) this.stats.golden++;
      if (v) { v.state = 'run'; v.unit.play('run'); }
      if (pl && pl.unit) { pl.unit.play('cheer', { once: true, force: true }); pl.busy = 1.6; this.fx.text(pl.unit.root.position.clone().add(V(0, 2.4, 0)), golden ? '✨+⭐' : '+⭐', 'good'); }
      if (golden) { this.say(pick(['A golden answer! Wonderful!', 'Gold! You are a true hero!']), 'cheer', true); S.sfx('golden'); }
      else if (pl && pl.streak && pl.streak % 5 === 0) this.say(`${pl.name}, ${pl.streak} in a row! Amazing!`, 'cheer', true);
    } else {
      if (!silent) this.stats.wrong++;
      if (v) { if (silent) { v.state = 'fade'; v.t = 0; } else { v.state = 'dead'; v.t = 0; v.unit.play('death', { once: true }); S.sfx('death', 0.6); this.fx.text(v.unit.root.position.clone().add(V(0, 2.2, 0)), '✖', 'bad'); } }
      if (!silent) {
        // castigo leve: el castillo pierde un poco
        this.penaltyStrike();
        if (pl && pl.unit) { pl.unit.play('hit', { once: true, force: true }); pl.busy = 0.9; }
      }
    }
    this.hud.feed(correct ? `${golden ? '✨' : '🧺'} <b>${esc(pl ? pl.name : '?')}</b> ${golden ? 'answered a golden question!' : 'is sending supplies!'}` : `💀 <b>${esc(pl ? pl.name : '?')}</b>'s villager didn't make it`, correct ? 'good' : 'bad');
  }
  deliver(v) {
    const mult = 1 + 0.4 * this.up.carts;
    const bolts = Math.round((v.golden ? 12 : 3) * mult);
    this.ammo = Math.min(this.maxAmmo(), this.ammo + bolts);
    const heal = this.penaltySize() * (v.golden ? 3 : (window.__H || 0.2)) * mult;
    this.hp = Math.min(this.maxHp, this.hp + heal);
    // reparar el tramo más dañado
    const segs = this.castle.segments.slice().sort((a, b) => a.hp - b.hp);
    const n = v.golden ? 3 : 1;
    for (let i = 0; i < n; i++) if (segs[i].hp < segs[i].maxHp) this.repairSegment(segs[i], (v.golden ? 30 : 12) * mult);
    S.sfx('coin');
    const p = V(GATE_POS.x, 3, HALF - 4);
    this.fx.text(p, `+${bolts} 🏹`, 'ammo'); this.fx.emit(v.golden ? 'gold' : 'heal', p, v.golden ? 24 : 8);
  }
  repairSegment(seg, amt) {
    const before = seg.hp;
    seg.hp = Math.min(seg.maxHp, seg.hp + amt);
    const ch = setSegmentLook(seg);
    if (ch === 'better' || (before < seg.maxHp * 0.9)) {
      // andamio temporal + martillazos
      if (!seg.scaffold) { seg.scaffold = A.clone('castle/scaffolding'); seg.scaffold.scale.set(4.5, 3.4, 2.2); seg.grp.add(seg.scaffold); seg.scaffold.position.set(0, 0, -2.4); }
      seg.scaffold.visible = true; seg.scaffoldT = 3.5;
      S.sfx('build', 0.7);
      this.fx.emit('heal', seg.center.clone().setY(3.5), 10, { area: 6 });
      this.fx.text(seg.center.clone().setY(6), '🔨 Repaired!', 'heal');
      for (const pl of this.players.values()) if (pl.station && pl.station.seg === seg && !pl.busy) { pl.unit.play('hammer', { force: true }); pl.busy = 2.5; }
    }
  }
  onUpgrade({ pid, id }) {
    const pl = this.players.get(pid);
    const U = window.UPGRADES.list[id]; if (!U) return;
    this.up[id] = (this.up[id] || 0) + 1;
    if (id === 'blessing') { for (const s of this.castle.segments) this.repairSegment(s, 100); this.hp = Math.min(this.maxHp, this.hp + this.penaltySize() * 10); this.princess.play('cheer', { force: true }); this.fx.emit('heart', this.princess.root.position.clone().add(V(0, 2, 0)), 16); }
    if (id === 'catapult' && !this.catapults) {
      this.catapults = [];
      for (const [x, z] of [[HALF, HALF], [-HALF, -HALF], [HALF, -HALF], [-HALF, HALF]]) { const c = A.clone('castle/tower_catapult'); c.scale.setScalar(2.2); c.position.set(x, 9.6, z); c.rotation.y = Math.atan2(x, z); this.scene.add(c); this.catapults.push(c); }
    }
    this.hud.upgrades(this.up);
    this.hud.banner(`${U.icon} ${U.name}`, `${pl ? esc(pl.name) : 'A hero'} chose: ${U.desc}`, 'upgrade');
    S.sfx('golden');
  }

  // ---------- Daño ----------
  damageCastle(amt, seg, isPenalty, src) {
    if (this.phase !== 'playing') return;
    const armor = Math.max(0.4, 1 - 0.2 * this.up.armor);
    amt *= isPenalty ? 1 : armor;
    // el muro absorbe la mayor parte del golpe; el castillo pierde una fracción.
    // Amortiguador: si llueven golpes a la vez, cada uno cuenta menos (el castillo cae poco a poco, con drama)
    let hit = isPenalty ? amt : seg ? amt * 0.35 : amt;
    if (!isPenalty) {
      this.dmgPressure = (this.dmgPressure || 0) + hit; hit /= 1 + this.dmgPressure / (12 + 2 * Math.max(1, this.activePlayers()));
      // los enemigos desgastan el castillo como mucho a un ritmo fijo: lo que más pesa son las respuestas
      hit = Math.min(hit, this.dmgBucket ?? 0); this.dmgBucket = (this.dmgBucket ?? 0) - hit;
    }
    this.hp = Math.max(this.maxHp * 0.03, this.hp - hit);
    if (window.__dmgLog) { const k = isPenalty ? 'penalty' : (src || 'other'); window.__dmgLog[k] = (window.__dmgLog[k] || 0) + hit; }
    if (seg) {
      seg.hp = Math.max(isPenalty ? Math.min(seg.hp, 20) : 0, seg.hp - amt * (isPenalty ? 0.3 : 1.1));
      const ch = setSegmentLook(seg);
      if (ch === 'worse') {
        S.sfx(seg.state === 3 ? 'boom' : 'crack'); this.shake = Math.max(this.shake, seg.state === 3 ? 0.9 : 0.35);
        this.fx.emit('dust', seg.center.clone().setY(1), 16, { area: 6 });
        if (seg.state === 3) { this.say('The wall is broken! Help!', 'sad', true); this.hud.feed('💥 A wall has been <b>breached</b>!', 'bad'); this.punch(seg.center.clone().setY(2)); this.horde.roar(); S.sfx('warcry'); }
      }
    } else if (isPenalty) {
      const s = pick(this.castle.segments.filter(x => x.hp > 0) || this.castle.segments);
      if (s) { s.hp = Math.max(1, s.hp - 4); setSegmentLook(s); this.fx.emit('dust', s.center.clone().setY(4), 5); }
    }
    if (!this.lastStand && this.hp < this.maxHp * 0.25) {
      this.lastStand = true; this.hud.banner('LAST STAND!', 'Every answer counts — the castle is about to fall!', 'boss');
      S.sfx('horn'); this.say('Heroes, this is our last stand! Answer, quickly!', 'sad', true); S.restartMusic('boss');
    }
    if (!this.halfWarned && this.hp < this.maxHp * 0.5) { this.halfWarned = true; this.say('The castle is half destroyed! Hurry!', 'sad', true); }
  }

  // ---------- Enemigos ----------
  spawnEnemy(type, at) {
    const D = ENEMIES[type];
    const unit = D.vehicle ? this.makeVehicle(D) : new Unit(pick(D.models), { height: D.h * 1.25, tint: D.tint, tintAmt: D.tintAmt ?? 0.45, shadow: false });
    // la mayoría llega por los lados que ve la cámara (frente, izquierda y derecha)
    const a = Math.random() < 0.8 ? rnd(-0.35, 3.5) : rnd(3.5, 5.93);
    let r = D.rise ? rnd(24, 32) : rnd(46, 52);
    let pos = at ? at.clone() : null;
    if (D.vehicle) r = rnd(46, 50);
    if (!pos && !D.flying && !D.rise && !D.vehicle) pos = this.horde.take(a); // sale de la horda
    if (!pos) pos = V(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (D.ram) { const gz = 46; pos = V(GATE_POS.x + rnd(-14, 14), 0, gz); }
    pos.y = D.flying ? rnd(8, 11) : groundY(pos.x, pos.z);
    unit.root.position.copy(pos);
    this.decorate(unit, D);
    this.scene.add(unit.root);
    const hpMul = 1 + Math.min(this.wave, 5) * 0.08;
    const e = { type, D, unit, hp: D.hp * hpMul, maxHp: D.hp * hpMul, state: 'move', t: 0, cd: rnd(0, D.cd || 1), seg: null, slow: 0, burn: 0, lat: rnd(-3.5, 3.5) };
    if (D.artillery) e.stopR = rnd(D.stopR[0], D.stopR[1]);
    if (D.vehicle) { unit.root.rotation.y = Math.atan2(-pos.x, -pos.z); this.hud.feed(`⚙️ ${D.name.replace(/s$/, '')} approaching!`, 'bad'); }
    if (D.rise && !at) { e.state = 'rise'; unit.play('rise', { once: true }); e.t = 0; this.fx.emit('dust', pos, 10); }
    else unit.play('walk');
    this.enemies.push(e);
    return e;
  }
  // Máquinas de asedio (Kenney): ariete, catapulta, trebuchet y torre. El modelo mira a +X; lo giramos a +Z.
  makeVehicle(D) {
    const u = new Unit(D.vehicle, { height: D.h, optimize: false, weapons: false, shadow: true });
    u.static = false; u.model.rotation.y = -Math.PI / 2;
    u.wheels = []; u.model.traverse(o => { if (o.name === 'wheel') u.wheels.push(o); if (D.arm && o.name === D.arm && !u.arm) { u.arm = o; u.armRest = o.rotation.z; } });
    u.crew = [];
    for (const [x, z] of D.crew.at) { const c = new Unit(D.crew.model, { height: D.crew.h, shadow: false }); c.root.position.set(x, 0, z); c.play('walk'); u.root.add(c.root); u.crew.push(c); }
    return u;
  }
  wreckVehicle(e) {
    const u = e.unit; if (u.wrecked) return; u.wrecked = true;
    const w = A.clone(e.D.wreck); w.scale.copy(u.model.scale); w.rotation.y = -Math.PI / 2; w.position.y = u.baseY; u.root.add(w); u.model.visible = false;
    const p = u.root.position.clone().setY(u.root.position.y + 1);
    this.fx.emit('smoke', p, 24, { area: 3 }); this.fx.emit('fire', p, 18, { area: 2.5 }); this.fx.emit('dust', p, 16, { area: 3 });
    S.sfx('boom', 0.8); S.sfx('crack', 0.6); this.shake = Math.max(this.shake, 0.35);
    this.fx.text(p.clone().setY(p.y + e.D.h), '💥 Destroyed!', 'good');
  }
  towerUnload(e, seg) {
    // la torre de asedio baja su pasarela: los orcos saltan al adarve y entran al patio
    S.sfx('warcry'); this.shake = Math.max(this.shake, 0.4);
    this.damageCastle(20, seg, false, 'tower');
    this.fx.text(seg.top.clone().add(V(0, 2.5, 0)), 'Orcs storm the wall!', 'bad');
    this.hud.feed('🏰 A <b>siege tower</b> reached the wall!', 'bad');
    for (let i = 0; i < 3; i++) setTimeout(() => {
      if (this.phase !== 'playing') return;
      const p = seg.inner.clone().addScaledVector(seg.along, (i - 1) * 1.6);
      const o = this.spawnEnemy('orc', p); o.inside = true; o.seg = seg; this.fx.emit('dust', p, 8);
    }, 500 + i * 450);
  }
  updateArtillery(e, dt, spd) {
    const u = e.unit, pos = u.root.position, D = e.D;
    if (e.state === 'move') {
      const r = Math.hypot(pos.x, pos.z);
      if (r > e.stopR) {
        const to = V(-pos.x, 0, -pos.z).normalize();
        pos.addScaledVector(to, spd * dt); pos.y = groundY(pos.x, pos.z); e.vel = to.multiplyScalar(spd);
        u.faceTo(pos.x + e.vel.x, pos.z + e.vel.z, dt, 3);
      } else { e.state = 'siege'; e.vel = null; e.cd = rnd(1, 3); u.crew.forEach(c => c.play('idle')); this.hud.feed(`🪨 A <b>${D.name.replace(/s$/, '').toLowerCase()}</b> is bombarding the castle!`, 'bad'); }
      return;
    }
    if (!e.seg || e.seg.hp <= 0) { const segs = this.castle.segments.filter(s => s.hp > 0 && s.side !== 2); e.seg = segs.sort((a, b) => a.outer.distanceToSquared(pos) - b.outer.distanceToSquared(pos))[0] || this.castle.segments[0]; }
    u.faceTo(e.seg.center.x, e.seg.center.z, dt, 2);
    e.cd -= dt;
    if (e.cd <= 0 && e.fireT == null) { e.cd = D.cd * rnd(0.85, 1.15); this.artilleryShot(e, e.seg, D.dmg, false); }
  }
  artilleryShot(e, seg, dmg, penalty) {
    const u = e.unit; e.fireT = 0; e.shotDone = false; e.shot = { seg, dmg, penalty };
    u.crew.forEach(c => c.play('attack', { once: true, force: true }));
  }
  animateArtillery(e, dt) {
    const u = e.unit; if (e.fireT == null) return;
    e.fireT += dt; const t = e.fireT;
    // el brazo se dispara rápido y vuelve despacio
    const swing = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.6) / 1.4);
    if (u.arm) u.arm.rotation.z = u.armRest - swing * (e.D.big ? 1.9 : 1.3);
    if (!e.shotDone && t > 0.25) {
      e.shotDone = true; const { seg, dmg, penalty } = e.shot;
      const from = u.root.position.clone().add(V(0, e.D.h * 0.9, 0));
      const to = seg.top.clone().add(V(rnd(-3, 3), 0.5, 0));
      this.throwRock(from, to, dmg, seg, { fire: true, big: e.D.big, penalty });
      S.sfx('whoosh', 0.9); this.fx.emit('smoke', from, 4);
    }
    if (t > 2.2) { e.fireT = null; u.crew.forEach(c => c.play('idle')); }
  }
  decorate(unit, D) {
    if (D.wings) {
      // alas de murciélago: separamos el modelo en ala izquierda y derecha para que aleteen
      unit.wings = [];
      for (const s of [-1, 1]) { const w = batWing(s); w.scale.setScalar(D.h * 0.24); w.position.set(0, D.h * 1.25 * 0.62, -0.25); w.rotation.x = -0.25; unit.root.add(w); unit.wings.push({ w, s }); }
    }
    if (D.broom) {
      const broom = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), new THREE.MeshStandardMaterial({ color: 0x6b4423 })); stick.rotation.x = Math.PI / 2; broom.add(stick);
      const bristle = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0xc9a14a })); bristle.rotation.x = -Math.PI / 2; bristle.position.z = -1.5; broom.add(bristle);
      broom.position.y = 0.75; unit.root.add(broom);
      unit.model.position.y = unit.baseY + 0.3;
    }
  }
  spawnBoss(B, hp) {
    const unit = new Unit(B.model, { height: B.h, tint: B.tint, tintAmt: B.tintAmt ?? 0.4, emissive: B.emissive });
    // los jefes llegan por el frente o por los lados, para que se vea el daño que hacen
    const side = Math.random();
    let pos = side < 0.5 ? V(rnd(-18, 12), 0, 55) : side < 0.85 ? V(-55, 0, rnd(-6, 14)) : V(55, 0, rnd(0, 16));
    if (B.flying) pos = V(-50, 18, 50); else pos.y = groundY(pos.x, pos.z);
    unit.root.position.copy(pos); this.scene.add(unit.root);
    unit.play('walk', { speed: 0.6 });
    if (B.attack === 'lich') {
      // aura y corona del Rey Lich
      const aura = new THREE.PointLight(0x9a4aff, 40, 14); aura.position.y = B.h * 0.6; unit.root.add(aura);
      const gold = new THREE.MeshStandardMaterial({ color: 0xc9c9ff, emissive: 0x7a3aff, emissiveIntensity: 1, metalness: 0.6 });
      const crown = new THREE.Group();
      for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 4), gold); const a = i / 7 * Math.PI * 2; s.position.set(Math.cos(a) * 0.65, B.h * 1.02, Math.sin(a) * 0.65); crown.add(s); }
      unit.root.add(crown);
    }
    const D = { name: B.name, h: B.h, flying: B.flying, hop: B.hop, speed: B.flying ? 3 : 1.1, dps: 22 };
    const e = { type: 'boss', boss: B, D, unit, hp, maxHp: hp, state: 'move', t: 0, cd: 3, seg: null, slow: 0, burn: 0, lat: 0, isBoss: true, special: 6 };
    this.enemies.push(e);
    return e;
  }
  pickSegment(pos, e) {
    // tramo más cercano (si está roto, el enemigo entra al patio)
    let best = null, bd = 1e9;
    for (const s of this.castle.segments) { const d = s.outer.distanceToSquared(pos) * (s.hp <= 0 ? 0.7 : 1); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  hurt(e, dmg, { fire, frost, quiet } = {}) {
    if (e.dead) return;
    e.hp -= dmg;
    // escudo: el jefe no cae mientras el equipo esté por debajo del 80%
    if (e.isBoss && !this.passed() && e.hp < e.maxHp * 0.12) { e.hp = e.maxHp * 0.12; e.shielded = true; if (!this.shieldWarn || this.time - this.shieldWarn > 25) { this.shieldWarn = this.time; this.hud.banner('🛡️ The boss is shielded!', 'Reach 80% team accuracy to break the shield!', 'boss'); S.sfx('roar'); } }
    else if (e.isBoss) e.shielded = false;
    if (fire) e.burn = 3; if (frost) e.slow = 2.5;
    if (!quiet && !e.isBoss && !e.D.ram && e.state !== 'climb' && Math.random() < 0.3 && e.unit.action('hit')) { e.unit.play('hit', { once: true, force: true }); e.hitT = 0.4; }
    const hp = e.unit.root.position.clone().add(V(0, e.D.h * 0.6, 0));
    if (fire) { this.fx.emit('fire', hp, 10, { scale: 1.3 }); this.fx.emit('smoke', hp, 2); }
    else if (frost) { this.fx.emit('ice', hp, 12, { scale: 1.3, spread: 3 }); }
    else this.fx.emit('spark', hp, quiet ? 2 : 4);
    if (!quiet) S.sfx('hit', 0.6);
    if (e.hp <= 0) this.killEnemy(e);
  }
  killEnemy(e, silent) {
    if (e.dead) return; e.dead = true; e.state = 'dead'; e.t = 0;
    e.unit.play('death', { once: true });
    if (e.D.vehicle && !silent) this.wreckVehicle(e);
    if (e.unit.crew) for (const c of e.unit.crew) c.play('death', { once: true });
    if (e.unit.bar) e.unit.bar.visible = false;
    if (e.ladder) { e.ladder.falling = true; }
    if (!silent) { this.stats.kills++; S.sfx('death', 0.5); this.fx.emit('smoke', e.unit.root.position.clone().setY(0.5), e.isBoss ? 30 : 4); }
    if (e.isBoss && !silent) {
      this.bossDead = this.enemies.every(x => !x.isBoss || x.dead);
      S.sfx('roar'); this.shake = 1.2;
      // cámara lenta al caer el jefe
      if (this.bossDead) { this.slowmo = 2.2; this.focus = { t: 3, target: e.unit.root, zoom: 0.8 }; }
      if (this.bossDead) setTimeout(() => this.onWin && this.onWin(), 2600);
    }
  }

  // ---------- Disparos ----------
  fireBolt(seg, target, weak) {
    const b = seg.ballista, from = b.obj.position.clone().add(V(0, 0.9, 0));
    const shots = weak ? 1 : 1 + this.up.multi;
    for (let i = 0; i < shots; i++) {
      const tp = target.unit.root.position.clone().add(V(0, target.D.h * 0.55, 0));
      // predicción simple de movimiento
      if (target.vel) tp.addScaledVector(target.vel, from.distanceTo(tp) / 48);
      if (i) tp.add(V(rnd(-1.5, 1.5), 0, rnd(-1.5, 1.5)));
      const dir = tp.sub(from).normalize();
      const mesh = makeBoltMesh(); mesh.position.copy(from); mesh.lookAt(from.clone().add(dir));
      // virote elemental: si hay fuego y hielo, se alternan
      const elem = weak ? null : this.up.fire && this.up.frost ? (Math.random() < 0.5 ? 'fire' : 'frost') : this.up.fire ? 'fire' : this.up.frost ? 'frost' : null;
      if (elem) {
        mesh.children[1].material = elemMat(elem);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: elem === 'fire' ? 0xff8a2a : 0x7fdcff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.setScalar(2.4); glow.position.z = 0.9; mesh.add(glow);
      }
      this.scene.add(mesh);
      this.projectiles.push({ kind: 'bolt', elem, mesh, vel: dir.multiplyScalar(48), life: 1.6, dmg: 10 * (1 + 0.2 * this.up.dmg), pierce: this.up.pierce, hit: new Set() });
    }
    b.recoil = 1; S.sfx('bolt', 0.7);
    for (const pl of this.players.values()) if (pl.station && pl.station.seg === seg && !pl.busy) { pl.unit.play('shoot', { once: true, force: true }); pl.busy = 0.7; }
  }
  throwRock(from, to, dmg, seg, { big = false, magic = false, fire = false, penalty = false } = {}) {
    const mesh = magic
      ? new THREE.Mesh(new THREE.SphereGeometry(big ? 0.9 : 0.45, 10, 8), new THREE.MeshBasicMaterial({ color: fire ? 0xff7a1a : 0xb06aff }))
      : A.clone('res/Stone_Chunks_Large');
    if (!magic) mesh.scale.setScalar(big ? 3 : 1.6);
    mesh.position.copy(from); this.scene.add(mesh);
    const T = magic ? from.distanceTo(to) / 18 : 1.5;
    const vel = to.clone().sub(from).divideScalar(T); if (!magic) vel.y += 0.5 * 18 * T;
    this.projectiles.push({ kind: magic ? 'magic' : 'rock', mesh, vel, life: T, grav: magic ? 0 : 18, dmg, seg, to, big, fire, penalty });
  }

  // ---------- Princesa ----------
  say(text, kind = 'cheer', force) {
    const m = this.mood;
    if (!force) { if (kind === 'cheer' && this.time - m.lastCheer < 12) return; if (kind === 'sad' && this.time - m.lastSad < 12) return; }
    if (kind === 'cheer') m.lastCheer = this.time; else m.lastSad = this.time;
    this.bubble.textContent = text; this.bubble.className = 'bubble ' + kind; m.bubbleT = 4.5;
    S.say(text, { who: 'princess' });
    const p = this.princess;
    if (kind === 'cheer') { p.play('cheer', { force: true }); p.busy = 3; S.sfx('cheer', 0.6); this.fx.emit('heart', p.root.position.clone().add(V(0, 2.2, 0)), 10); }
    else { p.play('sad', { force: true }); p.busy = 4; S.sfx('sob', 0.8); m.tears = 4; }
  }
  updateMood(dt) {
    const m = this.mood;
    m.window = m.window.filter(x => this.time - x.t < 25);
    if (m.bubbleT > 0 && (m.bubbleT -= dt) <= 0) this.bubble.className = 'bubble hidden';
    if (m.tears > 0) { m.tears -= dt; if (Math.random() < dt * 8) this.fx.emit('tear', this.princess.root.position.clone().add(V(0.15, 1.8, 0.25)), 1); }
    const p = this.princess;
    if (p.busy > 0 && (p.busy -= dt) <= 0) p.play('idle');
    if (this.phase !== 'playing' || m.window.length < 5) return;
    const acc = m.window.filter(x => x.ok).length / m.window.length;
    if (acc >= 0.75) this.say(pick(CHEERS), 'cheer');
    else if (acc < 0.4) this.say(pick(SADS), 'sad');
  }

  // ---------- Bucle principal ----------
  update(dt) {
    this.time += dt;
    if (this.dmgPressure) this.dmgPressure *= Math.exp(-dt / 3);
    this.dmgBucket = Math.min(18, (this.dmgBucket ?? 0) + dt * (1.3 + 0.12 * Math.max(1, this.activePlayers())));
    for (const pl of this.players.values()) this.updatePlayer(pl, dt);
    this.princess.update(dt); swayBraid(this.braid, dt);
    this.updateMood(dt);
    this.updateGate(dt);
    this.updateVillagers(dt);
    this.updateProjectiles(dt);
    this.updateEnemies(dt);
    this.updateBallistas(dt);
    this.updateSegments(dt);
    this.horde.update(dt);
    this.archers.update(dt, this);
    if (this.punchCd > 0) this.punchCd -= dt;
    if (this.phase === 'playing') this.updateWaves(dt);
    this.hud.update(this);
  }
  updatePlayer(pl, dt) {
    const u = pl.unit; u.update(dt);
    // los defensores del patio y del portón pelean contra los enemigos que se cuelan
    if (this.phase === 'playing' && pl.station && pl.station.kind !== 'ballista') {
      let foe = null, bd = 7;
      for (const e of this.enemies) { if (e.dead || !e.inside) continue; const d = e.unit.root.position.distanceTo(u.root.position); if (d < bd) { bd = d; foe = e; } }
      if (foe) {
        u.faceTo(foe.unit.root.position.x, foe.unit.root.position.z, dt);
        if (!pl.busy) { u.play('attack', { once: true, force: true }); pl.busy = 0.9; this.fx.emit('spark', foe.unit.root.position.clone().add(V(0, 1.2, 0)), 3); }
        return;
      }
    }
    if (pl.busy > 0) { pl.busy -= dt; if (pl.busy <= 0) u.play(pl.station ? pl.station.anim : 'idle'); }
    if (this.phase === 'lobby' && !pl.busy && Math.random() < dt * 0.04) { u.play(pick(['cheer', 'idle2', 'interact']), { once: true }); pl.busy = 2; }
  }
  updateGate(dt) {
    const g = this.castle.gate; if (!g) return;
    let want = 0;
    for (const v of this.villagers.values()) if ((v.state === 'run' || v.state === 'enter') && v.unit.root.position.distanceTo(GATE_POS) < 12) want = 1;
    if (this.phase === 'lobby') want = 1;
    if (want && g.open < 0.05) { S.sfx('gate', 0.6); for (const pl of this.players.values()) if (pl.station && pl.station.kind === 'gate' && !pl.busy) { pl.unit.play('interact', { once: true, force: true }); pl.busy = 1.2; } }
    g.open += (want - g.open) * Math.min(1, dt * 3);
    for (const d of g.doors) d.o.rotation.y = d.dir * g.open * 1.5;
  }
  updateVillagers(dt) {
    for (const [qid, v] of this.villagers) {
      const u = v.unit; u.update(dt); v.t += dt;
      if (v.state === 'walk' || v.state === 'run') {
        // la caminata dura lo mismo que el tiempo de la pregunta (llega al portón al final)
        const len = v.path.getLength();
        const walkK = Math.min(0.62, v.t / v.time * 0.62);
        if (v.state === 'walk') v.k = walkK; else v.k = Math.min(1, (v.k || 0) + dt * 9 / len);
        const p = v.path.getPointAt(Math.min(1, v.k)); const ahead = v.path.getPointAt(Math.min(1, v.k + 0.01));
        u.root.position.copy(p); u.faceTo(ahead.x, ahead.z, dt, 8);
        if (v.k >= 1) { v.state = 'enter'; v.t = 0; this.deliver(v); }
      } else if (v.state === 'enter') {
        u.root.position.z -= dt * 3; u.root.scale.setScalar(Math.max(0.01, 1 - v.t / 0.8));
        if (v.t > 0.8) { u.dispose(); this.villagers.delete(qid); }
      } else if (v.state === 'dead' || v.state === 'fade') {
        if (v.t > 2.2) { u.root.position.y -= dt * 1.2; }
        if (v.t > 3.5) { u.dispose(); this.villagers.delete(qid); }
      }
    }
  }
  updateWaves(dt) {
    if (this.breakT > 0) { this.breakT -= dt; return; }
    if (this.wave < WAVES.length) {
      this.waveT += dt;
      if (this.waveT >= this.waveLen) { this.nextWave(); return; }
    } else if (!this.bossDead) {
      // límite de tiempo del jefe: al acabarse, el examen termina y decide el 80%
      this.waveT += dt;
      if (this.waveT >= this.bossLimit()) { this.bossDead = true; this.onTimeUp && this.onTimeUp(); return; }
    }
    // presupuesto de aparición: escala con jugadores conectados y con la oleada
    const n = Math.max(1, this.activePlayers());
    const w = Math.min(this.wave, WAVES.length - 1);
    const bossPhase = this.wave >= WAVES.length;
    // La presión se calcula con el ritmo REAL de respuestas del grupo (no con sus aciertos):
    // un grupo que acierta más del 70% gana con holgura; uno que acierta menos, sufre.
    const budget = this.expectedDps() * (0.7 + 0.22 * w) * (bossPhase ? 0.6 : 1) * 1.7 * (window.__D || 1)
      * (n < 8 ? 0.5 + 0.05 * n : n > 16 ? 1 + (n - 16) * 0.012 : 1) // ajuste para grupos pequeños / grandes
      * ({ easy: 0.7, normal: 1, hard: 1.3 }[this.cfg.difficulty] || 1)
      * (this.hp / this.maxHp < 0.5 ? 0.55 + 0.9 * this.hp / this.maxHp : 1); // si el castillo está muy mal, los enemigos aflojan un poco
    this.spawnAcc += budget * dt;
    const mix = WAVES[w].mix;
    const alive = this.enemies.filter(e => !e.dead).length;
    let guard = 0;
    const cap = Math.min(window.__lite ? 55 : 75, 6 + n * 1.1 + w * 1.6);
    if (alive >= cap) this.spawnAcc = Math.min(this.spawnAcc, 0);
    while (this.spawnAcc > 0 && alive + guard < cap && guard < 6) {
      let type = weighted(mix);
      // pocas máquinas de asedio a la vez (si ya hay demasiadas, sale infantería)
      if (ENEMIES[type].max && this.enemies.filter(x => !x.dead && x.type === type).length >= ENEMIES[type].max) type = Object.keys(mix).find(k => !ENEMIES[k].vehicle) || 'zombie';
      this.spawnAcc -= ENEMIES[type].cost * (1 + Math.min(this.wave, 5) * 0.08); guard++;
      this.spawnEnemy(type);
    }
    if (this.escortPending && this.boss && this.boss.hp < this.boss.maxHp * 0.5) {
      const { def, hp } = this.escortPending; this.escortPending = null;
      this.spawnBoss(def, hp); this.hud.banner('BOSS', def.name + ' joins the battle!', 'boss'); S.sfx('roar');
    }
    // el castillo refleja el examen: por debajo del 80% el castillo no puede estar sano
    const ans = this.stats.correct + this.stats.wrong;
    if (ans >= 10) {
      const acc = this.teamAcc(), cap = this.maxHp * Math.max(0.03, 1 - Math.max(0, 80 - acc) * 0.045);
      if (this.hp > cap) this.hp -= Math.min(this.hp - cap, (this.hp - cap) * dt * 0.6 + dt * 4);
    }
    if (this.up.mason) { for (const s of this.castle.segments) if (s.hp > 0 && s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + dt * 0.6 * this.up.mason); }
    if (this.up.catapult && this.catapults) {
      this.catT -= dt;
      if (this.catT <= 0) {
        this.catT = 3.5 / this.up.catapult;
        const t = this.enemies.filter(e => !e.dead && !e.D.flying).sort((a, b) => b.unit.root.position.length() - a.unit.root.position.length())[0];
        if (t) { const c = pick(this.catapults); this.throwRock(c.position.clone().add(V(0, 2, 0)), t.unit.root.position.clone(), 30, null, { friendly: true }); this.projectiles[this.projectiles.length - 1].friendly = true; }
      }
    }
  }
  updateBallistas(dt) {
    const range = 26 * (1 + 0.2 * this.up.range);
    const rate = 1.45 / (1 + 0.2 * this.up.rate);
    for (const seg of this.castle.segments) {
      const b = seg.ballista; if (!b.obj.visible) continue;
      b.cd -= dt; b.recoil = Math.max(0, b.recoil - dt * 3);
      const { yaw, pitch, bolt } = b.obj.userData;
      bolt.visible = b.recoil < 0.3 && this.ammo > 0;
      pitch.position.z = -b.recoil * 0.25;
      // elegir objetivo: escaladores > jefe > el más cercano
      if (!b.target || b.target.dead || b.target.unit.root.position.distanceTo(b.obj.position) > range) {
        b.target = null; let best = 1e9;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'rise') continue;
          const ep = e.unit.root.position, d = ep.distanceTo(b.obj.position);
          if (d > range) continue;
          const to = ep.clone().sub(seg.center).setY(0).normalize();
          if (to.dot(seg.n) < -0.2 && !e.D.flying && !(e.inside)) continue; // no dispara hacia dentro (salvo voladores)
          const score = d - (e.state === 'climb' ? 30 : 0) - (e.isBoss ? 12 : 0);
          if (score < best) { best = score; b.target = e; }
        }
      }
      if (b.target) {
        const tp = b.target.unit.root.position;
        const want = Math.atan2(tp.x - b.obj.position.x, tp.z - b.obj.position.z) - b.obj.rotation.y;
        let d = want - yaw.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        yaw.rotation.y += d * Math.min(1, dt * 6);
        const dist = Math.hypot(tp.x - b.obj.position.x, tp.z - b.obj.position.z);
        pitch.rotation.x = -Math.atan2(tp.y + b.target.D.h * 0.5 - b.obj.position.y - 1, dist) * 0.8;
        if (b.cd <= 0 && Math.abs(d) < 0.25 && this.phase === 'playing') {
          // sin virotes la tripulación dispara despacio con lo que queda
          if (this.ammo > 0) { b.cd = rate * rnd(0.9, 1.1); this.ammo--; this.fireBolt(seg, b.target); }
          // sin virotes no hay disparo: el daño a los enemigos solo sale de las respuestas correctas
        }
      }
    }
  }
  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.life -= dt;
      if (p.grav) p.vel.y -= p.grav * dt;
      const prevPos = p.mesh.position.clone();
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.kind === 'bolt') {
        p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
        // colisión "barrida": revisamos todo el tramo recorrido en este frame (no se cuela aunque haya pocos FPS)
        const seg3 = new THREE.Line3(prevPos, p.mesh.position.clone()), cp = new THREE.Vector3();
        for (const e of this.enemies) {
          if (e.dead || p.hit.has(e) || e.state === 'rise') continue;
          const c = e.unit.root.position, r = Math.max(0.9, e.unit.height * 0.35);
          const center = c.clone(); center.y += e.unit.height * 0.5;
          seg3.closestPointToPoint(center, true, cp);
          const dy = cp.y - center.y;
          if (Math.hypot(cp.x - center.x, cp.z - center.z) < r && Math.abs(dy) < e.unit.height * 0.6 + 0.4) {
            p.hit.add(e); this.hurt(e, p.dmg, { fire: p.elem === 'fire', frost: p.elem === 'frost' });
            if (p.pierce-- <= 0) { p.life = 0; break; }
          }
        }
        // estela del virote elemental
        if (p.elem === 'fire') { this.fx.emit('fire', p.mesh.position, 2, { scale: 0.9, vy: 0.3 }); if (Math.random() < 0.4) this.fx.emit('smoke', p.mesh.position, 1, { scale: 0.6 }); }
        else if (p.elem === 'frost') { this.fx.emit('ice', p.mesh.position, 2, { scale: 0.9, vy: 0.2 }); }
        const gy = groundY(p.mesh.position.x, p.mesh.position.z);
        if (p.mesh.position.y < gy) {
          p.life = 0; this.fx.emit(p.elem === 'fire' ? 'fire' : p.elem === 'frost' ? 'ice' : 'dust', p.mesh.position, p.elem ? 8 : 3);
          // si cae entre la horda, se lleva a alguno por delante
          for (const m of this.horde.members) if (m.state === 'hold' && Math.hypot(m.x - p.mesh.position.x, m.z - p.mesh.position.z) < 1.6) this.horde.kill(m);
        }
      } else if (p.kind === 'magic' && Math.random() < 0.6) this.fx.emit(p.fire ? 'fire' : 'magic', p.mesh.position, 1);
      else if (p.kind === 'rock' && p.fire) { this.fx.emit('fire', p.mesh.position, 2, { scale: 1.3 }); if (Math.random() < 0.5) this.fx.emit('smoke', p.mesh.position, 1); }
      if (p.life <= 0) {
        if (p.kind === 'rock' || p.kind === 'magic') {
          if (p.friendly) {
            this.fx.emit('dust', p.mesh.position, 14); S.sfx('boom', 0.4);
            for (const e of this.enemies) if (!e.dead && e.unit.root.position.distanceTo(p.mesh.position) < 4) this.hurt(e, p.dmg);
          } else {
            this.fx.emit(p.kind === 'magic' ? (p.fire ? 'fire' : 'magic') : 'dust', p.mesh.position, p.big ? 20 : 10, { area: p.big ? 3 : 1 });
            S.sfx(p.kind === 'magic' ? (p.fire ? 'fire' : 'spell') : 'crack', 0.6); this.shake = Math.max(this.shake, p.big ? 0.6 : 0.2);
            if (p.penalty) {
              // golpe por respuesta incorrecta: siempre cuenta completo
              this.damageCastle(p.dmg, p.seg, true, 'penalty');
              this.fx.text(p.mesh.position.clone().add(V(0, 2, 0)), `-${(p.dmg / this.maxHp * 100).toFixed(1)}%`, 'bad');
              this.fx.emit('fire', p.mesh.position, 14, { area: 2 });
              if (p.seg) p.seg.burning = Math.max(p.seg.burning || 0, 2);
            } else {
              this.damageCastle(p.dmg, p.seg && p.seg.hp > 0 ? p.seg : null, false, 'proj:' + p.kind);
              if (p.fire && p.seg) p.seg.burning = Math.max(p.seg.burning || 0, 3);
            }
          }
        }
        p.mesh.removeFromParent(); this.projectiles.splice(i, 1);
      }
    }
  }
  updateSegments(dt) {
    for (const s of this.castle.segments) {
      if (s.scaffoldT > 0 && (s.scaffoldT -= dt) <= 0) s.scaffold.visible = false;
      s.emitT -= dt;
      if (s.emitT <= 0) {
        s.emitT = 0.25;
        const top = s.center.clone().setY(WALL_H * 0.8);
        if (s.state >= 1) this.fx.emit(s.state >= 2 ? 'dark' : 'smoke', top, 1, { area: 5 });
        if (s.state >= 2 || s.burning > 0) this.fx.emit('fire', top.clone().setY(s.state === 3 ? 1 : WALL_H * 0.9), 2, { area: 5 });
      }
      if (s.burning > 0) { s.burning -= dt; if (this.phase === 'playing') this.damageCastle(dt * 3, s, false, 'burn'); }
    }
  }
  updateEnemies(dt) {
    const alive = this.enemies;
    for (let i = alive.length - 1; i >= 0; i--) {
      const e = alive[i], u = e.unit, pos = u.root.position;
      u.update(dt * (e.slow > 0 ? 0.6 : 1)); e.t += dt;
      if (u.crew) for (const c of u.crew) c.update(dt);
      if (e.dead) {
        if (e.D.vehicle) { if (e.t > 9) pos.y -= dt * 0.8; if (e.t > 12) { u.dispose(); alive.splice(i, 1); } continue; }
        if (e.t > 2.2) { pos.y -= dt * (e.D.flying ? 6 : 1.5); }
        const gy = groundY(pos.x, pos.z);
        if (e.D.flying && pos.y > gy) pos.y = Math.max(gy, pos.y - dt * 8);
        if (e.t > 3.5) { u.dispose(); alive.splice(i, 1); }
        continue;
      }
      if (e.slow > 0) { e.slow -= dt; if (Math.random() < dt * 12) this.fx.emit('ice', pos.clone().add(V(0, e.D.h * 0.6, 0)), 1, { area: 2, vy: 0.3 }); }
      if (e.burn > 0) { e.burn -= dt; e.hp -= dt * 4; if (Math.random() < dt * 14) this.fx.emit('fire', pos.clone().add(V(0, e.D.h * 0.5, 0)), 1, { area: 1.5 }); if (e.hp <= 0) { this.killEnemy(e); continue; } }
      if (e.hitT > 0) { e.hitT -= dt; continue; }
      u.hpBar(e.hp / e.maxHp, e.isBoss ? 0xa040ff : 0xe74c3c, e.isBoss ? 3 : 1.2);
      if (this.phase === 'ended') continue;
      const spd = e.D.speed * (e.slow > 0 ? 0.6 : 1);
      if (e.isBoss) { this.updateBoss(e, dt, spd); continue; }
      if (e.state === 'rise') { if (e.t > Math.min(2.4, u.duration('rise'))) { e.state = 'move'; u.play('walk'); } continue; }
      if (e.D.flying) { this.updateFlyer(e, dt, spd); continue; }
      if (u.wheels && e.vel) for (const w of u.wheels) w.rotation.z -= dt * spd * 1.8;
      if (e.D.artillery) { this.animateArtillery(e, dt); this.updateArtillery(e, dt, spd); continue; }
      if (e.D.ram) { this.updateRam(e, dt, spd); continue; }
      if (!e.seg || e.seg.hp <= 0 && !e.inside || Math.random() < dt * 0.2) e.seg = this.pickSegment(pos, e);
      const seg = e.seg;
      if (e.state === 'move') {
        let target;
        if (seg.hp <= 0 || e.inside) { target = KEEP.clone().add(V(e.lat, 0, 6)); e.inside = e.inside || pos.distanceTo(seg.center) < 2.5; if (!e.inside) target = seg.center.clone(); }
        else target = seg.outer.clone().addScaledVector(seg.along, e.lat);
        const stopDist = e.D.ranged ? e.D.range : (e.D.reach || 0.6);
        const to = target.clone().sub(pos).setY(0); const dist = to.length();
        if (dist > stopDist) {
          to.normalize();
          // separación entre enemigos
          for (const o of alive) { if (o === e || o.dead || o.D.flying) continue; const dx = pos.x - o.unit.root.position.x, dz = pos.z - o.unit.root.position.z, d2 = dx * dx + dz * dz; if (d2 < 1.2 && d2 > 0.0001) { to.x += dx / d2 * 0.25; to.z += dz / d2 * 0.25; } }
          to.setY(0).normalize();
          const hop = e.D.hop ? Math.max(0, Math.sin(e.t * 6)) : 1;
          pos.addScaledVector(to, spd * dt * (e.D.hop ? hop * 1.8 : 1));
          pos.y = groundY(pos.x, pos.z) + (e.D.hop ? Math.abs(Math.sin(e.t * 6)) * 0.8 : 0);
          e.vel = to.clone().multiplyScalar(spd);
          u.faceTo(pos.x + to.x, pos.z + to.z, dt);
          if (u.cur !== 'walk') u.play('walk');
          // escaleras: los orcos suben cuando llegan al muro
        } else {
          e.vel = null;
          if (e.D.ladder && seg.hp > 0 && !e.inside) { this.startClimb(e, seg); continue; }
          if (e.D.tower && !e.unloaded && seg.hp > 0) { e.unloaded = true; this.towerUnload(e, seg); }
          if (u.crew) u.crew.forEach(c => c.play('attack'));
          e.state = e.D.ranged ? 'ranged' : 'attack'; u.play('attack');
          u.faceTo(seg.center.x, seg.center.z);
        }
      } else if (e.state === 'attack') {
        if (e.inside || seg.hp <= 0) {
          if (!e.inside && pos.distanceTo(KEEP) > 8) { e.state = 'move'; continue; }
          this.damageCastle(e.D.dps * dt * 0.6, null, false, 'inside:' + e.type);
        } else {
          // si el portón está abierto, se cuela adentro
          const g = this.castle.gate;
          if (seg.isGate && g.open > 0.6 && pos.distanceTo(GATE_POS) < 4) { this.damageCastle(10, null, false, 'sneak'); this.fx.text(pos.clone().setY(3), 'Sneaked in!', 'bad'); this.hud.feed('🚪 An enemy <b>sneaked in</b> through the open gate!', 'bad'); this.killEnemy(e, true); continue; }
          this.damageCastle(e.D.dps * dt, seg, false, 'melee:' + e.type);
          if (Math.random() < dt * 2) this.fx.emit('dust', pos.clone().addScaledVector(seg.n, -0.8).setY(1), 1);
        }
        if (seg.hp <= 0 && !e.inside) e.state = 'move';
      } else if (e.state === 'ranged') {
        e.cd -= dt; u.faceTo(seg.center.x, seg.center.z, dt);
        if (seg.hp <= 0) { e.seg = this.pickSegment(pos, e); if (e.seg.hp <= 0) { e.state = 'move'; continue; } }
        if (e.cd <= 0) {
          e.cd = e.D.cd * rnd(0.85, 1.15);
          u.play(e.D.ranged === 'magic' ? 'castShot' : 'throw', { once: true, force: true });
          setTimeout(() => { if (!e.dead && this.phase === 'playing') this.throwRock(pos.clone().add(V(0, e.D.h * 0.8, 0)), e.seg.top.clone().add(V(rnd(-3, 3), 0.5, 0)), e.D.dmg, e.seg, { magic: e.D.ranged === 'magic' }); }, 400);
          setTimeout(() => { if (!e.dead) u.play('idle'); }, 1100);
        }
      } else if (e.state === 'climb') {
        e.climbT += dt;
        // sube por peldaños: un tirón, una pausa, otro tirón… inclinado hacia la escalera
        const k0 = Math.min(1, e.climbT / 3.6), steps = 9, sk = k0 * steps, si = Math.floor(sk), sf = sk - si;
        const k = Math.min(1, (si + Math.min(1, Math.max(0, (sf - 0.35) / 0.65)) ** 0.6) / steps);
        pos.copy(e.climbFrom).lerp(e.climbTo, k);
        u.model.rotation.x = 0.28 + Math.sin(sk * Math.PI * 2) * 0.05;
        u.model.position.x = Math.sin(sk * Math.PI) * 0.08;
        if (k >= 1) {
          u.model.rotation.x = 0; u.model.position.x = 0;
          // llega arriba: golpe fuerte y salta adentro
          this.damageCastle(28, seg, false, 'ladder'); this.shake = 0.5; S.sfx('crack');
          this.fx.text(pos.clone().add(V(0, 2.5, 0)), 'Climbed in!', 'bad');
          this.hud.feed('🪜 An orc <b>climbed the wall</b>!', 'bad');
          this.killEnemy(e, true); e.ladder && (e.ladder.falling = true);
        }
      }
    }
    // escaleras caídas
    for (let i = this.ladders.length - 1; i >= 0; i--) {
      const l = this.ladders[i];
      if (l.falling) { l.obj.rotation.x -= 0.02 + (l.fall = (l.fall || 0) + 0.003); if (l.obj.rotation.x < -1.6) { l.obj.removeFromParent(); this.ladders.splice(i, 1); } }
    }
  }
  // ---------- Ariete contra el portón ----------
  updateRam(e, dt, spd) {
    const u = e.unit, pos = u.root.position, seg = this.castle.gate.seg; e.seg = seg;
    if (seg.hp <= 0) {
      // el portón cayó: sueltan el tronco y entran a pelear
      // el portón cayó: los orcos abandonan el ariete y entran a pelear
      for (const c of u.crew) { const wp = c.root.getWorldPosition(V()); c.dispose(); this.spawnEnemy('orc', wp); }
      u.crew = []; this.killEnemy(e, true);
      return;
    }
    const base = seg.outer.clone().addScaledVector(seg.n, 3.6); base.y = 0;
    const face = () => u.faceTo(pos.x - seg.n.x, pos.z - seg.n.z, dt, 4);
    if (e.state === 'move') {
      const to = base.clone().sub(pos).setY(0), d = to.length();
      if (d > 0.4) { to.normalize(); pos.addScaledVector(to, spd * dt); pos.y = groundY(pos.x, pos.z); e.vel = to.clone().multiplyScalar(spd); u.faceTo(pos.x + to.x, pos.z + to.z, dt, 3); if (u.cur !== 'walk') { u.play('walk'); u.crew && u.crew.forEach(c => c.play('walk')); } }
      else { e.state = 'ram'; e.swing = 0; e.vel = null; u.play('idle'); u.crew && u.crew.forEach(c => c.play('idle')); this.hud.feed('🪵 A <b>battering ram</b> is hitting the gate!', 'bad'); }
      return;
    }
    face();
    e.swing += dt;
    const k = (e.swing % 2.4) / 2.4;
    const off = k < 0.62 ? (k / 0.62) * 1.5 : k < 0.72 ? 1.5 - (k - 0.62) / 0.1 * 1.9 : -0.4 + (k - 0.72) / 0.28 * 0.4;
    pos.copy(base).addScaledVector(seg.n, off); pos.y = 0;
    const cycle = Math.floor(e.swing / 2.4);
    if (k > 0.7 && e.lastHit !== cycle) {
      e.lastHit = cycle;
      this.damageCastle(18, seg, false, 'ram'); this.shake = Math.max(this.shake, 0.55); S.sfx('boom', 0.7); S.sfx('crack', 0.6);
      const hitP = seg.outer.clone().setY(1.5);
      this.fx.emit('dust', hitP, 14, { area: 3 }); this.fx.emit('spark', hitP, 10);
      this.punch(hitP, 1.2);
    }
  }
  punch(p, t = 1.6) {
    // acercamiento breve de la cámara a un momento dramático
    if (this.punchCd > 0 || (this.focus && this.focus.t > 0)) return;
    this.punchCd = 12; this.focus = { t, target: { position: p.clone() }, zoom: 0.55 };
  }
  pickVisibleSegment(pos) {
    let best = null, bd = 1e9;
    for (const s of this.castle.segments) { if (s.side === 2) continue; const d = s.outer.distanceToSquared(pos); if (d < bd && s.hp > 0) { bd = d; best = s; } }
    return best || this.pickSegment(pos);
  }
  startClimb(e, seg) {
    const ladder = A.clone('deco/ladder'); ladder.scale.set(9, 7.2, 9);
    const base = seg.outer.clone().addScaledVector(seg.along, e.lat).addScaledVector(seg.n, 1.2);
    ladder.position.copy(base); ladder.rotation.y = seg.ry; ladder.rotation.x = 0;
    const holder = new THREE.Group(); holder.position.copy(base); holder.rotation.y = Math.atan2(seg.n.x, seg.n.z);
    ladder.position.set(0, 0, 0); ladder.rotation.set(0.24, 0, 0); holder.add(ladder);
    this.scene.add(holder);
    const l = { obj: holder, falling: false }; this.ladders.push(l);
    holder.rotation.order = 'YXZ';
    l.obj = holder; e.ladder = l;
    // la escalera inclinada: rotamos el holder en X para que caiga hacia afuera al soltarse
    e.state = 'climb'; e.climbT = 0; e.climbFrom = e.unit.root.position.clone(); e.climbTo = base.clone().addScaledVector(seg.n, -1.4).setY(WALK_Y + 0.4);
    e.unit.play('walk', { speed: 1.5 }); e.unit.faceTo(seg.center.x, seg.center.z);
    S.sfx('whoosh', 0.4);
  }
  updateFlyer(e, dt, spd) {
    const u = e.unit, pos = u.root.position;
    if (u.wings) for (const { w, s } of u.wings) w.rotation.z = s * Math.sin(e.t * 18) * 0.7;
    const target = KEEP.clone().add(V(Math.cos(e.t * 0.8 + e.lat) * 7, 9 + Math.sin(e.t * 2) * 0.8, Math.sin(e.t * 0.8 + e.lat) * 7));
    const to = target.clone().sub(pos); const d = to.length();
    if (d > 1) { pos.addScaledVector(to.normalize(), Math.min(d, spd * dt)); e.vel = to.clone().multiplyScalar(spd); }
    u.faceTo(target.x, target.z, dt, 4);
    if (u.cur !== 'walk' && u.cur !== 'attack') u.play('walk');
    if (pos.distanceTo(KEEP) < 14) {
      if (u.cur !== 'attack') u.play('attack');
      this.damageCastle(e.D.dps * dt, null, false, 'fly:' + e.type);
      if (Math.random() < dt * 1.5) this.fx.emit(e.D.broom ? 'magic' : 'dust', KEEP.clone().add(V(rnd(-3, 3), rnd(4, 9), rnd(-3, 3))), 2);
    }
  }
  updateBoss(e, dt, spd) {
    const B = e.boss, u = e.unit, pos = u.root.position;
    if (!e.seg || e.seg.hp <= 0) e.seg = this.pickSegment(pos, e);
    const seg = e.seg;
    e.special -= dt;
    if (B.flying) {
      // el dragón vuela en círculos y escupe fuego sobre las murallas
      // vuela de un lado a otro por el frente (siempre a la vista de la cámara)
      const ang = 1.55 + Math.sin(e.t * 0.22) * 1.75;
      const target = V(Math.cos(ang) * 26, 14 + Math.sin(e.t) * 1.5, Math.sin(ang) * 26);
      const to = target.clone().sub(pos); const d = to.length();
      if (d > 0.5) pos.addScaledVector(to.normalize(), Math.min(d, Math.max(spd, d * 0.5) * dt * (e.slow > 0 ? 0.6 : 1)));
      u.faceTo(pos.x + to.x, pos.z + to.z, dt, 3);
      u.model.rotation.z = Math.sin(e.t * 2) * 0.12; u.model.position.y = u.baseY + Math.sin(e.t * 3) * 0.4;
      if (e.special <= 0) {
        e.special = 4.5;
        const s = this.pickVisibleSegment(pos);
        for (let k = 0; k < 6; k++) setTimeout(() => { if (!e.dead && this.phase === 'playing') this.throwRock(pos.clone().add(V(0, 0, 0)), s.top.clone().add(V(rnd(-4, 4), 0, rnd(-1, 1))), 5, s, { magic: true, fire: true }); }, k * 120);
        S.sfx('fire');
      }
      return;
    }
    const dist = Math.hypot(pos.x - seg.outer.x, pos.z - seg.outer.z);
    const range = B.attack === 'rocks' || B.attack === 'lich' ? 14 : 1.5;
    if (dist > range && !(seg.hp <= 0 && pos.length() < 8)) {
      const target = seg.hp <= 0 ? KEEP.clone() : seg.outer.clone();
      const to = target.sub(pos).setY(0).normalize();
      pos.addScaledVector(to, spd * dt * (B.hop ? Math.max(0, Math.sin(e.t * 3)) * 2 : 1));
      pos.y = groundY(pos.x, pos.z) + (B.hop ? Math.abs(Math.sin(e.t * 3)) * 2 : 0);
      e.vel = to.clone().multiplyScalar(spd);
      u.faceTo(pos.x + to.x, pos.z + to.z, dt, 3);
      if (u.cur !== 'walk') u.play('walk', { speed: 0.6 });
      if (B.hop && Math.sin(e.t * 3) < -0.95 && !e.landed) { e.landed = true; this.shake = 0.4; S.sfx('boom', 0.5); this.fx.emit('dust', pos, 10, { area: 3 }); } else if (Math.sin(e.t * 3) > 0) e.landed = false;
    } else {
      e.vel = null;
      u.faceTo(seg.center.x, seg.center.z, dt, 3);
      if (range < 2) { if (u.cur !== 'attack') u.play('attack', { speed: 0.6 }); this.damageCastle(e.D.dps * dt, seg.hp > 0 ? seg : null); if (Math.random() < dt * 3) { this.shake = Math.max(this.shake, 0.15); this.fx.emit('dust', seg.outer.clone().setY(1), 3, { area: 3 }); } }
      e.cd -= dt;
      if (range >= 2 && e.cd <= 0) {
        e.cd = 3;
        u.play(B.attack === 'lich' ? 'castShot' : 'throw', { once: true, force: true, speed: 0.7 });
        setTimeout(() => { if (!e.dead && this.phase === 'playing') this.throwRock(pos.clone().add(V(0, B.h * 0.8, 0)), seg.top.clone(), 22, seg, { big: true, magic: B.attack === 'lich' }); }, 500);
        setTimeout(() => { if (!e.dead) u.play('idle'); }, 1500);
      }
    }
    if (B.summon && e.special <= 0) {
      e.special = 9;
      u.play(B.attack === 'lich' ? 'cast' : 'cheer', { once: true, force: true });
      const nn = 3 + Math.min(5, Math.floor(this.activePlayers() / 4));
      for (let k = 0; k < nn; k++) {
        const a = rnd(0, Math.PI * 2), r = rnd(3, 7);
        const at = pos.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r)); at.y = groundY(at.x, at.z);
        const m = this.spawnEnemy(B.summon, B.summon === 'skeleton' ? null : at);
        if (B.summon === 'skeleton') { m.unit.root.position.copy(at); m.state = 'rise'; m.t = 0; m.unit.play('rise', { once: true, force: true }); }
      }
      this.fx.emit('magic', pos.clone().setY(2), 30, { area: 5 }); S.sfx('spell');
      this.hud.feed(`☠️ <b>${B.name}</b> summoned reinforcements!`, 'bad');
    }
  }
}

function weighted(mix) { const tot = Object.values(mix).reduce((a, b) => a + b, 0); let r = Math.random() * tot; for (const [k, w] of Object.entries(mix)) { if ((r -= w) <= 0) return k; } return Object.keys(mix)[0]; }
export function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- utilidades visuales ----------
const _elemMats = {};
function elemMat(kind) { return _elemMats[kind] ||= new THREE.MeshBasicMaterial({ color: kind === 'fire' ? 0xff7a1a : 0x8fe8ff }); }
// Ala de murciélago (izquierda s=-1 o derecha s=1) a partir del modelo, con el pivote en la espalda
const _wingCache = {};
function batWing(s) {
  if (!_wingCache[s]) {
    const src = A.clone('enemies/batwing');
    const parts = [];
    src.updateMatrixWorld(true);
    src.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const p = g.attributes.position, keep = [];
      for (let i = 0; i < p.count; i += 3) { const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3; if (Math.sign(cx) === s) for (let j = 0; j < 3; j++) keep.push(p.getX(i + j), p.getY(i + j) - 1.0, p.getZ(i + j)); }
      const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3)); ng.computeVertexNormals();
      parts.push(new THREE.Mesh(ng, new THREE.MeshStandardMaterial({ color: o.material.color ? o.material.color.clone().lerp(new THREE.Color(0x3a2a3a), 0.4) : 0x222222, side: THREE.DoubleSide, roughness: 0.9 })));
    });
    _wingCache[s] = parts;
  }
  const g = new THREE.Group();
  for (const m of _wingCache[s]) g.add(new THREE.Mesh(m.geometry, m.material));
  return g;
}
