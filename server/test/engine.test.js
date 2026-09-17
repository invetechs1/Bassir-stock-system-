import { describe, it, expect, beforeEach } from 'vitest';
import './helpers.js'; // seed DB + agents
import { createEngine } from '../src/agents/engine.js';
import { createPaperExecutor } from '../src/exchange/execution.js';
import * as agents from '../src/agents/agentService.js';

// Deterministic, offline market data: a controllable close series.
function makeMarket(series) {
  const candles = () =>
    series.map((c) => ({ open: c, high: c, low: c, close: c, volume: 1, openTime: 0, closeTime: 0 }));
  return {
    set: (s) => {
      series = s;
    },
    getCandles: async () => candles(),
    getPrice: async () => series[series.length - 1]
  };
}

const ascending = Array.from({ length: 60 }, (_, i) => 100 + i); // uptrend
const executor = createPaperExecutor({ feeRate: 0 });
const AGENT = 'btc-sma-crossover';

describe('agent engine', () => {
  beforeEach(() => {
    agents.setKillSwitch(false);
  });

  it('start/stop toggles the running flag without hitting the network', () => {
    const eng = createEngine({ marketData: makeMarket(ascending), executor });
    eng.start(10_000_000);
    expect(eng.isRunning()).toBe(true);
    eng.stop();
    expect(eng.isRunning()).toBe(false);
  });

  it('opens a position when the strategy signals BUY on an uptrend', async () => {
    const market = makeMarket(ascending);
    const eng = createEngine({ marketData: market, executor });
    agents.setEnabled(AGENT, true);

    await eng.stepAgent(agents.getAgentRow(AGENT));

    const a = agents.getAgent(AGENT);
    expect(a.position.qty).toBeGreaterThan(0);
    expect(a.cash).toBeLessThan(a.allocation);
    expect(agents.getTrades(AGENT, 10).some((t) => t.side === 'BUY')).toBe(true);
  });

  it('force-liquidates and disables an agent when drawdown breaches the limit', async () => {
    const market = makeMarket(ascending);
    const eng = createEngine({ marketData: market, executor });
    agents.setEnabled(AGENT, true);

    // Ensure it is holding (from the previous test or a fresh buy).
    if (agents.getAgent(AGENT).position.qty === 0) {
      await eng.stepAgent(agents.getAgentRow(AGENT));
    }
    expect(agents.getAgent(AGENT).position.qty).toBeGreaterThan(0);

    // Crash the price ~50% below the entry to breach the 20% drawdown stop.
    market.set(Array.from({ length: 60 }, () => 70));
    await eng.stepAgent(agents.getAgentRow(AGENT));

    const a = agents.getAgent(AGENT);
    expect(a.position.qty).toBe(0);
    expect(a.enabled).toBe(false);
    expect(a.status).toBe('STOPPED_DRAWDOWN');
  });
});
