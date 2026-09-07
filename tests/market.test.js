import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuote, parseFx, fetchYahoo } from '../src/yahoo.js';
import { createMarketService, QUOTE_TTL_MS, FX_TTL_MS } from '../src/market-service.js';
import { compare, validFx, quoteSessionLabel } from '../assets/model.js';
import { companies, seconds, chart, bar, reply, marketFixture } from './fixtures.js';

test('company IDs, symbols, ratios and evidence are consistent', () => {
  assert.equal(new Set(companies.map(c => c.id)).size, companies.length);
  assert.equal(new Set(companies.flatMap(c => [c.krCode, c.usTicker])).size, companies.length * 2);
  for (const c of companies) {
    assert.ok(Number.isFinite(c.commonPerAdr) && c.commonPerAdr > 0);
    assert.ok(c.krYahooSymbol && c.usYahooSymbol && c.ratioLabel && c.ratioVerifiedAt);
    assert.equal(new URL(c.ratioSourceUrl).protocol, 'https:');
  }
});

test('valid regular metadata does not require minute bars', () => {
  for (const row of [ { meta: bar(123).meta }, { ...bar(123), indicators: { quote: [{ close: [null] }] } } ]) {
    assert.equal(parseQuote(chart(row)).price, 123);
  }
});

test('regular metadata is preferred even when a later bar exists; ADR remains bar-based', () => {
  const row = { ...bar(101, seconds + 60), meta: bar(123).meta };
  assert.equal(parseQuote(chart(row)).price, 123);
  assert.equal(parseQuote(chart(row), true).price, 101);
  assert.equal(parseQuote(chart(row), true).extendedHoursIncluded, true);
});

for (const value of [undefined, null, 0, -1, '123', NaN, Infinity]) {
  test(`invalid regular price ${String(value)} falls back`, () => {
    const row = bar(100); row.meta.regularMarketPrice = value;
    assert.equal(parseQuote(chart(row)).price, 100);
  });
}
for (const value of [undefined, null, 0, -1, '123', NaN, Infinity, 1e20]) {
  test(`invalid regular time ${String(value)} falls back`, () => {
    const row = bar(100); row.meta.regularMarketTime = value;
    assert.equal(parseQuote(chart(row)).timestamp, new Date(seconds * 1000).toISOString());
  });
}

test('fallback validates price and matching time together, including unequal arrays', () => {
  const row = { timestamp: [seconds, null, seconds + 60, seconds + 120], indicators: { quote: [{ close: [123, 456, 0, null, 999] }] } };
  assert.equal(parseQuote(chart(row)).price, 123);
  assert.equal(parseFx(chart(row)).rates.KRW, 123);
  assert.throws(() => parseQuote(chart({ timestamp: [null], indicators: { quote: [{ close: [123] }] } })));
  assert.throws(() => parseFx(chart({})));
});

test('normal quote and FX TTLs stay at one minute and one hour; force bypasses both', async () => {
  let now = 0, calls = 0;
  const service = createMarketService(companies, { now: () => now, fetchFn: async () => { calls++; return reply(bar()); } });
  await service.getQuote('000660'); await service.getFx();
  await service.getQuote('000660'); await service.getFx();
  assert.equal(calls, 2);
  now = QUOTE_TTL_MS;
  await service.getQuote('000660'); await service.getFx(); assert.equal(calls, 3);
  await service.getQuote('000660', true); await service.getFx(true); assert.equal(calls, 5);
  now += FX_TTL_MS;
  await service.getFx(); assert.equal(calls, 6);
});

test('force with unchanged Yahoo data keeps source timestamps', async () => {
  const service = createMarketService(companies, { fetchFn: async () => reply(bar()) });
  assert.deepEqual(await service.getQuote('000660'), await service.getQuote('000660', true));
  assert.deepEqual(await service.getFx(), await service.getFx(true));
});

test('simultaneous forced requests share one upstream call per symbol', async () => {
  let resolve, calls = 0;
  const service = createMarketService(companies, { fetchFn: () => { calls++; return new Promise(r => { resolve = r; }); } });
  const a = service.getQuote('000660', true), b = service.getQuote('000660', true);
  resolve(reply(bar()));
  assert.deepEqual(await a, await b);
  assert.equal(calls, 1);
});

test('force does not join an older normal request; late old responses cannot roll back data', async () => {
  const resolvers = [];
  const service = createMarketService(companies, { fetchFn: () => new Promise(r => resolvers.push(r)) });
  const old = service.getQuote('000660'), fresh = service.getQuote('000660', true);
  assert.equal(resolvers.length, 2);
  resolvers[1](reply(bar(200, seconds + 60))); assert.equal((await fresh).quote.price, 200);
  resolvers[0](reply(bar(100))); assert.equal((await old).quote.price, 200);
  assert.equal((await service.getQuote('000660')).quote.price, 200);
});

test('same-time corrections are protected by request order', async () => {
  const resolvers = [];
  const service = createMarketService(companies, { fetchFn: () => new Promise(r => resolvers.push(r)) });
  const old = service.getFx(), fresh = service.getFx(true);
  resolvers[1](reply(bar(1400))); await fresh;
  resolvers[0](reply(bar(1300))); await old;
  assert.equal((await service.getFx()).fx.rates.KRW, 1400);
});

test('one hung symbol times out while FX starts immediately and other symbols survive', async () => {
  const urls = [];
  const service = createMarketService(companies, { timeoutMs: 20, fetchFn: url => {
    urls.push(url);
    return url.includes('/WF?') ? new Promise(() => {}) : Promise.resolve(reply(bar()));
  } });
  const pending = service.getMarketData(null, true);
  assert.equal(urls.length, 19);
  assert.ok(urls.some(url => url.includes('KRW%3DX')));
  const data = await pending;
  assert.equal(Object.keys(data.quotes).length, 17);
  assert.match(data.errors.WF.message, /timed out/);
  assert.ok(data.fx);
});

test('response body is covered by the deadline and its signal is aborted', async () => {
  let signal;
  await assert.rejects(fetchYahoo(async (_url, options) => {
    signal = options.signal;
    return { ok: true, json: () => new Promise(() => {}) };
  }, 'KRW=X', false, 20), /timed out/);
  assert.equal(signal.aborted, true);
});

test('failed quote and FX loads keep previous values explicitly stale, not fresh', async () => {
  let fail = false;
  const service = createMarketService(companies, { fetchFn: async () => {
    if (fail) throw new Error('offline');
    return reply(bar());
  } });
  await service.getMarketData('sk-hynix'); fail = true;
  const result = await service.getMarketData('sk-hynix', true);
  assert.equal(result.quotes['000660'].stale, true);
  assert.equal(result.fx.stale, true);
  assert.equal(Object.keys(result.errors).length, 3);
});

test('unsupported inputs make no upstream requests; ADR alone includes extended hours', async () => {
  const urls = [];
  const service = createMarketService(companies, { fetchFn: async url => { urls.push(url); return reply(bar()); } });
  assert.ok((await service.getQuote('unknown')).error);
  assert.ok((await service.getMarketData('unknown')).error);
  assert.equal(urls.length, 0);
  await service.getMarketData('sk-hynix', true);
  assert.equal(urls.filter(url => url.includes('includePrePost=true')).length, 1);
  assert.ok(urls.find(url => url.includes('/SKHY?')).includes('includePrePost=true'));
});

test('all cards share comparison math, validation and existing session labels', () => {
  const fixture = marketFixture();
  const kr = fixture.quotes['000660'], us = fixture.quotes.SKHY;
  const result = compare(kr, us, 1300, 0.1);
  assert.equal(result.fairAdr, 170000 * 0.1 / 1300);
  assert.equal(result.impliedKrw, 12 * 1300 / 0.1);
  for (const value of [0, -1, null, NaN, Infinity]) {
    assert.equal(compare({ ...kr, price: value }, us, 1300, 0.1), null);
    assert.equal(compare(kr, us, value, 0.1), null);
    assert.equal(compare(kr, us, 1300, value), null);
    assert.equal(validFx({ ...fixture.fx, rates: { KRW: value } }), false);
  }
  assert.equal(quoteSessionLabel(kr), '정규장 시세');
  assert.equal(quoteSessionLabel(us), '시간외 시세');
});
