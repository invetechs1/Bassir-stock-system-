import { useCallback, useEffect, useState } from 'react';
import { api, subscribeAgents, formatMoney } from '../api/client.js';

// Admin-only control panel for the autonomous trading agents. Renders nothing
// for non-admin accounts (the API returns 403). Live state arrives over SSE.
export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [risk, setRisk] = useState(null);
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getAgents();
      setAgents(data.agents);
      setSummary(data.summary);
      setRisk(data.risk);
      setError('');
    } catch (e) {
      // 403 → not an admin; hide the panel entirely.
      if (/admin/i.test(e.message) || /403/.test(e.message)) setVisible(false);
      else setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: patch individual agents and the fleet summary as they change.
  useEffect(() => {
    if (!visible) return undefined;
    return subscribeAgents({
      onSnapshot: (s) => {
        setAgents(s.agents);
        setSummary(s.summary);
      },
      onAgent: (a) =>
        setAgents((prev) => prev.map((x) => (x.id === a.id ? a : x))),
      onFleet: (f) => setSummary(f)
    });
  }, [visible]);

  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  const live = summary?.mode === 'live';

  return (
    <section className="panel wide">
      <div className="agents-head">
        <h2>
          Trading Agents
          <span className={`mode-badge ${live ? 'live' : 'paper'}`}>
            {live ? 'LIVE' : 'PAPER'}
          </span>
        </h2>
        {summary && (
          <div className="agents-controls">
            {summary.killSwitch ? (
              <button className="btn danger" disabled={busy} onClick={() => act(api.releaseKill)}>
                Release kill switch
              </button>
            ) : (
              <button className="btn danger" disabled={busy} onClick={() => act(api.killAgents)}>
                ⛔ Kill all
              </button>
            )}
            {summary.engineRunning ? (
              <button className="btn ghost" disabled={busy} onClick={() => act(api.stopEngine)}>
                Stop engine
              </button>
            ) : (
              <button className="btn" disabled={busy} onClick={() => act(api.startEngine)}>
                ▶ Start engine
              </button>
            )}
            {!live && (
              <button className="btn ghost" disabled={busy} onClick={() => act(api.resetAgents)}>
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      {error && <div className="banner error">{error}</div>}

      {summary && (
        <div className="agents-summary">
          <Stat label="Fleet equity" value={formatMoney(summary.equity)} />
          <Stat
            label="Total P/L"
            value={`${summary.totalPnl >= 0 ? '+' : ''}${formatMoney(summary.totalPnl)} (${summary.returnPct}%)`}
            positive={summary.totalPnl >= 0}
          />
          <Stat label="Deployed" value={formatMoney(summary.deployed)} />
          <Stat label="Engine" value={summary.engineRunning ? 'running' : 'stopped'} />
          <Stat label="Kill switch" value={summary.killSwitch ? 'ENGAGED' : 'off'} />
        </div>
      )}

      <p className="muted small">
        {live
          ? 'LIVE mode — real orders are being sent to Binance.'
          : 'Paper mode — fills are simulated against real Binance prices. No real funds are at risk.'}
        {risk &&
          ` Risk limits: ${risk.maxDrawdownPct}% max drawdown, ${risk.dailyLossLimitPct}% daily loss, ${formatMoney(risk.maxTotalExposure)} total exposure cap.`}
      </p>

      <div className="table-wrap">
        <table className="agents-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Symbol</th>
              <th>Status</th>
              <th className="num">Position</th>
              <th className="num">Equity</th>
              <th className="num">P/L</th>
              <th className="num">Control</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="agent-name">{a.name}</div>
                  <div className="muted small">{a.strategy}</div>
                </td>
                <td>{a.symbol}</td>
                <td>
                  <span className={`status-pill ${statusClass(a.status)}`}>{a.status}</span>
                </td>
                <td className="num">
                  {a.position.qty > 0 ? (
                    <>
                      {a.position.qty.toFixed(4)}
                      <div className="muted small">@ {a.position.avgPrice}</div>
                    </>
                  ) : (
                    <span className="muted">flat</span>
                  )}
                </td>
                <td className="num">{formatMoney(a.equity)}</td>
                <td className={`num ${a.totalPnl >= 0 ? 'pos' : 'neg'}`}>
                  {a.totalPnl >= 0 ? '+' : ''}
                  {a.returnPct}%
                </td>
                <td className="num">
                  <label className="switch" title={a.enabled ? 'Disable' : 'Enable'}>
                    <input
                      type="checkbox"
                      checked={a.enabled}
                      disabled={busy || (summary?.killSwitch && !a.enabled)}
                      onChange={() =>
                        act(() => (a.enabled ? api.disableAgent(a.id) : api.enableAgent(a.id)))
                      }
                    />
                    <span className="slider" />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value, positive }) {
  return (
    <div className="agent-stat">
      <div className="muted small">{label}</div>
      <div className={positive === undefined ? '' : positive ? 'pos' : 'neg'}>{value}</div>
    </div>
  );
}

function statusClass(status) {
  if (status === 'ACTIVE') return 'ok';
  if (status.startsWith('STOPPED') || status.startsWith('HALTED')) return 'bad';
  return 'idle';
}
