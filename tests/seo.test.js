import '../scripts/register-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderHome } from '../src/render-home.js';
import { compare, gapSummary } from '../assets/model.js';

const companies = JSON.parse(readFileSync(new URL('../companies.json', import.meta.url)));
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let calls = 0;
globalThis.fetch = async () => { calls++; throw new Error('SEO requests must not fetch market data'); };
const { default: worker } = await import('../worker.js');
const request = (url, headers) => worker.fetch(new Request(url, { headers }));

test('Initial HTML contains all company metadata without scripts, Yahoo calls or made-up prices', async () => {
  const response = await request('https://adrgap.com/');
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal((html.match(/class="stock-component"/g) || []).length, companies.length);
  assert.equal((html.match(/data-role="summary-adr">—</g) || []).length, companies.length);
  for (const company of companies) {
    assert.ok(html.includes('data-company-id="' + company.id + '"'));
    for (const field of ['name', 'krCode', 'usTicker', 'ratioLabel']) assert.ok(html.includes(company[field]), company.id + '/' + field);
  }
  assert.match(html, /id="companyCount">9개 기업/);
  assert.doesNotMatch(html, /companyTemplate|COMPANY_CARDS|\{\{(?:id|name|companyCount)\}\}/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Unique element IDs');
  const crawler = await request('https://adrgap.com/', { 'user-agent': 'Googlebot' });
  assert.equal(await crawler.text(), html, 'Same content for users and crawlers');
  assert.equal(calls, 0);
});

test('Company metadata is escaped in text and attributes without interpreting replacement tokens', () => {
  const name = '<img src=x onerror="alert(1)"> & \' $& {{companyCount}}';
  const html = renderHome(source, [{ ...companies[0], name }]);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39; $&amp; {{companyCount}}'));
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /id="companyCount">1개 기업/);
  assert.throws(() => renderHome('<html></html>', companies), /Missing company template/);
});

test('Permanent canonical redirects preserve query parameters and combine host, scheme and path', async () => {
  for (const [input, expected] of [
    ['http://adrgap.com/', 'https://adrgap.com/'],
    ['http://www.adrgap.com/index.html?utm_source=test&utm_medium=referral', 'https://adrgap.com/?utm_source=test&utm_medium=referral'],
    ['https://www.adrgap.com/what-is-adr-gap?utm_source=test', 'https://adrgap.com/what-is-adr-gap/?utm_source=test'],
    ['https://adrgap.com/index.html', 'https://adrgap.com/'],
    ['http://adrgap.com/api/market?force=1', 'https://adrgap.com/api/market?force=1'],
    ['http://127.0.0.1:8787/what-is-adr-gap', 'http://127.0.0.1:8787/what-is-adr-gap/']
  ]) {
    const response = await request(input);
    assert.equal(response.status, 308, input);
    assert.equal(response.headers.get('location'), expected, input);
  }
  for (const url of ['http://127.0.0.1:8787/', 'https://preview.workers.dev/', 'https://adrgap.com/what-is-adr-gap/']) {
    assert.equal((await request(url)).status, 200, url);
  }
  assert.equal((await request('https://adrgap.com/missing')).status, 404);
  assert.equal(calls, 0);
});

test('Guide example agrees with the actual comparison model and sitemap changes only edited pages', async () => {
  const timestamp = '2026-09-08T06:30:00.000Z';
  const kr = { price: 130000, currency: 'KRW', timestamp };
  const us = { price: 55, currency: 'USD', timestamp };
  const example = compare(kr, us, 1300, 0.5);
  assert.equal(example.fairAdr, 50);
  assert.equal(example.impliedKrw, 143000);
  assert.equal(gapSummary(example.adrGap), '10.00% 높음');
  assert.equal(Math.abs(example.koreaGap).toFixed(2), '9.09');
  assert.equal(gapSummary(compare(kr, { ...us, price: 45 }, 1300, 0.5).adrGap), '10.00% 낮음');
  const guide = await (await request('https://adrgap.com/what-is-adr-gap/')).text();
  assert.match(guide, /ADR 괴리율\(%\) = \(미국 ADR 가격 ÷ 국내 환산가 − 1\) × 100/);
  assert.match(guide, /10\.00% 높음/);
  assert.match(guide, /9\.09%/);
  assert.match(guide, /실제 종목·시세가 아닌 계산 예시/);
  const sitemap = await (await request('https://adrgap.com/sitemap.xml')).text();
  for (const path of ['/', '/what-is-adr-gap/']) assert.ok(sitemap.includes('<loc>https://adrgap.com' + path + '</loc>\n    <lastmod>2026-09-09</lastmod>'));
  for (const path of ['/terms.html', '/privacy.html']) assert.ok(sitemap.includes('<loc>https://adrgap.com' + path + '</loc>\n    <lastmod>2026-07-20</lastmod>'));
});
