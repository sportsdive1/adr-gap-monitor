import test from 'node:test';
import assert from 'node:assert/strict';
import { compare, gapSummary, normalizePreferences, readPreferences, writePreferences } from '../assets/model.js';

test('summaries use the ADR gap denominator, with neutral rounded zero', () => {
  const timestamp = '2026-09-07T06:30:00Z';
  const values = compare({ price: 13000, timestamp }, { price: 12, timestamp }, 1300, 1);
  assert.equal(gapSummary(values.adrGap), '20.00% 높음');
  assert.equal(gapSummary(-20), '20.00% 낮음');
  assert.equal(gapSummary(0), '0.00% · 거의 같음');
  assert.equal(gapSummary(-0.001), '0.00% · 거의 같음');
  assert.equal(gapSummary(0.001), '0.00% · 거의 같음');
  for (const value of [NaN, Infinity, -Infinity, undefined]) assert.equal(gapSummary(value), '비교 불가');
});

test('preferences restore only versioned, bounded UI fields', () => {
  const result = normalizePreferences({ version: 1, pinned: ['kb-financial', 'kb-financial', 2, '<script>', 'future-company'], expanded: { 'sk-hynix': false, 'kb-financial': true, bad: 'true' }, quotes: { secret: 1 } });
  assert.deepEqual(result, { version: 1, pinned: ['kb-financial', 'future-company'], expanded: { 'sk-hynix': false, 'kb-financial': true } });
  const many = Array.from({ length: 150 }, (_, i) => `company-${i}`);
  assert.equal(normalizePreferences({ version: 1, pinned: many, expanded: Object.fromEntries(many.map(id => [id, true])) }).pinned.length, 100);
  assert.equal(Object.keys(normalizePreferences({ version: 1, expanded: Object.fromEntries(many.map(id => [id, true])) }).expanded).length, 100);
});

test('missing, malformed and unsupported preference versions use safe defaults', () => {
  const defaults = { version: 1, pinned: [], expanded: {} };
  for (const raw of [null, '', 'not JSON', 'null', '[]', '{"version":2,"pinned":["kt"]}']) assert.deepEqual(readPreferences(() => raw), defaults);
  assert.deepEqual(readPreferences(() => { throw new Error('Storage blocked'); }), defaults);
});

test('UI preferences round-trip without prices and blocked writes do not throw', () => {
  let stored;
  const preferences = { version: 1, pinned: ['kt'], expanded: { kt: true }, rates: { KRW: 1300 } };
  assert.equal(writePreferences(value => { stored = value; }, preferences), true);
  assert.deepEqual(readPreferences(() => stored), { version: 1, pinned: ['kt'], expanded: { kt: true } });
  assert.equal(writePreferences(() => { throw new Error('Quota exceeded'); }, preferences), false);
});
