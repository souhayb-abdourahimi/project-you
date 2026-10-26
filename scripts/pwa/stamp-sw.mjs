// Stamps the service worker of a web export with the build's identity (D-048): every new build is
// a new worker, so installed apps see the update ("Nouvelle version disponible"). The identity is a
// hash of index.html, which names the hashed bundles. Usage: node scripts/pwa/stamp-sw.mjs [dist]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), process.argv[2] ?? 'dist');
const sw = join(root, 'sw.js');
if (!existsSync(sw)) {
  console.error(`stamp-sw: ${sw} not found`);
  process.exit(1);
}
const build = createHash('sha256')
  .update(readFileSync(join(root, 'index.html')))
  .digest('hex')
  .slice(0, 12);
const source = readFileSync(sw, 'utf8');
if (!source.includes("'__BUILD__'")) {
  console.error('stamp-sw: no __BUILD__ placeholder in sw.js');
  process.exit(1);
}
writeFileSync(sw, source.replace("'__BUILD__'", `'${build}'`));
console.log(`sw.js stamped: build ${build}`);
