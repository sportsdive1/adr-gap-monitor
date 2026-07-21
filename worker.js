import companies from './companies.json';
import indexHtml from './index.html';
import termsHtml from './terms.html';
import privacyHtml from './privacy.html';
import robotsTxt from './robots.txt';
import sitemapXml from './sitemap.xml';

const symbolMap = Object.fromEntries(companies.flatMap(company => [
  [company.krCode, company.krYahooSymbol],
  [company.usTicker, company.usYahooSymbol]
]));
const quoteCache = new Map();
let fxCache = null;
const quoteTtlMs = 60_000;
const fxTtlMs = 60 * 60 * 1_000;

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const html = content => new Response(content, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const text = (content, contentType) => new Response(content, { headers: { 'content-type': contentType } });

async function getQuote(symbol) {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < quoteTtlMs) return { quote: cached.quote };
  const yahooSymbol = symbolMap[symbol];
  if (!yahooSymbol) return { error: 'Unsupported symbol' };

  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1m`, {
      headers: { 'user-agent': 'Mozilla/5.0' }
    });
    if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`);
    const data = await response.json();
    const row = data.chart?.result?.[0];
    const closes = row?.indicators?.quote?.[0]?.close;
    const timestamps = row?.timestamp;
    if (!row || !Array.isArray(closes) || !Array.isArray(timestamps)) throw new Error('No Yahoo Finance price data available');
    let last = closes.length - 1;
    while (last >= 0 && !Number.isFinite(closes[last])) last -= 1;
    if (last < 0) throw new Error('No Yahoo Finance price data available');
    const quote = {
      price: closes[last],
      timestamp: new Date(timestamps[last] * 1_000).toISOString(),
      marketState: row.meta?.marketState ?? null,
      source: 'Yahoo Finance'
    };
    quoteCache.set(symbol, { quote, fetchedAt: Date.now() });
    return { quote };
  } catch (error) {
    if (cached) return { quote: { ...cached.quote, stale: true }, error: error.message };
    return { error: error.message };
  }
}

async function getFx() {
  if (fxCache && Date.now() - fxCache.fetchedAt < fxTtlMs) return { fx: fxCache.fx };
  try {
    const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/KRW%3DX?range=1d&interval=1m', {
      headers: { 'user-agent': 'Mozilla/5.0' }
    });
    if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`);
    const data = await response.json();
    const row = data.chart?.result?.[0];
    const closes = row?.indicators?.quote?.[0]?.close;
    const timestamps = row?.timestamp;
    if (!row || !Array.isArray(closes) || !Array.isArray(timestamps)) throw new Error('No Yahoo Finance FX data available');
    let last = closes.length - 1;
    while (last >= 0 && !Number.isFinite(closes[last])) last -= 1;
    if (last < 0) throw new Error('No Yahoo Finance FX data available');
    const rate = closes[last];
    const fx = {
      rates: { KRW: rate },
      updatedAt: new Date(timestamps[last] * 1_000).toISOString(),
      source: 'Yahoo Finance (KRW=X)'
    };
    fxCache = { fx, fetchedAt: Date.now() };
    return { fx };
  } catch (error) {
    if (fxCache) return { fx: { ...fxCache.fx, stale: true }, error: error.message };
    return { error: error.message };
  }
}

async function getMarketData(companyId) {
  const selected = companyId ? companies.filter(company => company.id === companyId) : companies;
  if (!selected.length) return { error: 'Unknown company' };
  const symbols = selected.flatMap(company => [company.krCode, company.usTicker]);
  const results = await Promise.all(symbols.map(async symbol => [symbol, await getQuote(symbol)]));
  const quotes = {};
  const errors = {};
  for (const [symbol, result] of results) {
    if (result.quote) quotes[symbol] = result.quote;
    if (result.error) errors[symbol] = { message: result.error, lastKnownTimestamp: result.quote?.timestamp ?? null };
  }
  const fxResult = await getFx();
  if (fxResult.error) errors.fx = { message: fxResult.error, lastKnownTimestamp: fxResult.fx?.updatedAt ?? null };
  return { companies: selected, quotes, fx: fxResult.fx ?? null, errors, cachedAt: new Date().toISOString() };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (url.pathname === '/' || url.pathname === '/index.html') return html(indexHtml);
      if (url.pathname === '/terms.html') return html(termsHtml);
      if (url.pathname === '/privacy.html') return html(privacyHtml);
      if (url.pathname === '/robots.txt') return text(robotsTxt, 'text/plain; charset=utf-8');
      if (url.pathname === '/sitemap.xml') return text(sitemapXml, 'application/xml; charset=utf-8');
      return new Response('Not found', { status: 404 });
    }

    if (url.pathname === '/api/companies') return json({ companies });
    if (url.pathname === '/api/quote') {
      const symbol = url.searchParams.get('symbol');
      const result = await getQuote(symbol);
      return result.quote ? json(result.quote) : json({ error: result.error }, 502);
    }
    if (url.pathname === '/api/fx') {
      const result = await getFx();
      return result.fx ? json(result.fx) : json({ error: result.error }, 502);
    }
    if (url.pathname === '/api/market') {
      const data = await getMarketData(url.searchParams.get('company'));
      return data.error ? json({ error: data.error }, 404) : json(data);
    }
    return json({ error: 'Not found' }, 404);
  }
};
