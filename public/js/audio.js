// Efectos de sonido y música sintetizados con Web Audio (no se necesitan archivos).
// Si luego tienes sonidos reales, ponlos en /assets/sfx/<nombre>.mp3 y se usan automáticamente.
let ctx, master, sfxBus, musicBus, noiseBuf, muted = false;
const files = {};
const FILE_SFX = ['thunder', 'warcry', 'volley', 'heart', 'drum', 'bolt', 'hit', 'crack', 'gate', 'horn', 'roar', 'cheer', 'sob', 'victory', 'defeat', 'coin', 'death', 'boom', 'build', 'whoosh', 'golden'];

export function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // archivos opcionales
  // /assets/sfx/list.json = ["bolt","roar",...] con los nombres de los .mp3 que hayas agregado
  fetch('/assets/sfx/list.json').then(r => r.ok ? r.json() : []).then(list => {
    for (const n of list) if (FILE_SFX.includes(n) || n.startsWith('music')) fetch(`/assets/sfx/${n}.mp3`).then(r => r.ok ? r.arrayBuffer() : null).then(b => b && ctx.decodeAudioData(b)).then(buf => { if (buf) files[n] = buf; }).catch(() => { });
  }).catch(() => { });
}
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; }
export function isMuted() { return muted; }

function playFile(n, vol = 1) {
  if (!files[n]) return false;
  const s = ctx.createBufferSource(); s.buffer = files[n]; const g = ctx.createGain(); g.gain.value = vol; s.connect(g).connect(sfxBus); s.start(); return true;
}
function tone(f, t, dur, { type = 'sine', vol = 0.2, slide = 0, bus = sfxBus, attack = 0.005 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
}
function noise(t, dur, { vol = 0.3, freq = 1000, q = 1, type = 'lowpass', slide = 0, bus = sfxBus } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q; if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const last = {};
export function sfx(name, vol = 1) {
  if (!ctx || muted) return;
  const now = ctx.currentTime;
  // evita saturar con el mismo sonido muchas veces por frame
  const gap = { bolt: 0.05, hit: 0.04, death: 0.08, crack: 0.25, coin: 0.06, volley: 1, warcry: 2 }[name] || 0;
  if (gap && last[name] && now - last[name] < gap) return; last[name] = now;
  if (playFile(name, vol)) return;
  const t = now;
  switch (name) {
    case 'bolt': tone(180, t, 0.12, { type: 'triangle', vol: 0.18 * vol, slide: 0.5 }); noise(t, 0.08, { vol: 0.12 * vol, freq: 3000, type: 'highpass' }); break;
    case 'hit': noise(t, 0.12, { vol: 0.25 * vol, freq: 900 }); tone(120, t, 0.1, { type: 'square', vol: 0.06 * vol, slide: 0.6 }); break;
    case 'death': tone(320, t, 0.35, { type: 'sawtooth', vol: 0.06 * vol, slide: 0.35 }); noise(t, 0.2, { vol: 0.12 * vol, freq: 600 }); break;
    case 'crack': noise(t, 0.6, { vol: 0.5 * vol, freq: 500, slide: 0.3 }); tone(70, t, 0.5, { type: 'sine', vol: 0.3 * vol, slide: 0.6 }); break;
    case 'boom': noise(t, 1.1, { vol: 0.7 * vol, freq: 300, slide: 0.2 }); tone(50, t, 0.9, { vol: 0.5 * vol, slide: 0.5 }); break;
    case 'gate': for (let i = 0; i < 8; i++) noise(t + i * 0.07, 0.05, { vol: 0.12 * vol, freq: 2500 + Math.random() * 1500, type: 'bandpass', q: 8 }); tone(90, t, 0.6, { type: 'sawtooth', vol: 0.04 * vol }); break;
    case 'build': for (let i = 0; i < 3; i++) { tone(900 + i * 50, t + i * 0.18, 0.08, { type: 'square', vol: 0.05 * vol }); noise(t + i * 0.18, 0.06, { vol: 0.15 * vol, freq: 2000, type: 'bandpass', q: 3 }); } break;
    case 'coin': tone(988, t, 0.08, { type: 'square', vol: 0.06 * vol }); tone(1319, t + 0.07, 0.25, { type: 'square', vol: 0.06 * vol }); break;
    case 'golden': [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, t + i * 0.07, 0.4, { type: 'triangle', vol: 0.1 * vol })); break;
    case 'horn': [[196, 0, 0.5], [262, 0.45, 0.4], [330, 0.8, 1.0]].forEach(([f, d, l]) => { tone(f, t + d, l, { type: 'sawtooth', vol: 0.09 * vol, attack: 0.05 }); tone(f * 1.005, t + d, l, { type: 'square', vol: 0.03 * vol, attack: 0.05 }); }); break;
    case 'roar': noise(t, 1.8, { vol: 0.6 * vol, freq: 400, q: 2, type: 'bandpass', slide: 0.4 }); tone(70, t, 1.8, { type: 'sawtooth', vol: 0.18 * vol, slide: 0.6, attack: 0.2 }); tone(105, t, 1.6, { type: 'sawtooth', vol: 0.1 * vol, slide: 0.55, attack: 0.2 }); break;
    case 'whoosh': noise(t, 0.5, { vol: 0.25 * vol, freq: 400, q: 1, type: 'bandpass', slide: 4 }); break;
    case 'cheer': for (let i = 0; i < 14; i++) tone(500 + Math.random() * 700, t + Math.random() * 0.3, 0.5, { type: 'triangle', vol: 0.025 * vol, slide: 1.3, attack: 0.08 }); noise(t, 0.9, { vol: 0.12 * vol, freq: 1500, type: 'bandpass', q: 0.7 }); break;
    case 'sob': [0, 0.35, 0.7].forEach(d => tone(620, t + d, 0.3, { type: 'sine', vol: 0.07 * vol, slide: 0.7, attack: 0.04 })); break;
    case 'victory': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.16, i === 6 ? 1.2 : 0.3, { type: 'square', vol: 0.06 * vol })); break;
    case 'defeat': [392, 370, 349, 262].forEach((f, i) => tone(f, t + i * 0.4, 0.6, { type: 'sawtooth', vol: 0.06 * vol, slide: 0.98 })); break;
    case 'click': tone(1200, t, 0.04, { type: 'square', vol: 0.04 * vol }); break;
    case 'join': tone(660, t, 0.1, { type: 'triangle', vol: 0.1 * vol }); tone(990, t + 0.08, 0.2, { type: 'triangle', vol: 0.1 * vol }); break;
    case 'fire': noise(t, 1.2, { vol: 0.35 * vol, freq: 700, q: 0.5, slide: 0.5 }); break;
    case 'thunder': noise(t, 2.6, { vol: 0.8 * vol, freq: 260, slide: 0.25 }); noise(t + 0.05, 0.3, { vol: 0.5 * vol, freq: 2000, type: 'highpass' }); tone(42, t, 2.2, { vol: 0.35 * vol, slide: 0.7, attack: 0.05 }); break;
    case 'warcry': for (let i = 0; i < 10; i++) { const f = 90 + Math.random() * 90; tone(f, t + Math.random() * 0.25, 1.4, { type: 'sawtooth', vol: 0.025 * vol, slide: 0.8, attack: 0.15 }); } noise(t, 1.5, { vol: 0.22 * vol, freq: 500, q: 1.5, type: 'bandpass', slide: 0.6 }); break;
    case 'volley': for (let i = 0; i < 12; i++) noise(t + Math.random() * 0.35, 0.18, { vol: 0.07 * vol, freq: 1800 + Math.random() * 1500, type: 'bandpass', q: 4, slide: 0.4 }); break;
    case 'heart': tone(55, t, 0.16, { vol: 0.5 * vol, slide: 0.6 }); tone(50, t + 0.22, 0.2, { vol: 0.4 * vol, slide: 0.6 }); break;
    case 'drum': tone(70, t, 0.35, { vol: 0.35 * vol, slide: 0.5 }); noise(t, 0.12, { vol: 0.2 * vol, freq: 300 }); break;
    case 'spell': tone(400, t, 0.6, { type: 'sine', vol: 0.08 * vol, slide: 3 }); tone(600, t, 0.6, { type: 'triangle', vol: 0.05 * vol, slide: 2 }); break;
  }
}

// ---------- Música: un loop medieval sencillo (modo dórico) ----------
let musicTimer = null, musicMode = 'calm', step = 0;
const SCALE = [146.8, 164.8, 174.6, 196, 220, 246.9, 261.6, 293.7]; // D dórico
const MEL_CALM = [0, 2, 4, 3, 2, 1, 0, -1, 0, 4, 5, 4, 3, 2, 1, 2];
const MEL_WAR = [0, 0, 4, 0, 3, 2, 0, -1, 0, 0, 5, 4, 3, 4, 2, 1];
// Pistas reales (lobby y batalla) en streaming con <audio>; si no cargan, se usa el loop sintetizado.
const TRACKS = { calm: '/assets/sfx/music_lobby.mp3', war: '/assets/sfx/music_battle.mp3', boss: '/assets/sfx/music_battle.mp3' };
const VOL = { calm: 0.75, war: 0.7, boss: 0.95 };
const els = {}; let curTrack = null, trackFail = false;
function trackEl(src) {
  if (els[src]) return els[src];
  const a = new Audio(src); a.loop = true; a.preload = 'auto'; a.crossOrigin = 'anonymous';
  const g = ctx.createGain(); g.gain.value = 0; ctx.createMediaElementSource(a).connect(g).connect(musicBus);
  a.addEventListener('error', () => { trackFail = true; if (curTrack === src) { curTrack = null; synthMusic(musicMode); } });
  return (els[src] = { a, g });
}
function fadeTo(e, v, d = 1.2) { const t = ctx.currentTime; e.g.gain.cancelScheduledValues(t); e.g.gain.setValueAtTime(e.g.gain.value, t); e.g.gain.linearRampToValueAtTime(v, t + d); }
export function music(mode) {
  if (!ctx) return;
  musicMode = mode;
  const src = TRACKS[mode];
  if (!trackFail) {
    for (const k in els) if (k !== src) { const e = els[k]; fadeTo(e, 0); setTimeout(() => { if (curTrack !== k) e.a.pause(); }, 1300); }
    curTrack = src || null;
    if (!src) { clearInterval(musicTimer); musicTimer = null; return; }
    const e = trackEl(src);
    if (e.a.paused) { e.a.currentTime = 0; e.a.play().catch(() => { }); }
    fadeTo(e, VOL[mode] || 0.7);
    clearInterval(musicTimer); musicTimer = null; return;
  }
  synthMusic(mode);
}
function synthMusic(mode) {
  musicMode = mode;
  if (mode === 'off') { clearInterval(musicTimer); musicTimer = null; return; }
  if (musicTimer) return;
  step = 0;
  musicTimer = setInterval(() => {
    if (muted) return;
    const t = ctx.currentTime + 0.05, war = musicMode !== 'calm', beat = war ? 0.24 : 0.36;
    const mel = war ? MEL_WAR : MEL_CALM, i = step % 16, n = mel[i];
    if (i % 4 === 0) { tone(SCALE[0] / 2, t, beat * 4, { type: 'sawtooth', vol: 0.035, bus: musicBus, attack: 0.1 }); tone(SCALE[4] / 2, t, beat * 4, { type: 'triangle', vol: 0.03, bus: musicBus, attack: 0.1 }); }
    if (n >= 0 && (war || i % 2 === 0 || Math.random() < 0.6)) tone(SCALE[n] * 2, t, beat * 1.6, { type: 'triangle', vol: war ? 0.05 : 0.04, bus: musicBus, attack: 0.02 });
    if (war) { if (i % 2 === 0) noise(t, 0.12, { vol: i % 4 === 0 ? 0.22 : 0.1, freq: 160, bus: musicBus }); if (musicMode === 'boss' && i % 4 === 2) tone(SCALE[1] / 2, t, 0.2, { type: 'square', vol: 0.03, bus: musicBus }); }
    step++;
  }, musicMode === 'calm' ? 360 : 240);
}
export function restartMusic(mode) { clearInterval(musicTimer); musicTimer = null; music(mode); }
// jingle de entrada (voz del Arcade)
export function intro() { if (!ctx || muted) return; const a = new Audio('/assets/sfx/intro.mp3'); const g = ctx.createGain(); g.gain.value = 1; try { ctx.createMediaElementSource(a).connect(g).connect(sfxBus); } catch { } a.play().catch(() => { }); }

// ---------- Voces (síntesis del navegador, en inglés) ----------
let voices = [];
function loadVoices() { try { voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); } catch { } }
try { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; } catch { }
export function say(text, { who = 'princess', rate = 1 } = {}) {
  if (muted) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const female = voices.find(v => /female|zira|samantha|karen|victoria|susan|hazel|libby|aria|jenny/i.test(v.name)) || voices[0];
    const male = voices.find(v => /male|david|daniel|george|guy|ryan|alex/i.test(v.name) && !/female/i.test(v.name)) || voices[0];
    if (who === 'princess') { u.voice = female; u.pitch = 1.7; u.rate = 1.05 * rate; u.volume = 1; }
    else if (who === 'boss') { u.voice = male; u.pitch = 0.1; u.rate = 0.8 * rate; u.volume = 1; }
    else { u.voice = male; u.pitch = 0.8; u.rate = 0.95 * rate; u.volume = 0.9; }
    if (speechSynthesis.speaking && who !== 'boss') speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { }
}
