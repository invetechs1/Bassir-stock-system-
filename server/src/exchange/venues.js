import { config } from '../config.js';
import { marketData as binanceMarketData } from './marketData.js';
import { getExecutor as getBinanceExecutor } from './execution.js';
import { createAlpacaVenue } from './alpaca.js';

// A venue bundles market data, an executor, and a market calendar behind one
// shape so the engine can trade any market uniformly:
//   { key, assetClass, label, configured, mode, marketData, executor, isOpen() }
// Crypto (Binance) is always open; US equities (Alpaca) follow market hours.

function createBinanceVenue() {
  return {
    key: 'binance',
    assetClass: 'crypto',
    label: 'Binance (crypto)',
    configured: true,
    mode: config.liveTrading ? 'live' : 'paper',
    marketData: binanceMarketData,
    executor: getBinanceExecutor(),
    isOpen: async () => true // crypto trades 24/7
  };
}

const registry = new Map();

export function getVenue(key) {
  if (registry.has(key)) return registry.get(key);
  let venue = null;
  if (key === 'binance') venue = createBinanceVenue();
  else if (key === 'alpaca') venue = createAlpacaVenue();
  if (venue) registry.set(key, venue);
  return venue;
}

export const KNOWN_VENUES = ['binance', 'alpaca'];

export function listVenues() {
  return KNOWN_VENUES.map(getVenue).filter(Boolean);
}

// Snapshot of each venue's availability/open state for the dashboard. Best
// effort — a venue whose clock check fails is reported closed.
export async function venueStatuses() {
  const out = {};
  for (const v of listVenues()) {
    let open = false;
    try {
      open = await v.isOpen();
    } catch {
      open = false;
    }
    out[v.key] = { label: v.label, assetClass: v.assetClass, configured: v.configured, mode: v.mode, open };
  }
  return out;
}
