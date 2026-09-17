// Thin wrapper around fetch for the stock-system API, with JWT auth support.
const BASE = '/api';
const TOKEN_KEY = 'stocksys.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY)
};

// Invoked when a request comes back 401 so the app can drop to the login screen.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, options = {}) {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...options
  });

  if (res.status === 401) {
    tokenStore.clear();
    onUnauthorized();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.details?.[0]?.message;
    throw new Error(detail || data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  // Auth
  register: (email, password) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  me: () => request('/auth/me'),

  // Market & trading
  getStocks: () => request('/stocks'),
  getPortfolio: () => request('/portfolio'),
  getTransactions: () => request('/portfolio/transactions'),
  getHistory: () => request('/portfolio/history'),
  getLeaderboard: () => request('/leaderboard'),
  buy: (symbol, shares) =>
    request('/portfolio/buy', {
      method: 'POST',
      body: JSON.stringify({ symbol, shares })
    }),
  sell: (symbol, shares) =>
    request('/portfolio/sell', {
      method: 'POST',
      body: JSON.stringify({ symbol, shares })
    }),
  getWatchlist: () => request('/watchlist'),
  addWatch: (symbol) =>
    request('/watchlist', {
      method: 'POST',
      body: JSON.stringify({ symbol })
    }),
  removeWatch: (symbol) => request(`/watchlist/${symbol}`, { method: 'DELETE' }),

  // Limit orders
  getOrders: () => request('/orders'),
  placeOrder: (order) =>
    request('/orders', { method: 'POST', body: JSON.stringify(order) }),
  cancelOrder: (id) => request(`/orders/${id}`, { method: 'DELETE' }),

  // Autonomous trading agents (admin-only).
  getAgents: () => request('/agents'),
  getAgent: (id) => request(`/agents/${id}`),
  getAgentRisk: () => request('/agents/risk'),
  enableAgent: (id) => request(`/agents/${id}/enable`, { method: 'POST' }),
  disableAgent: (id) => request(`/agents/${id}/disable`, { method: 'POST' }),
  startEngine: () => request('/agents/engine/start', { method: 'POST' }),
  stopEngine: () => request('/agents/engine/stop', { method: 'POST' }),
  killAgents: () => request('/agents/kill', { method: 'POST' }),
  releaseKill: () => request('/agents/kill/release', { method: 'POST' }),
  resetAgents: () => request('/agents/reset', { method: 'POST' })
};

// Subscribe to the admin agent stream (SSE). EventSource can't set headers, so
// the JWT is passed as a query param. Returns an unsubscribe function.
export function subscribeAgents({ onSnapshot, onAgent, onFleet }) {
  const token = tokenStore.get();
  if (!token) return () => {};
  const source = new EventSource(`${BASE}/agents/stream?token=${encodeURIComponent(token)}`);
  const parse = (fn) => (e) => {
    try {
      fn(JSON.parse(e.data));
    } catch {
      /* ignore malformed frames */
    }
  };
  if (onSnapshot) source.addEventListener('snapshot', parse(onSnapshot));
  if (onAgent) source.addEventListener('agent', parse(onAgent));
  if (onFleet) source.addEventListener('fleet', parse(onFleet));
  return () => source.close();
}

// Subscribe to the live quote stream (Server-Sent Events). Returns an
// unsubscribe function. Falls back silently if the connection drops; the
// browser EventSource reconnects automatically.
export function subscribeQuotes(onQuotes) {
  const source = new EventSource(`${BASE}/stream`);
  source.addEventListener('tick', (e) => {
    try {
      onQuotes(JSON.parse(e.data));
    } catch {
      /* ignore malformed frames */
    }
  });
  return () => source.close();
}

// Open the authenticated per-user WebSocket channel for live account updates
// (trades, order fills/expiry). Calls onEvent for each message and reconnects
// automatically. Returns a disconnect function.
export function connectUserChannel(onEvent) {
  const token = tokenStore.get();
  if (!token) return () => {};

  let socket;
  let retryTimer;
  let closed = false;

  const open = () => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(
      `${proto}://${window.location.host}/ws?token=${encodeURIComponent(token)}`
    );
    socket.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onclose = () => {
      if (!closed) retryTimer = setTimeout(open, 2000);
    };
  };
  open();

  return () => {
    closed = true;
    clearTimeout(retryTimer);
    socket?.close();
  };
}

export function formatMoney(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(n ?? 0);
}
