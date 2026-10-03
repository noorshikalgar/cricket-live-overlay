// Fetch one raw API response and save it, so the adapter can be mapped to real field names.
//   npm run probe -w apps/server -- /matches/live
//   npm run probe -w apps/server -- https://full.url/if/different?x=1
// Uses CRICKET_API_KEY and CRICKET_API_BASE_URL from .env. Auth: Bearer token by default
// (CricketLiveApi); PROBE_AUTH=header sends X-API-Key, PROBE_AUTH=query:apikey sends ?apikey=.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../src/config';

const target = process.argv[2];
const key = process.env['CRICKET_API_KEY'] ?? '';
const base = (process.env['CRICKET_API_BASE_URL'] || 'https://cricketliveapi.com/api/v1').replace(/\/+$/, '');
const auth = process.env['PROBE_AUTH'] ?? 'bearer';

if (!target) {
  console.error('usage: npm run probe -w apps/server -- <path-or-url>');
  process.exit(1);
}
if (!key) {
  console.error('CRICKET_API_KEY is empty in .env');
  process.exit(1);
}
if (!target.startsWith('http') && !base) {
  console.error('Set CRICKET_API_BASE_URL in .env, or pass a full URL');
  process.exit(1);
}

const url = new URL(target.startsWith('http') ? target : base + (target.startsWith('/') ? target : `/${target}`));
const headers: Record<string, string> = { accept: 'application/json' };
if (auth === 'bearer') headers['authorization'] = `Bearer ${key}`;
else if (auth.startsWith('query:')) url.searchParams.set(auth.slice(6), key);
else headers['X-API-Key'] = key;

const res = await fetch(url, { headers });
const text = await res.text();
const shown = url.toString().replace(key, '***');
console.log(`${res.status} ${res.statusText}  ${shown}`);
for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after']) {
  const v = res.headers.get(h);
  if (v) console.log(`${h}: ${v}`);
}

const dir = path.join(DATA_DIR, 'samples');
mkdirSync(dir, { recursive: true });
const name = `${url.pathname.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}-${Date.now()}.json`;
const file = path.join(dir, name);
let body: unknown = text;
try {
  body = JSON.parse(text);
} catch {
  // not JSON; saved as a string
}
writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body, null, 2));
console.log(`saved → ${path.relative(process.cwd(), file)}`);
console.log(text.slice(0, 1500));
