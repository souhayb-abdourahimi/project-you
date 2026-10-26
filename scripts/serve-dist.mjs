// Minimal static server for the web export (single-page output): unknown paths fall back to index.html.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

// DIST_DIR: another export (the account-mode E2E build in dist-account).
const root = join(process.cwd(), process.env.DIST_DIR ?? 'dist');
const port = Number(process.env.PORT ?? 8765);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
};

createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  // E2E only (E2E_HOOKS=1): a test context with this cookie sees another build of the service
  // worker, i.e. a new deploy, without touching dist/ for the other tests.
  const nextBuild = /(?:^|;\s*)py-e2e-sw-build=([a-z0-9]{1,24})/.exec(req.headers.cookie ?? '')?.[1];
  if (process.env.E2E_HOOKS === '1' && path === '/sw.js' && nextBuild) {
    res.end(readFileSync(file, 'utf8').replace(/const BUILD = '[^']*';/, `const BUILD = '${nextBuild}';`));
    return;
  }
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`dist served on http://localhost:${port}`));
