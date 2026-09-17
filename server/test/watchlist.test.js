import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, newUser, auth } from './helpers.js';

describe('watchlist', () => {
  let token;
  beforeAll(async () => {
    ({ token } = await newUser(request));
  });

  it('adds, lists, and removes symbols', async () => {
    const add = await request(app)
      .post('/api/watchlist')
      .set('Authorization', auth(token))
      .send({ symbol: 'tsla' });
    expect(add.status).toBe(201);
    expect(add.body).toContain('TSLA');

    const list = await request(app)
      .get('/api/watchlist')
      .set('Authorization', auth(token));
    expect(list.body.find((s) => s.symbol === 'TSLA')).toBeTruthy();

    const remove = await request(app)
      .delete('/api/watchlist/TSLA')
      .set('Authorization', auth(token));
    expect(remove.body).not.toContain('TSLA');
  });

  it('is idempotent and rejects unknown symbols', async () => {
    await request(app)
      .post('/api/watchlist')
      .set('Authorization', auth(token))
      .send({ symbol: 'NVDA' });
    const dup = await request(app)
      .post('/api/watchlist')
      .set('Authorization', auth(token))
      .send({ symbol: 'NVDA' });
    expect(dup.body.filter((s) => s === 'NVDA')).toHaveLength(1);

    const bad = await request(app)
      .post('/api/watchlist')
      .set('Authorization', auth(token))
      .send({ symbol: 'NOPE' });
    expect(bad.status).toBe(404);
  });
});
