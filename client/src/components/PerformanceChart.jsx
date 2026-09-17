import { formatMoney } from '../api/client.js';

// Lightweight dependency-free SVG sparkline of portfolio net worth over time.
export default function PerformanceChart({ points }) {
  if (!points || points.length < 2) {
    return (
      <p className="muted">
        Building your performance history… check back as prices move.
      </p>
    );
  }

  const W = 600;
  const H = 160;
  const PAD = 6;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (i) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;

  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const changePct = first ? (change / first) * 100 : 0;
  const up = change >= 0;
  const color = up ? 'var(--pos)' : 'var(--neg)';

  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-value">{formatMoney(last)}</span>
        <span className={up ? 'pos' : 'neg'}>
          {up ? '▲' : '▼'} {formatMoney(Math.abs(change))} ({changePct.toFixed(2)}%)
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="chart-svg"
        role="img"
        aria-label="Portfolio value over time"
      >
        <defs>
          <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#perfFill)" />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
