// Tadawul (Saudi stock exchange) — NOT AVAILABLE for automated trading.
//
// Why there is no working adapter here:
//   Unlike US equities (Alpaca) or crypto (Binance), the Saudi market does not
//   expose a public retail trading API. Orders on Tadawul are placed through
//   licensed local brokers (e.g. Al Rajhi Capital, SNB Capital, Derayah),
//   none of which offer programmatic order execution to retail customers.
//   Real-time Tadawul market data is likewise not freely available via a clean
//   public API. As a result, an autonomous agent CANNOT place real Saudi-stock
//   orders today, and this file does not pretend otherwise.
//
// What it would take to enable this venue later:
//   1. A broker (or licensed data/execution vendor) that provides an
//      authenticated REST/FIX API for Tadawul order entry and market data.
//   2. Implement `getCandles`, `getPrice`, `isOpen` (Tadawul hours: Sun–Thu,
//      ~10:00–15:00 AST), and `execute` against that API, matching the venue
//      interface in venues.js.
//   3. Register 'tadawul' in KNOWN_VENUES and add a 'sa_equity' fleet.
//
// This stub exists so the extension point is explicit. It is intentionally not
// registered in venues.js, so no agent can be assigned to it.

const NOT_AVAILABLE =
  'Tadawul automated trading is not available: no public retail broker API exists. See src/exchange/tadawul.js.';

export function createTadawulVenue() {
  const unavailable = async () => {
    throw new Error(NOT_AVAILABLE);
  };
  return {
    key: 'tadawul',
    assetClass: 'sa_equity',
    label: 'Tadawul (Saudi stocks) — unavailable',
    configured: false,
    mode: 'unavailable',
    marketData: { getCandles: unavailable, getPrice: unavailable },
    executor: { mode: 'unavailable', execute: unavailable },
    isOpen: async () => false
  };
}
