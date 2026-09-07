import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { marketFixture } from './fixtures.js';
import { compare, gapSummary, PREFERENCES_KEY } from '../assets/model.js';

const server = spawn(process.execPath, ['scripts/test-server.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Test server startup timeout')), 15000);
  server.once('error', reject);
  server.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited: ${code}`)); });
  server.stdout.on('data', chunk => {
    const match = String(chunk).match(/TEST_URL=(http:\/\/127\.0\.0\.1:\d+)/);
    if (match) { clearTimeout(timer); resolve(match[1]); }
  });
}).catch(error => { server.kill(); throw error; });
let browser;
const results = [];

try {
  await mkdir('test-results', { recursive: true });
  browser = await chromium.launch({ headless: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const label = viewport.width === 390 ? 'mobile' : 'desktop';
    const context = await browser.newContext({ viewport, locale: 'ko-KR', timezoneId: 'Asia/Seoul', deviceScaleFactor: 1, isMobile: label === 'mobile', hasTouch: label === 'mobile' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let mode = 'valid', offset = 0, heldResolve;
    let requests = [];
    await page.addInitScript(() => {
      const original = window.setInterval;
      window.__testIntervals = [];
      window.setInterval = (callback, delay, ...args) => {
        window.__testIntervals.push({ callback, delay });
        return original(callback, delay, ...args);
      };
    });
    await page.route('**/*', async route => {
      const target = new URL(route.request().url());
      if (target.origin !== url) { await route.abort(); return; }
      if (!target.pathname.startsWith('/api/')) { await route.continue(); return; }
      requests.push(target.pathname + target.search);
      const data = marketFixture(offset);
      if (mode === 'error') { await route.fulfill({ status: 502, json: { error: 'mock failure' } }); return; }
      if (mode === 'hold' && target.searchParams.get('company')) {
        await new Promise(resolve => { heldResolve = resolve; });
      }
      if (mode === 'invalid') { data.quotes['000660'].price = 0; data.quotes['105560'].price = 0; }
      if (mode === 'staleFx') { data.fx.stale = true; data.errors.fx = { message: 'mock FX failure' }; }
      if (mode === 'partial') { delete data.quotes.WF; data.errors.WF = { message: 'mock quote failure' }; }
      if (target.pathname === '/api/companies') { await route.fulfill({ json: { companies: data.companies } }); return; }
      if (target.searchParams.get('company')) data.companies = data.companies.filter(c => c.id === 'sk-hynix');
      await route.fulfill({ json: data }).catch(error => {
        if (!/closed|canceled|aborted/i.test(error.message)) throw error;
      });
    });

    async function ready() {
      await page.waitForFunction(() => document.querySelectorAll('#companyList .stock-component').length === 9 && document.querySelector('[data-role="kr-price"]')?.textContent !== '—');
      await page.locator('#refresh:not([disabled])').waitFor();
    }
    async function layout() {
      return page.evaluate(() => ({
        text: document.querySelector('main').innerText.replace(/마지막 새로고침:[^\n]*/, '마지막 새로고침'),
        overflow: document.documentElement.scrollWidth > innerWidth,
        boxes: [...document.querySelectorAll('header,.fx-card,.company-heading,.stock-prices,.coverage,.guide-help,footer')].filter(e => !e.hidden).map(e => {
          const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
        })
      }));
    }

    requests = []; errors.length = 0;
    await page.goto(url); await ready();
    const currentLayout = await layout();
    assert.equal(currentLayout.overflow, false, `${label}: horizontal overflow`);
    assert.deepEqual(requests, ['/api/market?company=sk-hynix', '/api/market']);
    for (const company of marketFixture().companies) {
      const data = marketFixture();
      const expected = compare(data.quotes[company.krCode], data.quotes[company.usTicker], data.fx.rates.KRW, company.commonPerAdr);
      const card = page.locator(`[data-company-id="${company.id}"]`);
      assert.equal(await card.locator('[data-role="summary"]').innerText(), gapSummary(expected.adrGap));
      assert.match(await card.locator('[data-role="summary-kr-time"]').innerText(), /국내 기준:.*정규장/);
      assert.match(await card.locator('[data-role="summary-us-time"]').innerText(), /ADR 기준:.*시간외/);
      assert.equal(await card.locator('[data-role="pin"]').getAttribute('aria-pressed'), 'false');
    }
    assert.equal(await page.locator('#toggleMain').getAttribute('aria-expanded'), 'true');
    const controls = await page.locator('.company-actions button').evaluateAll(buttons => buttons.map(b => ({ height: b.getBoundingClientRect().height, name: b.getAttribute('aria-label') })));
    assert.ok(controls.every(b => b.height >= 44 && b.name));
    await page.screenshot({ path: `test-results/${label}.png`, fullPage: true });
    const first = page.locator('[data-company-id="kb-financial"]');
    await first.locator('[data-role="toggle"]').click();
    assert.equal(await first.locator('[data-role="content"]').isVisible(), true);
    const event = await page.evaluate(() => window.dataLayer.filter(e => e.event === 'company_toggle').at(-1));
    assert.equal(event.company_id, 'kb-financial');
    assert.equal(event.toggle_action, 'open');
    assert.equal((await layout()).overflow, false);
    await page.screenshot({ path: `test-results/${label}-expanded.png`, fullPage: true });

    const initialKrTime = await page.locator('#krwTime').innerText();
    requests = []; offset = 60;
    await page.locator('#refresh').click(); await page.locator('#refresh:not([disabled])').waitFor();
    assert.deepEqual(requests, ['/api/market?force=1']);
    assert.notEqual(await page.locator('#krwTime').innerText(), initialKrTime);
    const unchanged = await page.locator('#krwTime').innerText();
    await page.locator('#refresh').click(); await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(await page.locator('#krwTime').innerText(), unchanged);

    mode = 'error';
    await page.locator('#refresh').click(); await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(await page.locator('#status').isVisible(), true);
    assert.equal(await first.locator('[data-role="summary"]').innerText(), '갱신 실패 · 이전 표시');
    mode = 'valid';
    await page.locator('#refresh').click(); await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(await page.locator('#status').isVisible(), false);

    for (const invalidMode of ['invalid', 'staleFx']) {
      mode = invalidMode;
      await page.locator('#lastRefreshAt').evaluate(e => { e.textContent = 'sentinel'; });
      await page.locator('#refresh').click(); await page.locator('#refresh:not([disabled])').waitFor();
      assert.equal(await page.locator('#lastRefreshAt').innerText(), 'sentinel');
      assert.equal(await page.locator('#status').isVisible(), true);
      assert.doesNotMatch(await page.locator('main').innerText(), /NaN|Infinity/);
      assert.equal(await page.locator('[data-company-id="sk-hynix"] [data-role="summary"]').innerText(), invalidMode === 'invalid' ? '비교 불가' : '이전 시세 · 확인 필요');
    }
    mode = 'partial';
    await page.locator('#refresh').click(); await page.locator('#refresh:not([disabled])').waitFor();
    assert.match(await page.locator('[data-company-id="woori-financial"] [data-role="kr-time"]').textContent(), /불러오지 못했습니다/);
    assert.equal(await page.locator('#status').isVisible(), false);
    assert.equal(await page.locator('[data-company-id="woori-financial"] [data-role="summary"]').innerText(), '비교 불가');

    // An automatic request already in flight must not overwrite a newer manual refresh.
    mode = 'hold'; offset = 0; requests = [];
    await page.evaluate(() => { window.__testIntervals.find(i => i.delay === 3600000).callback(); });
    const holdDeadline = Date.now() + 5000;
    while (!heldResolve && Date.now() < holdDeadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(heldResolve, 'Automatic refresh did not start within the test deadline');
    mode = 'valid'; offset = 120;
    // The UI button is disabled for normal users; invoke its existing handler to exercise supersession.
    await page.evaluate(() => { document.querySelector('#refresh').onclick(); });
    await page.locator('#refresh:not([disabled])').waitFor();
    const latest = await page.locator('#krwTime').innerText();
    heldResolve();
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#krwTime').innerText(), latest);
    assert.deepEqual(requests, ['/api/market?company=sk-hynix', '/api/market?force=1']);
    // Pinning only changes UI order and restores on this origin, without extra API calls.
    const requestCount = requests.length;
    await first.locator('[data-role="pin"]').click();
    assert.equal(await page.locator('#companyList > .stock-component').first().getAttribute('data-company-id'), 'kb-financial');
    assert.equal(await first.locator('[data-role="pin"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await first.locator('[data-role="pin"]').evaluate(e => e === document.activeElement), true);
    await page.locator('#toggleMain').click();
    assert.equal(requests.length, requestCount);
    const saved = JSON.parse(await page.evaluate(key => localStorage.getItem(key), PREFERENCES_KEY));
    assert.deepEqual(saved.pinned, ['kb-financial']);
    assert.deepEqual(saved.expanded, { 'kb-financial': true, 'sk-hynix': false });
    requests = [];
    await page.reload(); await ready();
    assert.deepEqual(requests, ['/api/market?company=sk-hynix', '/api/market']);
    assert.equal(await page.locator('#companyList > .stock-component').first().getAttribute('data-company-id'), 'kb-financial');
    assert.equal(await first.locator('[data-role="content"]').isVisible(), true);
    assert.equal(await page.locator('#toggleMain').getAttribute('aria-expanded'), 'false');
    assert.equal((await layout()).overflow, false);
    await page.screenshot({ path: `test-results/${label}-pinned.png`, fullPage: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/${label}-first-screen.png` });
    await first.locator('[data-role="toggle"]').click();
    await page.screenshot({ path: `test-results/${label}-overview.png`, fullPage: true });
    await first.locator('[data-role="pin"]').focus();
    await page.keyboard.press('Space');
    assert.equal(await first.locator('[data-role="pin"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#companyList > .stock-component').first().getAttribute('data-company-id'), 'sk-hynix');

    // Corrupt storage must not break initial rendering.
    await page.evaluate(key => localStorage.setItem(key, '{broken'), PREFERENCES_KEY);
    await page.reload(); await ready();
    assert.equal(await page.locator('#toggleMain').getAttribute('aria-expanded'), 'true');
    assert.equal(await first.locator('[data-role="content"]').isVisible(), false);
    // Unknown company IDs are ignored without adding cards or changing the default order.
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, pinned: ['unknown-company'], expanded: { 'unknown-company': true } })), PREFERENCES_KEY);
    await page.reload(); await ready();
    assert.equal(await page.locator('#companyList > .stock-component').first().getAttribute('data-company-id'), 'sk-hynix');
    // Private/restricted storage: the controls remain functional in memory.
    await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
    await page.reload(); await ready();
    await first.locator('[data-role="pin"]').click();
    await first.locator('[data-role="toggle"]').click();
    assert.equal(await first.locator('[data-role="content"]').isVisible(), true);
    assert.equal(await first.locator('[data-role="pin"]').getAttribute('aria-pressed'), 'true');
    requests = [];
    await page.locator('#refresh').click(); await page.locator('#refresh:not([disabled])').waitFor();
    assert.deepEqual(requests, ['/api/market?force=1']);

    await page.setViewportSize({ width: 320, height: 844 });
    assert.equal((await layout()).overflow, false, '320px overflow');
    // Text-only enlargement, not screenshot scaling.
    await page.addStyleTag({ content: 'html{font-size:200%!important}' });
    assert.equal((await layout()).overflow, false, '200% text overflow');
    assert.equal(await first.locator('[data-role="toggle"]').isVisible(), true);
    assert.deepEqual(errors, []);
    results.push({ viewport: label, passed: true, initialApiRequests: 2, manualApiRequests: 1, scenarios: ['nine summaries / common denominator', 'separate source times / US session policy', 'layout / 44px controls / 320px / 200% text', 'toggle / analytics ID', 'force / unchanged source time', 'error recovery / invalid / stale / partial', 'request supersession', 'pin / unpin / focus / keyboard', 'preference reload', 'corrupt / unknown / blocked storage'] });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
  await writeFile('test-results/browser-results.json', JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
