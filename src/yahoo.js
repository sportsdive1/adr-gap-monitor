const positive = value => Number.isFinite(value) && value > 0;

function point(price, seconds) {
  if (!positive(price) || !positive(seconds)) return null;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? { price, timestamp: date.toISOString() } : null;
}

export function lastValidBar(row) {
  const closes = row?.indicators?.quote?.[0]?.close;
  const times = row?.timestamp;
  if (!Array.isArray(closes) || !Array.isArray(times)) return null;
  for (let i = Math.min(closes.length, times.length) - 1; i >= 0; i--) {
    const candidate = point(closes[i], times[i]);
    if (candidate) return candidate;
  }
  return null;
}

export function parseQuote(data, includePrePost = false) {
  const row = data?.chart?.result?.[0];
  const regular = !includePrePost && point(row?.meta?.regularMarketPrice, row?.meta?.regularMarketTime);
  const selected = regular || lastValidBar(row);
  if (!selected) throw new Error('No Yahoo Finance price data available');
  return { ...selected, marketState: row?.meta?.marketState ?? null, extendedHoursIncluded: includePrePost, source: 'Yahoo Finance' };
}

export function parseFx(data) {
  const selected = lastValidBar(data?.chart?.result?.[0]);
  if (!selected) throw new Error('No Yahoo Finance FX data available');
  return { rates: { KRW: selected.price }, updatedAt: selected.timestamp, source: 'Yahoo Finance (KRW=X)' };
}

// The deadline covers both response headers and body, including non-cooperative upstreams.
export async function fetchYahoo(fetchFn, symbol, includePrePost, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Yahoo Finance request timed out'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m${includePrePost ? '&includePrePost=true' : ''}`;
        const response = await fetchFn(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: controller.signal });
        if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`);
        return response.json();
      })(),
      deadline
    ]);
  } finally {
    clearTimeout(timer);
  }
}
