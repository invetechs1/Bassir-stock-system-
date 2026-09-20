import { describe, it, expect } from 'vitest';
import { runBacktest } from '../src/agents/backtest.js';

// Synthetic candles so the backtest is validated offline (no network).
function candlesFromCloses(closes) {
  return closes.map((c) => ({
    open: c,
    high: c * 1.001,
    low: c * 0.999,
    close: c,
    volume: 1,
    openTime: 0,
    closeTime: 0
  }));
}

describe('backtest harness', () => {
  it('profits from a clean uptrend with the SMA crossover', () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 + i);
    const result = runBacktest(candlesFromCloses(closes), 'sma-crossover', {
      allocation: 1000,
      feeRate: 0
    });
    expect(result.returnPct).toBeGreaterThan(0);
    expect(result.trades).toBeGreaterThan(0);
    expect(result.maxDrawdownPct).toBeGreaterThanOrEqual(0);
  });

  it('reports a bounded drawdown and rejects unknown strategies', () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 + 10 * Math.sin(i / 5));
    const result = runBacktest(candlesFromCloses(closes), 'rsi-reversion');
    expect(result.maxDrawdownPct).toBeLessThanOrEqual(100);
    expect(result.closedTrades).toBe(result.wins + result.losses);
    expect(() => runBacktest(candlesFromCloses(closes), 'nope')).toThrow(/Unknown strategy/);
  });
});
