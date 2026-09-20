import { db } from '../db/index.js';
import { round2 } from '../utils/money.js';
import { notFound } from '../utils/errors.js';

const getStock = db.prepare('SELECT * FROM stocks WHERE symbol = ?');
const listSymbols = db.prepare('SELECT symbol FROM watchlist WHERE user_id = ?');
const addSymbol = db.prepare(
  'INSERT OR IGNORE INTO watchlist (user_id, symbol) VALUES (?, ?)'
);
const removeSymbol = db.prepare('DELETE FROM watchlist WHERE user_id = ? AND symbol = ?');

export function getWatchlist(userId) {
  return listSymbols
    .all(userId)
    .map((row) => {
      const stock = getStock.get(row.symbol);
      if (!stock) return null;
      const change = stock.price - stock.prev_close;
      return {
        symbol: stock.symbol,
        name: stock.name,
        price: round2(stock.price),
        change: round2(change),
        changePercent: stock.prev_close ? round2((change / stock.prev_close) * 100) : 0
      };
    })
    .filter(Boolean);
}

export function addToWatchlist(userId, symbol) {
  if (!getStock.get(symbol)) throw notFound('Stock not found');
  addSymbol.run(userId, symbol);
  return listSymbols.all(userId).map((r) => r.symbol);
}

export function removeFromWatchlist(userId, symbol) {
  removeSymbol.run(userId, symbol);
  return listSymbols.all(userId).map((r) => r.symbol);
}
