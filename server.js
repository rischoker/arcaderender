/* =========================================================
   RISCHOKER ARCADE — servidor (Render Web Service)
   - Sirve el hub (index.html, img/, media/) y los juegos estáticos
   - Arranca Castle Quest (que necesita servidor) y le pasa sus rutas
   ========================================================= */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = process.env.PORT || 3000;

/* ---------- Juegos con servidor propio ----------
   Cada uno corre como proceso interno en su puerto y el arcade le reenvía:
   - /<carpeta>/...         → su página principal y archivos
   - rutas absolutas que usa el juego (/play, /ws, /api, ...) */
const APPS = [
  {
    name: 'Castle Quest', dir: 'apps/castlequest', port: 3101, mount: '/castlequest',
    routes: ['/play', '/j/', '/ws', '/api/', '/qr.svg', '/assets/', '/vendor/', '/js/', '/shared/', '/host.html', '/phone.html'],
  },
];

const children = [];
function startApp(a) {
  const dir = path.join(__dirname, a.dir);
  if (!fs.existsSync(path.join(dir, 'server.js'))) { console.warn(`[${a.name}] no está instalado (${a.dir})`); return; }
  const child = spawn(process.execPath, ['server.js'], { cwd: dir, env: { ...process.env, PORT: String(a.port) }, stdio: 'inherit' });
  children.push(child);
  child.on('exit', code => {
    console.warn(`[${a.name}] se detuvo (código ${code}). Reiniciando en 3 s…`);
    setTimeout(() => startApp(a), 3000);
  });
}
APPS.forEach(startApp);

const app = express();
app.disable('x-powered-by');
app.get('/health', (_, res) => res.send('ok'));

// Página amable mientras un juego interno termina de arrancar
const waking = name => `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="2">
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#120b24;color:#ffe08a;font:24px Georgia,serif">
<div style="text-align:center">🏰 ${name} está despertando…<br><small style="opacity:.6">Se recarga solo</small></div></body>`;

const proxies = APPS.map(a => {
  const owns = p => p === a.mount || p.startsWith(a.mount + '/') || a.routes.some(r => r.endsWith('/') ? p.startsWith(r) : (p === r || p.startsWith(r + '?')));
  const proxy = createProxyMiddleware({
    target: `http://127.0.0.1:${a.port}`,
    ws: true,
    pathFilter: (p) => owns(p.split('?')[0]),
    pathRewrite: (p) => p.startsWith(a.mount) ? (p.slice(a.mount.length) || '/') : p,
    on: {
      // Que el navegador siempre revise si hay versión nueva (evita ver el juego viejo tras un deploy)
      proxyRes: (proxyRes) => { proxyRes.headers['cache-control'] = 'no-cache'; },
      error: (err, req, res) => {
        if (res && res.writeHead && !res.headersSent) { res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(waking(a.name)); }
        else if (res && res.destroy) res.destroy();
      },
    },
  });
  app.use(proxy);
  return proxy;
});

// Archivos internos que nunca se deben servir
const PRIVATE = /^\/(apps|node_modules)(\/|$)|^\/(server\.js|build\.sh|package(-lock)?\.json|render\.yaml|README\.md)$/i;
app.use((req, res, next) => PRIVATE.test(decodeURIComponent(req.path)) ? res.status(404).end() : next());

// Hub y juegos estáticos (la raíz del repo)
app.use(express.static(__dirname, { dotfiles: 'ignore',
  extensions: ['html'],
  // no-cache = el navegador revisa con el servidor (respuesta 304 rápida si nada cambió)
  setHeaders: (res) => { res.setHeader('Cache-Control', 'no-cache'); },
}));

const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  for (const p of proxies) { if (p.upgrade) { p.upgrade(req, socket, head); return; } }
  socket.destroy();
});
server.listen(PORT, () => console.log('Rischoker Arcade en http://localhost:' + PORT));

const stop = () => { children.forEach(c => { c.removeAllListeners('exit'); c.kill(); }); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
