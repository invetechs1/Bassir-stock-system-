import { describe, it, expect } from 'vitest';
import { strategies, getStrategy } from '../src/agents/strategies.js';

const asc = (n, start = 100, step = 1) =>
  Array.from({ length: n }, (_, i) => start + i * step);
const desc = (n, start = 200, step = 1) =>
  Array.from({ length: n }, (_, i) => start - i * step);

function ctx(closes, { holding = false, price } = {}) {
  return {
    closes,
    highs: closes,
    lows: closes,
    price: price ?? closes[closes.length - 1],
    holding
  };
}

describe('strategies', () => {
  it('every registered strategy exposes name, warmup and decide', () => {
    for (const s of Object.values(strategies)) {
      expect(typeof s.decide).toBe('function');
      expect(s.warmup).toBeGreaterThan(0);
    }
    expect(getStrategy('nope')).toBeNull();
  });

  it('sma-crossover buys an uptrend when flat and sells a downtrend when held', () => {
    const s = getStrategy('sma-crossover');
    expect(s.decide(ctx(asc(40))).action).toBe('BUY');
    expect(s.decide(ctx(desc(40), { holding: true })).action).toBe('SELL');
    // Flat during a downtrend → no action (long-only).
    expect(s.decide(ctx(desc(40))).action).toBe('HOLD');
  });

  it('momentum buys strong positive ROC and exits when it turns negative', () => {
    const s = getStrategy('momentum');
    expect(s.decide(ctx(asc(20, 100, 2))).action).toBe('BUY');
    expect(s.decide(ctx(desc(20), { holding: true })).action).toBe('SELL');
  });

  it('rsi-reversion buys oversold and sells overbought', () => {
    const s = getStrategy('rsi-reversion');
    expect(s.decide(ctx(desc(30))).action).toBe('BUY'); // falling → RSI low
    expect(s.decide(ctx(asc(30), { holding: true })).action).toBe('SELL');
  });

  it('breakout buys a new high and exits on a new low', () => {
    const s = getStrategy('breakout');
    const closes = asc(21, 100, 0.1); // gentle rise, last bar breaks the channel
    const highs = [...closes];
    const lows = [...closes];
    // Force the final bar to break above the prior 20-bar high.
    const buyCtx = { closes, highs, lows, price: 200, holding: false };
    expect(s.decide(buyCtx).action).toBe('BUY');
    const sellCtx = { closes, highs, lows, price: 1, holding: true };
    expect(s.decide(sellCtx).action).toBe('SELL');
  });

  it('holds while still warming up', () => {
    const s = getStrategy('macd');
    expect(s.decide(ctx(asc(5))).action).toBe('HOLD');
  });
});
