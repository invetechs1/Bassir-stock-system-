// Pure technical-indicator functions. Each takes an array of numbers (usually
// closing prices, oldest first) and returns an array of the same length with
// `null` for positions before the indicator has enough data ("warmup"). Keeping
// them pure and array-shaped makes strategies easy to reason about and test:
// a strategy inspects the last one or two values to detect a signal or cross.

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev;
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) continue;
    if (i === period - 1) {
      // Seed with the SMA of the first `period` values.
      let sum = 0;
      for (let j = 0; j < period; j += 1) sum += values[j];
      prev = sum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

// Wilder's RSI.
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
  );
  // Signal is an EMA of the (defined portion of the) MACD line.
  const defined = macdLine.filter((v) => v != null);
  const signalDefined = ema(defined, signalPeriod);
  const firstIdx = macdLine.findIndex((v) => v != null);
  const signal = new Array(values.length).fill(null);
  if (firstIdx >= 0) {
    for (let i = 0; i < signalDefined.length; i += 1) {
      signal[firstIdx + i] = signalDefined[i];
    }
  }
  const hist = values.map((_, i) =>
    macdLine[i] != null && signal[i] != null ? macdLine[i] - signal[i] : null
  );
  return { macd: macdLine, signal, hist };
}

export function stddev(values, period) {
  const means = sma(values, period);
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    let sq = 0;
    for (let j = i - period + 1; j <= i; j += 1) sq += (values[j] - means[i]) ** 2;
    out[i] = Math.sqrt(sq / period);
  }
  return out;
}

export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const sd = stddev(values, period);
  const upper = values.map((_, i) => (mid[i] != null ? mid[i] + mult * sd[i] : null));
  const lower = values.map((_, i) => (mid[i] != null ? mid[i] - mult * sd[i] : null));
  return { mid, upper, lower };
}

// Rate of change (%) over `period` bars.
export function roc(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = period; i < values.length; i += 1) {
    const past = values[i - period];
    if (past !== 0) out[i] = ((values[i] - past) / past) * 100;
  }
  return out;
}

// Rolling max/min over the `period` bars ending at each index (inclusive).
export function rollingMax(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    out[i] = Math.max(...values.slice(i - period + 1, i + 1));
  }
  return out;
}

export function rollingMin(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    out[i] = Math.min(...values.slice(i - period + 1, i + 1));
  }
  return out;
}

// Last non-null value of an indicator array.
export function last(arr) {
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}
