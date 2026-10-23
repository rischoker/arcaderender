// ScriptBoard Karaoke — servidor de salas.
// La extensión (el tablero) crea una sala; los celulares entran con el código o el QR
// y le envían lo que reconocen de su voz. El servidor solo reenvía mensajes.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const rooms = new Map(); // code -> { host, players: Map(id -> {ws, name, color}), created, hostLeftAt }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const newCode = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
};
const newId = () => Math.random().toString(36).slice(2, 9);
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.role = null; ws.room = null; ws.pid = null;

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;

    // ---- Tablero (extensión) ----
    if (m.t === 'host') {
      let code = clean(m.room, 4).toUpperCase();
      let room = code && rooms.get(code);
      if (room && room.secret && room.secret !== m.secret) room = null; // no robar salas ajenas
      if (!room) {
        code = newCode();
        room = { host: null, players: new Map(), created: Date.now(), secret: clean(m.secret, 40) || newId() };
        rooms.set(code, room);
      }
      if (room.host && room.host !== ws) try { room.host.close(); } catch (e) { /* ignore */ }
      room.host = ws; room.hostLeftAt = 0;
      ws.role = 'host'; ws.room = code;
      send(ws, { t: 'room', room: code, secret: room.secret, players: [...room.players].map(([id, p]) => ({ id, name: p.name, color: p.color, online: p.ws.readyState === 1 })) });
      for (const p of room.players.values()) send(p.ws, { t: 'hostOnline', on: true });
      return;
    }
    if (ws.role === 'host') {
      const room = rooms.get(ws.room); if (!room) return;
      if (m.t === 'state') { for (const p of room.players.values()) send(p.ws, { t: 'state', s: m.s }); return; }
      if (m.t === 'to' && m.id) { const p = room.players.get(m.id); if (p) send(p.ws, m.msg); return; }
      if (m.t === 'kick' && m.id) { const p = room.players.get(m.id); if (p) { send(p.ws, { t: 'kicked' }); room.players.delete(m.id); try { p.ws.close(); } catch (e) { /* ignore */ } } return; }
      return;
    }

    // ---- Celulares ----
    if (m.t === 'join') {
      const code = clean(m.room, 4).toUpperCase();
      const room = rooms.get(code);
      if (!room) { send(ws, { t: 'error', msg: 'room' }); return; }
      let id = clean(m.id, 12);
      const name = clean(m.name, 18) || 'Player';
      const color = /^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : '#ff7a45';
      if (id && room.players.has(id)) { // reconexión
        const p = room.players.get(id);
        if (p.ws !== ws) try { p.ws.close(); } catch (e) { /* ignore */ }
        p.ws = ws; p.name = name; p.color = color;
      } else {
        if (room.players.size >= 30) { send(ws, { t: 'error', msg: 'full' }); return; }
        id = newId();
        room.players.set(id, { ws, name, color });
      }
      ws.role = 'player'; ws.room = code; ws.pid = id;
      send(ws, { t: 'joined', id, room: code, hostOnline: !!(room.host && room.host.readyState === 1) });
      send(room.host, { t: 'player', id, name, color, online: true });
      return;
    }
    if (ws.role === 'player') {
      const room = rooms.get(ws.room); if (!room) return;
      if (m.t === 'speech') send(room.host, { t: 'speech', id: ws.pid, text: clean(m.text, 400), final: !!m.final, at: Date.now() });
      else if (m.t === 'mic') send(room.host, { t: 'mic', id: ws.pid, on: !!m.on, err: clean(m.err, 60) });
    }
  });

  ws.on('close', () => {
    const room = ws.room && rooms.get(ws.room);
    if (!room) return;
    if (ws.role === 'host' && room.host === ws) {
      room.host = null; room.hostLeftAt = Date.now();
      for (const p of room.players.values()) send(p.ws, { t: 'hostOnline', on: false });
    } else if (ws.role === 'player') {
      const p = room.players.get(ws.pid);
      if (p && p.ws === ws) send(room.host, { t: 'player', id: ws.pid, name: p.name, color: p.color, online: false });
    }
  });
});

// Mantener viva la conexión (los proxies cortan conexiones calladas) y limpiar salas viejas.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* ignore */ }
  }
  const now = Date.now();
  for (const [code, room] of rooms) {
    const hostGone = !room.host && room.hostLeftAt && now - room.hostLeftAt > 30 * 60 * 1000;
    const tooOld = now - room.created > 12 * 60 * 60 * 1000;
    if (hostGone || tooOld) {
      for (const p of room.players.values()) { send(p.ws, { t: 'closed' }); try { p.ws.close(); } catch (e) { /* ignore */ } }
      rooms.delete(code);
    }
  }
}, 25000);

server.listen(PORT, () => console.log('ScriptBoard Karaoke escuchando en el puerto ' + PORT));
