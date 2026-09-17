import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { conflict, unauthorized } from '../utils/errors.js';
import { signToken } from '../middleware/auth.js';

const insertUser = db.prepare(`
  INSERT INTO users (email, password_hash, cash, created_at)
  VALUES (?, ?, ?, ?)
`);
const findByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const findById = db.prepare('SELECT id, email, cash, created_at FROM users WHERE id = ?');

function publicUser(row) {
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

export function register(email, password) {
  const normalized = email.trim().toLowerCase();
  if (findByEmail.get(normalized)) {
    throw conflict('An account with this email already exists');
  }
  const hash = bcrypt.hashSync(password, config.BCRYPT_ROUNDS);
  const info = insertUser.run(normalized, hash, config.STARTING_CASH, Date.now());
  const user = findById.get(info.lastInsertRowid);
  return { user: publicUser(user), token: signToken(user.id) };
}

export function login(email, password) {
  const normalized = email.trim().toLowerCase();
  const row = findByEmail.get(normalized);
  // Always run a hash comparison shape to avoid trivial user enumeration.
  const ok = row && bcrypt.compareSync(password, row.password_hash);
  if (!ok) throw unauthorized('Invalid email or password');
  return { user: publicUser(row), token: signToken(row.id) };
}

export function getUser(userId) {
  const row = findById.get(userId);
  if (!row) throw unauthorized('Account no longer exists');
  return publicUser(row);
}
