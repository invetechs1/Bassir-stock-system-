import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, newUser, auth } from './helpers.js';

// With ADMIN_EMAILS unset, the first registered account (id 1) is the admin.
let adminToken;
let userToken;

beforeAll(async () => {
  adminToken = (await newUser(request)).token; // id 1 → admin
  userToken = (await newUser(request)).token; // id 2 → not admin
});

describe('agents API', () => {
  it('lists the fleet for an admin across venues', async () => {
    const res = await request(app).get('/api/agents').set('Authorization', auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(14); // 7 crypto + 7 US equity
    expect(res.body.summary.mode).toBe('paper');
    expect(res.body.risk.maxDrawdownPct).toBeGreaterThan(0);
    // Venue statuses present; crypto is always open, Alpaca closed w/o keys.
    expect(res.body.venues.binance.open).toBe(true);
    expect(res.body.agents.some((a) => a.venue === 'binance')).toBe(true);
    expect(res.body.agents.some((a) => a.venue === 'alpaca')).toBe(true);
  });

  it('forbids non-admin users', async () => {
    const res = await request(app).get('/api/agents').set('Authorization', auth(userToken));
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/agents')).status).toBe(401);
  });

  it('enables and disables an agent', async () => {
    const id = 'eth-ema-trend';
    const on = await request(app)
      .post(`/api/agents/${id}/enable`)
      .set('Authorization', auth(adminToken));
    expect(on.body.agent.enabled).toBe(true);

    const off = await request(app)
      .post(`/api/agents/${id}/disable`)
      .set('Authorization', auth(adminToken));
    expect(off.body.agent.enabled).toBe(false);
  });

  it('kill switch blocks enabling until released', async () => {
    await request(app).post('/api/agents/kill').set('Authorization', auth(adminToken));
    const blocked = await request(app)
      .post('/api/agents/btc-sma-crossover/enable')
      .set('Authorization', auth(adminToken));
    expect(blocked.status).toBe(409);

    await request(app).post('/api/agents/kill/release').set('Authorization', auth(adminToken));
    const ok = await request(app)
      .post('/api/agents/btc-sma-crossover/enable')
      .set('Authorization', auth(adminToken));
    expect(ok.status).toBe(200);
  });

  it('resets the fleet in paper mode', async () => {
    const res = await request(app).post('/api/agents/reset').set('Authorization', auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.agents.every((a) => a.enabled === false)).toBe(true);
    expect(res.body.agents.every((a) => a.cash === a.allocation)).toBe(true);
  });

  it('exposes agent detail with trades and equity curve', async () => {
    const res = await request(app)
      .get('/api/agents/xrp-macd')
      .set('Authorization', auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.agent.id).toBe('xrp-macd');
    expect(Array.isArray(res.body.trades)).toBe(true);
    expect(Array.isArray(res.body.equityCurve)).toBe(true);
  });
});
