import { db } from '../db/index.js';
import { round2 } from '../utils/money.js';
import { notFound } from '../utils/errors.js';

const listStocks = db.prepare('SELECT * FROM stocks ORDER BY symbol');
const getStock = db.prepare('SELECT * FROM stocks WHERE symbol = ?');

function withChange(stock) {
  const change = stock.price - stock.prev_close;
  return {
    symbol: stock.symbol,
    name: stock.name,
    price: round2(stock.price),
    prevClose: round2(stock.prev_close),
    change: round2(change),
    changePercent: stock.prev_close ? round2((change / stock.prev_close) * 100) : 0,
    updatedAt: stock.updated_at
  };
}

export function listAllStocks() {
  return listStocks.all().map(withChange);
}

export function getStockQuote(symbol) {
  const stock = getStock.get(symbol);
  if (!stock) throw notFound('Stock not found');
  return withChange(stock);
}
