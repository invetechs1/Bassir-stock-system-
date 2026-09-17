import { config } from './config.js';
import { logger } from './logger.js';
import { seed } from './db/seed.js';
import { createApp } from './app.js';
import { attachWebSocket } from './ws.js';
import { startSimulator, stopSimulator } from './services/priceSimulator.js';
import { startSnapshots, stopSnapshots } from './services/analyticsService.js';
import { engine } from './agents/engine.js';

// Ensure schema + seed data exist, then start background pricing and the API.
seed();
startSimulator(config.TICK_MS);
startSnapshots(config.SNAPSHOT_MS);

// The autonomous-agent engine only auto-starts when explicitly enabled, and
// even then individual agents remain disabled until switched on.
if (config.ENGINE_AUTOSTART) {
  engine.start();
  logger.info('Agent engine auto-started', {
    mode: config.liveTrading ? 'LIVE' : 'paper',
    tickMs: config.AGENT_TICK_MS
  });
}

const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info('Stock system API started', {
    port: config.PORT,
    env: config.NODE_ENV
  });
});
attachWebSocket(server);

function shutdown(signal) {
  logger.info('Shutting down', { signal });
  stopSimulator();
  stopSnapshots();
  engine.stop();
  server.close(() => process.exit(0));
  // Force-exit if connections linger.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
