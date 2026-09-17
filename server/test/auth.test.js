import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './helpers.js';

describe('auth', () => {
  it('registers a new user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@test.dev', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.email).toBe('alice@test.dev');
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'bob@test.dev', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bob@test.dev', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('rejects weak passwords and bad emails', async () => {
    const weak = await request(app)
      .post('/api/auth/register')
      .send({ email: 'c@test.dev', password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.details).toBeInstanceOf(Array);

    const bad = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123' });
    expect(bad.status).toBe(400);
  });

  it('logs in with valid credentials and rejects invalid ones', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dana@test.dev', password: 'password123' });

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dana@test.dev', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTypeOf('string');

    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dana@test.dev', password: 'wrongpass1' });
    expect(bad.status).toBe(401);
  });

  it('protects authenticated routes', async () => {
    const res = await request(app).get('/api/portfolio');
    expect(res.status).toBe(401);

    const bad = await request(app)
      .get('/api/portfolio')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(bad.status).toBe(401);
  });
});
