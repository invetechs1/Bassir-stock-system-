import { describe, it, expect } from 'vitest';
import { createAlpacaVenue } from '../src/exchange/alpaca.js';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

// Minimal fake Alpaca HTTP surface driven by URL/method.
function fakeFetch(routes) {
  return async (url, options = {}) => {
    for (const [match, handler] of routes) {
      if (url.includes(match)) return handler(url, options);
    }
    return { ok: false, status: 404, json: async () => ({ message: 'not found' }) };
  };
}

const KEYS = { apiKey: 'k', apiSecret: 's' };

describe('alpaca venue', () => {
  it('maps bars and latest trade price', async () => {
    const venue = createAlpacaVenue({
      ...KEYS,
      fetchImpl: fakeFetch([
        ['/bars', () => ok({ bars: [{ t: '2026-01-01T00:00:00Z', o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }] })],
        ['/trades/latest', () => ok({ trade: { p: 42.5 } })]
      ])
    });
    const candles = await venue.marketData.getCandles('AAPL', '1m', 1);
    expect(candles[0].close).toBe(1.5);
    expect(candles[0].high).toBe(2);
    expect(await venue.marketData.getPrice('AAPL')).toBe(42.5);
  });

  it('reports open state from the market clock', async () => {
    const venue = createAlpacaVenue({
      ...KEYS,
      fetchImpl: fakeFetch([['/v2/clock', () => ok({ is_open: true })]])
    });
    expect(await venue.isOpen()).toBe(true);
  });

  it('is unavailable and closed without keys', async () => {
    const venue = createAlpacaVenue({ apiKey: '', apiSecret: '' });
    expect(venue.configured).toBe(false);
    expect(await venue.isOpen()).toBe(false);
    await expect(venue.executor.execute({ symbol: 'AAPL', side: 'BUY', qty: 1, price: 10 })).rejects.toThrow(
      /keys not configured/
    );
  });

  it('submits a market order and returns the fill', async () => {
    let posted = null;
    const venue = createAlpacaVenue({
      ...KEYS,
      fetchImpl: fakeFetch([
        [
          '/v2/orders',
          (url, opts) => {
            if (opts.method === 'POST') {
              posted = JSON.parse(opts.body);
              return ok({ id: 'ord1', filled_qty: '2', filled_avg_price: '150.25' });
            }
            return ok({ id: 'ord1', filled_qty: '2', filled_avg_price: '150.25' });
          }
        ]
      ])
    });
    const fill = await venue.executor.execute({ symbol: 'AAPL', side: 'BUY', qty: 2, price: 150 });
    expect(posted.symbol).toBe('AAPL');
    expect(posted.side).toBe('buy');
    expect(fill.qty).toBe(2);
    expect(fill.price).toBe(150.25);
    expect(fill.fee).toBe(0);
  });
});
