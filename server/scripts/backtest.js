#!/usr/bin/env node
// Backtest a strategy against real Binance history.
//
//   node scripts/backtest.js <strategy> <symbol> [interval] [limit]
//   node scripts/backtest.js sma-crossover BTCUSDT 1h 1000
//
// Strategies: sma-crossover, ema-trend, momentum, rsi-reversion, macd,
//             bollinger, breakout. Requires outbound access to Binance.
import { getCandles } from '../src/exchange/marketData.js';
import { runBacktest } from '../src/agents/backtest.js';
import { strategies } from '../src/agents/strategies.js';

const [, , strategy, symbol = 'BTCUSDT', interval = '1h', limit = '1000'] = process.argv;

if (!strategy || !strategies[strategy]) {
  console.error('Usage: node scripts/backtest.js <strategy> <symbol> [interval] [limit]');
  console.error('Strategies:', Object.keys(strategies).join(', '));
  process.exit(1);
}

try {
  const candles = await getCandles(symbol, interval, Number(limit));
  const result = runBacktest(candles, strategy);
  console.log(`\nBacktest — ${strategy} on ${symbol} ${interval} (${candles.length} candles)\n`);
  console.table(result);
  console.log(
    '\nNote: past performance does not imply future results. Fees and slippage' +
      ' in live markets are typically worse than modeled here.\n'
  );
} catch (err) {
  console.error('Backtest failed:', err.message);
  process.exit(1);
}
