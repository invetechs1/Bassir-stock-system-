import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';

// One migrated + seeded in-memory app for the whole suite.
seed();
export const app = createApp();

let counter = 0;

// Register a fresh user and return its auth token plus an authorized helper.
export async function newUser(request) {
  counter += 1;
  const email = `user${counter}@test.dev`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123' });
  return { email, token: res.body.token, user: res.body.user };
}

export const auth = (token) => `Bearer ${token}`;
