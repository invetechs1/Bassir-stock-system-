import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin, isAdminUser } from '../middleware/admin.js';
import { asyncHandler } from '../middleware/error.js';
import { notFound, unauthorized, ApiError } from '../utils/errors.js';
import * as agents from '../agents/agentService.js';
import * as risk from '../agents/riskManager.js';
import { engine } from '../agents/engine.js';
import { venueStatuses } from '../exchange/venues.js';
import { agentEvents, AGENT_UPDATE, FLEET_UPDATE } from '../agents/agentEvents.js';

const router = Router();

function riskLimits() {
  return {
    maxDrawdownPct: config.RISK_MAX_DRAWDOWN_PCT,
    dailyLossLimitPct: config.RISK_DAILY_LOSS_LIMIT_PCT,
    maxTotalExposure: config.RISK_MAX_TOTAL_EXPOSURE,
    maxPositionFraction: config.RISK_MAX_POSITION_FRACTION,
    minOrderNotional: config.RISK_MIN_ORDER_NOTIONAL
  };
}

// --- SSE live stream (declared before the header-based admin guard because
// EventSource cannot send an Authorization header; it authenticates via a
// ?token= query parameter instead). -------------------------------------
router.get('/stream', (req, res, next) => {
  try {
    const payload = jwt.verify(req.query.token || '', config.JWT_SECRET);
    if (!isAdminUser(payload.sub)) throw new ApiError(403, 'Admin access required');
  } catch (err) {
    return next(err.status ? err : unauthorized('Invalid token'));
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  const sendAgent = (a) => res.write(`event: agent\ndata: ${JSON.stringify(a)}\n\n`);
  const sendFleet = (f) => res.write(`event: fleet\ndata: ${JSON.stringify(f)}\n\n`);

  // Initial snapshot so the dashboard renders immediately.
  res.write(
    `event: snapshot\ndata: ${JSON.stringify({
      agents: agents.listAgents(),
      summary: agents.fleetSummary()
    })}\n\n`
  );

  agentEvents.on(AGENT_UPDATE, sendAgent);
  agentEvents.on(FLEET_UPDATE, sendFleet);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    agentEvents.off(AGENT_UPDATE, sendAgent);
    agentEvents.off(FLEET_UPDATE, sendFleet);
    res.end();
  });
});

// Everything below requires an authenticated admin.
router.use(requireAuth, requireAdmin);

// GET /api/agents - fleet overview.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({
      agents: agents.listAgents(),
      summary: agents.fleetSummary(),
      risk: riskLimits(),
      venues: await venueStatuses()
    });
  })
);

// GET /api/agents/risk - risk config + recent risk events.
router.get(
  '/risk',
  asyncHandler(async (req, res) => {
    res.json({ limits: riskLimits(), events: agents.listRiskEvents(100) });
  })
);

// POST /api/agents/engine/start | stop - control the decision loop.
router.post(
  '/engine/:action',
  asyncHandler(async (req, res) => {
    if (req.params.action === 'start') engine.start();
    else if (req.params.action === 'stop') engine.stop();
    else throw new ApiError(400, 'Unknown engine action');
    res.json({ engineRunning: engine.isRunning(), summary: agents.fleetSummary() });
  })
);

// POST /api/agents/kill | kill/release - global emergency stop.
router.post(
  '/kill',
  asyncHandler(async (req, res) => {
    risk.engageKillSwitch('manual kill switch (API)');
    res.json({ killSwitch: true, summary: agents.fleetSummary() });
  })
);
router.post(
  '/kill/release',
  asyncHandler(async (req, res) => {
    risk.releaseKillSwitch();
    res.json({ killSwitch: false, summary: agents.fleetSummary() });
  })
);

// POST /api/agents/reset - restore paper balances (refused in live mode).
router.post(
  '/reset',
  asyncHandler(async (req, res) => {
    if (config.liveTrading) throw new ApiError(409, 'Reset is disabled while live trading');
    agents.resetAgents();
    res.json({ agents: agents.listAgents(), summary: agents.fleetSummary() });
  })
);

// GET /api/agents/:id - agent detail with trades and equity curve.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const agent = agents.getAgent(req.params.id);
    if (!agent) throw notFound('Agent not found');
    res.json({
      agent,
      trades: agents.getTrades(req.params.id, 50),
      equityCurve: agents.getEquityCurve(req.params.id, 500)
    });
  })
);

// POST /api/agents/:id/enable | disable.
router.post(
  '/:id/:action',
  asyncHandler(async (req, res) => {
    const { id, action } = req.params;
    if (!['enable', 'disable'].includes(action)) throw new ApiError(400, 'Unknown action');
    if (action === 'enable' && agents.isKillSwitchOn()) {
      throw new ApiError(409, 'Release the kill switch before enabling agents');
    }
    const agent = agents.setEnabled(id, action === 'enable');
    if (!agent) throw notFound('Agent not found');
    res.json({ agent });
  })
);

export default router;
