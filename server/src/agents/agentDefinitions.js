import { config } from '../config.js';

// The fleet: seven agents, each running a distinct strategy on a distinct
// liquid pair, plus (conceptually) the risk manager sitting above them all.
// Symbols are quoted against config.QUOTE_ASSET (default USDT). Agents are
// created disabled — nothing trades until explicitly enabled.
const BASES = [
  { base: 'BTC', strategy: 'sma-crossover' },
  { base: 'ETH', strategy: 'ema-trend' },
  { base: 'BNB', strategy: 'momentum' },
  { base: 'SOL', strategy: 'rsi-reversion' },
  { base: 'XRP', strategy: 'macd' },
  { base: 'ADA', strategy: 'bollinger' },
  { base: 'DOGE', strategy: 'breakout' }
];

export function agentDefinitions() {
  return BASES.map(({ base, strategy }) => ({
    id: `${base.toLowerCase()}-${strategy}`,
    name: `${base} ${strategy.replace(/-/g, ' ')}`,
    strategy,
    symbol: `${base}${config.QUOTE_ASSET}`,
    allocation: config.AGENT_ALLOCATION
  }));
}
