import { config } from '../config.js';
import { logger } from '../logger.js';

// Alpaca venue: US equities. Market data (IEX bars/trades) and order execution
// share one client. Paper (paper-api.alpaca.markets) uses real market data with
// simulated fills and needs only free paper keys; live (api.alpaca.markets)
// trades real money and is gated behind config.liveTrading. Alpaca data
// requires auth even for paper, so this venue is unavailable without keys.

const TIMEFRAME = { '1m': '1Min', '5m': '5Min', '15m': '15Min', '1h': '1Hour', '1d': '1Day' };

function authHeaders(apiKey, apiSecret) {
  return { 'APCA-API-KEY-ID': apiKey, 'APCA-API-SECRET-KEY': apiSecret };
}

export function createAlpacaVenue({
  apiKey = config.ALPACA_API_KEY,
  apiSecret = config.ALPACA_API_SECRET,
  baseUrl = config.ALPACA_BASE_URL,
  dataUrl = config.ALPACA_DATA_URL,
  fetchImpl = fetch
} = {}) {
  const configured = Boolean(apiKey && apiSecret);
  const isLiveUrl = !baseUrl.includes('paper');
  const mode = isLiveUrl ? 'live' : 'paper';
  const headers = authHeaders(apiKey, apiSecret);

  async function getCandles(symbol, interval = '1m', limit = 100) {
    const tf = TIMEFRAME[interval] || '1Min';
    const url = `${dataUrl}/v2/stocks/${symbol}/bars?timeframe=${tf}&limit=${limit}&feed=iex&adjustment=raw`;
    const res = await fetchImpl(url, { headers });
    if (!res.ok) throw new Error(`Alpaca bars for ${symbol} failed: HTTP ${res.status}`);
    const body = await res.json();
    return (body.bars || []).map((b) => ({
      openTime: new Date(b.t).getTime(),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
      closeTime: new Date(b.t).getTime()
    }));
  }

  async function getPrice(symbol) {
    const url = `${dataUrl}/v2/stocks/${symbol}/trades/latest?feed=iex`;
    const res = await fetchImpl(url, { headers });
    if (!res.ok) throw new Error(`Alpaca price for ${symbol} failed: HTTP ${res.status}`);
    const body = await res.json();
    return Number(body.trade?.p);
  }

  // Cached market-clock check (avoids a network call every tick).
  let clockCache = { at: 0, open: false };
  async function isOpen() {
    if (!configured) return false;
    const now = Date.now();
    if (now - clockCache.at < 30_000) return clockCache.open;
    try {
      const res = await fetchImpl(`${baseUrl}/v2/clock`, { headers });
      const body = await res.json();
      clockCache = { at: now, open: Boolean(body.is_open) };
    } catch (err) {
      logger.warn('Alpaca clock check failed', { error: err.message });
      clockCache = { at: now, open: false };
    }
    return clockCache.open;
  }

  async function execute({ symbol, side, qty, price }) {
    if (!configured) throw new Error('Alpaca keys not configured');
    if (isLiveUrl && !config.liveTrading) {
      throw new Error('Alpaca live endpoint requires the live-trading gate (TRADING_MODE/LIVE_CONFIRM)');
    }
    const order = {
      symbol,
      qty: String(Number(qty.toFixed(4))),
      side: side.toLowerCase(),
      type: 'market',
      time_in_force: 'day'
    };
    const res = await fetchImpl(`${baseUrl}/v2/orders`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Alpaca order rejected: ${body.message || res.status}`);

    // Poll briefly for the fill (market orders fill fast during RTH).
    let filled = body;
    for (let i = 0; i < 5 && !Number(filled.filled_avg_price); i += 1) {
      await new Promise((r) => setTimeout(r, 400));
      const check = await fetchImpl(`${baseUrl}/v2/orders/${body.id}`, { headers });
      if (check.ok) filled = await check.json();
    }
    const filledQty = Number(filled.filled_qty) || Number(qty.toFixed(4));
    const fillPrice = Number(filled.filled_avg_price) || price;
    return {
      id: String(body.id),
      symbol,
      side,
      qty: filledQty,
      price: fillPrice,
      fee: 0, // Alpaca US-equity commissions are zero
      notional: filledQty * fillPrice,
      mode
    };
  }

  return {
    key: 'alpaca',
    assetClass: 'us_equity',
    label: 'Alpaca (US stocks)',
    configured,
    mode,
    marketData: { getCandles, getPrice },
    executor: { mode, execute },
    isOpen
  };
}
