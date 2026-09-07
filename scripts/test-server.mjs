import './register-loader.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
const { default: worker } = await import('../worker.js');

const server = createServer(async (req, res) => {
  try {
    if (req.url === '/__baseline' && existsSync('reports/baseline.html')) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(readFileSync('reports/baseline.html')); return;
    }
    // Browser tests must mock every API call. Never query Yahoo or production analytics.
    if (req.url.startsWith('/api/')) { res.writeHead(500); res.end('{"error":"Unmocked test API request"}'); return; }
    const response = await worker.fetch(new Request(`http://127.0.0.1${req.url}`));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
server.listen(0, '127.0.0.1', () => console.log(`TEST_URL=http://127.0.0.1:${server.address().port}`));
