import {
  sma,
  ema,
  rsi,
  macd,
  bollinger,
  roc,
  last
} from './indicators.js';

// A strategy decides, from recent candles and whether the agent currently holds
// a position, whether to BUY (open a long), SELL (close it), or HOLD. These are
// long-only (spot): BUY only when flat, SELL only when holding. Each returns
// { action, reason }. Strategies are pure functions of their inputs — no I/O,
// no state — so they are trivially unit-testable and backtestable.
//
// ctx = { closes: number[], highs: number[], lows: number[], price, holding }

const HOLD = (reason) => ({ action: 'HOLD', reason });

function smaCrossover({ closes, holding }, { fast = 10, slow = 30 } = {}) {
  const f = last(sma(closes, fast));
  const s = last(sma(closes, slow));
  if (f == null || s == null) return HOLD('warming up');
  if (!holding && f > s) return { action: 'BUY', reason: `SMA${fast} > SMA${slow}` };
  if (holding && f < s) return { action: 'SELL', reason: `SMA${fast} < SMA${slow}` };
  return HOLD('no crossover');
}

function emaTrend({ closes, price, holding }, { period = 20 } = {}) {
  const e = last(ema(closes, period));
  if (e == null) return HOLD('warming up');
  if (!holding && price > e) return { action: 'BUY', reason: `price > EMA${period}` };
  if (holding && price < e) return { action: 'SELL', reason: `price < EMA${period}` };
  return HOLD('in-trend hold');
}

function momentum({ closes, holding }, { period = 10, threshold = 1 } = {}) {
  const m = last(roc(closes, period));
  if (m == null) return HOLD('warming up');
  if (!holding && m > threshold) return { action: 'BUY', reason: `ROC ${m.toFixed(2)}% > ${threshold}%` };
  if (holding && m < 0) return { action: 'SELL', reason: `ROC ${m.toFixed(2)}% < 0` };
  return HOLD('momentum flat');
}

function rsiReversion({ closes, holding }, { period = 14, low = 30, high = 70 } = {}) {
  const r = last(rsi(closes, period));
  if (r == null) return HOLD('warming up');
  if (!holding && r < low) return { action: 'BUY', reason: `RSI ${r.toFixed(1)} < ${low}` };
  if (holding && r > high) return { action: 'SELL', reason: `RSI ${r.toFixed(1)} > ${high}` };
  return HOLD('RSI neutral');
}

function macdCross({ closes, holding }) {
  const { hist } = macd(closes);
  const n = hist.length;
  const cur = hist[n - 1];
  const prev = hist[n - 2];
  if (cur == null) return HOLD('warming up');
  if (!holding && prev != null && prev <= 0 && cur > 0) {
    return { action: 'BUY', reason: 'MACD crossed up' };
  }
  if (holding && prev != null && prev >= 0 && cur < 0) {
    return { action: 'SELL', reason: 'MACD crossed down' };
  }
  return HOLD('no MACD cross');
}

function bollingerReversion({ closes, price, holding }, { period = 20, mult = 2 } = {}) {
  const { mid, lower } = bollinger(closes, period, mult);
  const m = last(mid);
  const l = last(lower);
  if (m == null) return HOLD('warming up');
  if (!holding && price <= l) return { action: 'BUY', reason: 'price at/below lower band' };
  if (holding && price >= m) return { action: 'SELL', reason: 'reverted to mean' };
  return HOLD('inside bands');
}

function breakout({ highs, lows, price, holding }, { period = 20 } = {}) {
  if (highs.length < period + 1) return HOLD('warming up');
  // Channel from the `period` bars BEFORE the current one.
  const upper = Math.max(...highs.slice(-period - 1, -1));
  const lower = Math.min(...lows.slice(-period - 1, -1));
  if (!holding && price > upper) return { action: 'BUY', reason: `broke ${period}-bar high` };
  if (holding && price < lower) return { action: 'SELL', reason: `broke ${period}-bar low` };
  return HOLD('inside channel');
}

// Registry keyed by the slug stored on each agent.
export const strategies = {
  'sma-crossover': { name: 'SMA Crossover', warmup: 31, decide: smaCrossover },
  'ema-trend': { name: 'EMA Trend', warmup: 21, decide: emaTrend },
  momentum: { name: 'Momentum (ROC)', warmup: 11, decide: momentum },
  'rsi-reversion': { name: 'RSI Mean-Reversion', warmup: 15, decide: rsiReversion },
  macd: { name: 'MACD Cross', warmup: 35, decide: macdCross },
  bollinger: { name: 'Bollinger Reversion', warmup: 21, decide: bollingerReversion },
  breakout: { name: 'Donchian Breakout', warmup: 21, decide: breakout }
};

export function getStrategy(key) {
  return strategies[key] || null;
}
