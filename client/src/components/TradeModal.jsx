import { useState } from 'react';
import { formatMoney } from '../api/client.js';

const TIF_OPTIONS = [
  { key: 'GTC', label: 'Good till cancelled', ms: null },
  { key: '1H', label: 'Expires in 1 hour', ms: 60 * 60 * 1000 },
  { key: '1D', label: 'Expires in 1 day', ms: 24 * 60 * 60 * 1000 }
];

// Explain when a resting order will trigger, given its type and side.
function triggerHint(orderType, mode, symbol, price) {
  const at = formatMoney(price);
  if (orderType === 'STOP') {
    return mode === 'BUY'
      ? `Fills when ${symbol} rises to ${at} (breakout entry).`
      : `Fills when ${symbol} falls to ${at} (stop-loss).`;
  }
  return mode === 'BUY'
    ? `Fills when ${symbol} drops to ${at}.`
    : `Fills when ${symbol} rises to ${at}.`;
}

// Handles immediate market trades and resting limit/stop orders.
export default function TradeModal({ trade, cash, onClose, onMarket, onLimit }) {
  const { stock, mode, maxShares } = trade;
  const [orderType, setOrderType] = useState('MARKET'); // MARKET | LIMIT | STOP
  const [shares, setShares] = useState(1);
  const [limitPrice, setLimitPrice] = useState(stock.price);
  const [tif, setTif] = useState('GTC');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const resting = orderType !== 'MARKET';
  const qty = Number(shares) || 0;
  const limit = Number(limitPrice) || 0;
  const unitPrice = resting ? limit : stock.price;
  const estimate = qty * unitPrice;

  const affordable = mode === 'BUY' ? estimate <= cash : true;
  const enoughShares = mode === 'SELL' ? qty <= (maxShares ?? Infinity) : true;
  const validQty = qty > 0 && Number.isInteger(qty);
  const validLimit = !resting || limit > 0;
  // Market trades are checked against funds/shares now; resting orders are
  // validated by the engine at fill time, so we only sanity-check inputs.
  const valid =
    validQty && validLimit && (resting || (affordable && enoughShares));

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      if (!resting) {
        await onMarket(mode, stock.symbol, qty);
      } else {
        const tifMs = TIF_OPTIONS.find((o) => o.key === tif)?.ms;
        await onLimit({
          side: mode,
          type: orderType,
          symbol: stock.symbol,
          shares: qty,
          limitPrice: limit,
          ...(tifMs ? { expiresAt: Date.now() + tifMs } : {})
        });
      }
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          {mode === 'BUY' ? 'Buy' : 'Sell'} {stock.symbol}
        </h3>
        <p className="muted">
          {stock.name} · {formatMoney(stock.price)} / share
        </p>

        <div className="segmented">
          {['MARKET', 'LIMIT', 'STOP'].map((t) => (
            <button
              key={t}
              type="button"
              className={orderType === t ? 'active' : ''}
              onClick={() => setOrderType(t)}
            >
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <label>
            Shares
            <input
              type="number"
              min="1"
              step="1"
              max={mode === 'SELL' && !resting ? maxShares : undefined}
              value={shares}
              autoFocus
              onChange={(e) => setShares(e.target.value)}
            />
          </label>

          {resting && (
            <label>
              {orderType === 'STOP' ? 'Stop price' : 'Limit price'}
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
              />
            </label>
          )}

          {resting && (
            <label>
              Time in force
              <select value={tif} onChange={(e) => setTif(e.target.value)}>
                {TIF_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === 'SELL' && (
            <p className="muted small">You hold {maxShares} shares</p>
          )}

          <div className="estimate">
            <span>
              {resting ? 'Order' : 'Estimated'} {mode === 'BUY' ? 'cost' : 'proceeds'}
            </span>
            <strong>{formatMoney(estimate)}</strong>
          </div>

          {resting && (
            <p className="muted small">
              {triggerHint(orderType, mode, stock.symbol, limit)}
            </p>
          )}
          {!resting && mode === 'BUY' && !affordable && (
            <p className="neg small">
              Not enough cash ({formatMoney(cash)} available)
            </p>
          )}
          {error && <p className="neg small">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={!valid || submitting}>
              {submitting
                ? '…'
                : resting
                  ? `Place ${orderType.toLowerCase()} order`
                  : `Confirm ${mode}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
