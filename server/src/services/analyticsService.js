import { db } from '../db/index.js';
import { round2 } from '../utils/money.js';
import { logger } from '../logger.js';

// Net worth (cash + holdings at live prices) for every user, computed in SQL.
const valuesByUser = db.prepare(`
  SELECT u.id AS user_id,
         u.email AS email,
         u.cash + COALESCE(SUM(h.shares * s.price), 0) AS total
  FROM users u
  LEFT JOIN holdings h ON h.user_id = u.id
  LEFT JOIN stocks  s ON s.symbol = h.symbol
  GROUP BY u.id
  ORDER BY total DESC
`);

const insertSnapshot = db.prepare(
  'INSERT INTO portfolio_snapshots (user_id, value, timestamp) VALUES (?, ?, ?)'
);

const historyStmt = db.prepare(`
  SELECT value, timestamp FROM (
    SELECT value, timestamp FROM portfolio_snapshots
    WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?
  ) ORDER BY timestamp ASC
`);

// Record a net-worth point for every user. Called on an interval and returns
// the number of users captured.
export const takeSnapshots = db.transaction(() => {
  const now = Date.now();
  const rows = valuesByUser.all();
  for (const r of rows) insertSnapshot.run(r.user_id, round2(r.total), now);
  return rows.length;
});

export function getHistory(userId, limit = 500) {
  return historyStmt
    .all(userId, limit)
    .map((r) => ({ value: round2(r.value), timestamp: r.timestamp }));
}

// Mask the local part of an email for public display: alice@test.dev -> a***@test.dev
function maskEmail(email) {
  const [local, domain] = email.split('@');
  const head = local.slice(0, 1);
  return `${head}***@${domain ?? ''}`;
}

export function getLeaderboard(currentUserId, limit = 20) {
  return valuesByUser.all().slice(0, limit).map((r, i) => ({
    rank: i + 1,
    name: maskEmail(r.email),
    totalValue: round2(r.total),
    isMe: r.user_id === currentUserId
  }));
}

let intervalId = null;

export function startSnapshots(intervalMs = 60000) {
  if (intervalId) return;
  // Capture an initial point so charts aren't empty on first load.
  try {
    takeSnapshots();
  } catch (err) {
    logger.warn('Initial snapshot failed', { message: err.message });
  }
  intervalId = setInterval(() => {
    try {
      takeSnapshots();
    } catch (err) {
      logger.warn('Snapshot failed', { message: err.message });
    }
  }, intervalMs);
  if (intervalId.unref) intervalId.unref();
}

export function stopSnapshots() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
