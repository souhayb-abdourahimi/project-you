// Checks the web export before it is deployed (npm run build:pwa): installable files present, no
// server secret in any shipped file, and says which Supabase mode the bundle was built for.
// Prints file names and key kinds only, never a key.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(process.cwd(), 'dist');
const problems = [];

const required = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  '_headers',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];
for (const file of required) if (!existsSync(join(root, file))) problems.push(`missing dist/${file}`);
// Without a build stamp, installed apps would never be offered this version (D-048).
if (existsSync(join(root, 'sw.js')) && readFileSync(join(root, 'sw.js'), 'utf8').includes("'__BUILD__'"))
  problems.push('sw.js not stamped (run node scripts/pwa/stamp-sw.mjs)');

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const SECRETS = [
  [/sb_secret_[A-Za-z0-9_-]{16,}/, 'Supabase secret key'],
  [/sk-ant-[A-Za-z0-9_-]{16,}/, 'Anthropic API key'],
  [/sk-(proj-)?[A-Za-z0-9_-]{32,}/, 'OpenAI API key'],
];
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g;

let supabaseUrl = false;
for (const path of files(root)) {
  const name = relative(root, path);
  if (/(^|\/)\.env/.test(name)) problems.push(`env file shipped: ${name}`);
  // Icons are vector drawings (D-048): an icon font would bring back the squares on iPhone Safari.
  if (/material-?symbols|materialicons/i.test(name)) problems.push(`icon font shipped: ${name}`);
  if (!/\.(js|html|json|webmanifest|txt|map)$/.test(name)) continue;
  const text = readFileSync(path, 'utf8');
  for (const [pattern, kind] of SECRETS) if (pattern.test(text)) problems.push(`${kind} found in ${name}`);
  // The account-mode E2E build points to a fake project; it must never be the one deployed.
  if (text.includes('e2e.supabase.test')) problems.push(`E2E test project URL found in ${name} (rebuild with --clear)`);
  for (const match of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') problems.push(`service_role key found in ${name}`);
    } catch {
      // Not a token.
    }
  }
  if (/https:\/\/[a-z0-9]+\.supabase\.co/.test(text)) supabaseUrl = true;
}

if (problems.length) {
  console.error(`dist check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(
  supabaseUrl
    ? 'dist OK: installable web app, Supabase project configured, no server secret found.'
    : 'dist OK, but LOCAL MODE: no EXPO_PUBLIC_SUPABASE_URL at build time (no account, no photo analysis).',
);
