import { db } from './index.js';
import { migrate } from './migrate.js';
import { logger } from '../logger.js';
import { initAgents } from '../agents/agentService.js';

const SEED_STOCKS = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 195.32 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 421.18 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 178.45 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 186.9 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 124.72 },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 248.5 },
  { symbol: 'META', name: 'Meta Platforms Inc.', price: 504.3 },
  { symbol: 'NFLX', name: 'Netflix Inc.', price: 678.11 },
  { symbol: 'AMD', name: 'Advanced Micro Devices', price: 162.04 },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', price: 198.77 }
];

// Insert the tradable universe if it isn't already present. Existing rows are
// left untouched so live prices survive restarts.
export function seed() {
  migrate();
  const now = Date.now();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO stocks (symbol, name, price, prev_close, volatility, updated_at)
    VALUES (@symbol, @name, @price, @price, @volatility, @updated_at)
  `);
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      insert.run({
        ...r,
        volatility: 0.004 + Math.random() * 0.008,
        updated_at: now
      });
    }
  });
  tx(SEED_STOCKS);
  logger.info('Stocks seeded', { count: SEED_STOCKS.length });

  // Create the trading-agent fleet (idempotent; agents start disabled).
  initAgents();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
}
