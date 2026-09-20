import { describe, it, expect } from 'vitest';
import {
  sma,
  ema,
  rsi,
  roc,
  rollingMax,
  rollingMin,
  bollinger,
  last
} from '../src/agents/indicators.js';

describe('indicators', () => {
  it('sma has correct warmup and values', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  it('ema is seeded from the initial sma', () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(2, 5); // sma(1,2,3)
    expect(out[4]).toBeGreaterThan(out[2]);
  });

  it('rsi trends high for a rising series and low for a falling one', () => {
    const rising = Array.from({ length: 20 }, (_, i) => i + 1);
    const falling = [...rising].reverse();
    expect(last(rsi(rising, 14))).toBeGreaterThan(70);
    expect(last(rsi(falling, 14))).toBeLessThan(30);
  });

  it('roc computes percentage change over the period', () => {
    expect(roc([100, 105, 110], 1)).toEqual([null, 5, expect.closeTo(4.7619, 3)]);
  });

  it('rollingMax/Min track the window', () => {
    expect(rollingMax([1, 3, 2, 5], 2)).toEqual([null, 3, 3, 5]);
    expect(rollingMin([4, 1, 3, 2], 2)).toEqual([null, 1, 1, 2]);
  });

  it('bollinger bands straddle the mean', () => {
    const values = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i));
    const { mid, upper, lower } = bollinger(values, 20, 2);
    expect(last(upper)).toBeGreaterThan(last(mid));
    expect(last(lower)).toBeLessThan(last(mid));
  });
});
