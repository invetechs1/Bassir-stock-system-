import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { app, newUser, auth } from './helpers.js';
import { attachWebSocket } from '../src/ws.js';
import { subscribeUser } from '../src/services/userEvents.js';
import { processPendingOrders } from '../src/services/orderService.js';

let server;
let port;

beforeAll(async () => {
  server = app.listen(0);
  attachWebSocket(server);
  await new Promise((r) => server.once('listening', r));
  port = server.address().port;
});

afterAll(() => new Promise((r) => server.close(r)));

function connect(token) {
  const q = token === undefined ? '' : `?token=${token}`;
  return new WebSocket(`ws://127.0.0.1:${port}/ws${q}`);
}

// Resolve with the first message that isn't the initial handshake.
function nextEvent(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for event')), 4000);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connected') return;
      clearTimeout(timer);
      resolve(msg);
    });
  });
}

describe('websocket live updates', () => {
  it('rejects a connection without a valid token', async () => {
    const ws = connect('garbage');
    const code = await new Promise((resolve) => ws.on('close', resolve));
    expect(code).toBe(4001);
  });

  it('pushes a trade event to the acting user', async () => {
    const { token } = await newUser(request);
    const ws = connect(token);
    await new Promise((r) => ws.on('open', r));

    const eventP = nextEvent(ws);
    await request(app)
      .post('/api/portfolio/buy')
      .set('Authorization', auth(token))
      .send({ symbol: 'AAPL', shares: 1 });

    const event = await eventP;
    expect(event.type).toBe('trade');
    ws.close();
  });

  it('notifies the user when a resting order fills server-side', async () => {
    const { token, user } = await newUser(request);
    const price = (await request(app).get('/api/stocks/MSFT')).body.price;

    // Subscribe to the same bus the socket uses (server-driven fills happen on
    // the simulator tick, not in response to a request).
    const events = [];
    const off = subscribeUser(user.id, (e) => events.push(e));

    await request(app)
      .post('/api/orders')
      .set('Authorization', auth(token))
      .send({ side: 'BUY', symbol: 'MSFT', shares: 1, limitPrice: price * 2 });

    processPendingOrders();
    off();

    expect(events.some((e) => e.type === 'orders')).toBe(true);
  });
});
