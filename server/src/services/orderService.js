import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { round2 } from '../utils/money.js';
import { badRequest, notFound } from '../utils/errors.js';
import { buy, sell } from './portfolioService.js';
import { notifyUser } from './userEvents.js';
import { logger } from '../logger.js';

const getStock = db.prepare('SELECT * FROM stocks WHERE symbol = ?');
const insertOrder = db.prepare(`
  INSERT INTO orders (id, user_id, side, type, symbol, shares, limit_price, status, expires_at, created_at)
  VALUES (@id, @user_id, @side, @type, @symbol, @shares, @limit_price, 'PENDING', @expires_at, @created_at)
`);
const listOrders = db.prepare(
  'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
);
const getOrder = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?');
const cancelStmt = db.prepare(
  "UPDATE orders SET status = 'CANCELLED' WHERE id = ? AND status = 'PENDING'"
);
const allPending = db.prepare("SELECT * FROM orders WHERE status = 'PENDING'");
const markFilled = db.prepare(
  "UPDATE orders SET status = 'FILLED', fill_price = ?, filled_at = ? WHERE id = ?"
);
const expireStmt = db.prepare(
  "UPDATE orders SET status = 'EXPIRED' WHERE status = 'PENDING' AND expires_at IS NOT NULL AND expires_at <= ?"
);
const expiringUsers = db.prepare(
  "SELECT DISTINCT user_id FROM orders WHERE status = 'PENDING' AND expires_at IS NOT NULL AND expires_at <= ?"
);

function view(o) {
  return {
    id: o.id,
    side: o.side,
    type: o.type,
    symbol: o.symbol,
    shares: o.shares,
    limitPrice: round2(o.limit_price),
    status: o.status,
    fillPrice: o.fill_price != null ? round2(o.fill_price) : null,
    expiresAt: o.expires_at ?? null,
    createdAt: o.created_at,
    filledAt: o.filled_at
  };
}

export function placeOrder(userId, { side, type = 'LIMIT', symbol, shares, limitPrice, expiresAt }) {
  if (!getStock.get(symbol)) throw notFound('Stock not found');
  if (limitPrice <= 0) throw badRequest('limitPrice must be positive');
  const now = Date.now();
  if (expiresAt != null && expiresAt <= now) {
    throw badRequest('expiresAt must be in the future');
  }

  const order = {
    id: randomUUID(),
    user_id: userId,
    side,
    type,
    symbol,
    shares,
    limit_price: limitPrice,
    expires_at: expiresAt ?? null,
    created_at: now
  };
  insertOrder.run(order);
  return view({ ...order, status: 'PENDING', fill_price: null, filled_at: null });
}

export function getOrders(userId, limit = 100) {
  return listOrders.all(userId, limit).map(view);
}

export function cancelOrder(userId, id) {
  const existing = getOrder.get(id, userId);
  if (!existing) throw notFound('Order not found');
  if (existing.status !== 'PENDING') {
    throw badRequest(`Cannot cancel a ${existing.status.toLowerCase()} order`);
  }
  cancelStmt.run(id);
  return view(getOrder.get(id, userId));
}

// Whether a pending order's trigger condition is satisfied at the given price.
//   LIMIT BUY  — buy once price falls to/below the limit
//   LIMIT SELL — sell once price rises to/above the limit
//   STOP  BUY  — buy once price rises to/above the stop (breakout entry)
//   STOP  SELL — sell once price falls to/below the stop (stop-loss)
function isTriggered(order, price) {
  const at = order.limit_price;
  if (order.type === 'STOP') {
    return order.side === 'BUY' ? price >= at : price <= at;
  }
  return order.side === 'BUY' ? price <= at : price >= at;
}

// Called by the simulator after each price tick. First expires any pending
// orders past their time-in-force, then fills every triggered order the user
// can afford / has shares for. Returns the number of orders filled.
export function processPendingOrders(now = Date.now()) {
  // Users whose orders changed this tick, so we can push them a single update.
  const affected = new Set();

  // Expire pending orders past their time-in-force.
  for (const r of expiringUsers.all(now)) affected.add(r.user_id);
  expireStmt.run(now);

  let filled = 0;
  for (const order of allPending.all()) {
    const stock = getStock.get(order.symbol);
    if (!stock || !isTriggered(order, stock.price)) continue;
    try {
      // Reuse the same transactional execution as market orders; fill price is
      // the current market price.
      if (order.side === 'BUY') buy(order.user_id, order.symbol, order.shares);
      else sell(order.user_id, order.symbol, order.shares);
      markFilled.run(stock.price, now, order.id);
      filled += 1;
      affected.add(order.user_id);
    } catch (err) {
      // Insufficient funds/shares right now — leave the order pending so it can
      // fill on a later tick once the account can support it.
      logger.debug('Order not fillable yet', { id: order.id, reason: err.message });
    }
  }

  for (const userId of affected) notifyUser(userId, { type: 'orders' });
  return filled;
}
