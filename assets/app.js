import { compare, validFx, money, timeLabel, quoteTime, escapeHtml, gapSummary, PREFERENCES_KEY, readPreferences, writePreferences } from './model.js';

const MAIN_ID = 'sk-hynix';
const MARKET_ERROR = '시세 또는 환율을 불러오지 못했습니다.';
const QUOTE_ERROR = '시세를 불러오지 못했습니다.';
const FX_ERROR = '환율을 불러오지 못했습니다.';

export function createApp({ document, window, fetchFn = window.fetch.bind(window), now = () => new Date() }) {
  const $ = id => document.getElementById(id);
  const container = $('companyList');
  const preferences = readPreferences(() => window.localStorage.getItem(PREFERENCES_KEY));
  const cards = new Map();
  let active = null;
  let background = null;
  let generation = 0;
  let interval;

  function status(message = '') {
    $('status').textContent = message;
    $('status').hidden = !message;
  }

  async function api(url, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 12000);
    try {
      const response = await fetchFn(url, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `API 오류 ${response.status}`);
      return data;
    } catch (error) {
      if (error.name === 'AbortError' && !signal.aborted) throw new Error('서버 응답 시간 초과');
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }

  const mainRoles = { 'kr-time': 'krwTime', 'us-time': 'adrTime', 'kr-price': 'krwPrice', 'us-price': 'adrPrice', 'kr-usd': 'krUsdPrice', 'us-krw': 'adrKrwPrice', 'kr-gap': 'krGapCopy', 'us-gap': 'adrGapCopy', ratio: 'mainRatio', toggle: 'toggleMain' };
  const element = (company, role) => cards.get(company.id).querySelector(`[data-role="${role}"]`);
  function savePreferences() {
    writePreferences(value => window.localStorage.setItem(PREFERENCES_KEY, value), preferences);
  }
  function applyPreferences() {
    const focused = document.activeElement;
    const ordered = [...cards.entries()].sort(([a], [b]) => Number(preferences.pinned.includes(b)) - Number(preferences.pinned.includes(a)));
    ordered.forEach(([id, card], index) => {
      const pinned = preferences.pinned.includes(id);
      const opening = Object.hasOwn(preferences.expanded, id) ? preferences.expanded[id] : false;
      const pin = card.querySelector('[data-role="pin"]');
      pin.setAttribute('aria-pressed', String(pinned));
      pin.setAttribute('aria-label', `${card.dataset.name} ${pinned ? '관심 기업 고정 해제' : '관심 기업으로 고정'}`);
      card.querySelector('[data-role="monogram"]').setAttribute('data-pinned', String(pinned));
      card.dataset.pinned = String(pinned);
      const toggle = card.querySelector('[data-role="toggle"]');
      toggle.setAttribute('aria-expanded', String(opening));
      card.querySelector('[data-role="toggle-label"]').textContent = opening ? '접기' : '상세';
      card.dataset.expanded = String(opening);
      toggle.setAttribute('aria-label', `${card.dataset.name} 상세 ${opening ? '접기' : '펼치기'}`);
      card.querySelector('[data-role="content"]').hidden = !opening;
      if (container.children[index] !== card) container.insertBefore(card, container.children[index] || null);
    });
    if (focused && container.contains(focused) && focused !== document.activeElement) focused.focus({ preventScroll: true });
  }
  function buildCards(companies) {
    for (const company of companies) {
      if (cards.has(company.id)) continue;
      const card = $('companyTemplate').content.firstElementChild.cloneNode(true);
      card.dataset.pair = `${company.krCode}-${company.usTicker}`;
      card.dataset.companyId = company.id;
      card.dataset.name = company.name;
      cards.set(company.id, card);
      element(company, 'name').textContent = company.name;
      element(company, 'name').id = `company-name-${company.id}`;
      card.setAttribute('aria-labelledby', `company-name-${company.id}`);
      element(company, 'monogram').textContent = company.usTicker.slice(0, 2);
      element(company, 'us-ticker').textContent = company.usTicker;
      element(company, 'ratio').textContent = company.ratioLabel;
      element(company, 'kr-label').textContent = `한국 KRX · ${company.krCode}`;
      element(company, 'us-label').textContent = `미국 ${company.usExchange} · ${company.usTicker}`;
      const contentId = `prices-${company.id}`;
      element(company, 'content').id = contentId;
      element(company, 'toggle').setAttribute('aria-controls', contentId);
      if (company.id === MAIN_ID) for (const [role, id] of Object.entries(mainRoles)) element(company, role).id = id;
      container.append(card);
    }
    if (cards.size) $('companyLoading')?.remove();
    $('companyCount').textContent = `${cards.size}개 기업`;
    applyPreferences();
  }
  function summaryIssue(company, message) {
    element(company, 'summary').textContent = message;
    cards.get(company.id).dataset.summaryState = 'unavailable';
  }
  function failedRefresh() {
    for (const id of cards.keys()) summaryIssue({ id }, '갱신 실패 · 이전 표시');
    if ($('companyLoading')) $('companyLoading').textContent = QUOTE_ERROR;
  }
  function issue(company, message) {
    summaryIssue(company, '비교 불가');
    element(company, 'summary-fair-adr').textContent = '—';
    element(company, 'summary-adr').textContent = '—';
    element(company, 'summary-kr-time').textContent = message;
    element(company, 'summary-us-time').textContent = '';
    for (const side of ['kr', 'us']) {
      element(company, `${side}-time`).textContent = message;
      element(company, `${side}-gap`).innerHTML = `<strong>${message}</strong><br>다음 새로고침 때 다시 시도합니다.`;
    }
  }

  function renderCompany(company, market) {
    const kr = market.quotes?.[company.krCode], us = market.quotes?.[company.usTicker];
    const values = validFx(market.fx) && compare(kr, us, market.fx.rates.KRW, company.commonPerAdr);
    if (!values) {
      issue(company, company.id === MAIN_ID ? MARKET_ERROR : validFx(market.fx) ? QUOTE_ERROR : FX_ERROR);
      return false;
    }
    const text = (role, value) => { element(company, role).textContent = value; };
    text('kr-price', money(values.krw, 'KRW')); text('us-price', money(values.adr, 'USD'));
    text('kr-usd', money(values.fairAdr, 'USD')); text('us-krw', money(values.impliedKrw, 'KRW'));
    text('summary-fair-adr', money(values.fairAdr, 'USD')); text('summary-adr', money(values.adr, 'USD'));
    text('kr-time', quoteTime(kr)); text('us-time', quoteTime(us));
    element(company, 'kr-gap').innerHTML = `ADR 원화 환산가보다<br><strong>${Math.abs(values.koreaGap).toFixed(2)}% (${money(values.krwDifference, 'KRW')})</strong> <span class="gap-direction">${values.koreaGap >= 0 ? '높은' : '낮은'}</span> 상태입니다.`;
    element(company, 'us-gap').innerHTML = `${escapeHtml(company.name)} 달러 환산가보다<br><strong>${Math.abs(values.adrGap).toFixed(2)}% (${money(values.usdDifference, 'USD')})</strong> <span class="gap-direction">${values.adrGap >= 0 ? '높은' : '낮은'}</span> 상태입니다.`;
    const healthy = !kr.stale && !us.stale && !market.fx.stale;
    text('summary', healthy ? gapSummary(values.adrGap) : '이전 시세 · 확인 필요');
    text('summary-kr-time', `국내 ${quoteTime(kr)}`);
    text('summary-us-time', `ADR ${quoteTime(us)}`);
    cards.get(company.id).dataset.summaryState = healthy ? 'valid' : 'stale';
    return healthy;
  }

  function renderMarket(market) {
    if (!Array.isArray(market.companies)) throw new Error(MARKET_ERROR);
    buildCards(market.companies);
    if (validFx(market.fx)) {
      $('fxTime').textContent = `환율: 1 USD = ${market.fx.rates.KRW.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원`;
      $('fxUpdatedAt').textContent = `기준: ${timeLabel(market.fx.updatedAt)}`;
    }
    let mainHealthy = false;
    for (const company of market.companies) {
      const healthy = renderCompany(company, market);
      if (company.id === MAIN_ID) {
        $('mainRatio').textContent = company.ratioLabel;
        mainHealthy = healthy;
      }
    }
    status(mainHealthy ? '' : MARKET_ERROR);
    return mainHealthy;
  }

  function refresh(force = false) {
    // Automatic ticks join active refreshes; a manual click supersedes a normal request.
    if (active && (!force || active.force)) return active.promise;
    active?.controller.abort();
    background?.abort();
    const token = ++generation;
    const controller = new AbortController();
    const task = { force, controller };
    active = task;
    $('refresh').disabled = true;
    $('refreshLabel').textContent = '업데이트 중…';
    task.promise = (async () => {
      try {
        const market = await api(force ? '/api/market?force=1' : '/api/market?company=sk-hynix', controller.signal);
        if (token !== generation) return;
        if (renderMarket(market)) $('lastRefreshAt').textContent = `마지막 새로고침: ${now().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        // Reuse the forced snapshot; only normal loads need the existing background request.
        if (!force) {
          background = controller;
          void api('/api/market', controller.signal).then(data => {
            if (token === generation) renderMarket(data);
          }).catch(error => {
            if (!controller.signal.aborted && token === generation) { failedRefresh(); status(`시세를 불러오지 못했습니다. (${error.message})`); }
          });
        }
      } catch (error) {
        if (!controller.signal.aborted && token === generation) { failedRefresh(); status(`시세를 불러오지 못했습니다. (${error.message})`); }
      } finally {
        if (active === task) {
          active = null;
          $('refresh').disabled = false;
          $('refreshLabel').textContent = '새로고침';
        }
      }
    })();
    return task.promise;
  }

  function track(event, parameters = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...parameters });
  }
  $('refresh').onclick = () => { track('manual_refresh'); return refresh(true); };
  container.addEventListener('click', event => {
    const button = event.target.closest('button[data-role]');
    if (!button || !container.contains(button)) return;
    const card = button.closest('.stock-component');
    const id = card.dataset.companyId;
    if (button.dataset.role === 'pin') {
      preferences.pinned = preferences.pinned.includes(id) ? preferences.pinned.filter(value => value !== id) : [...preferences.pinned, id];
    } else if (button.dataset.role === 'toggle') {
      const opening = button.getAttribute('aria-expanded') !== 'true';
      preferences.expanded[id] = opening;
      track('company_toggle', { company_id: id, toggle_action: opening ? 'open' : 'close' });
    } else return;
    savePreferences();
    applyPreferences();
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-track-content]');
    if (link) track('select_content', { content_type: 'navigation', item_id: link.dataset.trackContent, link_placement: link.dataset.linkPlacement });
  });
  return {
    refresh,
    start() { interval = window.setInterval(() => refresh(), 60 * 60 * 1000); return refresh(); },
    stop() { generation++; active?.controller.abort(); background?.abort(); window.clearInterval(interval); }
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') createApp({ window, document }).start();
