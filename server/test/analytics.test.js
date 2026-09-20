import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, newUser, auth } from './helpers.js';
import { takeSnapshots } from '../src/services/analyticsService.js';

describe('analytics', () => {
  let token;
  beforeAll(async () => {
    ({ token } = await newUser(request));
  });

  it('records net-worth snapshots and returns chronological history', async () => {
    takeSnapshots();
    takeSnapshots();

    const res = await request(app)
      .get('/api/portfolio/history')
      .set('Authorization', auth(token));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    // New accounts start flat at their starting cash.
    expect(res.body[0].value).toBe(100000);
    // Timestamps are non-decreasing.
    for (let i = 1; i < res.body.length; i += 1) {
      expect(res.body[i].timestamp).toBeGreaterThanOrEqual(res.body[i - 1].timestamp);
    }
  });

  it('ranks users by net worth with the caller flagged and emails masked', async () => {
    const res = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', auth(token));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const me = res.body.find((r) => r.isMe);
    expect(me).toBeTruthy();
    expect(me.name).toMatch(/\*\*\*@/); // masked

    // Ranking is descending by total value.
    for (let i = 1; i < res.body.length; i += 1) {
      expect(res.body[i].totalValue).toBeLessThanOrEqual(res.body[i - 1].totalValue);
      expect(res.body[i].rank).toBe(i + 1);
    }
  });

  it('requires auth', async () => {
    expect((await request(app).get('/api/leaderboard')).status).toBe(401);
    expect((await request(app).get('/api/portfolio/history')).status).toBe(401);
  });
});
