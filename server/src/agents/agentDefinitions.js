import { config } from '../config.js';

// The fleet. Each agent runs a distinct strategy, on a distinct instrument, on
// a specific venue, with the risk manager sitting above them all. Agents are
// created disabled — nothing trades until explicitly enabled.
//
// Fleets are selected via config.fleets (AGENT_FLEETS):
//   crypto     — Binance pairs, trade 24/7
//   us_equity  — US stocks via Alpaca, trade during US market hours

const STRATEGY_ROTATION = [
  'sma-crossover',
  'ema-trend',
  'momentum',
  'rsi-reversion',
  'macd',
  'bollinger',
  'breakout'
];

const CRYPTO_BASES = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE'];
const US_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'];

function cryptoFleet() {
  return CRYPTO_BASES.map((base, i) => ({
    id: `${base.toLowerCase()}-${STRATEGY_ROTATION[i]}`,
    name: `${base} ${STRATEGY_ROTATION[i].replace(/-/g, ' ')}`,
    strategy: STRATEGY_ROTATION[i],
    symbol: `${base}${config.QUOTE_ASSET}`,
    venue: 'binance',
    allocation: config.AGENT_ALLOCATION
  }));
}

function usEquityFleet() {
  return US_SYMBOLS.map((sym, i) => ({
    id: `${sym.toLowerCase()}-${STRATEGY_ROTATION[i]}`,
    name: `${sym} ${STRATEGY_ROTATION[i].replace(/-/g, ' ')}`,
    strategy: STRATEGY_ROTATION[i],
    symbol: sym,
    venue: 'alpaca',
    allocation: config.AGENT_ALLOCATION
  }));
}

export function agentDefinitions() {
  const out = [];
  if (config.fleets.includes('crypto')) out.push(...cryptoFleet());
  if (config.fleets.includes('us_equity')) out.push(...usEquityFleet());
  return out;
}
