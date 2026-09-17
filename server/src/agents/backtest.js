import { getStrategy } from './strategies.js';

// Replay a strategy over historical candles (oldest first) as a long-only,
// all-in paper trader and report performance. This is how you vet a strategy
// BEFORE enabling it — architecture doesn't create edge, evidence does.
export function runBacktest(candles, strategyKey, { allocation = 1000, feeRate = 0.001 } = {}) {
  const strat = getStrategy(strategyKey);
  if (!strat) throw new Error(`Unknown strategy: ${strategyKey}`);

  let cash = allocation;
  let qty = 0;
  let avg = 0;
  let peak = allocation;
  let maxDrawdown = 0;
  let trades = 0;
  let wins = 0;
  let losses = 0;

  for (let i = strat.warmup; i < candles.length; i += 1) {
    const window = candles.slice(0, i + 1);
    const closes = window.map((c) => c.close);
    const price = closes[closes.length - 1];
    const decision = strat.decide({
      closes,
      highs: window.map((c) => c.high),
      lows: window.map((c) => c.low),
      price,
      holding: qty > 0
    });

    if (decision.action === 'BUY' && qty === 0) {
      const fee = cash * feeRate;
      qty = (cash - fee) / price;
      avg = price;
      cash = 0;
      trades += 1;
    } else if (decision.action === 'SELL' && qty > 0) {
      const notional = qty * price;
      const fee = notional * feeRate;
      const pnl = (price - avg) * qty - fee;
      cash = notional - fee;
      qty = 0;
      avg = 0;
      if (pnl >= 0) wins += 1;
      else losses += 1;
    }

    const equity = cash + qty * price;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 0);
  }

  const lastPrice = candles[candles.length - 1].close;
  const finalEquity = cash + qty * lastPrice;
  const closed = wins + losses;

  return {
    strategy: strategyKey,
    candles: candles.length,
    allocation,
    finalEquity: round(finalEquity),
    returnPct: round(((finalEquity - allocation) / allocation) * 100),
    trades,
    closedTrades: closed,
    wins,
    losses,
    winRatePct: closed ? round((wins / closed) * 100) : 0,
    maxDrawdownPct: round(maxDrawdown * 100),
    openPosition: qty > 0
  };
}

const round = (n) => Math.round(n * 100) / 100;
