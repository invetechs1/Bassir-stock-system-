import crypto from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';

// An executor turns an approved order proposal into a fill. Two implementations
// share one interface so the engine is agnostic to how orders are executed:
//
//   execute({ symbol, side, qty, price }) -> Promise<{
//     id, symbol, side, qty, price, fee, notional, mode
//   }>
//
// - paper: fills are simulated in-process at the current market price with an
//   assumed fee. No keys, no network writes, no funds at risk. (default)
// - live: real MARKET orders are sent to Binance. When BINANCE_BASE_URL points
//   at the testnet, this exercises the full order path with fake balances;
//   pointing it at api.binance.com trades real funds. Gated by config.liveTrading.

function hmac(query, secret) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

// Round quantity to a sane precision. NOTE: live venues enforce per-symbol
// LOT_SIZE step sizes via exchangeInfo; wiring that in is a hardening follow-up
// before mainnet. Paper mode is unaffected.
function formatQty(qty) {
  return Number(qty.toFixed(6));
}

export function createPaperExecutor({ feeRate = config.AGENT_FEE_RATE } = {}) {
  return {
    mode: 'paper',
    async execute({ symbol, side, qty, price }) {
      const filledQty = formatQty(qty);
      const notional = filledQty * price;
      const fee = notional * feeRate;
      return {
        id: `paper-${crypto.randomUUID()}`,
        symbol,
        side,
        qty: filledQty,
        price,
        fee,
        notional,
        mode: 'paper'
      };
    }
  };
}

export function createBinanceExecutor({
  apiKey = config.BINANCE_API_KEY,
  apiSecret = config.BINANCE_API_SECRET,
  baseUrl = config.BINANCE_BASE_URL,
  fetchImpl = fetch,
  recvWindow = 5000
} = {}) {
  const label = baseUrl.includes('testnet') ? 'testnet' : 'live';
  return {
    mode: label,
    async execute({ symbol, side, qty, price }) {
      const params = new URLSearchParams({
        symbol,
        side,
        type: 'MARKET',
        quantity: String(formatQty(qty)),
        timestamp: String(Date.now()),
        recvWindow: String(recvWindow)
      });
      params.append('signature', hmac(params.toString(), apiSecret));

      const res = await fetchImpl(`${baseUrl}/api/v3/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(`Binance order rejected: ${body.msg || res.status}`);
      }

      const fills = body.fills || [];
      const filledQty = Number(body.executedQty) || formatQty(qty);
      const cost =
        Number(body.cummulativeQuoteQty) ||
        fills.reduce((s, f) => s + Number(f.price) * Number(f.qty), 0) ||
        filledQty * price;
      const fee = fills.reduce((s, f) => s + Number(f.commission || 0), 0);
      return {
        id: String(body.orderId),
        symbol,
        side,
        qty: filledQty,
        price: filledQty ? cost / filledQty : price,
        fee,
        notional: cost,
        mode: label
      };
    }
  };
}

// Select the executor from configuration. Live routing only happens once the
// confirmation gate in config.js has been cleared (config.liveTrading).
export function getExecutor() {
  if (config.liveTrading) {
    logger.warn('LIVE trading enabled — real orders will be sent', {
      baseUrl: config.BINANCE_BASE_URL
    });
    return createBinanceExecutor();
  }
  return createPaperExecutor();
}
