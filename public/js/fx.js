// Partículas (humo, fuego, chispas, corazones, lágrimas…) y textos flotantes.
// Todas las partículas de un mismo tipo se dibujan juntas en un solo objeto Points
// (una llamada de dibujo por tipo, aunque haya cientos en pantalla).
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

function makeTex(draw, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const soft = (inner, outer) => makeTex((g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
const emoji = (e) => makeTex((g, s) => { g.font = `${s * 0.8}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, s / 2, s / 2 + 4); }, 96);

const TYPES = {
  smoke: { tex: () => soft('rgba(120,120,120,.75)', 'rgba(120,120,120,0)'), blend: THREE.NormalBlending, life: [1.6, 2.6], size: [1.5, 3.5], grow: 1.8, vy: [0.8, 1.8], spread: 0.6, grav: 0, max: 400 },
  dark: { tex: () => soft('rgba(40,35,35,.8)', 'rgba(40,35,35,0)'), blend: THREE.NormalBlending, life: [1.8, 3], size: [2, 4], grow: 2, vy: [1.2, 2.2], spread: 0.6, grav: 0, max: 300 },
  fire: { tex: () => soft('rgba(255,220,120,1)', 'rgba(255,80,0,0)'), blend: THREE.AdditiveBlending, life: [0.4, 0.9], size: [0.8, 1.8], grow: -0.6, vy: [1.5, 3], spread: 0.5, grav: 0, max: 900 },
  spark: { tex: () => soft('rgba(255,255,200,1)', 'rgba(255,180,40,0)'), blend: THREE.AdditiveBlending, life: [0.3, 0.6], size: [0.25, 0.5], grow: -0.5, vy: [2, 6], spread: 4, grav: -12, max: 400 },
  dust: { tex: () => soft('rgba(170,140,100,.7)', 'rgba(170,140,100,0)'), blend: THREE.NormalBlending, life: [0.8, 1.4], size: [1, 2.2], grow: 1.5, vy: [0.3, 1.2], spread: 2.5, grav: 0, max: 500 },
  magic: { tex: () => soft('rgba(220,150,255,1)', 'rgba(120,0,255,0)'), blend: THREE.AdditiveBlending, life: [0.5, 1.1], size: [0.5, 1.2], grow: -0.4, vy: [0.5, 2], spread: 1.5, grav: 0, max: 400 },
  gold: { tex: () => soft('rgba(255,240,150,1)', 'rgba(255,190,0,0)'), blend: THREE.AdditiveBlending, life: [0.8, 1.5], size: [0.3, 0.7], grow: -0.3, vy: [2, 5], spread: 2.5, grav: -5, max: 300 },
  heal: { tex: () => soft('rgba(150,255,170,1)', 'rgba(0,200,80,0)'), blend: THREE.AdditiveBlending, life: [0.8, 1.4], size: [0.4, 0.9], grow: -0.3, vy: [1.5, 3], spread: 1.5, grav: 0, max: 300 },
  heart: { tex: () => emoji('💖'), blend: THREE.NormalBlending, life: [1.4, 2.2], size: [0.7, 1.2], grow: 0.2, vy: [1.2, 2.2], spread: 1, grav: 0, max: 80 },
  tear: { tex: () => emoji('💧'), blend: THREE.NormalBlending, life: [0.6, 1], size: [0.35, 0.5], grow: 0, vy: [0.5, 1], spread: 0.6, grav: -9, max: 60 },
  star: { tex: () => emoji('⭐'), blend: THREE.NormalBlending, life: [1, 1.6], size: [0.5, 0.9], grow: 0, vy: [3, 6], spread: 3, grav: -8, max: 200 },
  ice: { tex: () => soft('rgba(220,248,255,1)', 'rgba(80,180,255,0)'), blend: THREE.AdditiveBlending, life: [0.5, 1], size: [0.4, 0.9], grow: -0.3, vy: [0.5, 1.5], spread: 1, grav: 0, max: 600 },
};
const rnd = (a, b) => a + Math.random() * (b - a);

const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uScale; varying float vAlpha; varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vAlpha = aAlpha; vColor = aColor;
}`;
const FRAG = `
uniform sampler2D uMap; varying float vAlpha; varying vec3 vColor;
void main() {
  vec4 c = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(c.rgb * vColor, c.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
  #include <colorspace_fragment>
}`;

class Batch {
  constructor(scene, T) {
    this.T = T; this.max = T.max; this.n = 0;
    this.pos = new Float32Array(this.max * 3); this.size = new Float32Array(this.max); this.alpha = new Float32Array(this.max); this.col = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3); this.age = new Float32Array(this.max); this.life = new Float32Array(this.max); this.base = new Float32Array(this.max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: T.tex() }, uScale: { value: 500 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: T.blend });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
  }
  add(p, opts) {
    if (this.n >= this.max) return;
    const T = this.T, i = this.n++;
    const sp = opts.spread ?? T.spread, area = opts.area || 1;
    this.pos[i * 3] = p.x + rnd(-0.3, 0.3) * area; this.pos[i * 3 + 1] = p.y + rnd(0, 0.3); this.pos[i * 3 + 2] = p.z + rnd(-0.3, 0.3) * area;
    this.vel[i * 3] = rnd(-sp, sp) + (opts.vel ? opts.vel.x : 0); this.vel[i * 3 + 1] = rnd(...T.vy) * (opts.vy ?? 1) + (opts.vel ? opts.vel.y : 0); this.vel[i * 3 + 2] = rnd(-sp, sp) + (opts.vel ? opts.vel.z : 0);
    this.age[i] = 0; this.life[i] = rnd(...T.life) * (opts.life || 1); this.base[i] = rnd(...T.size) * (opts.scale || 1);
    const c = opts.color ? new THREE.Color(opts.color) : null;
    this.col[i * 3] = c ? c.r : 1; this.col[i * 3 + 1] = c ? c.g : 1; this.col[i * 3 + 2] = c ? c.b : 1;
  }
  update(dt) {
    const T = this.T;
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.swap(i, --this.n); continue; }
      this.vel[i * 3 + 1] += T.grav * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (T.grav && this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3] = this.vel[i * 3 + 1] = this.vel[i * 3 + 2] = 0; }
      const k = this.age[i] / this.life[i];
      this.size[i] = Math.max(0.01, this.base[i] * (1 + T.grow * k));
      this.alpha[i] = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    }
    this.geo.setDrawRange(0, this.n);
    for (const a of ['position', 'aSize', 'aAlpha', 'aColor']) this.geo.attributes[a].needsUpdate = true;
    this.points.visible = this.n > 0;
  }
  swap(i, j) {
    if (i === j) return;
    for (const [arr, k] of [[this.pos, 3], [this.vel, 3], [this.col, 3], [this.age, 1], [this.life, 1], [this.base, 1], [this.size, 1], [this.alpha, 1]]) for (let c = 0; c < k; c++) arr[i * k + c] = arr[j * k + c];
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene; this.labels = [];
    this.batches = {};
    for (const [k, T] of Object.entries(TYPES)) this.batches[k] = new Batch(scene, T);
  }
  // tamaño de pantalla para que las partículas se vean igual en cualquier resolución
  setScale(camera, heightPx) { const s = heightPx * 0.5 * camera.projectionMatrix.elements[5]; for (const b of Object.values(this.batches)) b.mat.uniforms.uScale.value = s; }
  emit(type, pos, n = 1, opts = {}) {
    const b = this.batches[type]; if (!b) return;
    for (let i = 0; i < n; i++) b.add(pos, opts);
  }
  get count() { let n = 0; for (const b of Object.values(this.batches)) n += b.n; return n; }
  update(dt) {
    for (const b of Object.values(this.batches)) b.update(dt);
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i]; l.age += dt;
      l.obj.position.y += dt * l.speed;
      l.obj.element.style.opacity = Math.max(0, 1 - Math.max(0, l.age - l.life * 0.6) / (l.life * 0.4));
      if (l.age > l.life) { l.obj.removeFromParent(); this.labels.splice(i, 1); }
    }
  }
  // Texto que sube y se desvanece (ej. "+5 🏹", "-2%")
  text(pos, txt, cls = '', life = 1.6, speed = 2) {
    if (this.labels.length > 40) return;
    const d = document.createElement('div'); d.className = 'ftext ' + cls; d.textContent = txt;
    const o = new CSS2DObject(d); o.position.copy(pos); this.scene.add(o);
    this.labels.push({ obj: o, age: 0, life, speed });
  }
}

// Brillos fijos (antorchas, fogatas): un solo objeto Points para todos
export class Glows {
  constructor(scene, positions, tex, color = 0xffa040) {
    this.n = positions.length;
    this.pos = new Float32Array(this.n * 3); this.size = new Float32Array(this.n); this.alpha = new Float32Array(this.n); this.col = new Float32Array(this.n * 3);
    const c = new THREE.Color(color);
    positions.forEach((p, i) => { this.pos.set([p.x, p.y, p.z], i * 3); this.col.set([c.r, c.g, c.b], i * 3); this.size[i] = 2; this.alpha[i] = 1; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: tex }, uScale: { value: 500 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; scene.add(this.points);
  }
  set(i, size, alpha) { this.size[i] = size; this.alpha[i] = alpha; }
  commit() { this.geo.attributes.aSize.needsUpdate = true; this.geo.attributes.aAlpha.needsUpdate = true; }
}
