import { z } from 'zod';

// Coerce common truthy string spellings from the environment into a boolean.
const boolFromEnv = z.preprocess(
  (v) =>
    typeof v === 'string'
      ? ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
      : Boolean(v),
  z.boolean()
);

// Validate and normalize environment configuration at startup so the app
// fails fast on misconfiguration rather than at first request.
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Path to the SQLite database file. ":memory:" is used by the test suite.
  DATABASE_PATH: z.string().default('./data/stock-system.db'),
  // Secret used to sign JWTs. A default is allowed outside production only.
  JWT_SECRET: z.string().min(16).optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  // Price simulator tick interval in milliseconds.
  TICK_MS: z.coerce.number().int().positive().default(3000),
  // How often each user's net-worth is snapshotted for history charts.
  SNAPSHOT_MS: z.coerce.number().int().positive().default(60000),
  // Starting virtual cash granted to each new account.
  STARTING_CASH: z.coerce.number().positive().default(100000),
  // Comma-separated list of allowed CORS origins, or "*".
  CORS_ORIGIN: z.string().default('*'),
  // Bcrypt cost factor.
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  // --- Autonomous trading agents ---------------------------------------
  // Comma-separated emails allowed to control agents. When empty, the first
  // registered account (user id 1) is treated as the owner/admin.
  ADMIN_EMAILS: z.string().default(''),
  // paper: fills are simulated in-process against real market prices (no keys,
  // no funds at risk). live: real orders are sent to the exchange.
  TRADING_MODE: z.enum(['paper', 'live']).default('paper'),
  // Live trading is refused unless this exactly equals the phrase below. This
  // is a deliberate speed-bump so real money is never traded by accident.
  LIVE_CONFIRM: z.string().default(''),
  // Exchange venue. Only 'binance' is implemented today; the engine is written
  // against an adapter interface so other venues can be added.
  EXCHANGE: z.enum(['binance']).default('binance'),
  // Binance REST base. Defaults to the Spot Testnet (real data, fake balances).
  BINANCE_BASE_URL: z.string().default('https://testnet.binance.vision'),
  // Public market-data base (klines/prices). Testnet mirrors production data;
  // override to 'https://api.binance.com' for full history if needed.
  BINANCE_DATA_URL: z.string().default('https://api.binance.com'),
  BINANCE_API_KEY: z.string().default(''),
  BINANCE_API_SECRET: z.string().default(''),
  // Quote asset all agents trade against (e.g. BTC/USDT).
  QUOTE_ASSET: z.string().default('USDT'),
  // Per-agent virtual (or real, in live mode) capital allocation, in quote asset.
  AGENT_ALLOCATION: z.coerce.number().positive().default(50),
  // How often the engine polls the market and lets agents decide, in ms.
  AGENT_TICK_MS: z.coerce.number().int().positive().default(15000),
  // Candle interval agents analyze (Binance kline interval string).
  AGENT_CANDLE_INTERVAL: z.string().default('1m'),
  // Assumed taker fee per fill (fraction), applied to paper fills too.
  AGENT_FEE_RATE: z.coerce.number().min(0).max(0.05).default(0.001),
  // Start the engine automatically on boot. Off by default — agents also start
  // disabled, so nothing trades until explicitly enabled.
  ENGINE_AUTOSTART: boolFromEnv.default(false),

  // --- Risk limits (enforced by the top-level risk manager) ------------
  // Disable an agent once its equity falls this % below its peak.
  RISK_MAX_DRAWDOWN_PCT: z.coerce.number().positive().max(100).default(20),
  // Halt an agent for the day once it loses this % of its start-of-day equity.
  RISK_DAILY_LOSS_LIMIT_PCT: z.coerce.number().positive().max(100).default(10),
  // Cap on total capital deployed across all agents at once, in quote asset.
  RISK_MAX_TOTAL_EXPOSURE: z.coerce.number().positive().default(400),
  // Fraction of its allocation a single agent may hold in a position (1 = 100%).
  RISK_MAX_POSITION_FRACTION: z.coerce.number().positive().max(1).default(1),
  // Minimum order notional; smaller proposals are skipped as dust.
  RISK_MIN_ORDER_NOTIONAL: z.coerce.number().positive().default(1)
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'production' && !env.JWT_SECRET) {
  console.error('JWT_SECRET is required in production.');
  process.exit(1);
}

// Live trading requires TRADING_MODE=live AND the exact confirmation phrase.
// Both conditions must hold or the executor stays in paper mode.
const LIVE_PHRASE = 'I_UNDERSTAND_THE_RISKS';
const liveEnabled = env.TRADING_MODE === 'live' && env.LIVE_CONFIRM === LIVE_PHRASE;

if (env.TRADING_MODE === 'live' && !liveEnabled) {
  console.error(
    `TRADING_MODE=live requires LIVE_CONFIRM="${LIVE_PHRASE}". Refusing to start in live mode; set the phrase to confirm you accept the risk of trading real funds.`
  );
  process.exit(1);
}

if (liveEnabled && (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET)) {
  console.error('Live trading requires BINANCE_API_KEY and BINANCE_API_SECRET.');
  process.exit(1);
}

export const config = {
  ...env,
  // Stable fallback secret for development/test only.
  JWT_SECRET:
    env.JWT_SECRET || 'dev-insecure-secret-do-not-use-in-production',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  // Resolved, effective live-trading switch. Everything downstream reads this
  // rather than TRADING_MODE so the confirmation gate cannot be bypassed.
  liveTrading: liveEnabled,
  adminEmails: env.ADMIN_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
};
