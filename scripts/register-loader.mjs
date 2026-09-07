import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

// Mirror Wrangler's Text imports for Node contract tests, never used in production.
registerHooks({
  resolve(specifier, context, next) {
    const result = next(specifier, context);
    if (context.parentURL?.endsWith('/worker.js') && /\/assets\/.*\.js$/.test(result.url)) result.url += '?raw';
    return result;
  },
  load(url, context, next) {
    if (/\.(html|txt|xml|css|json)$/.test(url) || url.endsWith('?raw')) {
      const path = new URL(url); path.search = '';
      const body = readFileSync(path, 'utf8');
      return { format: 'module', shortCircuit: true, source: `export default ${url.endsWith('.json') ? body : JSON.stringify(body)};` };
    }
    return next(url, context);
  }
});
