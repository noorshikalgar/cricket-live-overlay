import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { log } from './log';

/**
 * Player images, always served from local files:
 *
 * - **avatar**: an SVG we draw ourselves (team colour, role silhouette, initials).
 *   No third-party rights at all; generated once per player and cached.
 * - **photo**: a freely licensed photo from Wikimedia Commons, found by name via
 *   Wikidata (P18). Downloaded once, cached with its license and author so cards
 *   can show the required credit. Falls back to the avatar when none exists.
 *
 * Wikimedia lookups are free (no key) and never touch the cricket API budget.
 */

const UA = 'CricketOverlayStudio/0.1 (https://github.com/noorshikalgar/cricket-live-overlay)';
/** a failed photo lookup is retried after this long */
const RETRY_NOT_FOUND_MS = 7 * 86_400_000;
const PHOTO_WIDTH = 400;

export type PlayerRole = 'bat' | 'bowl' | 'wk' | 'ar' | '';

export interface PhotoMeta {
  found: boolean;
  checkedAt: number;
  file?: string;
  contentType?: string;
  /** credit line for the card, e.g. "Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons" */
  credit?: string;
  license?: string;
  artist?: string;
  sourcePage?: string;
}

export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'player'
  );
}

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : (parts[0][1] ?? '');
  return (first + last).toUpperCase();
}

function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function roleOf(text: string): PlayerRole {
  const r = text.toLowerCase();
  if (r.includes('wk') || r.includes('keeper')) return 'wk';
  if (r.includes('allrounder') || r.includes('all-rounder') || r === 'ar') return 'ar';
  if (r.includes('bowl')) return 'bowl';
  if (r.includes('bat')) return 'bat';
  return '';
}

const ROLE_BADGE: Record<Exclude<PlayerRole, ''>, string> = {
  // bat
  bat: '<g transform="rotate(-35 160 160)"><rect x="155" y="128" width="10" height="16" rx="3" fill="#1f2937"/><path d="M153 144h14l2 34q0 5-9 5t-9-5z" fill="#e9c98f" stroke="#b08850" stroke-width="2"/></g>',
  // ball with seam
  bowl: '<circle cx="160" cy="160" r="17" fill="#dc2626"/><path d="M150 147c7 7 7 19 0 26M156 145c7 8 7 22 0 30" stroke="#fde7c7" stroke-width="2" fill="none" stroke-dasharray="3 2"/>',
  // keeping glove
  wk: '<path d="M146 176v-22q0-6 5-6t5 6v-10q0-6 5-6t5 6v8q0-6 5-6t5 6v24q0 8-8 8h-12q-10 0-10-8z" fill="#f5f7fa" stroke="#1f2937" stroke-width="2"/>',
  // bat + ball
  ar: '<circle cx="168" cy="168" r="10" fill="#dc2626"/><g transform="rotate(-35 152 152)"><rect x="148" y="124" width="8" height="12" rx="3" fill="#1f2937"/><path d="M146 136h12l2 26q0 4-8 4t-8-4z" fill="#e9c98f" stroke="#b08850" stroke-width="2"/></g>',
};

/** Our own SVG avatar: team-colour background, player bust, initials, role badge. */
export function avatarSvg(name: string, color: string, role: PlayerRole): string {
  const base = /^#[0-9a-f]{6}$/i.test(color) ? color : '#1D4ED8';
  const h = hash(name);
  const angle = h % 360;
  const light = shade(base, 0.18);
  const dark = shade(base, -0.32);
  const text = initials(name)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;');
  // helmet for batters and keepers, cap for bowlers and all-rounders
  const headgear =
    role === 'bat' || role === 'wk'
      ? '<path d="M64 84q0-38 36-38t36 38v6H64z" fill="#0b0f17" opacity=".85"/><path d="M70 92h60M74 100h52M78 108h44" stroke="#9aa4b2" stroke-width="3" opacity=".9"/>'
      : '<path d="M66 80q0-34 34-34t34 34z" fill="#0b0f17" opacity=".85"/><path d="M128 78q22 2 26 10h-30z" fill="#0b0f17" opacity=".85"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${text}">
<defs>
<radialGradient id="g" cx="0.3" cy="0.25" r="0.95"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
<linearGradient id="s" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="c"><rect width="200" height="200" rx="24"/></clipPath>
</defs>
<g clip-path="url(#c)">
<rect width="200" height="200" fill="url(#g)"/>
<rect width="200" height="200" fill="url(#s)"/>
<path d="M28 200q4-56 72-56t72 56z" fill="#0b0f17" opacity=".55"/>
<circle cx="100" cy="92" r="34" fill="#0b0f17" opacity=".55"/>
${headgear}
<text x="100" y="186" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-weight="800" font-size="34" fill="#fff" letter-spacing="2">${text}</text>
${role ? ROLE_BADGE[role] : ''}
</g>
</svg>`;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {});

export class PlayerImageService {
  private readonly inFlight = new Map<string, Promise<PhotoMeta>>();
  /** one Wikimedia request at a time, to be polite to their API */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  avatarFile(name: string, color: string, role: PlayerRole): string {
    const file = path.join(this.dir, `avatar-${slugify(name)}-${color.replace('#', '')}-${role || 'x'}.svg`);
    if (!existsSync(file)) writeFileSync(file, avatarSvg(name, color, role));
    return file;
  }

  private metaFile(name: string): string {
    return path.join(this.dir, `photo-${slugify(name)}.json`);
  }

  cachedPhoto(name: string): PhotoMeta | null {
    const f = this.metaFile(name);
    if (!existsSync(f)) return null;
    try {
      return JSON.parse(readFileSync(f, 'utf8')) as PhotoMeta;
    } catch {
      return null;
    }
  }

  /** Cached photo meta, or a fresh Wikimedia lookup (deduped, queued). */
  async photo(name: string): Promise<PhotoMeta> {
    const cached = this.cachedPhoto(name);
    if (cached && (cached.found || Date.now() - cached.checkedAt < RETRY_NOT_FOUND_MS)) return cached;
    const key = slugify(name);
    let p = this.inFlight.get(key);
    if (!p) {
      p = (this.queue = this.queue.then(() => this.lookup(name), () => this.lookup(name))) as Promise<PhotoMeta>;
      this.inFlight.set(key, p);
      void p.finally(() => this.inFlight.delete(key));
    }
    return p;
  }

  private async lookup(name: string): Promise<PhotoMeta> {
    const notFound = (why: string): PhotoMeta => {
      log.info(`PHOTO ${name}: no free photo (${why}) · using avatar`);
      const meta: PhotoMeta = { found: false, checkedAt: Date.now() };
      writeFileSync(this.metaFile(name), JSON.stringify(meta));
      return meta;
    };
    try {
      // 1. Wikidata item for this person, preferring one described as a cricketer
      const search = obj(
        await getJson(
          `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=7&search=${encodeURIComponent(name)}`,
        ),
      );
      const hits = (Array.isArray(search['search']) ? search['search'] : []).map(obj);
      const hit = hits.find((h) => /cricket/i.test(String(h['description'] ?? '')));
      if (!hit) return notFound('no cricketer with this name on Wikidata');
      // 2. its image (P18)
      const claims = obj(
        await getJson(`https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&property=P18&entity=${String(hit['id'])}`),
      );
      const p18 = (obj(claims['claims'])['P18'] as unknown[] | undefined)?.map(obj)[0];
      const fileName = String(obj(obj(obj(p18)['mainsnak'])['datavalue'])['value'] ?? '');
      if (!fileName) return notFound('no image on Wikidata');
      // 3. a thumbnail and its license from Commons
      const info = obj(
        await getJson(
          `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${PHOTO_WIDTH}&titles=${encodeURIComponent(`File:${fileName}`)}`,
        ),
      );
      const page = Object.values(obj(obj(info['query'])['pages'])).map(obj)[0];
      const ii = (Array.isArray(page?.['imageinfo']) ? page['imageinfo'] : []).map(obj)[0];
      const thumb = String(ii?.['thumburl'] ?? '');
      const meta = obj(ii?.['extmetadata']);
      const license = stripHtml(String(obj(meta['LicenseShortName'])['value'] ?? ''));
      const artist = stripHtml(String(obj(meta['Artist'])['value'] ?? '')).slice(0, 80);
      if (!thumb || !license) return notFound('no usable thumbnail or license');
      if (/fair use|non-free/i.test(license)) return notFound(`not freely licensed (${license})`);
      // 4. download once, keep locally
      const img = await fetch(thumb, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
      if (!img.ok) return notFound(`download failed (HTTP ${img.status})`);
      const contentType = img.headers.get('content-type') ?? 'image/jpeg';
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
      const file = `photo-${slugify(name)}.${ext}`;
      writeFileSync(path.join(this.dir, file), Buffer.from(await img.arrayBuffer()));
      const result: PhotoMeta = {
        found: true,
        checkedAt: Date.now(),
        file,
        contentType,
        license,
        artist,
        sourcePage: String(ii?.['descriptionurl'] ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`),
        credit: `Photo: ${artist || 'unknown'} · ${license} · Wikimedia Commons`,
      };
      writeFileSync(this.metaFile(name), JSON.stringify(result));
      log.info(`PHOTO ${name}: downloaded (${license}, by ${artist || 'unknown'}) · cached`);
      return result;
    } catch (err) {
      // network trouble: don't cache, try again next time
      log.warn(`PHOTO ${name}: lookup failed (${err instanceof Error ? err.message : String(err)})`);
      return { found: false, checkedAt: 0 };
    }
  }
}
