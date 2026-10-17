// Does the API send overs that the normal live feed leaves out (an innings we
// missed)? Run during a live match:
//   npm run check:history                 (first live match)
//   npm run check:history -- <match_id>
// Uses CRICKET_API_KEY / CRICKET_API_BASE_URL from .env and about 7 calls from
// the same daily / per-minute budget as the server. The key is never printed.
import path from 'node:path';
import { DATA_DIR, loadConfig } from '../src/config';
import { CallBudget } from '../src/usage';

const key = process.env['CRICKET_API_KEY'] ?? '';
const base = (process.env['CRICKET_API_BASE_URL'] || 'https://cricketliveapi.com/api/v1').replace(/\/+$/, '');
if (!key) {
  console.error('CRICKET_API_KEY is empty in .env');
  process.exit(1);
}

const cfg = loadConfig();
const budget = new CallBudget(path.join(DATA_DIR, 'usage.json'), cfg.dailyCallLimit, cfg.perMinuteLimit);
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** one budgeted call; waits for the per-minute limit instead of failing */
async function call(p: string): Promise<{ status: number; body: unknown }> {
  for (let waited = 0; !budget.tryAcquire(); waited += 5) {
    if (waited >= 90) throw new Error(`not sent: ${budget.blockedReason()}`);
    if (waited === 0) console.log(`  (waiting for the per-minute limit: ${budget.blockedReason()})`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  const res = await fetch(base + p, { headers: { accept: 'application/json', authorization: `Bearer ${key}` } });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: keep the text
  }
  return { status: res.status, body };
}

/** what a commentary response covers: innings ids, over range, ball count */
function summary(body: unknown): { entries: number; innings: number[]; overs: number[]; key: Set<string> } {
  const data = obj(obj(body)['data']);
  const list = arr(data['commentary']).map(obj);
  const innings = new Set<number>();
  const overs = new Set<number>();
  const keys = new Set<string>();
  for (const e of list) {
    const inn = Number(e['innings_id'] ?? 0);
    innings.add(inn);
    const sep = obj(e['over_separator']);
    if (sep['over_number'] !== undefined) {
      overs.add(Number(sep['over_number']));
      keys.add(`${inn}:${sep['over_number']}`);
    }
    const ov = e['over_number'] ?? e['overs'] ?? e['ball'];
    if (ov !== undefined && ov !== null) keys.add(`${inn}:b${String(ov)}`);
    keys.add(`${inn}:${String(e['timestamp'] ?? e['id'] ?? JSON.stringify(e).slice(0, 60))}`);
  }
  return { entries: list.length, innings: [...innings].sort(), overs: [...overs].sort((a, b) => a - b), key: keys };
}

console.log(`API ${base} · calls today ${budget.calls}/${cfg.dailyCallLimit || '∞'}`);

// 1. which match
let matchId = process.argv[2];
if (!matchId) {
  const live = await call('/cricket/matches/live');
  if (live.status !== 200) {
    console.error(`live list: HTTP ${live.status} ${JSON.stringify(live.body).slice(0, 200)}`);
    process.exit(1);
  }
  const list = arr(obj(live.body)['data']).map(obj);
  const pick = list.find((m) => /progress|live/i.test(String(m['state'] ?? m['status'] ?? ''))) ?? list[0];
  if (!pick) {
    console.error('No live match right now. Run this during a match.');
    process.exit(1);
  }
  matchId = String(pick['match_id']);
  const t = (x: unknown) => String(obj(x)['short_name'] ?? obj(x)['name'] ?? '?');
  console.log(`match ${matchId}: ${t(pick['first_team'])} v ${t(pick['second_team'])} · ${String(pick['state'] ?? pick['status'] ?? '')}`);
}

// 2. the normal feed, as the server reads it
const basePath = `/cricket/commentary/${encodeURIComponent(matchId)}`;
const normal = await call(basePath);
if (normal.status !== 200) {
  console.error(`commentary: HTTP ${normal.status} ${JSON.stringify(normal.body).slice(0, 200)}`);
  process.exit(1);
}
const ref = summary(normal.body);
const inningsNow = Number(obj(obj(obj(normal.body)['data'])['miniscore'])['innings_id'] ?? 0);
console.log(`\nnormal feed: ${ref.entries} entries · innings ${ref.innings.join(',') || '?'} · over ends ${ref.overs.join(',') || 'none'}`);

// 3. the ways an API like this usually offers older commentary
const variants = [
  `?innings_id=1`,
  `?innings=1`,
  `?page=2`,
  `?offset=${ref.entries}`,
  `?limit=500`,
  `/full`,
];
const found: string[] = [];
for (const v of variants) {
  const p = v.startsWith('?') ? basePath + v : basePath + v;
  try {
    const r = await call(p);
    const s = summary(r.body);
    const extra = [...s.key].filter((k) => !ref.key.has(k)).length;
    const otherInnings = s.innings.filter((i) => i !== inningsNow);
    const more = r.status === 200 && (extra > 0 || otherInnings.length > 0 || s.entries > ref.entries);
    console.log(
      `${v.padEnd(14)} HTTP ${r.status} · ${s.entries} entries · innings ${s.innings.join(',') || '-'} · over ends ${s.overs.join(',') || '-'}${more ? '   <-- MORE DATA' : ''}`,
    );
    if (more) found.push(v);
  } catch (err) {
    console.log(`${v.padEnd(14)} ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(
  found.length
    ? `\nRESULT: the API can send older commentary via ${found.join(', ')}. Send this output to Claude to use it for missed overs.`
    : `\nRESULT: none of these returned older overs. The API only sends the last ~${ref.entries} entries, so overs can only be recorded live (start the app before the first ball).`,
);
console.log(`calls today now ${budget.calls}/${cfg.dailyCallLimit || '∞'}`);
