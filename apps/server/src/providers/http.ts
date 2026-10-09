import { log } from '../log';
import { ProviderHttpError } from './types';

/**
 * GET JSON with a timeout; non-2xx becomes ProviderHttpError so the poller can
 * back off on 429. Every call is logged (terminal + daily JSONL), success or not.
 */
export async function getJson(url: string, headers: Record<string, string> = {}, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: ctrl.signal });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      const err = new ProviderHttpError(res.status, `HTTP ${res.status} from ${new URL(url).host}: ${text.slice(0, 200)}`);
      log.apiError(url, res.status, Date.now() - t0, `${res.statusText || 'error'} ${text.slice(0, 120)}`.trim());
      throw err;
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      log.apiError(url, res.status, Date.now() - t0, 'response is not JSON');
      throw new Error(`Response from ${new URL(url).host} is not JSON`);
    }
    log.apiOk(url, res.status, Date.now() - t0, text.length);
    return body;
  } catch (err) {
    if (!(err instanceof ProviderHttpError) && !(err instanceof Error && err.message.startsWith('Response from'))) {
      const cause = err instanceof Error ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
      const msg = ctrl.signal.aborted
        ? `timed out after ${timeoutMs} ms`
        : cause?.code
          ? `network error (${cause.code})`
          : err instanceof Error
            ? err.message
            : String(err);
      log.apiError(url, null, Date.now() - t0, msg);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Tiny safe accessors for untyped JSON. */
export type Json = Record<string, unknown>;

export function obj(v: unknown): Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : {};
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback;
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** "12.3" overs → 75 legal balls */
export function oversToBalls(overs: unknown): number {
  const s = str(overs, '0');
  const [o, b] = s.split('.');
  return num(o) * 6 + num(b ?? '0');
}
