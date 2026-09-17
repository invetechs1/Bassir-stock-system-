import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import authRouter from './routes/auth.js';
import stocksRouter from './routes/stocks.js';
import portfolioRouter from './routes/portfolio.js';
import watchlistRouter from './routes/watchlist.js';
import ordersRouter from './routes/orders.js';
import streamRouter from './routes/stream.js';
import leaderboardRouter from './routes/leaderboard.js';
import agentsRouter from './routes/agents.js';

// Build the Express app without starting a server, so tests can drive it
// directly via supertest.
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',')
    })
  );
  app.use(express.json({ limit: '100kb' }));

  // Trust the first proxy hop so rate limiting sees real client IPs.
  app.set('trust proxy', 1);

  app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', time: Date.now() })
  );

  // Stricter limit on auth to slow credential-stuffing; skip entirely in tests.
  if (!config.isTest) {
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 50,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many attempts, please try again later' }
    });
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/register', authLimiter);

    const apiLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false
    });
    app.use('/api', apiLimiter);
  }

  app.use('/api/auth', authRouter);
  app.use('/api/stocks', stocksRouter);
  app.use('/api/stream', streamRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/watchlist', watchlistRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/agents', agentsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
