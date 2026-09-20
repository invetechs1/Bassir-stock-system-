import { formatMoney } from '../api/client.js';

export default function Leaderboard({ entries }) {
  if (!entries.length) return <p className="muted">No traders yet.</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Trader</th>
          <th className="num">Net Worth</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.rank} className={e.isMe ? 'me-row' : ''}>
            <td>{e.rank}</td>
            <td>
              {e.name}
              {e.isMe ? <span className="you-tag">you</span> : null}
            </td>
            <td className="num">{formatMoney(e.totalValue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
