import { fetchYahoo, parseQuote, parseFx } from './yahoo.js';

export const QUOTE_TTL_MS = 60_000;
export const FX_TTL_MS = 60 * 60 * 1000;
export const YAHOO_TIMEOUT_MS = 8000;

// Best-effort, per-isolate cache; never treated as durable or globally shared state.
export function createMarketService(companies, { fetchFn = fetch, now = Date.now, timeoutMs = YAHOO_TIMEOUT_MS } = {}) {
  const symbols = new Map(companies.flatMap(company => [
    [company.krCode, { yahoo: company.krYahooSymbol, extended: false }],
    [company.usTicker, { yahoo: company.usYahooSymbol, extended: true }]
  ]));
  const cache = new Map();
  const inFlight = new Map();
  let sequence = 0;

  async function load(key, force, ttl, field, loader) {
    const cached = cache.get(key);
    if (!force && cached && now() - cached.fetchedAt < ttl) return { [field]: cached.value };
    const flightKey = `${key}:${force ? 'force' : 'normal'}`;
    // Forced requests cannot join a normal fetch started before the user's click.
    const existing = inFlight.get(`${key}:force`) || inFlight.get(flightKey);
    if (existing) return existing;
    const requestSequence = ++sequence;
    const promise = (async () => {
      try {
        const candidate = await loader();
        const timestamp = Date.parse(candidate.timestamp ?? candidate.updatedAt);
        const latest = cache.get(key);
        // Completion order must not make a cache or its callers move backwards.
        if (!latest || timestamp > latest.timestamp || (timestamp === latest.timestamp && requestSequence >= latest.sequence)) {
          cache.set(key, { value: candidate, timestamp, sequence: requestSequence, fetchedAt: now() });
        }
        return { [field]: cache.get(key).value };
      } catch (error) {
        const latest = cache.get(key);
        return { ...(latest ? { [field]: { ...latest.value, stale: true } } : {}), error: error.message };
      } finally {
        inFlight.delete(flightKey);
      }
    })();
    inFlight.set(flightKey, promise);
    return promise;
  }

  function getQuote(symbol, force = false) {
    const config = symbols.get(symbol);
    if (!config) return Promise.resolve({ error: 'Unsupported symbol' });
    return load(symbol, force, QUOTE_TTL_MS, 'quote', async () => parseQuote(
      await fetchYahoo(fetchFn, config.yahoo, config.extended, timeoutMs), config.extended
    ));
  }

  function getFx(force = false) {
    return load('KRW=X', force, FX_TTL_MS, 'fx', async () => parseFx(
      await fetchYahoo(fetchFn, 'KRW=X', false, timeoutMs)
    ));
  }

  async function getMarketData(companyId, force = false) {
    const selected = companyId ? companies.filter(company => company.id === companyId) : companies;
    if (!selected.length) return { error: 'Unknown company' };
    const requested = [...new Set(selected.flatMap(company => [company.krCode, company.usTicker]))];
    const [results, fxResult] = await Promise.all([
      Promise.all(requested.map(async symbol => [symbol, await getQuote(symbol, force)])),
      getFx(force)
    ]);
    const quotes = {};
    const errors = {};
    for (const [symbol, result] of results) {
      if (result.quote) quotes[symbol] = result.quote;
      if (result.error) errors[symbol] = { message: result.error, lastKnownTimestamp: result.quote?.timestamp ?? null };
    }
    if (fxResult.error) errors.fx = { message: fxResult.error, lastKnownTimestamp: fxResult.fx?.updatedAt ?? null };
    return { companies: selected, quotes, fx: fxResult.fx ?? null, errors, cachedAt: new Date(now()).toISOString() };
  }

  return { getQuote, getFx, getMarketData };
}
