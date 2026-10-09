import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Terminal + file logging for API traffic.
 *
 *   [14:03:21] API  ✓ 200  /cricket/commentary/173107   312 ms  7.6 KB   calls 43/100 · 2/5 min
 *   [14:03:51] API  ✗ 429  /cricket/commentary/173107   120 ms           Too Many Requests
 *   [14:04:02] API  ⊘ not sent  /cricket/scorecard/173107   Per-minute limit of 5 calls reached
 *   [14:04:10] CACHE  scorecard 173107 (age 4 min) · no call
 *
 * Every API line is also appended as JSON to data/logs/api-YYYY-MM-DD.jsonl
 * (7 days kept). Tokens in URLs are redacted.
 */

const KEEP_DAYS = 7;
const color = !process.env['NO_COLOR'];
const paint = (code: string) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = paint('2');
const red = paint('31');
const green = paint('32');
const yellow = paint('33');
const cyan = paint('36');

let logDir: string | null = null;
let budgetLine: () => string = () => '';

function time(d = new Date()): string {
  return d.toTimeString().slice(0, 8);
}

function kb(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}

/** Drop secrets from a URL before it is printed or stored. */
export function redact(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (/token|key|secret|password/i.test(k)) u.searchParams.set(k, '***');
    }
    return `${u.pathname.replace(/^\/api\/v\d+/, '')}${u.search}`;
  } catch {
    return url.replace(/(token|key)=[^&]+/gi, '$1=***');
  }
}

function writeFile(entry: Record<string, unknown>): void {
  if (!logDir) return;
  const day = new Date().toISOString().slice(0, 10);
  try {
    // sync: a handful of lines a minute, and nothing is lost if the server stops abruptly
    appendFileSync(path.join(logDir, `api-${day}.jsonl`), `${JSON.stringify(entry)}\n`);
  } catch {
    // logging must never break polling
  }
}

function prune(): void {
  if (!logDir) return;
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const f of readdirSync(logDir)) {
    const day = /^api-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f)?.[1];
    if (day && day < cutoff) rmSync(path.join(logDir, f), { force: true });
  }
}

export const log = {
  /** where JSONL logs go; also prunes old files now and once a day */
  init(dir: string, budget: () => string): void {
    logDir = dir;
    budgetLine = budget;
    mkdirSync(dir, { recursive: true });
    prune();
    setInterval(prune, 86_400_000).unref();
  },

  apiOk(url: string, status: number, ms: number, bytes: number): void {
    const p = redact(url);
    console.log(
      `${dim(`[${time()}]`)} ${cyan('API')}  ${green(`✓ ${status}`)}  ${p}   ${ms} ms  ${kb(bytes)}   ${dim(budgetLine())}`,
    );
    writeFile({ at: new Date().toISOString(), ok: true, status, path: p, ms, bytes });
  },

  apiError(url: string, status: number | null, ms: number, error: string): void {
    const p = redact(url);
    console.log(
      `${dim(`[${time()}]`)} ${cyan('API')}  ${red(`✗ ${status ?? 'ERR'}`)}  ${p}   ${ms} ms   ${red(error.slice(0, 200))}   ${dim(budgetLine())}`,
    );
    writeFile({ at: new Date().toISOString(), ok: false, status, path: p, ms, error: error.slice(0, 500) });
  },

  /** a call the budget refused: nothing was sent */
  apiBlocked(pathOrUrl: string, reason: string): void {
    const p = redact(pathOrUrl.startsWith('http') ? pathOrUrl : `http://x${pathOrUrl}`);
    console.log(`${dim(`[${time()}]`)} ${cyan('API')}  ${yellow('⊘ not sent')}  ${p}   ${yellow(reason)}`);
    writeFile({ at: new Date().toISOString(), ok: false, blocked: true, path: p, error: reason });
  },

  /** a request served from cache: the call it saved */
  cacheHit(what: string, ageMs: number): void {
    const age = ageMs < 60_000 ? `${Math.round(ageMs / 1000)} s` : `${Math.round(ageMs / 60_000)} min`;
    console.log(`${dim(`[${time()}]`)} ${green('CACHE')}  ${what} (age ${age}) · no call`);
  },

  info(msg: string): void {
    console.log(`${dim(`[${time()}]`)} ${msg}`);
  },

  warn(msg: string): void {
    console.log(`${dim(`[${time()}]`)} ${yellow(msg)}`);
  },

  error(msg: string): void {
    console.log(`${dim(`[${time()}]`)} ${red(msg)}`);
  },
};
