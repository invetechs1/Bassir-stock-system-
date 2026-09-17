import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { round2 } from '../utils/money.js';
import { agentDefinitions } from './agentDefinitions.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// --- prepared statements ------------------------------------------------
const insertAgent = db.prepare(`
  INSERT OR IGNORE INTO agents
    (id, name, strategy, symbol, venue, allocation, cash, enabled, status,
     mark_price, equity, realized_pnl, peak_equity, day_start_equity, day_start_ts,
     created_at, updated_at)
  VALUES
    (@id, @name, @strategy, @symbol, @venue, @allocation, @allocation, 0, 'IDLE',
     0, @allocation, 0, @allocation, @allocation, @now, @now, @now)
`);
const selectAgent = db.prepare('SELECT * FROM agents WHERE id = ?');
const selectAgents = db.prepare('SELECT * FROM agents ORDER BY created_at');
const selectActive = db.prepare('SELECT * FROM agents WHERE enabled = 1');
const updateEnabled = db.prepare(
  'UPDATE agents SET enabled = ?, status = ?, updated_at = ? WHERE id = ?'
);
const updateStatus = db.prepare(
  'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?'
);
const updatePosition = db.prepare(`
  UPDATE agents SET cash = ?, position_qty = ?, position_avg = ?,
    realized_pnl = ?, status = ?, updated_at = ? WHERE id = ?
`);
const updateMark = db.prepare(`
  UPDATE agents SET mark_price = ?, equity = ?, peak_equity = ?,
    day_start_equity = ?, day_start_ts = ?, updated_at = ? WHERE id = ?
`);
const insertTrade = db.prepare(`
  INSERT INTO agent_trades
    (id, agent_id, side, qty, price, fee, notional, realized_pnl, reason, mode, ext_order_id, ts)
  VALUES (@id, @agent_id, @side, @qty, @price, @fee, @notional, @realized_pnl, @reason, @mode, @ext_order_id, @ts)
`);
const insertEquity = db.prepare(
  'INSERT INTO agent_equity (agent_id, equity, ts) VALUES (?, ?, ?)'
);
const selectTrades = db.prepare(
  'SELECT * FROM agent_trades WHERE agent_id = ? ORDER BY ts DESC LIMIT ?'
);
const selectEquity = db.prepare(
  'SELECT equity, ts FROM agent_equity WHERE agent_id = ? ORDER BY ts DESC LIMIT ?'
);
const insertRiskEvent = db.prepare(
  'INSERT INTO risk_events (id, agent_id, kind, message, ts) VALUES (?, ?, ?, ?, ?)'
);
const selectRiskEvents = db.prepare(
  'SELECT * FROM risk_events ORDER BY ts DESC LIMIT ?'
);
const getFlagStmt = db.prepare('SELECT value FROM system_flags WHERE key = ?');
const setFlagStmt = db.prepare(
  'INSERT INTO system_flags (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

// --- lifecycle ----------------------------------------------------------
export function initAgents() {
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const def of agentDefinitions()) insertAgent.run({ ...def, now });
  });
  tx();
}

export function listAgents() {
  return selectAgents.all().map(toPublic);
}

export function getAgent(id) {
  const row = selectAgent.get(id);
  return row ? toPublic(row) : null;
}

export function getAgentRow(id) {
  return selectAgent.get(id);
}

export function getActiveRows() {
  return selectActive.all();
}

function toPublic(row) {
  const positionValue = row.position_qty * row.mark_price;
  const unrealized =
    row.position_qty > 0 ? (row.mark_price - row.position_avg) * row.position_qty : 0;
  return {
    id: row.id,
    name: row.name,
    strategy: row.strategy,
    symbol: row.symbol,
    venue: row.venue,
    allocation: row.allocation,
    cash: round2(row.cash),
    position: {
      qty: row.position_qty,
      avgPrice: round2(row.position_avg),
      value: round2(positionValue)
    },
    markPrice: row.mark_price,
    equity: round2(row.equity),
    realizedPnl: round2(row.realized_pnl),
    unrealizedPnl: round2(unrealized),
    totalPnl: round2(row.equity - row.allocation),
    returnPct: row.allocation ? round2(((row.equity - row.allocation) / row.allocation) * 100) : 0,
    enabled: Boolean(row.enabled),
    status: row.status,
    updatedAt: row.updated_at
  };
}

export function setEnabled(id, enabled) {
  const row = selectAgent.get(id);
  if (!row) return null;
  const status = enabled ? 'ACTIVE' : 'IDLE';
  updateEnabled.run(enabled ? 1 : 0, status, Date.now(), id);
  return getAgent(id);
}

export function setStatus(id, status) {
  updateStatus.run(status, Date.now(), id);
}

// Apply a fill to an agent's cash/position, recording the trade and realized
// P&L. Runs in a transaction so cash and position never diverge.
export const applyFill = db.transaction((row, fill, reason) => {
  const now = Date.now();
  let { cash, position_qty: qty, position_avg: avg, realized_pnl: realized } = row;
  let tradeRealized = 0;

  if (fill.side === 'BUY') {
    cash -= fill.notional + fill.fee;
    const newQty = qty + fill.qty;
    avg = newQty > 0 ? (qty * avg + fill.qty * fill.price) / newQty : 0;
    qty = newQty;
  } else {
    cash += fill.notional - fill.fee;
    tradeRealized = (fill.price - avg) * fill.qty - fill.fee;
    realized += tradeRealized;
    qty = Math.max(0, qty - fill.qty);
    if (qty === 0) avg = 0;
  }

  updatePosition.run(cash, qty, avg, realized, 'ACTIVE', now, row.id);
  insertTrade.run({
    id: crypto.randomUUID(),
    agent_id: row.id,
    side: fill.side,
    qty: fill.qty,
    price: fill.price,
    fee: fill.fee,
    notional: fill.notional,
    realized_pnl: tradeRealized,
    reason: reason || null,
    mode: fill.mode,
    ext_order_id: fill.id,
    ts: now
  });
  return { cash, qty, avg, tradeRealized };
});

// Mark an agent to market: recompute equity, track peak, roll the daily
// baseline once a day has elapsed, and append to the equity curve.
export function mark(id, price) {
  const row = selectAgent.get(id);
  if (!row) return null;
  const now = Date.now();
  const equity = row.cash + row.position_qty * price;
  const peak = Math.max(row.peak_equity, equity);

  let dayStartEquity = row.day_start_equity;
  let dayStartTs = row.day_start_ts;
  if (now - row.day_start_ts >= DAY_MS) {
    dayStartEquity = equity;
    dayStartTs = now;
  }

  updateMark.run(price, equity, peak, dayStartEquity, dayStartTs, now, id);
  insertEquity.run(id, equity, now);
  return { equity, peak, dayStartEquity };
}

export function getTrades(id, limit = 50) {
  return selectTrades.all(id, limit);
}

export function getEquityCurve(id, limit = 500) {
  return selectEquity.all(id, limit).reverse();
}

export function recordRiskEvent(agentId, kind, message) {
  insertRiskEvent.run(crypto.randomUUID(), agentId, kind, message, Date.now());
}

export function listRiskEvents(limit = 50) {
  return selectRiskEvents.all(limit);
}

// --- system flags -------------------------------------------------------
export function getFlag(key, fallback = null) {
  const row = getFlagStmt.get(key);
  return row ? row.value : fallback;
}

export function setFlag(key, value) {
  setFlagStmt.run(key, String(value));
}

export const isKillSwitchOn = () => getFlag('kill_switch') === 'on';
export function setKillSwitch(on) {
  setFlag('kill_switch', on ? 'on' : 'off');
}
export const isEngineRunning = () => getFlag('engine_running') === 'on';
export function setEngineRunning(on) {
  setFlag('engine_running', on ? 'on' : 'off');
}

// Portfolio-level rollup across the whole fleet.
export function fleetSummary() {
  const agents = listAgents();
  const allocation = agents.reduce((s, a) => s + a.allocation, 0);
  const equity = agents.reduce((s, a) => s + a.equity, 0);
  const deployed = agents.reduce((s, a) => s + a.position.value, 0);
  return {
    agentCount: agents.length,
    allocation: round2(allocation),
    equity: round2(equity),
    totalPnl: round2(equity - allocation),
    returnPct: allocation ? round2(((equity - allocation) / allocation) * 100) : 0,
    deployed: round2(deployed),
    killSwitch: isKillSwitchOn(),
    engineRunning: isEngineRunning(),
    liveTrading: config.liveTrading,
    mode: config.liveTrading ? 'live' : 'paper'
  };
}

// Full reset back to starting allocations (paper only). Clears history.
export const resetAgents = db.transaction(() => {
  const now = Date.now();
  db.prepare('DELETE FROM agent_trades').run();
  db.prepare('DELETE FROM agent_equity').run();
  db.prepare('DELETE FROM risk_events').run();
  db.prepare(
    `UPDATE agents SET cash = allocation, position_qty = 0, position_avg = 0,
       realized_pnl = 0, mark_price = 0, equity = allocation, peak_equity = allocation,
       day_start_equity = allocation, day_start_ts = ?, enabled = 0, status = 'IDLE',
       updated_at = ? WHERE 1`
  ).run(now, now);
  setKillSwitch(false);
});
