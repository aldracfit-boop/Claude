// Serveur Tour de Force : fichiers statiques + WebSocket (parties en ligne) + classement.
// Usage : npm start  (PORT=3000 par défaut)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';
import { Leaderboard } from './leaderboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIRS = ['client', 'shared'];
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const leaderboard = new Leaderboard(path.join(__dirname, 'data', 'leaderboard.json'));
const rooms = new RoomManager({ leaderboard, log });

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (urlPath === '/' || urlPath === '/index.html') {
    const search = new URL(req.url, 'http://x').search;
    res.writeHead(302, { Location: `/client/${search}` });
    res.end();
    return;
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.resolve(ROOT, '.' + urlPath);
  const allowed = PUBLIC_DIRS.some((d) => file.startsWith(path.join(ROOT, d) + path.sep));
  if (!allowed) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  if (req.url.startsWith('/api/leaderboard')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(leaderboard.top(20)));
    return;
  }
  if (req.url.startsWith('/api/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.rooms.size }));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });

wss.on('connection', (ws) => {
  const conn = {
    ws,
    room: null,
    tokens: 60,
    last: Date.now(),
    send(obj) {
      if (ws.readyState === 1) ws.send(JSON.stringify(obj));
    },
    sendRaw(data) {
      // on évite d'accumuler des instantanés pour un client trop lent
      if (ws.readyState === 1 && ws.bufferedAmount < 2_000_000) ws.send(data);
    },
    error(m) {
      this.send({ t: 'error', m });
    },
  };
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (data) => {
    // limitation de débit : 60 messages max, recharge de 40/s
    const now = Date.now();
    conn.tokens = Math.min(60, conn.tokens + ((now - conn.last) / 1000) * 40);
    conn.last = now;
    if (conn.tokens < 1) return;
    conn.tokens--;
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    try {
      switch (msg.t) {
        case 'create':
          rooms.create(conn, msg.name, msg.perks);
          break;
        case 'join':
          rooms.join(conn, msg.code, msg.name, msg.perks);
          break;
        case 'rejoin':
          rooms.rejoin(conn, msg.code, msg.token);
          break;
        default:
          if (conn.room) conn.room.handle(conn, msg);
      }
    } catch (err) {
      log('erreur de message', err);
      conn.error('Erreur serveur.');
    }
  });
  ws.on('close', () => {
    if (conn.room) conn.room.leave(conn);
  });
});

// détection des connexions mortes
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, HOST, () => {
  log(`Tour de Force — serveur prêt sur http://localhost:${PORT}`);
});

export { server, wss, rooms };
