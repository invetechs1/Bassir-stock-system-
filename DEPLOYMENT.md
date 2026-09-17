# Deployment Guide

Hand this to whoever deploys the system on a server. It covers a safe,
production deployment of the **stock-system** app and its **autonomous trading
agents** (crypto via Binance, US stocks via Alpaca).

> **Safety posture:** the system ships in **paper mode** (simulated fills at
> real market prices — no real money). Live trading is off and every agent is
> disabled until an admin turns them on. Do **not** switch to live money until a
> strategy has been proven in paper. See [§9 Going live](#9-going-live-real-money).

---

## 1. Architecture

| Component | What it is | Port |
| --------- | ---------- | ---- |
| `server`  | Node.js/Express API + SQLite + the agent engine | 4000 (internal) |
| `client`  | React SPA served by nginx; reverse-proxies `/api` and `/ws` to the server | 80 (internal), published as `WEB_PORT` (default 8080) |
| volume `stock-data` | Persists the SQLite database at `/app/data` | — |

The browser only ever talks to the **client** container; nginx inside it
forwards API, WebSocket, and SSE traffic to the server. So an external
HTTPS reverse proxy only needs to point at the client's published port.

---

## 2. Server requirements

- Linux host (Ubuntu 22.04+ recommended), 1 vCPU / 1 GB RAM is enough to start.
- **Docker Engine** + **Docker Compose v2** (`docker compose version`).
- A domain name + TLS certificate for production (see §7). HTTP-only is fine for
  a quick internal test.
- **Outbound network access** from the server to the trading venues (the app
  fetches live market data and, in live mode, places orders):
  - `api.binance.com`, `testnet.binance.vision`  (crypto)
  - `api.alpaca.markets`, `paper-api.alpaca.markets`, `data.alpaca.markets`  (US stocks)
  If the host has an egress firewall, allow HTTPS (443) to those domains.

---

## 3. Get the code

```bash
git clone https://github.com/invetechs1/stock-system-.git
cd stock-system-
# Use the main branch once the pull request is merged; otherwise the feature branch:
# git checkout claude/keen-keller-coio2e
```

---

## 4. Configure environment (`.env`)

Create the `.env` file from the template and edit it:

```bash
cp .env.example .env
```

**Minimum required to start (paper mode):**

```ini
# Strong random secret for signing login tokens. Generate one:
#   openssl rand -hex 32
JWT_SECRET=<paste-64-hex-characters-here>

# The owner account (this email becomes the admin who can control agents).
ADMIN_EMAILS=invetechs@gmail.com

# Public port the web app is served on.
WEB_PORT=8080

# Keep these as-is for safe paper trading:
TRADING_MODE=paper
ENGINE_AUTOSTART=false
```

Everything else has safe defaults (see `.env.example` for the full list and
comments). Key optional settings:

| Variable | Purpose | Default |
| -------- | ------- | ------- |
| `AGENT_FLEETS` | Which fleets to run: `crypto`, `us_equity` | `crypto,us_equity` |
| `AGENT_ALLOCATION` | Capital per agent (quote currency) | `50` |
| `AGENT_TICK_MS` | How often agents evaluate the market | `15000` |
| `RISK_MAX_DRAWDOWN_PCT` | Auto-stop an agent at this % loss from peak | `20` |
| `RISK_DAILY_LOSS_LIMIT_PCT` | Halt an agent for the day at this % loss | `10` |
| `RISK_MAX_TOTAL_EXPOSURE` | Cap on total capital deployed at once | `400` |

> **Never commit `.env` or real API keys to git.** Keep them only on the server.

---

## 5. API keys

### Crypto (Binance) — optional for paper
Paper crypto trading needs **no keys** (market data is public, fills are
simulated). Keys are only needed to place real/testnet orders.
- Testnet keys (rehearse the real order path with fake money):
  create at <https://testnet.binance.vision/> and set `BINANCE_API_KEY` /
  `BINANCE_API_SECRET`.

### US stocks (Alpaca) — required for the US fleet
Alpaca requires keys **even for paper** (its market data is authenticated).
Until they are set, the US-equity agents stay inactive and the dashboard shows
the venue as "keys not set".
1. Create a free account at <https://alpaca.markets/>.
2. In the dashboard, switch to **Paper Trading** and generate an API key.
3. Put them in `.env`:
   ```ini
   ALPACA_API_KEY=<key>
   ALPACA_API_SECRET=<secret>
   ALPACA_BASE_URL=https://paper-api.alpaca.markets
   ```

---

## 6. Deploy with Docker (recommended)

```bash
docker compose up -d --build
```

Verify:

```bash
docker compose ps
curl -s http://localhost:8080/api/health      # -> {"status":"ok",...}
docker compose logs -f server                 # watch server logs
```

Open `http://<server-ip>:8080` in a browser. Data persists in the
`stock-data` volume across restarts and rebuilds.

To stop / restart:

```bash
docker compose down          # stop (keeps the data volume)
docker compose up -d         # start again
```

---

## 7. HTTPS with a reverse proxy (production)

Put a TLS-terminating reverse proxy in front and point it at `WEB_PORT`.
WebSockets (`/ws`) and Server-Sent Events (`/api/stream`, `/api/agents/stream`)
must be forwarded correctly.

### Option A — Caddy (simplest, automatic HTTPS)
`/etc/caddy/Caddyfile`:
```
your.domain.com {
    reverse_proxy 127.0.0.1:8080
}
```
Caddy handles TLS certificates, WebSocket upgrades, and SSE streaming
automatically.

### Option B — nginx
```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' close; }

server {
    listen 443 ssl;
    server_name your.domain.com;
    ssl_certificate     /etc/letsencrypt/live/your.domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your.domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;         # WebSocket
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;                            # required for SSE
        proxy_read_timeout 3600s;
    }
}
```

---

## 8. First run — create the owner and start trading (paper)

1. Open the site and **Register** using the email you put in `ADMIN_EMAILS`
   (`invetechs@gmail.com`). That account is the admin.
2. On the dashboard, find the **Trading Agents** panel (visible only to the
   admin).
3. Click **Start trading** to start the engine.
4. Toggle the agents you want **on**. They begin paper-trading immediately
   (crypto now; US-stock agents act during US market hours).
5. Watch equity, P/L, and the per-agent charts. Use **⛔ Kill all** to halt
   everything instantly at any time.

---

## 9. Going live (real money)

> Only after a strategy is proven in paper. Live trading risks real capital and
> **does not guarantee profit** — automated trading commonly loses money.

1. Fund a **real** brokerage account (Binance and/or Alpaca live) and create
   live API keys (trading enabled). The app never holds your money — funds stay
   in your brokerage account.
2. In `.env`:
   ```ini
   TRADING_MODE=live
   LIVE_CONFIRM=I_UNDERSTAND_THE_RISKS      # exact phrase required, or the server refuses to start
   # Crypto live:
   BINANCE_BASE_URL=https://api.binance.com
   BINANCE_API_KEY=...
   BINANCE_API_SECRET=...
   # US stocks live:
   ALPACA_BASE_URL=https://api.alpaca.markets
   ALPACA_API_KEY=...
   ALPACA_API_SECRET=...
   ```
3. Start with **small** allocations (`AGENT_ALLOCATION`) and conservative risk
   limits. Rebuild: `docker compose up -d --build`.

> **Saudi/Tadawul stocks are not supported for automated trading** — no broker
> offers a public retail API for it. Only crypto (24/7) and US stocks (market
> hours) can be traded automatically.

---

## 10. Operations

- **Logs:** `docker compose logs -f server` (structured JSON, one line per event).
- **Health:** `GET /api/health` returns `{"status":"ok"}` (used by Docker's
  healthcheck).
- **Backups:** the whole state is one SQLite file in the `stock-data` volume.
  Back it up periodically:
  ```bash
  docker compose cp server:/app/data/stock-system.db ./backup-$(date +%F).db
  ```
- **Updates:** `git pull` then `docker compose up -d --build`. Schema migrations
  run automatically on startup; the data volume is preserved.
- **Backtest a strategy** (in a local checkout, not the container):
  ```bash
  cd server && npm ci && npm run backtest sma-crossover BTCUSDT 1h 1000
  ```

---

## 11. Security checklist

- [ ] `JWT_SECRET` is a long random value, unique to this deployment.
- [ ] `.env` and API keys are on the server only — never in git.
- [ ] `ADMIN_EMAILS` is set to the owner; only that account can control agents.
- [ ] HTTPS is enabled in production (§7).
- [ ] Start in `paper` mode; switch to `live` only deliberately, with small size.
- [ ] Restrict who can reach the server (firewall / security group).
- [ ] Regular database backups (§10).

---

## 12. Troubleshooting

| Symptom | Likely cause / fix |
| ------- | ------------------ |
| Server exits on start with a `LIVE_CONFIRM` error | `TRADING_MODE=live` without the exact `LIVE_CONFIRM` phrase or keys. Set them, or use `TRADING_MODE=paper`. |
| US-stock agents never trade; venue shows "keys not set" | Add Alpaca paper keys to `.env` and rebuild. |
| US-stock agents idle but keys are set | US market is closed (nights/weekends/holidays). They resume at the next session. |
| Crypto agents don't trade | Check outbound access to `api.binance.com`; see `docker compose logs server`. |
| Live quotes / agent updates don't stream | Reverse proxy not forwarding WebSocket/SSE — apply the §7 config (Upgrade headers, `proxy_buffering off`). |
| "Admin access required" in the agents panel | You're not logged in as an `ADMIN_EMAILS` account (or, if unset, the first registered account). |
| Can't reach the site | Check `docker compose ps`, the `WEB_PORT`, and the host firewall. |

---

**Questions about the trading logic, risk limits, or adding a broker (e.g.
Interactive Brokers) are in the project `README.md`.**
