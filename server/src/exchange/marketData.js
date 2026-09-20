import { config } from '../config.js';

// Public Binance market data. These endpoints require no API key and are the
// same whether you later trade on testnet or mainnet, so agents always analyze
// real prices. `fetchImpl` is injectable for tests.

// Fetch OHLCV candles, oldest first.
export async function getCandles(
  symbol,
  interval = config.AGENT_CANDLE_INTERVAL,
  limit = 100,
  { fetchImpl = fetch, baseUrl = config.BINANCE_DATA_URL } = {}
) {
  const url = `${baseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Binance klines for ${symbol} failed: HTTP ${res.status}`);
  }
  const rows = await res.json();
  return rows.map((k) => ({
    openTime: k[0],
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: k[6]
  }));
}

// Latest trade price for a symbol.
export async function getPrice(
  symbol,
  { fetchImpl = fetch, baseUrl = config.BINANCE_DATA_URL } = {}
) {
  const url = `${baseUrl}/api/v3/ticker/price?symbol=${symbol}`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Binance price for ${symbol} failed: HTTP ${res.status}`);
  }
  const body = await res.json();
  return Number(body.price);
}

// Default market-data provider object the engine consumes. Tests pass a fake
// with the same shape.
export const marketData = { getCandles, getPrice };
