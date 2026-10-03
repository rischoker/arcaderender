// Ambiente: la batalla empieza por la tarde, cae el atardecer y termina de noche con tormenta.
// Antorchas en las murallas, fogatas del enemigo, lluvia y relámpagos.
import * as THREE from 'three';
import * as S from './audio.js';
import { GLOW_TEX } from './crowd.js';
import { Glows } from './fx.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// textura de llama (lágrima: blanca en el centro, naranja hacia afuera)
const FLAME_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const shape = () => { g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(44, 24, 52, 38, 46, 50); g.bezierCurveTo(42, 60, 22, 60, 18, 50); g.bezierCurveTo(12, 38, 20, 24, 32, 4); g.closePath(); };
  const gr = g.createRadialGradient(32, 46, 2, 32, 40, 30);
  gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(0.2, 'rgba(255,190,60,1)'); gr.addColorStop(0.6, 'rgba(240,90,10,0.85)'); gr.addColorStop(1, 'rgba(180,30,0,0)');
  shape(); g.fillStyle = gr; g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
import { HALF, WALK_Y, WALL_H, groundY } from './world.js';

const C = h => new THREE.Color(h);
// paletas: [progreso, cieloArriba, cieloMedio, horizonte, sol, solInt, hemiCielo, hemiSuelo, hemiInt, niebla, exposición]
const KEYS = [
  [0.0, '#3d7fd1', '#8fc3f0', '#f3d7a6', '#fff1d6', 2.6, '#dcefff', '#5a6b3a', 1.25, '#cfe0e8', 1.05],
  [0.45, '#3a5aa8', '#d98a6a', '#ffb070', '#ffc58a', 2.2, '#ffd6b0', '#5a4a3a', 1.0, '#e0b090', 1.05],
  [0.75, '#1f2550', '#6a3a6a', '#e0603a', '#ff9a6a', 1.6, '#b0a0d0', '#3a2a2a', 0.9, '#6a4a5a', 1.15],
  [1.0, '#0a1024', '#1f2a50', '#3a3f62', '#a8bce8', 1.15, '#7a8cc0', '#2a2a36', 0.85, '#3a3f62', 1.35],
];
function sample(p) {
  let i = 0; while (i < KEYS.length - 2 && p > KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1], k = Math.min(1, Math.max(0, (p - a[0]) / (b[0] - a[0])));
  const out = [];
  for (let j = 1; j < a.length; j++) out.push(typeof a[j] === 'string' ? C(a[j]).lerp(C(b[j]), k) : a[j] + (b[j] - a[j]) * k);
  return out;
}

export class Atmosphere {
  constructor({ scene, lights, renderer, scenery, castle, fx }) {
    Object.assign(this, { scene, lights, renderer, scenery, castle, fx });
    this.p = 0; this.target = 0; this.flash = 0; this.storm = 0; this.stormTarget = 0; this.nextBolt = 6; this.time = 0;
    this.skyCanvas = document.createElement('canvas'); this.skyCanvas.width = 4; this.skyCanvas.height = 256;
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas); this.skyTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = this.skyTex;
    // braseros en el adarve y a los lados del portón (hierro + llama + brillo)
    this.torches = [];
    const iron = new THREE.MeshStandardMaterial({ color: 0x2e2a28, metalness: 0.6, roughness: 0.5 });
    const bowl = new THREE.CylinderGeometry(0.42, 0.22, 0.32, 8, 1, true).translate(0, 0.95, 0);
    const coals = new THREE.CylinderGeometry(0.36, 0.36, 0.06, 8).translate(0, 1.0, 0);
    const legs = [0, 1, 2].map(i => { const a = i / 3 * Math.PI * 2; return new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4).rotateZ(0.18).rotateY(a).translate(Math.cos(a) * 0.18, 0.5, Math.sin(a) * 0.18); });
    const brazierGeo = mergeGeometries([bowl, ...legs].map(g => g.toNonIndexed()));
    const spots = [];
    for (const seg of castle.segments) spots.push(seg.center.clone().addScaledVector(seg.along, seg.isGate ? -1.4 : -1.7).addScaledVector(seg.n, seg.isGate ? -0.3 : -0.9).setY(seg.isGate ? WALL_H + 0.05 : WALK_Y));
    const g = castle.gate.seg;
    for (const s of [-1, 1]) spots.push(g.center.clone().addScaledVector(g.along, s * 3.4).addScaledVector(g.n, 2.4).setY(0));
    const braziers = new THREE.InstancedMesh(brazierGeo, iron, spots.length);
    const coalMesh = new THREE.InstancedMesh(coals, new THREE.MeshBasicMaterial({ color: 0xff5a1a }), spots.length);
    spots.forEach((p, i) => { const m = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z); braziers.setMatrixAt(i, m); coalMesh.setMatrixAt(i, m); this.torches.push({ ph: Math.random() * 10, p: p.clone().add(new THREE.Vector3(0, 1.45, 0)) }); });
    braziers.castShadow = true; scene.add(braziers); scene.add(coalMesh);
    // fogatas enemigas
    this.fires = (scenery.fires || []).map(p => ({ p: p.clone().add(new THREE.Vector3(0, 1, 0)), ph: Math.random() * 9 }));
    const allP = [...this.torches.map(t => t.p), ...this.fires.map(f => f.p)];
    this.glows = new Glows(scene, allP, GLOW_TEX);                 // halo grande y suave
    this.flames = new Glows(scene, allP, FLAME_TEX, 0xffffff);      // llama con forma de lágrima
    // luces puntuales (pocas, fijas, para no recompilar sombreadores)
    this.points = [[GATE_X(), 6, HALF + 2], [1.5, 7, 0], [-10, 7, -4]].map(([x, y, z]) => { const l = new THREE.PointLight(0xff9a4a, 0, 30, 1.6); l.position.set(x, y, z); scene.add(l); return l; });
    // lluvia
    const N = 1800; this.rainN = N;
    const rp = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) this.resetDrop(rp, i, true);
    this.rainGeo = new THREE.BufferGeometry(); this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({ color: 0xaabbdd, transparent: true, opacity: 0 }));
    this.rain.frustumCulled = false; scene.add(this.rain);
    // rayo
    this.boltGeo = new THREE.BufferGeometry(); this.boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
    this.bolt = new THREE.Line(this.boltGeo, new THREE.LineBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0 })); this.bolt.frustumCulled = false; scene.add(this.bolt);
    this.apply(0);
  }
  resetDrop(a, i, anyY) {
    const x = (Math.random() - 0.5) * 140, z = (Math.random() - 0.5) * 120 + 10, y = anyY ? Math.random() * 45 : 45;
    a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 2] = z; a[i * 6 + 3] = x + 0.25; a[i * 6 + 4] = y + 1.4; a[i * 6 + 5] = z + 0.1;
  }
  drawSky(top, mid, bot) {
    const g = this.skyCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(0.5, '#' + mid.getHexString()); gr.addColorStop(0.82, '#' + bot.getHexString()); gr.addColorStop(1, '#' + bot.clone().multiplyScalar(0.8).getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256); this.skyTex.needsUpdate = true;
  }
  apply(p) {
    const [top, mid, bot, sunC, sunI, hs, hg, hi, fog, exp] = sample(p);
    const st = this.storm, f = this.flash;
    const dark = 1 - st * 0.15;
    this.drawSky(top.clone().multiplyScalar(dark).lerp(C('#ffffff'), f * 0.5), mid.clone().multiplyScalar(dark).lerp(C('#c8d0ff'), f * 0.5), bot.clone().multiplyScalar(dark).lerp(C('#c8d0ff'), f * 0.4));
    const { sun, hemi } = this.lights;
    sun.color.copy(sunC); sun.intensity = sunI * dark + f * 2.5;
    // el sol baja hacia el horizonte al atardecer
    const ang = 0.95 - p * 0.65;
    sun.position.set(-30 - p * 25, 60 * Math.sin(ang) + 8, 35 + p * 10);
    hemi.color.copy(hs); hemi.groundColor.copy(hg); hemi.intensity = hi * dark + f * 1.6;
    this.scene.fog.color.copy(fog).multiplyScalar(dark).lerp(C('#a0a8c8'), f * 0.4);
    this.scene.fog.near = 90 - st * 20; this.scene.fog.far = 240 - st * 30;
    this.renderer.toneMappingExposure = exp;
    this.night = Math.min(1, Math.max(0, (p - 0.45) / 0.45));
  }
  update(dt, game) {
    this.time += dt;
    this.p += (this.target - this.p) * Math.min(1, dt * 0.5);
    this.storm += (this.stormTarget - this.storm) * Math.min(1, dt * 0.3);
    this.flash = Math.max(0, this.flash - dt * 3.5);
    // relámpagos
    if (this.storm > 0.4) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.nextBolt = 4 + Math.random() * 8; this.strike(); }
    }
    this.bolt.material.opacity = Math.max(0, this.bolt.material.opacity - dt * 6);
    if ((this.frame = (this.frame || 0) + 1) % 3 === 0 || this.flash > 0) this.apply(this.p);
    // antorchas y fogatas: más intensas de noche, siempre parpadeando
    const glow = 0.35 + this.night * 0.85;
    this.torches.forEach((t, i) => {
      const k = 1 + Math.sin(this.time * 11 + t.ph) * 0.12 + Math.sin(this.time * 27 + t.ph) * 0.07;
      this.flames.set(i, 1.15 * k, 0.9); this.glows.set(i, 4 * k, 0.18 + glow * 0.45);
      if (Math.random() < dt * 7) this.fx.emit('fire', t.p.clone().setY(t.p.y - 0.25), 1, { scale: 0.45, vy: 0.5, spread: 0.15 });
      if (Math.random() < dt * 2) this.fx.emit('spark', t.p, 1, { scale: 0.6, vy: 0.4, spread: 0.6 });
    });
    this.fires.forEach((f, j) => { const k = 1 + Math.sin(this.time * 7 + f.ph) * 0.12, i = this.torches.length + j; this.flames.set(i, 3.2 * k, 1); this.glows.set(i, 8 * k, 0.3 + this.night * 0.6); if (Math.random() < dt * 2) this.fx.emit('smoke', f.p.clone().setY(f.p.y + 2), 1, { scale: 1.4 }); });
    this.glows.commit(); this.flames.commit();
    const sc = this.fx.batches.fire.mat.uniforms.uScale.value; this.glows.mat.uniforms.uScale.value = sc; this.flames.mat.uniforms.uScale.value = sc;
    this.points.forEach((l, i) => { l.intensity = this.night * (30 + Math.sin(this.time * 9 + i) * 4) + this.flash * 10; });
    // lluvia
    this.rain.material.opacity = this.storm * 0.55;
    if (this.storm > 0.02) {
      const a = this.rainGeo.attributes.position.array, fall = dt * 42;
      for (let i = 0; i < this.rainN; i++) {
        a[i * 6 + 1] -= fall; a[i * 6 + 4] -= fall; a[i * 6] -= fall * 0.18; a[i * 6 + 3] -= fall * 0.18;
        if (a[i * 6 + 1] < groundY(a[i * 6], a[i * 6 + 2])) this.resetDrop(a, i, false);
      }
      this.rainGeo.attributes.position.needsUpdate = true;
    }
  }
  strike() {
    this.flash = 1;
    // rayo dentado en el horizonte
    const a = this.boltGeo.attributes.position.array;
    const ang = Math.PI * (1.1 + Math.random() * 0.8), r = 110 + Math.random() * 40;
    let x = Math.cos(ang) * r, z = Math.sin(ang) * r, y = 90;
    for (let i = 0; i < 60; i++) { a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z; y -= 1.6; x += (Math.random() - 0.5) * 4; z += (Math.random() - 0.5) * 4; }
    this.boltGeo.attributes.position.needsUpdate = true; this.bolt.material.opacity = 1;
    setTimeout(() => S.sfx('thunder'), 300 + Math.random() * 1200);
  }
  reset() { this.target = 0; this.stormTarget = 0; }
}
function GATE_X() { return 5; }
