import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { logger } from './logger.js';
import { subscribeUser } from './services/userEvents.js';

// Attach a WebSocket server to the HTTP server for live per-user account
// updates. Browsers can't set Authorization headers on a WebSocket handshake,
// so the JWT is passed as a `token` query parameter and verified here.
export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    let userId;
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      userId = jwt.verify(token, config.JWT_SECRET).sub;
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Forward this user's account events to the socket.
    const unsubscribe = subscribeUser(userId, (event) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
    });

    ws.send(JSON.stringify({ type: 'connected' }));

    // Liveness: terminate sockets that stop responding to pings.
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('close', unsubscribe);
    ws.on('error', unsubscribe);
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  heartbeat.unref?.();

  wss.on('close', () => clearInterval(heartbeat));
  logger.info('WebSocket server attached', { path: '/ws' });
  return wss;
}
