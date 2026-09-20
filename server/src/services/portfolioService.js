import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { round2 } from '../utils/money.js';
import { badRequest, notFound } from '../utils/errors.js';

const getStock = db.prepare('SELECT * FROM stocks WHERE symbol = ?');
const getUserCash = db.prepare('SELECT cash FROM users WHERE id = ?');
const setUserCash = db.prepare('UPDATE users SET cash = ? WHERE id = ?');
const getHolding = db.prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?');
const listHoldings = db.prepare('SELECT * FROM holdings WHERE user_id = ?');
const upsertHolding = db.prepare(`
  INSERT INTO holdings (user_id, symbol, shares, avg_cost)
  VALUES (@user_id, @symbol, @shares, @avg_cost)
  ON CONFLICT(user_id, symbol)
  DO UPDATE SET shares = @shares, avg_cost = @avg_cost
`);
const deleteHolding = db.prepare('DELETE FROM holdings WHERE user_id = ? AND symbol = ?');
const insertTx = db.prepare(`
  INSERT INTO transactions (id, user_id, type, symbol, shares, price, total, timestamp)
  VALUES (@id, @user_id, @type, @symbol, @shares, @price, @total, @timestamp)
`);
const listTx = db.prepare(
  'SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?'
);

export function getPortfolio(userId) {
  const cash = getUserCash.get(userId).cash;
  const positions = listHoldings.all(userId).map((h) => {
    const stock = getStock.get(h.symbol);
    const price = stock ? stock.price : h.avg_cost;
    const marketValue = price * h.shares;
    const costBasis = h.avg_cost * h.shares;
    const gain = marketValue - costBasis;
    return {
      symbol: h.symbol,
      name: stock ? stock.name : h.symbol,
      shares: h.shares,
      avgCost: round2(h.avg_cost),
      price: round2(price),
      marketValue: round2(marketValue),
      gain: round2(gain),
      gainPercent: costBasis ? round2((gain / costBasis) * 100) : 0
    };
  });
  const holdingsValue = positions.reduce((s, p) => s + p.marketValue, 0);
  return {
    cash: round2(cash),
    holdingsValue: round2(holdingsValue),
    totalValue: round2(cash + holdingsValue),
    positions
  };
}

// Buy and sell run inside a transaction so cash, holdings and the trade log
// stay consistent even if something throws mid-way.
export const buy = db.transaction((userId, symbol, shares) => {
  const stock = getStock.get(symbol);
  if (!stock) throw notFound('Stock not found');

  const cash = getUserCash.get(userId).cash;
  const cost = stock.price * shares;
  if (cost > cash) {
    throw badRequest('Insufficient funds', {
      required: round2(cost),
      cash: round2(cash)
    });
  }

  setUserCash.run(cash - cost, userId);

  const existing = getHolding.get(userId, symbol);
  if (existing) {
    const totalShares = existing.shares + shares;
    const avgCost =
      (existing.avg_cost * existing.shares + stock.price * shares) / totalShares;
    upsertHolding.run({ user_id: userId, symbol, shares: totalShares, avg_cost: avgCost });
  } else {
    upsertHolding.run({ user_id: userId, symbol, shares, avg_cost: stock.price });
  }

  insertTx.run({
    id: randomUUID(),
    user_id: userId,
    type: 'BUY',
    symbol,
    shares,
    price: stock.price,
    total: round2(cost),
    timestamp: Date.now()
  });

  return getPortfolio(userId);
});

export const sell = db.transaction((userId, symbol, shares) => {
  const stock = getStock.get(symbol);
  if (!stock) throw notFound('Stock not found');

  const holding = getHolding.get(userId, symbol);
  if (!holding || holding.shares < shares) {
    throw badRequest('Not enough shares to sell', {
      held: holding ? holding.shares : 0
    });
  }

  const proceeds = stock.price * shares;
  const cash = getUserCash.get(userId).cash;
  setUserCash.run(cash + proceeds, userId);

  const remaining = holding.shares - shares;
  if (remaining === 0) {
    deleteHolding.run(userId, symbol);
  } else {
    upsertHolding.run({
      user_id: userId,
      symbol,
      shares: remaining,
      avg_cost: holding.avg_cost
    });
  }

  insertTx.run({
    id: randomUUID(),
    user_id: userId,
    type: 'SELL',
    symbol,
    shares,
    price: stock.price,
    total: round2(proceeds),
    timestamp: Date.now()
  });

  return getPortfolio(userId);
});

export function getTransactions(userId, limit = 100) {
  return listTx.all(userId, limit).map((t) => ({
    id: t.id,
    type: t.type,
    symbol: t.symbol,
    shares: t.shares,
    price: t.price,
    total: t.total,
    timestamp: t.timestamp
  }));
}
