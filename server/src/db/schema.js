// Schema definition, shared by the connection bootstrap and the CLI migrator.
// Every statement is idempotent so applying it repeatedly is safe.
export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    cash          REAL NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stocks (
    symbol      TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    price       REAL NOT NULL,
    prev_close  REAL NOT NULL,
    volatility  REAL NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS holdings (
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol    TEXT NOT NULL REFERENCES stocks(symbol),
    shares    INTEGER NOT NULL,
    avg_cost  REAL NOT NULL,
    PRIMARY KEY (user_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol   TEXT NOT NULL REFERENCES stocks(symbol),
    PRIMARY KEY (user_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
    symbol     TEXT NOT NULL,
    shares     INTEGER NOT NULL,
    price      REAL NOT NULL,
    total      REAL NOT NULL,
    timestamp  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tx_user_time
    ON transactions(user_id, timestamp DESC);

  CREATE TABLE IF NOT EXISTS orders (
    id           TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    side         TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    type         TEXT NOT NULL DEFAULT 'LIMIT' CHECK (type IN ('LIMIT', 'STOP')),
    symbol       TEXT NOT NULL REFERENCES stocks(symbol),
    shares       INTEGER NOT NULL,
    limit_price  REAL NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('PENDING', 'FILLED', 'CANCELLED', 'EXPIRED'))
                 DEFAULT 'PENDING',
    fill_price   REAL,
    expires_at   INTEGER,
    created_at   INTEGER NOT NULL,
    filled_at    INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user_time
    ON orders(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_orders_status
    ON orders(status);

  CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    value      REAL NOT NULL,
    timestamp  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_user_time
    ON portfolio_snapshots(user_id, timestamp);

  -- Autonomous trading agents. Each agent trades a single symbol with its own
  -- capital allocation, strategy, and isolated position.
  CREATE TABLE IF NOT EXISTS agents (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    strategy       TEXT NOT NULL,
    symbol         TEXT NOT NULL,
    venue          TEXT NOT NULL DEFAULT 'binance',
    allocation     REAL NOT NULL,
    cash           REAL NOT NULL,
    position_qty   REAL NOT NULL DEFAULT 0,
    position_avg   REAL NOT NULL DEFAULT 0,
    enabled        INTEGER NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'IDLE',
    mark_price     REAL NOT NULL DEFAULT 0,
    equity         REAL NOT NULL DEFAULT 0,
    realized_pnl   REAL NOT NULL DEFAULT 0,
    peak_equity    REAL NOT NULL,
    day_start_equity REAL NOT NULL,
    day_start_ts   INTEGER NOT NULL,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_trades (
    id            TEXT PRIMARY KEY,
    agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    side          TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    qty           REAL NOT NULL,
    price         REAL NOT NULL,
    fee           REAL NOT NULL,
    notional      REAL NOT NULL,
    realized_pnl  REAL NOT NULL DEFAULT 0,
    reason        TEXT,
    mode          TEXT NOT NULL,
    ext_order_id  TEXT,
    ts            INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_agent_trades_agent
    ON agent_trades(agent_id, ts DESC);

  CREATE TABLE IF NOT EXISTS agent_equity (
    agent_id  TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    equity    REAL NOT NULL,
    ts        INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_agent_equity_agent
    ON agent_equity(agent_id, ts);

  CREATE TABLE IF NOT EXISTS risk_events (
    id        TEXT PRIMARY KEY,
    agent_id  TEXT,
    kind      TEXT NOT NULL,
    message   TEXT NOT NULL,
    ts        INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_risk_events_ts
    ON risk_events(ts DESC);

  -- Single-row-per-key store for engine/kill-switch flags.
  CREATE TABLE IF NOT EXISTS system_flags (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );
`;
