// Castle Quest — servidor: sirve la web, maneja salas y el banco de preguntas.
// Las respuestas correctas nunca salen del servidor hasta que el estudiante responde.
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const UPGRADES = require('./public/shared/upgrades.js');
const FEEDBACK = require('./public/shared/feedback.js');

// Los modelos 3D vienen comprimidos en assets.zip (así el repositorio tiene pocos archivos).
// Al arrancar, si falta la carpeta public/assets, se descomprime automáticamente.
(function ensureAssets() {
  const dir = path.join(__dirname, 'public', 'assets'), zip = path.join(__dirname, 'assets.zip');
  const marker = path.join(dir, 'kn', 'siege-ballista.glb'); // cambia cuando hay assets nuevos
  if (fs.existsSync(marker) || !fs.existsSync(zip)) return;
  console.log('Descomprimiendo assets.zip…');
  new (require('adm-zip'))(zip).extractAllTo(path.join(__dirname, 'public'), true);
})();

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three'), { maxAge: '7d' }));
app.get('/qr.svg', async (req, res) => {
  try {
    const svg = await QRCode.toString(String(req.query.text || ''), { type: 'svg', margin: 1, color: { dark: '#2a1a0a', light: '#fff8e7' } });
    res.type('image/svg+xml').send(svg);
  } catch (e) { res.status(400).end(); }
});
app.get('/health', (_, res) => res.send('ok'));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public/host.html')));
app.get('/play', (_, res) => res.sendFile(path.join(__dirname, 'public/phone.html')));
app.get('/j/:code', (req, res) => res.redirect('/play?code=' + encodeURIComponent(req.params.code)));

// ---------- Banco de preguntas ----------
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const BANK = {};
for (const lv of LEVELS) {
  const f = path.join(__dirname, 'questions', lv + '.json');
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  BANK[lv] = {
    normal: data.questions.map((q, i) => ({ ...q, id: lv + '-' + i, level: lv })),
    golden: data.golden.map((q, i) => ({ ...q, id: lv + '-g' + i, level: lv, golden: true })),
    parts: data.parts || {},
  };
  console.log(`Banco ${lv}: ${BANK[lv].normal.length} normales, ${BANK[lv].golden.length} doradas`);
}
function poolFor(level, golden) {
  const lvls = level === 'MIX' ? LEVELS : [level];
  return lvls.flatMap(l => golden ? BANK[l].golden : BANK[l].normal);
}
function partInfo(q) { return (BANK[q.level].parts[q.part]) || { name: q.part, m: 1 }; }
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = s => String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/[.!?,;:"]/g, '').replace(/\s+/g, ' ').trim();

// ---------- Salas ----------
const rooms = new Map();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() { let c; do { c = Array.from({ length: 4 }, () => LETTERS[Math.random() * LETTERS.length | 0]).join(''); } while (rooms.has(c)); return c; }
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const toHost = (room, msg) => send(room.host, msg);
const rid = () => Math.random().toString(36).slice(2, 10);

function publicPlayer(p) { return { id: p.id, name: p.name, char: p.char, online: !!(p.ws && p.ws.readyState === 1) }; }

function createRoom(ws) {
  const room = { code: newCode(), key: rid(), host: ws, players: new Map(), state: 'lobby', cfg: null, paused: false, created: Date.now(), lastSeen: Date.now() };
  rooms.set(room.code, room);
  return room;
}

function resetPlayerStats(p) {
  p.stats = { correct: 0, wrong: 0, timeout: 0, golden: 0, goldenOk: 0, points: 0, streak: 0, best: 0, parts: {}, times: [], ratios: [] };
  p.deck = []; p.gdeck = []; p.sinceGolden = 0; p.q = null; clearTimeout(p.timer); clearTimeout(p.nextTimer);
}

function nextQuestion(room, p) {
  clearTimeout(p.nextTimer); clearTimeout(p.timer);
  if (room.state !== 'playing' || !p.ws || p.ws.readyState !== 1) { p.q = null; return; }
  if (room.paused) { p.waiting = true; return; }
  const cfg = room.cfg;
  p.sinceGolden++;
  const golden = cfg.golden && ((p.sinceGolden >= 6 && Math.random() < 0.16) || (process.env.DEV && p.name.startsWith('Gold') && p.sinceGolden >= 2));
  let q;
  if (golden) {
    if (!p.gdeck.length) p.gdeck = shuffle(poolFor(cfg.level, true).slice());
    q = p.gdeck.pop(); p.sinceGolden = 0;
  } else {
    if (!p.deck.length) p.deck = shuffle(poolFor(cfg.level, false).slice());
    q = p.deck.pop();
  }
  const info = partInfo(q);
  const time = Math.round(cfg.timeBase * (info.m || 1) * (golden ? 2.2 : 1));
  let options = null, correctText = q.golden ? q.a[0] : q.o[q.a];
  if (!golden) {
    const idx = shuffle(q.o.map((_, i) => i));
    options = idx.map(i => q.o[i]);
    q._order = idx;
  }
  p.q = { q, golden, started: Date.now(), time, options, correctText, qid: rid() };
  send(p.ws, { t: 'question', qid: p.q.qid, golden, part: info.name, partKey: q.part, prompt: q.q, text: q.t || null, options, time, level: q.level });
  toHost(room, { t: 'q_spawn', pid: p.id, qid: p.q.qid, time, golden });
  p.timer = setTimeout(() => resolve(room, p, null, true), time * 1000 + 600);
}

function resolve(room, p, answer, timedOut, forced) {
  const cur = p.q; if (!cur) return;
  clearTimeout(p.timer); p.q = null;
  const { q, golden } = cur;
  let ok = false;
  if (forced != null) ok = forced;
  else if (!timedOut) {
    if (golden) ok = q.a.some(a => norm(a) === norm(answer));
    else ok = Number.isInteger(answer) && cur.options && cur.options[answer] === q.o[q.a];
  }
  const st = p.stats; const part = q.part;
  st.parts[part] ||= { key: part, name: partInfo(q).name, ok: 0, n: 0 };
  st.parts[part].n++;
  const elapsed = (Date.now() - cur.started) / 1000;
  if (!timedOut && forced == null) st.ratios.push(Math.min(1, elapsed / cur.time));
  let pts = 0;
  if (ok) {
    st.correct++; st.parts[part].ok++; st.streak++; st.best = Math.max(st.best, st.streak);
    const lvlMult = { A1: 1, A2: 1.2, B1: 1.4, B2: 1.7, C1: 2, MIX: 1.5 }[room.cfg.level];
    const speed = Math.max(0, 1 - elapsed / cur.time);
    pts = Math.round((golden ? 300 : 100) * lvlMult * (1 + speed * 0.5) + Math.min(st.streak, 10) * 10);
    st.points += pts; st.times.push(elapsed);
    if (golden) st.goldenOk++;
  } else {
    st.streak = 0; if (timedOut) st.timeout++; else st.wrong++;
  }
  if (golden) st.golden++;
  const upgrades = ok && golden ? shuffle(Object.keys(UPGRADES.list).filter(k => {
    const U = UPGRADES.list[k], lvl = (room.ups && room.ups[k]) || 0;
    if (k === 'blessing') return true;
    return lvl < (U.max || (U.rare ? 2 : 3)) && (!U.rare || Math.random() < 0.5);
  })).slice(0, 3) : null;
  p.pendingUpgrades = upgrades;
  send(p.ws, { t: 'result', qid: cur.qid, correct: ok, timedOut: !!timedOut, answer: cur.correctText, explain: q.x || null, points: pts, total: st.points, streak: st.streak, upgrades });
  toHost(room, { t: 'q_result', pid: p.id, qid: cur.qid, correct: ok, golden, timedOut: !!timedOut, streak: st.streak, points: st.points });
  if (!upgrades) p.nextTimer = setTimeout(() => nextQuestion(room, p), ok ? 1400 : 3200);
  else p.nextTimer = setTimeout(() => pickUpgrade(room, p, upgrades[0]), 15000);
}

function pickUpgrade(room, p, id) {
  if (!p.pendingUpgrades || !p.pendingUpgrades.includes(id)) return;
  p.pendingUpgrades = null; clearTimeout(p.nextTimer);
  room.ups = room.ups || {}; room.ups[id] = (room.ups[id] || 0) + 1;
  toHost(room, { t: 'upgrade', pid: p.id, id });
  send(p.ws, { t: 'upgrade_ok', id });
  p.nextTimer = setTimeout(() => nextQuestion(room, p), 900);
}

function report(room, p) {
  const st = p.stats; const n = st.correct + st.wrong + st.timeout;
  const timeRatio = st.ratios.length ? st.ratios.reduce((a, b) => a + b, 0) / st.ratios.length : null;
  const parts = Object.values(st.parts);
  const r = {
    name: p.name, char: p.char, level: room.cfg.level, points: st.points, correct: st.correct, wrong: st.wrong, timeout: st.timeout, total: n,
    accuracy: n ? Math.round(st.correct / n * 100) : 0, best: st.best, golden: st.golden, goldenOk: st.goldenOk,
    avgTime: st.times.length ? +(st.times.reduce((a, b) => a + b, 0) / st.times.length).toFixed(1) : null,
    timeRatio, parts,
  };
  r.feedback = FEEDBACK.build(r);
  return r;
}

function endGame(room, win) {
  if (room.state !== 'playing') return;
  room.state = 'ended';
  const all = []; let ok = 0, tot = 0;
  for (const p of room.players.values()) {
    clearTimeout(p.timer); clearTimeout(p.nextTimer); p.q = null; p.pendingUpgrades = null;
    const r = report(room, p); all.push({ id: p.id, ...r }); ok += r.correct; tot += r.total;
  }
  // Regla de la academia: el examen se aprueba con 80% de precisión del equipo.
  const teamAcc = tot ? Math.round(ok / tot * 100) : 0;
  if (typeof win !== 'boolean') win = tot > 0 && teamAcc >= FEEDBACK.PASS;
  room.lastWin = !!win;
  all.sort((a, b) => b.points - a.points);
  const team = { accuracy: teamAcc, correct: ok, total: tot, pass: FEEDBACK.PASS };
  all.forEach((r, i) => { r.rank = i + 1; const p = room.players.get(r.id); send(p.ws, { t: 'final', win, report: r, players: all.length, team }); });
  toHost(room, { t: 'final', win, ranking: all, team });
}

// ---------- Tabla global (Supabase vía servidor; si no hay Supabase, archivo local) ----------
// El celular solo manda su código de sala + id; el servidor envía el puntaje real (no se puede hacer trampa).
const SB_URL = process.env.SUPABASE_URL, SB_KEY = process.env.SUPABASE_KEY, SB_TABLE = process.env.SUPABASE_TABLE || 'castle_scores';
const LOCAL_SCORES = path.join(__dirname, 'scores.json');
const sbHeaders = () => ({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' });
async function saveScore(row) {
  if (SB_URL && SB_KEY) {
    const r = await fetch(`${SB_URL}/rest/v1/${SB_TABLE}`, { method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) throw new Error('supabase ' + r.status + ' ' + await r.text());
  } else {
    let all = []; try { all = JSON.parse(fs.readFileSync(LOCAL_SCORES, 'utf8')); } catch { }
    all.push({ ...row, created_at: new Date().toISOString() }); fs.writeFileSync(LOCAL_SCORES, JSON.stringify(all.slice(-5000)));
  }
}
async function topScores(level, limit = 10) {
  if (SB_URL && SB_KEY) {
    const r = await fetch(`${SB_URL}/rest/v1/${SB_TABLE}?select=name,char,level,points,accuracy,correct,total,win&level=eq.${encodeURIComponent(level)}&order=points.desc&limit=${limit}`, { headers: sbHeaders() });
    if (!r.ok) throw new Error('supabase ' + r.status);
    return r.json();
  }
  let all = []; try { all = JSON.parse(fs.readFileSync(LOCAL_SCORES, 'utf8')); } catch { }
  return all.filter(s => s.level === level).sort((a, b) => b.points - a.points).slice(0, limit);
}
app.use(express.json({ limit: '4kb' }));
app.post('/api/submit', async (req, res) => {
  const room = rooms.get(String(req.body.code || '').toUpperCase());
  const p = room && room.players.get(req.body.pid);
  if (!p || !room.cfg || room.state !== 'ended') return res.status(400).json({ ok: false, msg: 'Game not found' });
  if (p.submitted) return res.json({ ok: true, already: true });
  const r = report(room, p);
  if (!r.total) return res.status(400).json({ ok: false, msg: 'No answers' });
  try {
    await saveScore({ name: r.name, char: r.char, level: r.level, points: r.points, accuracy: r.accuracy, correct: r.correct, total: r.total, win: !!room.lastWin });
    p.submitted = true; res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, msg: 'Could not save' }); }
});
app.get('/api/top', async (req, res) => {
  const level = [...LEVELS, 'MIX'].includes(req.query.level) ? req.query.level : 'A1';
  try { res.json(await topScores(level, Math.min(20, +req.query.limit || 10))); } catch (e) { console.error(e); res.json([]); }
});

// ---------- WebSocket ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    try { handle(ws, m); } catch (e) { console.error('handle error', e); }
  });
  ws.on('close', () => {
    const room = ws.room; if (!room) return;
    if (ws.role === 'host') { if (room.host === ws) room.host = null; room.lastSeen = Date.now(); }
    else if (ws.player) {
      const p = ws.player;
      if (p.ws === ws) {
        p.ws = null; clearTimeout(p.timer); clearTimeout(p.nextTimer);
        if (p.q) { toHost(room, { t: 'q_result', pid: p.id, qid: p.q.qid, correct: false, timedOut: true, silent: true }); p.q = null; }
        toHost(room, { t: 'player_update', p: publicPlayer(p) });
        if (room.state === 'lobby') setTimeout(() => { if (!p.ws && room.state === 'lobby') { room.players.delete(p.id); toHost(room, { t: 'player_leave', pid: p.id }); } }, 20000);
      }
    }
  });
});

function handle(ws, m) {
  if (m.t === 'ping') return send(ws, { t: 'pong' });
  if (m.t === 'host') {
    let room = m.code && rooms.get(m.code);
    if (room && room.key === m.key) { if (room.host && room.host !== ws) try { room.host.close(); } catch { } room.host = ws; }
    else room = createRoom(ws);
    ws.room = room; ws.role = 'host';
    send(ws, { t: 'room', code: room.code, key: room.key, state: room.state, players: [...room.players.values()].map(publicPlayer) });
    return;
  }
  if (m.t === 'join') {
    const code = String(m.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return send(ws, { t: 'error', msg: 'No existe una sala con ese código.' });
    let p = m.pid && room.players.get(m.pid);
    if (!p) {
      if (room.players.size >= 40) return send(ws, { t: 'error', msg: 'La sala está llena.' });
      const name = String(m.name || '').replace(/[<>]/g, '').trim().slice(0, 14) || 'Player';
      p = { id: rid(), name, char: m.char || 'Knight', ws: null };
      resetPlayerStats(p); room.players.set(p.id, p);
      if (room.state === 'playing') p.lateJoin = true;
    } else if (p.ws && p.ws !== ws) { try { p.ws.close(); } catch { } }
    p.ws = ws; ws.room = room; ws.role = 'phone'; ws.player = p;
    send(ws, { t: 'joined', pid: p.id, name: p.name, char: p.char, state: room.state, level: room.cfg && room.cfg.level });
    toHost(room, { t: 'player_join', p: publicPlayer(p) });
    if (room.state === 'playing') setTimeout(() => nextQuestion(room, p), 800);
    if (room.state === 'ended') send(ws, { t: 'final', report: report(room, p), players: room.players.size });
    return;
  }
  const room = ws.room; if (!room) return;
  if (ws.role === 'phone') {
    const p = ws.player;
    if (m.t === 'setChar' && room.state === 'lobby') { p.char = String(m.char).slice(0, 20); toHost(room, { t: 'player_update', p: publicPlayer(p) }); }
    if (m.t === 'answer' && p.q && p.q.qid === m.qid) resolve(room, p, p.q.golden ? String(m.text || '').slice(0, 80) : m.choice, false, process.env.DEV && m.cheat != null ? !!m.cheat : null);
    if (m.t === 'pick') pickUpgrade(room, p, m.id);
    if (m.t === 'react' && room.state !== 'playing') toHost(room, { t: 'react', pid: p.id, e: String(m.e).slice(0, 4) });
    return;
  }
  if (ws.role === 'host' && room.host === ws) {
    if (m.t === 'start') {
      const level = [...LEVELS, 'MIX'].includes(m.level) ? m.level : 'A2';
      room.cfg = { level, timeBase: Math.max(8, Math.min(60, +m.timeBase || 20)), golden: m.golden !== false };
      room.state = 'playing'; room.paused = false; room.ups = {};
      for (const p of room.players.values()) { resetPlayerStats(p); send(p.ws, { t: 'start', level }); }
      let i = 0; for (const p of room.players.values()) setTimeout(() => nextQuestion(room, p), 2500 + (i++) * 350);
    }
    if (m.t === 'pause') {
      room.paused = !!m.on;
      for (const p of room.players.values()) {
        send(p.ws, { t: 'pause', on: room.paused });
        if (room.paused && p.q) { clearTimeout(p.timer); p.q.remaining = p.q.time * 1000 + 600 - (Date.now() - p.q.started); }
        if (!room.paused && p.q && p.q.remaining != null) { p.q.started = Date.now() - (p.q.time * 1000 + 600 - p.q.remaining); const pp = p; p.timer = setTimeout(() => resolve(room, pp, null, true), p.q.remaining); p.q.remaining = null; }
        if (!room.paused && p.waiting) { p.waiting = false; nextQuestion(room, p); }
      }
    }
    if (m.t === 'end') endGame(room, !!m.win);
    if (m.t === 'lobby') {
      room.state = 'lobby';
      for (const p of room.players.values()) { resetPlayerStats(p); send(p.ws, { t: 'lobby' }); }
      for (const [id, p] of room.players) if (!p.ws) { room.players.delete(id); toHost(room, { t: 'player_leave', pid: id }); }
    }
    if (m.t === 'kick') { const p = room.players.get(m.pid); if (p) { send(p.ws, { t: 'kicked' }); room.players.delete(m.pid); toHost(room, { t: 'player_leave', pid: m.pid }); } }
    if (m.t === 'buzz') for (const p of room.players.values()) send(p.ws, { t: 'buzz', kind: String(m.kind || '') });
  }
}

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch { } });
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = room.host || [...room.players.values()].some(p => p.ws);
    if (anyone) room.lastSeen = now;
    else if (now - room.lastSeen > 30 * 60 * 1000) rooms.delete(code);
  }
}, 25000);

server.listen(PORT, () => console.log('Castle Quest en http://localhost:' + PORT));
