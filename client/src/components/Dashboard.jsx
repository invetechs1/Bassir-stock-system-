import { useCallback, useEffect, useState } from 'react';
import { api, subscribeQuotes, connectUserChannel } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PortfolioSummary from './PortfolioSummary.jsx';
import Market from './Market.jsx';
import Holdings from './Holdings.jsx';
import Watchlist from './Watchlist.jsx';
import Transactions from './Transactions.jsx';
import Orders from './Orders.jsx';
import PerformanceChart from './PerformanceChart.jsx';
import Leaderboard from './Leaderboard.jsx';
import Agents from './Agents.jsx';
import TradeModal from './TradeModal.jsx';

// Account changes arrive instantly over the WebSocket channel; this slow poll
// is just a safety net in case the socket drops. Live quotes arrive over SSE.
const ACCOUNT_REFRESH_MS = 20000;

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [stocks, setStocks] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [trade, setTrade] = useState(null);
  const [error, setError] = useState('');

  // Account-scoped data (changes on trades and order fills).
  const refreshAccount = useCallback(async () => {
    try {
      const [p, w, t, o, h, lb] = await Promise.all([
        api.getPortfolio(),
        api.getWatchlist(),
        api.getTransactions(),
        api.getOrders(),
        api.getHistory(),
        api.getLeaderboard()
      ]);
      setPortfolio(p);
      setWatchlist(w);
      setTransactions(t);
      setOrders(o);
      setHistory(h);
      setLeaderboard(lb);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refreshAccount();
    const id = setInterval(refreshAccount, ACCOUNT_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshAccount]);

  // Live market quotes via Server-Sent Events.
  useEffect(() => {
    const unsubscribe = subscribeQuotes(setStocks);
    return unsubscribe;
  }, []);

  // Live per-user account updates via WebSocket: refetch on any event so trades
  // and server-side order fills reflect immediately.
  useEffect(() => {
    const disconnect = connectUserChannel(() => refreshAccount());
    return disconnect;
  }, [refreshAccount]);

  const handleMarket = async (mode, symbol, shares) => {
    if (mode === 'BUY') await api.buy(symbol, shares);
    else await api.sell(symbol, shares);
    setTrade(null);
    await refreshAccount();
  };

  const handleLimit = async (order) => {
    await api.placeOrder(order);
    setTrade(null);
    await refreshAccount();
  };

  const cancelOrder = async (id) => {
    await api.cancelOrder(id);
    await refreshAccount();
  };

  const toggleWatch = async (symbol, watched) => {
    if (watched) await api.removeWatch(symbol);
    else await api.addWatch(symbol);
    await refreshAccount();
  };

  const watchedSymbols = new Set(watchlist.map((w) => w.symbol));
  const pendingCount = orders.filter((o) => o.status === 'PENDING').length;

  // Append the current live value so the line moves between snapshots.
  const chartPoints =
    portfolio != null
      ? [...history, { value: portfolio.totalValue, timestamp: Date.now() }]
      : history;

  return (
    <div className="app">
      <header className="topbar">
        <h1>📈 Stock Trading System</h1>
        <div className="topbar-right">
          <span className="live-dot" title="Live quotes" />
          <span className="muted small">{user?.email}</span>
          <button className="btn ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <PortfolioSummary portfolio={portfolio} />

      {/* Autonomous trading agents (renders only for admin accounts). */}
      <Agents />

      <div className="grid">
        <section className="panel wide">
          <h2>Performance</h2>
          <PerformanceChart points={chartPoints} />
        </section>

        <section className="panel">
          <h2>Market</h2>
          <Market
            stocks={stocks}
            watchedSymbols={watchedSymbols}
            onTrade={(stock) => setTrade({ stock, mode: 'BUY' })}
            onToggleWatch={toggleWatch}
          />
        </section>

        <section className="panel">
          <h2>Holdings</h2>
          <Holdings
            positions={portfolio?.positions || []}
            onSell={(pos) =>
              setTrade({
                stock: { symbol: pos.symbol, name: pos.name, price: pos.price },
                mode: 'SELL',
                maxShares: pos.shares
              })
            }
          />
        </section>

        <section className="panel">
          <h2>
            Open Orders{pendingCount ? <span className="badge">{pendingCount}</span> : null}
          </h2>
          <Orders orders={orders} onCancel={cancelOrder} />
        </section>

        <section className="panel">
          <h2>Watchlist</h2>
          <Watchlist items={watchlist} onRemove={(symbol) => toggleWatch(symbol, true)} />
        </section>

        <section className="panel">
          <h2>Leaderboard</h2>
          <Leaderboard entries={leaderboard} />
        </section>

        <section className="panel wide">
          <h2>Trade History</h2>
          <Transactions transactions={transactions} />
        </section>
      </div>

      {trade && (
        <TradeModal
          trade={trade}
          cash={portfolio?.cash || 0}
          onClose={() => setTrade(null)}
          onMarket={handleMarket}
          onLimit={handleLimit}
        />
      )}
    </div>
  );
}
