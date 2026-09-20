import { describe, it, expect, afterAll } from 'vitest';
import './helpers.js'; // ensures the DB is seeded (agents created)
import { config } from '../src/config.js';
import { assess, monitor, engageKillSwitch, releaseKillSwitch } from '../src/agents/riskManager.js';
import * as agents from '../src/agents/agentService.js';

const flatRow = { id: 'test', allocation: 50, cash: 50, position_qty: 0 };

describe('risk manager', () => {
  afterAll(() => releaseKillSwitch());

  it('sizes a BUY to the allocation and price', () => {
    const v = assess(flatRow, { action: 'BUY', reason: 'x' }, 100, { totalDeployed: 0 });
    expect(v.approved).toBe(true);
    expect(v.side).toBe('BUY');
    expect(v.notional).toBe(50);
    expect(v.qty).toBeCloseTo(0.5, 6);
  });

  it('rejects a BUY when the exposure cap is reached', () => {
    const v = assess(flatRow, { action: 'BUY', reason: 'x' }, 100, {
      totalDeployed: config.RISK_MAX_TOTAL_EXPOSURE
    });
    expect(v.approved).toBe(false);
    expect(v.reason).toMatch(/exposure/i);
  });

  it('rejects a BUY below the minimum notional', () => {
    const v = assess({ ...flatRow, cash: 0.5 }, { action: 'BUY', reason: 'x' }, 100, {});
    expect(v.approved).toBe(false);
    expect(v.reason).toMatch(/minimum/i);
  });

  it('closes the full position on SELL and rejects selling when flat', () => {
    const held = { id: 't', allocation: 50, cash: 10, position_qty: 0.4 };
    const sell = assess(held, { action: 'SELL', reason: 'x' }, 120, {});
    expect(sell.approved).toBe(true);
    expect(sell.qty).toBe(0.4);
    expect(assess(flatRow, { action: 'SELL', reason: 'x' }, 120, {}).approved).toBe(false);
  });

  it('honors the global kill switch', () => {
    engageKillSwitch('test');
    expect(agents.isKillSwitchOn()).toBe(true);
    expect(assess(flatRow, { action: 'BUY', reason: 'x' }, 100, {}).approved).toBe(false);
    releaseKillSwitch();
    expect(agents.isKillSwitchOn()).toBe(false);
  });

  it('trips a drawdown stop and disables the agent', () => {
    const id = 'ada-bollinger';
    const row = agents.getAgentRow(id);
    const trip = monitor(row, { equity: 40, peak: 100, dayStartEquity: 100 });
    expect(trip).not.toBeNull();
    expect(trip.kind).toBe('STOPPED_DRAWDOWN');
    const after = agents.getAgent(id);
    expect(after.enabled).toBe(false);
    expect(after.status).toBe('STOPPED_DRAWDOWN');
    expect(agents.listRiskEvents(10).some((e) => e.kind === 'STOPPED_DRAWDOWN')).toBe(true);
  });
});
