import { logger } from '../logger.js';

// `db` is passed in (rather than imported) to keep the module graph acyclic:
// db/index.js calls this during its own evaluation.
function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

// Additive, idempotent migrations for databases created before a schema change.
// Fresh databases already match the latest schema (applied via SCHEMA_SQL), so
// each guard below is a no-op for them.
export function applyMigrations(db) {
  // v3: multi-venue agents. Add the `venue` column to agent tables created
  // before venues existed (defaults to 'binance', the original crypto venue).
  const agentCols = columnNames(db, 'agents');
  if (agentCols.length && !agentCols.includes('venue')) {
    db.exec("ALTER TABLE agents ADD COLUMN venue TEXT NOT NULL DEFAULT 'binance'");
    logger.info('Migrated agents table to add venue column');
  }

  const orderCols = columnNames(db, 'orders');

  // v2: stop orders + time-in-force. Adding the `type`/`expires_at` columns and
  // widening the status CHECK to include 'EXPIRED' requires a table rebuild,
  // since SQLite cannot alter a CHECK constraint in place.
  if (orderCols.length && !orderCols.includes('type')) {
    const rebuild = db.transaction(() => {
      db.exec(`
        CREATE TABLE orders_new (
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
        INSERT INTO orders_new
          (id, user_id, side, type, symbol, shares, limit_price, status, fill_price, expires_at, created_at, filled_at)
        SELECT id, user_id, side, 'LIMIT', symbol, shares, limit_price, status, fill_price, NULL, created_at, filled_at
        FROM orders;
        DROP TABLE orders;
        ALTER TABLE orders_new RENAME TO orders;
        CREATE INDEX IF NOT EXISTS idx_orders_user_time ON orders(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      `);
    });
    // Foreign keys must be off during a table rebuild (toggled outside any txn).
    db.pragma('foreign_keys = OFF');
    rebuild();
    db.pragma('foreign_keys = ON');
    logger.info('Migrated orders table to support stop orders and expiry');
  }
}
