import { readFileSync } from 'node:fs';
export const companies = JSON.parse(readFileSync(new URL('../companies.json', import.meta.url), 'utf8'));
export const seconds = 1788762600;
export const chart = row => ({ chart: { result: [row] } });
export const bar = (price = 100, time = seconds) => ({ meta: { regularMarketPrice: price, regularMarketTime: time }, timestamp: [time], indicators: { quote: [{ close: [price] }] } });
export const reply = row => ({ ok: true, json: async () => chart(row) });
export function marketFixture(offset = 0) {
  const quotes = {};
  for (const [index, company] of companies.entries()) {
    quotes[company.krCode] = { price: 170000 + index * 1000 + offset, timestamp: new Date((seconds + offset) * 1000).toISOString(), extendedHoursIncluded: false, source: 'Yahoo Finance' };
    quotes[company.usTicker] = { price: 12 + index, timestamp: '2026-09-04T23:30:00.000Z', extendedHoursIncluded: true, source: 'Yahoo Finance' };
  }
  return { companies, quotes, fx: { rates: { KRW: 1300 + offset }, updatedAt: new Date((seconds + offset) * 1000).toISOString(), source: 'Yahoo Finance (KRW=X)' }, errors: {} };
}
