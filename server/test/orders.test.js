import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, newUser, auth } from './helpers.js';
import { processPendingOrders } from '../src/services/orderService.js';

// Read the live price of a symbol from the public stocks endpoint.
async function priceOf(symbol) {
  const res = await request(app).get(`/api/stocks/${symbol}`);
  return res.body.price;
}

describe('limit orders', () => {
  let token;
  beforeAll(async () => {
    ({ token } = await newUser(request));
  });

  it('places a pending order', async () => {
    const price = await priceOf('AAPL');
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', auth(token))
      .send({ side: 'BUY', symbol: 'AAPL', shares: 1, limitPrice: price * 0.5 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.side).toBe('BUY');
  });

  it('does not fill a BUY limit set below market', async () => {
    processPendingOrders();
    const list = await request(app)
      .get('/api/orders')
      .set('Authorization', auth(token));
    const order = list.body.find((o) => o.symbol === 'AAPL' && o.side === 'BUY');
    expect(order.status).toBe('PENDING');
  });

  it('fills a triggered BUY limit and updates the portfolio', async () => {
    const price = await priceOf('MSFT');
    const place = await request(app)
      .post('/api/orders')
      .set('Authorization', auth(token))
      // Limit far above market → condition (price <= limit) is satisfied now.
      .send({ side: 'BUY', symbol: 'MSFT', shares: 3, limitPrice: price * 2 });
    expect(place.body.status).toBe('PENDING');

    const filled = processPendingOrders();
    expect(filled).toBeGreaterThanOrEqual(1);

    const orders = await request(app)
      .get('/api/orders')
      .set('Authorization', auth(token));
    const msft = orders.body.find((o) => o.symbol === 'MSFT');
    expect(msft.status).toBe('FILLED');
    expect(msft.fillPrice).toBeGreaterThan(0);

    const portfolio = await request(app)
      .get('/api/portfolio')
      .set('Authorization', auth(token));
    expect(portfolio.body.positions.find((p) => p.symbol === 'MSFT').shares).toBe(3);
  });

  it('fills a triggered SELL limit against held shares', async () => {
    const price = await priceOf('MSFT');
    await request(app)
      .post('/api/orders')
      .set('Authorization', auth(token))
      // Limit below market → SELL condition (price >= limit) satisfied now.
      .send({ side: 'SELL', symbol: 'MSFT', shares: 3, limitPrice: price * 0.5 });

    processPendingOrders();

    const portfolio = await request(app)
      .get('/api/portfolio')
      .set('Authorization', auth(token));
    expect(portfolio.body.positions.find((p) => p.symbol === 'MSFT')).toBeUndefined();
  });

  it('leaves a triggered order pending when the account cannot support it', async () => {
    const price = await priceOf('NVDA');
    const place = await request(app)
      .post('/api/orders')
      .set('Authorization', auth(token))
      // Triggered (limit above market) but far more than the cash balance allows.
      .send({ side: 'BUY', symbol: 'NVDA', shares: 1_000_000, limitPrice: price * 2 });

    processPendingOrders();

    const orders = await request(app)
      .get('/api/orders')
      .set('Authorization', auth(token));
    expect(orders.body.find((o) => o.id === place.body.id).status).toBe('PENDING');
  });

  it('cancels a pending order', async () => {
    const price = await priceOf('TSLA');
    const place = await request(app)
      .post('/api/orders')
      .set('Authorization', auth(token))
      .send({ side: 'BUY', symbol: 'TSLA', shares: 1, limitPrice: price * 0.5 });

    const cancel = await request(app)
      .delete(`/api/orders/${place.body.id}`)
      .set('Authorization', auth(token));
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('CANCELLED');

    // Cancelling again is rejected.
    const again = await request(app)
      .delete(`/api/orders/${place.body.id}`)
      .set('Authorization', auth(token));
    expect(again.status).toBe(400);
  });

  it('fills a triggered STOP-BUY (breakout) order', async () => {
    const price = await priceOf('AMZN');
    const place = await request(app)
      .post('/api/orders')
      .set('Authorization', auth(token))
      // STOP BUY triggers when price >= stop; stop below market → triggered now.
      .send({ side: 'BUY', type: 'STOP', symbol: 'AMZN', shares: 2, limitPrice: price * 0.5 });
    expect(place.body.type).toBe('STOP');

    processPendingOrders();

    const orders = await request(app)
      .get('/api/orders')
      .set('Authorization', auth(token));
    expect(orders.body.find((o) => o.id === place.body.id).status).toBe('FILLED');
  });

  it('does not fill a STOP-SELL until price falls to the stop', async () => {
    // Acquire shares to sell.
    const price = await priceOf('META');
    await request(app)
      .post('/api/portfolio/buy')
      .set('Authorization', auth(token))
      .send({ symbol: 'META', shares: 1 });

    // STOP SELL triggers when price <= stop; stop far below market → not yet.
    const place = await request(app)
      .post('/api/orders')
      .set('Authorization', auth(token))
      .send({ side: 'SELL', type: 'STOP', symbol: 'META', shares: 1, limitPrice: price * 0.01 });

    processPendingOrders();

    const orders = await request(app)
      .get('/api/orders')
      .set('Authorization', auth(token));
    expect(orders.body.find((o) => o.id === place.body.id).status).toBe('PENDING');
  });

  it('expires an order past its time-in-force', async () => {
    const price = await priceOf('JPM');
    const expiresAt = Date.now() + 60_000;
    const place = await request(app)
      .post('/api/orders')
      .set('Authorization', auth(token))
      // Below-market BUY limit so it would otherwise rest as PENDING.
      .send({ side: 'BUY', symbol: 'JPM', shares: 1, limitPrice: price * 0.5, expiresAt });
    expect(place.body.expiresAt).toBe(expiresAt);

    // Advance the clock past expiry and sweep.
    processPendingOrders(expiresAt + 1);

    const orders = await request(app)
      .get('/api/orders')
      .set('Authorization', auth(token));
    expect(orders.body.find((o) => o.id === place.body.id).status).toBe('EXPIRED');
  });

  it('rejects an expiry in the past', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', auth(token))
      .send({ side: 'BUY', symbol: 'JPM', shares: 1, limitPrice: 10, expiresAt: Date.now() - 1000 });
    expect(res.status).toBe(400);
  });

  it('validates order input and requires auth', async () => {
    const noAuth = await request(app)
      .post('/api/orders')
      .send({ side: 'BUY', symbol: 'AAPL', shares: 1, limitPrice: 10 });
    expect(noAuth.status).toBe(401);

    const bad = await request(app)
      .post('/api/orders')
      .set('Authorization', auth(token))
      .send({ side: 'HOLD', symbol: 'AAPL', shares: 1, limitPrice: 10 });
    expect(bad.status).toBe(400);
  });
});
