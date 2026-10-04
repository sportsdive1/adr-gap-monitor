import '../scripts/register-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { bar, reply } from './fixtures.js';

const calls = [];
globalThis.fetch = async url => { calls.push(url); return reply(bar()); };
const { default: worker } = await import('../worker.js');
const request = path => worker.fetch(new Request(`https://example.test${path}`));

test('Worker serves all existing pages and extracted assets with correct content types', async () => {
  for (const path of ['/', '/terms.html', '/privacy.html', '/what-is-adr-gap/']) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /text\/html/);
  }
  for (const [path, type] of [['/robots.txt', 'text/plain'], ['/sitemap.xml', 'application/xml'], ['/assets/app.js', 'application/javascript'], ['/assets/model.js', 'application/javascript'], ['/assets/styles.css', 'text/css']]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-type').startsWith(type));
    assert.ok((await response.text()).length > 0);
  }
  for (const [path, type, signature, dimensions] of [
    ['/assets/favicon.png', 'image/png', [137, 80, 78, 71, 13, 10, 26, 10], [96, 96]],
    ['/assets/social-preview.png', 'image/png', [137, 80, 78, 71, 13, 10, 26, 10], [1200, 630]],
    ['/favicon.ico', 'image/x-icon', [0, 0, 1, 0, 1, 0], null]
  ]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), type);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, signature.length)], signature, path);
    if (dimensions) assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], dimensions, path);
  }
  assert.equal((await request('/missing')).status, 404);
  assert.equal((await request('/api/market?company=missing')).status, 404);
  assert.equal(calls.length, 0);
});

test('API routes propagate only force=1 and keep no-store response policy', async () => {
  let response = await request('/api/market?company=sk-hynix');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 3);
  await request('/api/market?company=sk-hynix&force=0'); assert.equal(calls.length, 3);
  await request('/api/market?company=sk-hynix&force=true'); assert.equal(calls.length, 3);
  response = await request('/api/market?company=sk-hynix&force=1'); assert.equal(calls.length, 6);
  assert.equal(Object.keys((await response.json()).quotes).length, 2);
  await request('/api/quote?symbol=000660&force=1'); assert.equal(calls.length, 7);
  await request('/api/fx?force=1'); assert.equal(calls.length, 8);
  assert.equal((await request('/api/companies')).status, 200);
});
