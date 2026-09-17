import { db } from '../db/index.js';
import { round2 } from '../utils/money.js';
import { marketEvents, TICK_EVENT } from './events.js';
import { processPendingOrders } from './orderService.js';
import { listAllStocks } from './stockService.js';

const allStocks = db.prepare('SELECT symbol, price, volatility FROM stocks');
const updatePrice = db.prepare(
  'UPDATE stocks SET price = ?, updated_at = ? WHERE symbol = ?'
);

// Random-walk every stock by a small percentage drawn from its volatility.
const walkPrices = db.transaction(() => {
  const now = Date.now();
  for (const s of allStocks.all()) {
    const drift = (Math.random() - 0.5) * 2 * s.volatility;
    const next = Math.max(0.5, round2(s.price * (1 + drift)));
    updatePrice.run(next, now, s.symbol);
  }
});

// A full tick: move prices, fill any triggered limit orders, then broadcast the
// fresh quotes to SSE subscribers.
function tickOnce() {
  walkPrices();
  processPendingOrders();
  marketEvents.emit(TICK_EVENT, listAllStocks());
}

let intervalId = null;

export function startSimulator(intervalMs = 3000) {
  if (intervalId) return;
  intervalId = setInterval(tickOnce, intervalMs);
  if (intervalId.unref) intervalId.unref(); // don't keep the process alive
}

export function stopSimulator() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// Exposed for tests that need a deterministic single tick.
export { tickOnce };
