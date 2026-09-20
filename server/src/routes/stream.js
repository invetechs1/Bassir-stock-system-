import { Router } from 'express';
import { marketEvents, TICK_EVENT } from '../services/events.js';
import { listAllStocks } from '../services/stockService.js';

const router = Router();

// GET /api/stream - Server-Sent Events stream of live stock quotes.
// Public (quotes are not user-specific), so the browser EventSource can connect
// without custom headers.
router.get('/', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  const send = (stocks) => {
    res.write(`event: tick\ndata: ${JSON.stringify(stocks)}\n\n`);
  };

  // Push the current snapshot immediately so clients render without waiting.
  send(listAllStocks());

  marketEvents.on(TICK_EVENT, send);

  // Heartbeat keeps proxies from closing an idle connection.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    marketEvents.off(TICK_EVENT, send);
    res.end();
  });
});

export default router;
