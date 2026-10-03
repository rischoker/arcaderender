// Pantalla del profesor (host): escena 3D, lobby, HUD y conexión con el servidor.
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import * as A from './assets.js';
import * as S from './audio.js';
import { FX } from './fx.js';
import { buildSky, buildLights, buildGround, buildScenery, buildCastle, HALF } from './world.js';
import { Game, esc, WAVES } from './game.js';
import { Atmosphere } from './atmo.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const ss = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch { } } };
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { } } };

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
// gráficos integrados (típicos de PCs de oficina): empezamos con una calidad más moderada
const gpuName = (() => { try { const gl = document.createElement('canvas').getContext('webgl'); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch { return ''; } })();
const weakGPU = /Intel|UHD|HD Graphics|Iris|Mali|Adreno|PowerVR|SwiftShader/i.test(gpuName) && !params.has('hq');
window.__weakGPU = weakGPU;
let pixelRatio = params.has('lite') ? 0.5 : weakGPU ? 1 : Math.min(window.devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = !params.has('lite');
console.log('[quality] GPU:', gpuName, weakGPU ? '(modo PC de oficina)' : ''); renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const labels = new CSS2DRenderer({ element: $('labels') });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 600);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let game, fx, sceneryRefs, atmo, lights, groundRefs;
window.__lite = params.has('lite');

const state = { code: null, key: ss.get('cq_host_key'), level: ls.get('cq_level') || 'A2', tq: +(ls.get('cq_tq') || 20), dur: +(ls.get('cq_dur') || 10), gold: ls.get('cq_gold') !== '0', diff: ls.get('cq_diff') || 'normal', paused: false, players: new Map() };

// ---------- HUD ----------
const hud = {
  banner(t, s, cls = '') { const b = $('banner'); b.className = ''; void b.offsetWidth; b.className = 'show ' + cls; b.querySelector('.t').innerHTML = t; b.querySelector('.s').innerHTML = s || ''; b.querySelector('.s').style.display = s ? '' : 'none'; },
  feed(html, cls = '') { const f = $('feed'); const d = document.createElement('div'); d.className = cls; d.innerHTML = html; f.appendChild(d); while (f.children.length > 5) f.firstChild.remove(); setTimeout(() => d.remove(), 9000); },
  upgrades(up) { $('ups').innerHTML = Object.entries(up).filter(([, n]) => n > 0).map(([k, n]) => `<span title="${window.UPGRADES.list[k].name}">${window.UPGRADES.list[k].icon}${n > 1 ? '×' + n : ''}</span>`).join(''); },
  update(g) {
    if (g.phase === 'lobby') return;
    const k = g.hp / g.maxHp, bar = $('hpbar').firstElementChild;
    bar.style.transform = `scaleX(${k})`; bar.className = k < 0.3 ? 'low' : k < 0.6 ? 'mid' : '';
    $('hptext').textContent = `🏰 Castle ${Math.ceil(k * 100)}%`;
    $('ammoN').textContent = g.ammo; $('ammo').className = g.ammo <= 0 ? 'empty' : '';
    $('ammo').querySelector('small').textContent = g.ammo <= 0 ? 'OUT OF BOLTS! Answer to send more!' : 'bolts';
    if (g.wave < 6) { $('wave').textContent = `Wave ${g.wave + 1}/6 · ${g.breakT > 0 ? 'Get ready…' : (window.WAVE_TITLES || [])[g.wave] || ''}`; $('waveprog').firstElementChild.style.width = Math.min(100, g.waveT / g.waveLen * 100) + '%'; $('waveprog').style.display = ''; }
    else { const left = Math.max(0, Math.ceil(g.bossLimit() - g.waveT)); $('wave').textContent = `⚔️ Final battle! · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; $('waveprog').style.display = 'none'; }
    const bosses = g.enemies.filter(e => e.isBoss && !e.dead);
    $('bossbar').classList.toggle('hidden', !bosses.length);
    if (bosses.length) { const b = bosses[0]; $('bossName').textContent = (b.shielded ? '🛡️ ' : '☠️ ') + b.boss.name + (b.shielded ? ' — shielded until 80%' : ''); $('bossbar').classList.toggle('shield', !!b.shielded); $('bossHp').style.width = Math.max(0, b.hp / b.maxHp * 100) + '%'; }
    const tot = g.stats.correct + g.stats.wrong, acc = Math.round(g.teamAcc());
    $('tacc').textContent = tot ? acc + '%' : '–';
    $('teamacc').className = !tot ? '' : acc >= 80 ? 'ok' : 'bad';
  },
};

// ---------- Carga ----------
async function boot() {
  buildSky(scene); lights = buildLights(scene); groundRefs = buildGround(scene);
  await A.loadAll(p => { $('loadbar').firstElementChild.style.width = (p * 100).toFixed(0) + '%'; });
  sceneryRefs = buildScenery(scene);
  const castle = buildCastle(scene);
  fx = new FX(scene);
  game = new Game({ scene, camera, castle, fx, hud });
  atmo = new Atmosphere({ scene, lights, renderer, scenery: sceneryRefs, castle, fx });
  window.__atmo = atmo; window.__renderer = renderer;
  window.WAVE_TITLES = WAVES.map(w => w.title);
  // el veredicto siempre lo decide la regla del 80%
  game.onWin = game.onLose = game.onTimeUp = () => endBattle(game.passed());
  $('loadtxt').textContent = 'Ready!';
  $('clickStart').classList.remove('hidden');
  window.__game = game; // depuración
  window.__sim = async (sec, dt = 1 / 30) => { for (let i = 0; i < sec / dt; i++) { stepWorld(dt); if (i % 10 === 0) await new Promise(r => setTimeout(r, 0)); } };
  window.done = true;
  if (params.has('auto')) enter();
  if (params.has('noui')) document.querySelectorAll('.ui').forEach(e => e.style.display = 'none');
}
function enter() {
  S.init(); S.resume(); S.intro(); setTimeout(() => S.music('calm'), 1800);
  $('loading').classList.add('hidden');
  showLobby();
  connect();
}
$('clickStart').onclick = enter;

// ---------- Lobby ----------
function segButtons(id, val, cb) {
  const el = $(id);
  const paint = v => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(v)));
  el.querySelectorAll('button').forEach(b => b.onclick = () => { S.sfx('click'); cb(b.dataset.v); paint(b.dataset.v); });
  paint(val);
}
segButtons('lvl', state.level, v => { state.level = v; ls.set('cq_level', v); loadTop(); });
segButtons('dur', state.dur, v => { state.dur = +v; ls.set('cq_dur', v); });
segButtons('diff', state.diff, v => { state.diff = v; ls.set('cq_diff', v); });
segButtons('gold', state.gold ? 1 : 0, v => { state.gold = v === '1'; ls.set('cq_gold', v); });
$('tq').value = state.tq; $('tlab').textContent = state.tq;
$('tq').oninput = () => { state.tq = +$('tq').value; $('tlab').textContent = state.tq; ls.set('cq_tq', state.tq); };
$('startBtn').onclick = () => {
  if (!state.players.size) { hud.banner('No defenders yet!', 'Scan the QR code with your phones'); return; }
  S.sfx('horn'); send({ t: 'start', level: state.level, timeBase: state.tq, golden: state.gold });
  startBattle();
};
const toggleMute = () => { S.setMuted(!S.isMuted()); $('muteBtn').textContent = S.isMuted() ? '🔇 Muted' : '🔊 Sound'; };
$('muteBtn').onclick = toggleMute; $('muteBtn2').onclick = toggleMute;
// si venimos del Arcade, botón para volver
const backUrl = (() => { try { const r = document.referrer && new URL(document.referrer); if (r && r.origin !== location.origin) { ss.set('cq_back', r.href); return r.href; } } catch { } return ss.get('cq_back'); })();
if (backUrl) { $('arcadeBtn').classList.remove('hidden'); $('arcadeBtn').onclick = () => { location.href = backUrl; }; }
$('fsBtn').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => { }); };

function showLobby() {
  game.phase = 'lobby'; game.reset(); game.layoutLobby();
  for (const pl of game.players.values()) pl.unit.play('idle');
  $('lobby').classList.remove('hidden'); $('plist').classList.remove('hidden');
  $('hud').classList.add('hidden'); $('final').classList.add('hidden'); $('pauseO').classList.add('hidden');
  game.princess.play('idle');
  loadTop();
  S.restartMusic('calm');
}
function renderPlayers() {
  $('pcount').textContent = state.players.size;
  $('pc2').textContent = state.players.size + ' defenders';
  const rows = [...state.players.values()].map(p => `<div class="pl"><img src="/assets/portraits/${p.char}.png"><span class="${p.online ? '' : 'off'}">${esc(p.name)}</span><button data-k="${p.id}" title="Remove">✖</button></div>`).join('');
  $('plrows').innerHTML = rows || '<div style="text-align:center;opacity:.6">Scan the QR code to join!</div>';
  $('plrows').querySelectorAll('button').forEach(b => b.onclick = () => send({ t: 'kick', pid: b.dataset.k }));
}
async function loadTop() {
  $('gtlv').textContent = state.level === 'MIX' ? 'Final exam' : state.level;
  try {
    const rows = await fetch('/api/top?level=' + state.level + '&limit=5').then(r => r.json());
    $('gtop').innerHTML = rows.length ? rows.map((r, i) => `<div class="row"><span>${['🥇', '🥈', '🥉', '4', '5'][i]}</span><span>${esc(r.name)}</span><span>${r.points}</span></div>`).join('') : '<div style="opacity:.6">No scores yet</div>';
  } catch { $('gtop').textContent = '—'; }
}

// ---------- Batalla ----------
let countdown = 0;
function startBattle() {
  $('lobby').classList.add('hidden'); $('plist').classList.add('hidden'); $('final').classList.add('hidden');
  $('hud').classList.remove('hidden'); $('feed').innerHTML = '';
  game.start({ level: state.level, timeBase: state.tq, duration: state.dur, golden: state.gold, difficulty: state.diff });
  hud.upgrades(game.up);
}
function endBattle(win) {
  if (game.phase !== 'playing') return;
  game.finish(win);
  send({ t: 'end', win });
}
// Tarjetas de resultados: retroalimentación para cada estudiante desde el tablero
let finalCards = [];
function cardHTML(r) {
  const f = r.feedback || (window.FEEDBACK ? FEEDBACK.build(r) : { rank: {}, strengths: [], weaknesses: [], tips: [] });
  const li = a => a.map(x => `<li>${esc(x)}</li>`).join('');
  return `<div class="card ${f.passed ? 'pass' : 'fail'}">
    <div class="pos">#${r.rank} · ${r.points} pts</div>
    <div class="hd"><img src="/assets/portraits/${r.char}.png" alt=""><div><div class="nm">${esc(r.name)}</div><div class="rk">${f.rank.icon || ''} ${esc(f.rank.title || '')}</div></div></div>
    <div class="line">${esc(f.rank.line || '')}</div>
    <div class="nums"><span class="ok">✓ ${r.correct}</span><span class="no">✗ ${r.wrong ?? 0}</span>${r.timeout ? `<span class="to">⌛ ${r.timeout}</span>` : ''}<span class="acc">${r.accuracy}%</span></div>
    ${f.strengths.length ? `<h4 class="g">💪 Strengths</h4><ul>${li(f.strengths)}</ul>` : ''}
    ${f.weaknesses.length ? `<h4 class="w">🎯 Needs work</h4><ul>${li(f.weaknesses)}</ul>` : ''}
    ${f.tips.length ? `<h4 class="t">📖 How to improve</h4><ul class="tip">${li(f.tips)}</ul>` : ''}
  </div>`;
}
function zoomCard(i) {
  const z = $('cardZoom');
  if (i == null || !finalCards.length) return z.classList.add('hidden');
  i = (i + finalCards.length) % finalCards.length; z.dataset.i = i;
  z.innerHTML = cardHTML(finalCards[i]) + `<button class="btn ghost nav l">‹</button><button class="btn ghost nav r">›</button><button class="btn small close">✕ Close</button>`;
  z.classList.remove('hidden');
  z.querySelector('.l').onclick = e => { e.stopPropagation(); zoomCard(i - 1); };
  z.querySelector('.r').onclick = e => { e.stopPropagation(); zoomCard(i + 1); };
  z.querySelector('.close').onclick = () => zoomCard(null);
  z.onclick = e => { if (e.target === z) zoomCard(null); };
}
addEventListener('keydown', e => {
  if ($('cardZoom').classList.contains('hidden')) return;
  const i = +$('cardZoom').dataset.i;
  if (e.key === 'ArrowRight') zoomCard(i + 1); else if (e.key === 'ArrowLeft') zoomCard(i - 1); else if (e.key === 'Escape') zoomCard(null);
});
function showFinal(win, ranking, team) {
  const s = game.stats;
  team = team || { accuracy: Math.round(game.teamAcc()), correct: s.correct, total: s.correct + s.wrong, pass: 80 };
  $('ftitle').textContent = win ? '👑 Exam passed — the castle stands!' : '💔 The castle fell…';
  $('ftitle').className = win ? '' : 'fail';
  $('fsub').textContent = win ? 'The princess is safe. Well done, heroes!' : `The academy needs ${team.pass}% to pass. Read your card, study your weak spots and try again!`;
  const col = team.accuracy >= team.pass ? '#3f9b4a' : '#c0503a';
  $('verdict').innerHTML = `<b style="font-size:22px">Team accuracy: <span style="color:${col}">${team.accuracy}%</span></b><div class="vbar"><i style="width:${Math.min(100, team.accuracy)}%;background:${col}"></i><em></em></div><span>${win ? '✅ PASSED' : '❌ NOT PASSED'} (${team.pass}% needed)</span>`;
  const passN = ranking.filter(r => r.feedback && r.feedback.passed).length;
  $('tstats').innerHTML = `<div><b>${team.correct}/${team.total}</b>correct answers</div><div><b>${passN}/${ranking.length}</b>students at 80%+</div><div><b>${s.golden}</b>golden answers</div><div><b>${s.kills}</b>monsters defeated</div>`;
  finalCards = ranking;
  $('cards').innerHTML = ranking.map(cardHTML).join('');
  [...$('cards').children].forEach((c, i) => c.onclick = () => zoomCard(i));
  setTimeout(() => { $('final').classList.remove('hidden'); $('hud').classList.add('hidden'); }, win ? 3500 : 4500);
}
$('againBtn').onclick = () => { zoomCard(null); send({ t: 'lobby' }); showLobby(); };
function setPause(on) {
  if (game.phase !== 'playing') return;
  state.paused = on; $('pauseO').classList.toggle('hidden', !on); send({ t: 'pause', on });
}
$('pauseBtn').onclick = () => setPause(true);
$('resumeBtn').onclick = () => setPause(false);
$('skipBtn').onclick = () => { setPause(false); game.nextWave(); };
$('endBtn').onclick = () => { setPause(false); endBattle(game.passed()); };
addEventListener('keydown', e => { if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { if (game && game.phase === 'playing') setPause(!state.paused); } });

// ---------- Red ----------
let ws, backoff = 500;
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { backoff = 500; send({ t: 'host', code: ss.get('cq_host_code'), key: ss.get('cq_host_key') }); };
  ws.onclose = () => setTimeout(connect, backoff = Math.min(backoff * 1.6, 5000));
  ws.onmessage = e => onMsg(JSON.parse(e.data));
  setInterval(() => send({ t: 'ping' }), 20000);
}
function onMsg(m) {
  if (m.t === 'room') {
    state.code = m.code; ss.set('cq_host_code', m.code); ss.set('cq_host_key', m.key);
    const url = `${location.origin}/play?code=${m.code}`;
    $('code').textContent = m.code; $('code2').textContent = m.code; $('url').textContent = `${location.host}/play`;
    $('qr').src = '/qr.svg?text=' + encodeURIComponent(url); $('qr2').src = $('qr').src;
    for (const p of m.players) { state.players.set(p.id, p); game.addPlayer(p); }
    renderPlayers();
    return;
  }
  if (m.t === 'player_join' || m.t === 'player_update') { state.players.set(m.p.id, m.p); game.addPlayer(m.p); renderPlayers(); if (m.t === 'player_join' && game.phase === 'playing') hud.feed(`🛡️ <b>${esc(m.p.name)}</b> joined the defense!`, 'good'); return; }
  if (m.t === 'player_leave') { state.players.delete(m.pid); game.removePlayer(m.pid); renderPlayers(); return; }
  if (m.t === 'q_spawn') return game.onQuestion(m);
  if (m.t === 'q_result') return game.onResult(m);
  if (m.t === 'upgrade') return game.onUpgrade(m);
  if (m.t === 'final') return showFinal(m.win, m.ranking, m.team);
}

// ---------- Cámara y bucle ----------
const clock = new THREE.Clock();
const GAME_CAM = new THREE.Vector3(-21, 40, 52), GAME_LOOK = new THREE.Vector3(1, 0, 7);
const camPos = GAME_CAM.clone(), camLook = GAME_LOOK.clone();
let orbit = 0, fpsN = 0, fpsT = 0;
let camOverride = params.get('cam') && params.get('cam').split(',').map(Number);
window.__cam = v => camOverride = v;
function updateCamera(dt) {
  if (camOverride) { camera.position.set(camOverride[0], camOverride[1], camOverride[2]); camera.lookAt(camOverride[3], camOverride[4], camOverride[5]); return; }
  const want = new THREE.Vector3(), look = new THREE.Vector3(0, 2, 0);
  if (!game || game.phase === 'lobby') {
    orbit += dt * 0.08;
    const n = game ? game.players.size : 0, far = n > 20 ? 1.35 : n > 10 ? 1.15 : 1;
    const a = Math.sin(orbit) * 0.35 - 0.1;
    want.set(Math.sin(a) * 24 * far + 2, 10 + 3 * far, Math.cos(a) * 24 * far + 21); look.set(1, 3.5, 14);
  } else if (game.focus && game.focus.t > 0) {
    game.focus.t -= dt;
    const p = game.focus.target.position;
    // mismo ángulo que la cámara normal, solo que más cerca del objetivo (nunca da la vuelta)
    const dir = GAME_CAM.clone().sub(GAME_LOOK).normalize();
    const dist = 64 * (0.42 + 0.25 * (game.focus.zoom ?? 0.35));
    want.copy(p).addScaledVector(dir, dist); look.copy(p).setY(p.y + 2);
  } else {
    const t = clock.elapsedTime;
    want.copy(GAME_CAM).add(new THREE.Vector3(Math.sin(t * 0.07) * 3, 0, Math.cos(t * 0.05) * 2)); look.copy(GAME_LOOK);
  }
  camPos.lerp(want, Math.min(1, dt * 1.5)); camLook.lerp(look, Math.min(1, dt * 2));
  camera.position.copy(camPos);
  if (game && game.shake > 0) { game.shake = Math.max(0, game.shake - dt * 1.8); const s = game.shake * 0.6; camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s)); }
  camera.lookAt(camLook);
}
// calidad adaptativa: si el PC del salón va lento, bajamos resolución y sombras
let slowSecs = 0;
function adaptQuality(fps) {
  if (params.has('lite') || params.has('hq')) return;
  slowSecs = fps < 28 ? slowSecs + 1 : 0;
  if (slowSecs >= 4) {
    slowSecs = 0;
    if (pixelRatio > 0.8) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); console.log('[quality] pixelRatio', pixelRatio); }
    else if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); console.log('[quality] shadows off'); }
    else if (game && (game.horde.quality ?? 1) > 0.4) { game.horde.quality = (game.horde.quality ?? 1) - 0.2; console.log('[quality] horde', game.horde.quality); }
  }
}
// avanza todo el mundo un paso (juego, partículas, ambiente, efectos de tensión)
let heartT = 0, drumT = 0;
function stepWorld(dt) {
  // cámara lenta cuando cae el jefe
  let gdt = dt;
  if (game.slowmo > 0) { game.slowmo -= dt; gdt = dt * 0.28; }
  game.update(gdt); fx.update(gdt);
  for (const c of sceneryRefs.clouds) { c.position.x += dt * 1.2; if (c.position.x > 160) c.position.x = -160; }
  if (groundRefs) { groundRefs.wtex.offset.x -= dt * 0.08; }
  // del atardecer a la noche, con tormenta al final
  if (game.phase === 'lobby') { atmo.target = 0.12; atmo.stormTarget = 0; }
  else if (game.phase === 'playing') {
    const p = game.wave >= 6 ? 1 : (game.wave + Math.min(1, game.waveT / game.waveLen)) / 6 * 0.92;
    atmo.target = Math.max(atmo.target, p); atmo.stormTarget = game.wave >= 6 ? 1 : game.wave >= 4 ? 0.6 : 0;
  }
  atmo.update(dt, game); game.night = atmo.night;
  // tensión: viñeta roja y latido cuando el castillo está por caer
  const k = game.hp / game.maxHp, vig = $('vig');
  if (game.phase === 'playing' && k < 0.35) {
    vig.style.opacity = ((0.35 - k) / 0.35 * 0.75 + 0.15) * (0.8 + 0.2 * Math.sin(performance.now() / 160));
    if (k < 0.25 && (heartT -= dt) <= 0) { heartT = 0.95; S.sfx('heart'); }
  } else vig.style.opacity = 0;
  // tambores de guerra de la horda
  if (game.phase === 'playing' && (drumT -= dt) <= 0) { drumT = game.wave >= 6 ? 0.9 : 1.8; S.sfx('drum', 0.35 + 0.1 * Math.min(6, game.wave) / 6); }
}
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  fpsN++; fpsT += dt; if (fpsT > 1) { window.__fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; adaptQuality(window.__fps); }
  if (game && !state.paused) stepWorld(dt);
  updateCamera(dt);
  if (fx) fx.setScale(camera, renderer.domElement.height);
  renderer.render(scene, camera); labels.render(scene, camera);
}
boot().then(loop);
