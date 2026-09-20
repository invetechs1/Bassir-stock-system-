# 📈 Stock Trading System

A production-grade, full-stack paper-trading platform. Create an account, watch
live (simulated) prices, build a portfolio with virtual cash, track
gains/losses, and keep a watchlist — backed by an authenticated REST API and a
real database.

> **Two subsystems:** (1) the **stock paper-trading app**, whose prices come from
> a built-in random-walk simulator (self-contained, no API key); and (2) an
> **autonomous multi-venue agent fleet** that trades **crypto (Binance, 24/7)**
> and **US stocks (Alpaca, market hours)** using real market data — in safe
> **paper mode by default**, with a gated path to live trading. See
> [Autonomous trading agents](#autonomous-trading-agents-multi-venue).

## Stack

- **Backend** — Node.js + Express, **SQLite** (better-sqlite3) with migrations,
  **JWT auth** (bcrypt-hashed passwords), per-user portfolios, **zod** request
  validation, **helmet** + **rate limiting**, structured JSON logging, and a
  background price simulator.
- **Frontend** — React (Vite) SPA with an auth flow (register/login), token
  session handling, and a live trading dashboard driven by Server-Sent Events
  (quotes) and an authenticated WebSocket channel (account updates).
- **Ops** — Dockerfiles for both tiers, **docker-compose** (nginx-served client
  + API + persistent volume), and a **GitHub Actions** CI pipeline (tests, build,
  image builds).

## Project layout

```
server/                       Express API
  src/
    config.js                 env validation (zod)
    logger.js                 structured JSON logger
    app.js                    express app factory (security, routes)
    ws.js                     authenticated WebSocket server (live account updates)
    index.js                  entry point (seed, simulator, listen)
    db/                       connection, schema, migrate, migrations, seed
    middleware/               auth, validation, error handling
    services/                 auth, portfolio, orders, analytics, watchlist, stocks, simulator, events, userEvents
    exchange/                 Binance market data + paper/live execution
    agents/                   strategies, indicators, engine, risk manager, backtest
    middleware/               auth, admin, validation, error handling
    routes/                   auth, stocks, stream, portfolio, orders, leaderboard, watchlist, agents
  scripts/                    backtest CLI
  test/                       vitest + supertest suite
  Dockerfile
client/                       React + Vite frontend
  src/
    auth/AuthContext.jsx      session state + token handling
    api/client.js             fetch wrapper with JWT
    components/               AuthScreen, Dashboard, Market, Holdings, …
  Dockerfile, nginx.conf
docker-compose.yml
.github/workflows/ci.yml
```

## Quick start — Docker (recommended)

```bash
cp .env.example .env
# set JWT_SECRET in .env (e.g. openssl rand -hex 32)
docker compose up --build
```

Open **http://localhost:8080**. The nginx-served client proxies `/api` to the
backend; the SQLite database persists in a named volume.

## Quick start — local dev

Requires **Node.js 18+**. Two terminals:

```bash
# 1) Backend
cd server
npm install
npm start            # http://localhost:4000

# 2) Frontend
cd client
npm install
npm run dev          # http://localhost:5173 (proxies /api to :4000)
```

Open **http://localhost:5173**, create an account, and start trading.

## Testing

```bash
cd server
npm test             # vitest + supertest (in-memory SQLite)
```

The suite covers auth (register/login/validation/protected routes), trading
(buy/sell, funds & share validation, transaction logging, per-user isolation),
the order engine (limit/stop placement, triggered fills, insufficient-balance
deferral, time-in-force expiry, cancellation), live WebSocket updates
(authenticated push on trades and server-side fills), and the watchlist.

## Features

- **Accounts** — register/login with JWT auth; bcrypt-hashed passwords.
- **Per-user portfolios** — each account gets its own cash, holdings, watchlist
  and trade history, fully isolated.
- **Live market** — 10 seeded stocks with prices that drift every few seconds,
  pushed to the browser in real time over **Server-Sent Events** (no polling).
- **Market trading** — buy/sell against virtual cash with server-side validation
  (funds, share counts, known symbols), executed in DB transactions.
- **Limit & stop orders** — place resting BUY/SELL orders that the engine
  auto-fills on the next tick once the price crosses the trigger (limit fills on
  a favourable move; stop fills on a breakout/stop-loss move) and the account can
  support the fill. Optional **time-in-force** expires unfilled orders; cancel any
  pending order at any time.
- **Portfolio** — holdings valued at live prices with average cost and
  unrealized gain/loss per position, plus totals.
- **Performance chart** — net worth is snapshotted on an interval; the dashboard
  renders the history as a live SVG sparkline.
- **Leaderboard** — all accounts ranked by net worth (emails masked).
- **Live account updates** — trades and server-side order fills/expiries push
  instantly to the browser over an authenticated WebSocket channel (the account
  poll is just a slow safety net).
- **Watchlist & history** — star stocks to track; every trade is recorded.

## API reference

Authenticated routes require an `Authorization: Bearer <token>` header.

| Method | Endpoint                      | Auth | Description                      |
| ------ | ----------------------------- | :--: | -------------------------------- |
| GET    | `/api/health`                 |  –   | Health check                     |
| POST   | `/api/auth/register`          |  –   | Create account `{ email, password }` |
| POST   | `/api/auth/login`             |  –   | Log in `{ email, password }`     |
| GET    | `/api/auth/me`                |  ✓   | Current user                     |
| GET    | `/api/stocks`                 |  –   | All stocks with live quotes      |
| GET    | `/api/stocks/:symbol`         |  –   | Single stock quote               |
| GET    | `/api/stream`                 |  –   | SSE stream of live quotes (`tick` events) |
| WS     | `/ws?token=<jwt>`             |  ✓   | Live per-user account events (trades, fills) |
| GET    | `/api/portfolio`              |  ✓   | Portfolio with live valuation    |
| POST   | `/api/portfolio/buy`          |  ✓   | Market buy `{ symbol, shares }`  |
| POST   | `/api/portfolio/sell`         |  ✓   | Market sell `{ symbol, shares }` |
| GET    | `/api/portfolio/transactions` |  ✓   | Trade history                    |
| GET    | `/api/portfolio/history`      |  ✓   | Net-worth snapshots over time    |
| GET    | `/api/leaderboard`            |  ✓   | Accounts ranked by net worth     |
| GET    | `/api/orders`                 |  ✓   | List orders                      |
| POST   | `/api/orders`                 |  ✓   | Place `{ side, type?, symbol, shares, limitPrice, expiresAt? }` |
| DELETE | `/api/orders/:id`             |  ✓   | Cancel a pending order           |

`type` is `LIMIT` (default) or `STOP`; `expiresAt` is an optional epoch-ms
time-in-force (omit for good-till-cancel).
| GET    | `/api/watchlist`              |  ✓   | Watched stocks with quotes       |
| POST   | `/api/watchlist`              |  ✓   | Add `{ symbol }`                 |
| DELETE | `/api/watchlist/:symbol`      |  ✓   | Remove a symbol                  |

### Trading agents (admin only)

| Method | Endpoint                          | Description                          |
| ------ | --------------------------------- | ------------------------------------ |
| GET    | `/api/agents`                     | Fleet overview + summary + risk limits |
| GET    | `/api/agents/:id`                 | Agent detail, trades, equity curve   |
| GET    | `/api/agents/risk`                | Risk limits + recent risk events     |
| GET    | `/api/agents/stream?token=<jwt>`  | SSE stream of live agent state       |
| POST   | `/api/agents/:id/enable`\|`disable` | Enable/disable one agent           |
| POST   | `/api/agents/engine/start`\|`stop` | Start/stop the decision loop        |
| POST   | `/api/agents/kill`                | **Global kill switch** — halt all    |
| POST   | `/api/agents/kill/release`        | Release the kill switch              |
| POST   | `/api/agents/reset`               | Reset paper balances (paper only)    |

## Autonomous trading agents (multi-venue)

Fleets of agents — each running a distinct strategy on a distinct instrument
with its own capital allocation (default **$50**) — supervised by a
**top-level risk manager**. Built against a venue-adapter interface, with two
markets implemented:

| Venue | Market | Hours | Broker | Live path |
| ----- | ------ | ----- | ------ | --------- |
| `binance` | Crypto (BTC, ETH, …) | **24/7** | Binance | testnet → mainnet |
| `alpaca` | **US stocks** (AAPL, MSFT, …) | US market hours | Alpaca | paper → live |
| `tadawul` | Saudi stocks | Sun–Thu 10:00–15:00 AST | — | **not available** (see below) |

Select fleets with `AGENT_FLEETS` (default `crypto,us_equity`). Each fleet has 7
agents, one per strategy.

> ### ⏰ On "24/7" and Saudi stocks — please read
> - **Only crypto trades 24/7.** Stock exchanges are closed nights and
>   weekends, so US-stock agents trade **during US market hours** and idle
>   otherwise (the engine skips them when the market is closed). There is no
>   such thing as 24/7 stock trading.
> - **Saudi/Tadawul automation is not available.** No Saudi broker exposes a
>   public retail trading API, and Tadawul market data isn't freely available
>   programmatically, so an agent cannot place real Saudi-stock orders today.
>   The `tadawul` venue is a documented stub (`server/src/exchange/tadawul.js`)
>   describing exactly what a future integration would require — it is
>   intentionally **not** wired up, so nothing pretends to trade it. Enabling it
>   would require a licensed broker/vendor offering a Tadawul order-entry API.
>   For a Saudi resident who wants automated **US** trading, **Interactive
>   Brokers** (global, has an API) is the usual route; Alpaca paper works for
>   everyone.

> ### ⚠️ Read this before risking real money
> - **Architecture is not edge.** Seven agents and a risk manager are just
>   plumbing. Whether they make money depends entirely on the strategies, and
>   naive technical strategies commonly **lose** to fees and spreads. Nothing
>   here guarantees revenue. **Validate before funding.**
> - **Paper first, always.** The system defaults to `paper` mode: fills are
>   simulated in-process against **real Binance prices** — no keys, no funds at
>   risk. Prove a strategy with the backtester and paper trading before going
>   near live money.
> - **Live is deliberately hard to enable** (see below), and starts small.

### Strategies

`sma-crossover`, `ema-trend`, `momentum` (ROC), `rsi-reversion`, `macd`,
`bollinger`, `breakout` (Donchian) — long-only spot. Each is a pure function of
indicators + current position, so it is unit-tested and backtestable.

### Risk manager

Sits between every agent and the exchange; no order reaches the venue without
passing it. Enforces, per agent: a **drawdown kill-switch** (default 20% off
peak → auto-flatten + disable), a **daily loss limit** (10%), a **position-size
cap** (≤ allocation, no leverage), and fleet-wide a **total-exposure cap** and a
**global kill switch** (one button halts everything).

### Run it in paper mode

Agents are created **disabled** and the engine starts **off**. As the owner
(first registered account, or set `ADMIN_EMAILS`), open the dashboard → the
**Trading Agents** panel → **Start trading**, then toggle agents on.

- **Crypto** needs outbound access to Binance for market data (no keys for
  paper).
- **US stocks** need free **Alpaca** paper keys in `.env` (Alpaca data requires
  auth even for paper) — until they're set, the US-equity fleet stays inactive
  and the dashboard shows the venue as "keys not set".

See **[GETTING_API_KEYS.md](./GETTING_API_KEYS.md)** for step-by-step key setup,
and **[DEPLOYMENT.md](./DEPLOYMENT.md)** to deploy on a server.

### Backtest a strategy first

```bash
cd server
npm run backtest sma-crossover BTCUSDT 1h 1000
# → return %, trades, win rate, max drawdown
```

### Going live (only after it's proven)

1. Fund a Binance account and create API keys (spot trading enabled).
2. In `.env`: keep `BINANCE_BASE_URL` on the testnet to rehearse the real order
   path with fake money first, then switch to `https://api.binance.com`.
3. Set `TRADING_MODE=live` **and** `LIVE_CONFIRM=I_UNDERSTAND_THE_RISKS` (the
   server refuses to start in live mode without the exact phrase and API keys).
4. Start with tiny allocations. Keys live only in your local `.env`/secrets and
   are **never** committed.

> Scaling to large capital is a much bigger undertaking (custody, liquidity vs.
> position size, tax/regulatory, monitoring) — treat that as a separate project,
> not a config flag.

## Configuration

All variables are validated at startup (see `server/src/config.js`).

| Env var          | Default                       | Description                          |
| ---------------- | ----------------------------- | ------------------------------------ |
| `NODE_ENV`       | `development`                 | `development` \| `test` \| `production` |
| `PORT`           | `4000`                        | Backend HTTP port                    |
| `DATABASE_PATH`  | `./data/stock-system.db`      | SQLite file path (`:memory:` in tests) |
| `JWT_SECRET`     | dev fallback                  | **Required in production** (min 16 chars) |
| `JWT_EXPIRES_IN` | `7d`                          | Token lifetime                       |
| `TICK_MS`        | `3000`                        | Price simulator tick interval (ms)   |
| `SNAPSHOT_MS`    | `60000`                       | Net-worth snapshot interval (ms)     |
| `STARTING_CASH`  | `100000`                      | Virtual cash per new account         |
| `CORS_ORIGIN`    | `*`                           | Allowed origins (`*` or CSV)         |
| `BCRYPT_ROUNDS`  | `10`                          | Password hash cost factor            |
