import { describe, it, expect, beforeEach } from 'vitest';
import './helpers.js'; // seed DB + agents
import { createEngine } from '../src/agents/engine.js';
import { createPaperExecutor } from '../src/exchange/execution.js';
import * as agents from '../src/agents/agentService.js';

// A deterministic, offline venue: controllable close series + open flag.
function makeVenue(series, { open = true } = {}) {
  const candles = () =>
    series.map((c) => ({ open: c, high: c, low: c, close: c, volume: 1, openTime: 0, closeTime: 0 }));
  return {
    key: 'test',
    configured: true,
    isOpen: async () => open,
    marketData: { getCandles: async () => candles(), getPrice: async () => series[series.length - 1] },
    executor: createPaperExecutor({ feeRate: 0 }),
    set: (s) => {
      series = s;
    },
    setOpen: (o) => {
      open = o;
    }
  };
}

const ascending = Array.from({ length: 60 }, (_, i) => 100 + i);
const AGENT = 'btc-sma-crossover';

describe('agent engine', () => {
  beforeEach(() => {
    agents.setKillSwitch(false);
  });

  it('start/stop toggles the running flag', () => {
    const eng = createEngine({ resolveVenue: () => makeVenue(ascending) });
    eng.start(10_000_000);
    expect(eng.isRunning()).toBe(true);
    eng.stop();
    expect(eng.isRunning()).toBe(false);
  });

  it('skips an agent whose market is closed', async () => {
    const venue = makeVenue(ascending, { open: false });
    const eng = createEngine({ resolveVenue: () => venue });
    agents.setEnabled(AGENT, true);
    await eng.stepAgent(agents.getAgentRow(AGENT));
    expect(agents.getAgent(AGENT).position.qty).toBe(0); // no trade while closed
  });

  it('opens a position when the strategy signals BUY on an uptrend', async () => {
    const eng = createEngine({ resolveVenue: () => makeVenue(ascending) });
    agents.setEnabled(AGENT, true);
    await eng.stepAgent(agents.getAgentRow(AGENT));

    const a = agents.getAgent(AGENT);
    expect(a.position.qty).toBeGreaterThan(0);
    expect(a.cash).toBeLessThan(a.allocation);
    expect(agents.getTrades(AGENT, 10).some((t) => t.side === 'BUY')).toBe(true);
  });

  it('force-liquidates and disables an agent when drawdown breaches the limit', async () => {
    const venue = makeVenue(ascending);
    const eng = createEngine({ resolveVenue: () => venue });
    agents.setEnabled(AGENT, true);
    if (agents.getAgent(AGENT).position.qty === 0) {
      await eng.stepAgent(agents.getAgentRow(AGENT));
    }
    expect(agents.getAgent(AGENT).position.qty).toBeGreaterThan(0);

    venue.set(Array.from({ length: 60 }, () => 70)); // ~50% crash
    await eng.stepAgent(agents.getAgentRow(AGENT));

    const a = agents.getAgent(AGENT);
    expect(a.position.qty).toBe(0);
    expect(a.enabled).toBe(false);
    expect(a.status).toBe('STOPPED_DRAWDOWN');
  });
});
