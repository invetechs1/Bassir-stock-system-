import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  recordRiskEvent,
  setStatus,
  setEnabled,
  setKillSwitch,
  isKillSwitchOn
} from './agentService.js';

// The risk manager sits between every agent and the executor. No order reaches
// the exchange without passing assess(); and after each mark-to-market it trips
// protective stops (per-agent drawdown, daily loss) and honors the global kill
// switch. It only ever reduces risk — it never enlarges a position.

// Decide whether/how to act on a strategy's signal. Returns an approved order
// with a concrete quantity, or a rejection with a reason.
export function assess(row, decision, price, { totalDeployed = 0 } = {}) {
  if (isKillSwitchOn()) {
    return { approved: false, reason: 'global kill switch engaged' };
  }
  if (!price || price <= 0) {
    return { approved: false, reason: 'no valid price' };
  }

  if (decision.action === 'BUY') {
    if (row.position_qty > 0) {
      return { approved: false, reason: 'already holding a position' };
    }
    const maxNotional = row.allocation * config.RISK_MAX_POSITION_FRACTION;
    let notional = Math.min(row.cash, maxNotional);

    const exposureRoom = config.RISK_MAX_TOTAL_EXPOSURE - totalDeployed;
    if (exposureRoom <= 0) {
      return { approved: false, reason: 'total exposure cap reached' };
    }
    notional = Math.min(notional, exposureRoom);

    if (notional < config.RISK_MIN_ORDER_NOTIONAL) {
      return { approved: false, reason: 'order below minimum notional' };
    }
    return {
      approved: true,
      side: 'BUY',
      qty: notional / price,
      notional,
      reason: decision.reason
    };
  }

  if (decision.action === 'SELL') {
    if (row.position_qty <= 0) {
      return { approved: false, reason: 'no position to sell' };
    }
    return {
      approved: true,
      side: 'SELL',
      qty: row.position_qty,
      notional: row.position_qty * price,
      reason: decision.reason
    };
  }

  return { approved: false, reason: decision.reason || 'hold' };
}

// After marking an agent to market, check protective limits. Returns a trip
// descriptor ({ kind, message, liquidate }) when a limit is breached, else null.
// The engine performs any liquidation, then this disables the agent.
export function monitor(row, { equity, peak, dayStartEquity }) {
  const drawdown = peak > 0 ? (peak - equity) / peak : 0;
  if (drawdown >= config.RISK_MAX_DRAWDOWN_PCT / 100) {
    const message = `drawdown ${(drawdown * 100).toFixed(1)}% ≥ ${config.RISK_MAX_DRAWDOWN_PCT}% limit`;
    trip(row.id, 'STOPPED_DRAWDOWN', message);
    return { kind: 'STOPPED_DRAWDOWN', message, liquidate: true };
  }

  const dailyLoss = dayStartEquity > 0 ? (dayStartEquity - equity) / dayStartEquity : 0;
  if (dailyLoss >= config.RISK_DAILY_LOSS_LIMIT_PCT / 100) {
    const message = `daily loss ${(dailyLoss * 100).toFixed(1)}% ≥ ${config.RISK_DAILY_LOSS_LIMIT_PCT}% limit`;
    trip(row.id, 'HALTED_DAILY', message);
    return { kind: 'HALTED_DAILY', message, liquidate: true };
  }

  return null;
}

function trip(agentId, status, message) {
  setEnabled(agentId, false);
  setStatus(agentId, status);
  recordRiskEvent(agentId, status, message);
  logger.warn('Risk limit tripped', { agentId, status, message });
}

// Global emergency stop: halt every agent immediately.
export function engageKillSwitch(reason = 'manual kill switch') {
  setKillSwitch(true);
  recordRiskEvent(null, 'KILL_SWITCH', reason);
  logger.warn('Kill switch engaged', { reason });
}

export function releaseKillSwitch() {
  setKillSwitch(false);
  recordRiskEvent(null, 'KILL_SWITCH_RELEASED', 'kill switch released');
}
