import { config } from '../config.js';
import { logger } from '../logger.js';
import { getVenue } from '../exchange/venues.js';
import { getStrategy } from './strategies.js';
import * as agents from './agentService.js';
import * as risk from './riskManager.js';
import { agentEvents, AGENT_UPDATE, FLEET_UPDATE } from './agentEvents.js';

// The decision engine. Each tick, for every enabled agent it resolves the
// agent's venue (Binance/crypto or Alpaca/US-equities), skips it if that market
// is closed, then: fetches candles, marks to market, applies protective stops,
// and — if clear — runs the strategy, passes any signal through the risk
// manager, and executes the fill. Venue resolution is injected so tests run
// entirely offline.
export function createEngine({
  resolveVenue = (agent) => getVenue(agent.venue),
  interval = config.AGENT_CANDLE_INTERVAL,
  candleLimit = 120
} = {}) {
  function totalDeployed() {
    return agents.listAgents().reduce((s, a) => s + a.position.value, 0);
  }

  async function execFill(row, venue, side, qty, price, reason) {
    const fill = await venue.executor.execute({ symbol: row.symbol, side, qty, price });
    const fresh = agents.getAgentRow(row.id);
    agents.applyFill(fresh, fill, reason);
    logger.info('Agent fill', {
      agent: row.id,
      venue: venue.key,
      side,
      qty: fill.qty,
      price: fill.price,
      mode: fill.mode,
      reason
    });
  }

  async function stepAgent(row) {
    const strat = getStrategy(row.strategy);
    const venue = resolveVenue(row);
    if (!strat || !venue) return;

    // Stock venues are closed nights/weekends; skip rather than trade on a
    // stale price. Crypto venues report open 24/7.
    if (!venue.configured || !(await venue.isOpen())) return;

    const candles = await venue.marketData.getCandles(row.symbol, interval, candleLimit);
    if (!candles.length) return;
    const closes = candles.map((c) => c.close);
    const price = closes[closes.length - 1];

    // 1) Mark to market and enforce protective stops before anything else.
    const marks = agents.mark(row.id, price);
    const trip = risk.monitor(row, marks);
    if (trip) {
      if (trip.liquidate && row.position_qty > 0) {
        await execFill(row, venue, 'SELL', row.position_qty, price, `risk: ${trip.kind}`);
        agents.setStatus(row.id, trip.kind);
      }
      agentEvents.emit(AGENT_UPDATE, agents.getAgent(row.id));
      return;
    }

    // 2) Strategy signal → risk assessment → execution.
    if (candles.length >= strat.warmup) {
      const decision = strat.decide({
        closes,
        highs: candles.map((c) => c.high),
        lows: candles.map((c) => c.low),
        price,
        holding: row.position_qty > 0
      });
      if (decision.action !== 'HOLD') {
        const verdict = risk.assess(row, decision, price, { totalDeployed: totalDeployed() });
        if (verdict.approved && verdict.qty > 0) {
          await execFill(row, venue, verdict.side, verdict.qty, price, verdict.reason);
        }
      }
    }

    agentEvents.emit(AGENT_UPDATE, agents.getAgent(row.id));
  }

  async function tickOnce() {
    if (agents.isKillSwitchOn()) return;
    for (const row of agents.getActiveRows()) {
      try {
        await stepAgent(row);
      } catch (err) {
        logger.error('Agent step failed', { agent: row.id, error: err.message });
      }
    }
    agentEvents.emit(FLEET_UPDATE, agents.fleetSummary());
  }

  let timer = null;
  function start(tickMs = config.AGENT_TICK_MS) {
    if (timer) return;
    agents.setEngineRunning(true);
    const run = () => tickOnce().catch((err) => logger.error('Tick failed', { error: err.message }));
    timer = setInterval(run, tickMs);
    if (timer.unref) timer.unref();
    run();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    agents.setEngineRunning(false);
  }

  const isRunning = () => timer !== null;

  return { tickOnce, stepAgent, start, stop, isRunning };
}

// Shared singleton used by the API routes and server bootstrap.
export const engine = createEngine();
