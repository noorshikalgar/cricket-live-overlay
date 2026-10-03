import { ProviderHttpError } from './types';

/** GET JSON with a timeout; non-2xx becomes ProviderHttpError so the poller can back off on 429. */
export async function getJson(url: string, headers: Record<string, string> = {}, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ProviderHttpError(res.status, `HTTP ${res.status} from ${new URL(url).host}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as unknown;
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
