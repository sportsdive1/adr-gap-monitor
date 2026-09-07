import companies from './companies.json';
import indexHtml from './index.html';
import termsHtml from './terms.html';
import privacyHtml from './privacy.html';
import adrGapGuideHtml from './what-is-adr-gap.html';
import robotsTxt from './robots.txt';
import sitemapXml from './sitemap.xml';
import appJs from './assets/app.js';
import modelJs from './assets/model.js';
import stylesCss from './assets/styles.css';

import { createMarketService } from './src/market-service.js';

const { getQuote, getFx, getMarketData } = createMarketService(companies);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const html = content => new Response(content, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const text = (content, contentType) => new Response(content, { headers: { 'content-type': contentType } });

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (url.pathname === '/assets/app.js') return text(appJs, 'application/javascript; charset=utf-8');
      if (url.pathname === '/assets/model.js') return text(modelJs, 'application/javascript; charset=utf-8');
      if (url.pathname === '/assets/styles.css') return text(stylesCss, 'text/css; charset=utf-8');
      if (url.pathname === '/' || url.pathname === '/index.html') return html(indexHtml);
      if (url.pathname === '/terms.html') return html(termsHtml);
      if (url.pathname === '/privacy.html') return html(privacyHtml);
      if (url.pathname === '/what-is-adr-gap/' || url.pathname === '/what-is-adr-gap') return html(adrGapGuideHtml);
      if (url.pathname === '/robots.txt') return text(robotsTxt, 'text/plain; charset=utf-8');
      if (url.pathname === '/sitemap.xml') return text(sitemapXml, 'application/xml; charset=utf-8');
      return new Response('Not found', { status: 404 });
    }

    if (url.pathname === '/api/companies') return json({ companies });
    if (url.pathname === '/api/quote') {
      const symbol = url.searchParams.get('symbol');
      const result = await getQuote(symbol, url.searchParams.get('force') === '1');
      return result.quote ? json(result.quote) : json({ error: result.error }, 502);
    }
    if (url.pathname === '/api/fx') {
      const result = await getFx(url.searchParams.get('force') === '1');
      return result.fx ? json(result.fx) : json({ error: result.error }, 502);
    }
    if (url.pathname === '/api/market') {
      const data = await getMarketData(url.searchParams.get('company'), url.searchParams.get('force') === '1');
      return data.error ? json({ error: data.error }, 404) : json(data);
    }
    return json({ error: 'Not found' }, 404);
  }
};
