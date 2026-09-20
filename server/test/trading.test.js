import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, newUser, auth } from './helpers.js';

describe('trading', () => {
  let token;

  beforeAll(async () => {
    ({ token } = await newUser(request));
  });

  it('starts with cash and no positions', async () => {
    const res = await request(app)
      .get('/api/portfolio')
      .set('Authorization', auth(token));
    expect(res.status).toBe(200);
    expect(res.body.cash).toBe(100000);
    expect(res.body.positions).toHaveLength(0);
  });

  it('buys shares, deducting cash and creating a position', async () => {
    const res = await request(app)
      .post('/api/portfolio/buy')
      .set('Authorization', auth(token))
      .send({ symbol: 'AAPL', shares: 10 });
    expect(res.status).toBe(200);
    const pos = res.body.positions.find((p) => p.symbol === 'AAPL');
    expect(pos.shares).toBe(10);
    expect(res.body.cash).toBeLessThan(100000);
    // Total value is conserved immediately after a trade.
    expect(res.body.totalValue).toBeCloseTo(100000, 1);
  });

  it('rejects buying with insufficient funds', async () => {
    const res = await request(app)
      .post('/api/portfolio/buy')
      .set('Authorization', auth(token))
      .send({ symbol: 'AAPL', shares: 1000000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insufficient/i);
  });

  it('rejects unknown symbols and invalid share counts', async () => {
    const unknown = await request(app)
      .post('/api/portfolio/buy')
      .set('Authorization', auth(token))
      .send({ symbol: 'NOPE', shares: 1 });
    expect(unknown.status).toBe(404);

    const invalid = await request(app)
      .post('/api/portfolio/buy')
      .set('Authorization', auth(token))
      .send({ symbol: 'AAPL', shares: -5 });
    expect(invalid.status).toBe(400);
  });

  it('sells shares and removes the position when flat', async () => {
    const res = await request(app)
      .post('/api/portfolio/sell')
      .set('Authorization', auth(token))
      .send({ symbol: 'AAPL', shares: 10 });
    expect(res.status).toBe(200);
    expect(res.body.positions.find((p) => p.symbol === 'AAPL')).toBeUndefined();
  });

  it('rejects overselling', async () => {
    const res = await request(app)
      .post('/api/portfolio/sell')
      .set('Authorization', auth(token))
      .send({ symbol: 'AAPL', shares: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not enough/i);
  });

  it('records transactions', async () => {
    const res = await request(app)
      .get('/api/portfolio/transactions')
      .set('Authorization', auth(token));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0]).toHaveProperty('type');
  });

  it('isolates portfolios between users', async () => {
    const { token: other } = await newUser(request);
    const res = await request(app)
      .get('/api/portfolio')
      .set('Authorization', auth(other));
    expect(res.body.cash).toBe(100000);
    expect(res.body.positions).toHaveLength(0);
  });
});
