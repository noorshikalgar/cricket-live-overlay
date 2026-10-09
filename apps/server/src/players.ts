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

export type AvatarStyle = 'tile' | 'cutout';

/** skin tones, mostly South Asian, picked per player so a squad doesn't look cloned */
const SKIN = ['#8d5524', '#a0673c', '#c68642', '#b5763f', '#7a4a2a', '#d0a06a', '#9a5f35', '#e0ac69'];
const HAIR = ['#1b1410', '#2a1d14', '#120d0a', '#3b2a1e'];

/**
 * Our own illustrated cricketer (not anyone's likeness): skin tone, beard and
 * hair vary by name; jersey in the team colour with a collar and a number;
 * helmet with a grille for batters and keepers, a cap for bowlers and
 * all-rounders. `tile` has a team-colour background, initials and a role
 * badge (small panels); `cutout` is just the figure on transparent (big cards).
 */
export function avatarSvg(name: string, color: string, role: PlayerRole, style: AvatarStyle = 'tile'): string {
  const base = /^#[0-9a-f]{6}$/i.test(color) ? color : '#1D4ED8';
  const h = hash(name);
  const pick = <T,>(arr: T[], salt: number) => arr[(h >>> salt) % arr.length];
  const skin = pick(SKIN, 0);
  const skinDark = shade(skin, -0.22);
  const hair = pick(HAIR, 3);
  const beard = (h >>> 5) % 3; // 0 none, 1 stubble, 2 full
  const number = ((h >>> 7) % 98) + 1;
  const light = shade(base, 0.2);
  const dark = shade(base, -0.35);
  const jersey = base;
  const jerseyDark = shade(base, -0.25);
  const trim = (h >>> 9) % 2 ? '#ffffff' : '#facc15';
  const helmet = role === 'bat' || role === 'wk';
  const text = initials(name).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const esc = (v: string) => v.replace(/"/g, '');

  const beardSvg =
    beard === 2
      ? `<path d="M74 104q2 26 26 30q24-4 26-30q-6 10-26 12q-20-2-26-12z" fill="${hair}"/>`
      : beard === 1
        ? `<path d="M76 106q4 22 24 26q20-4 24-26q-8 12-24 12t-24-12z" fill="${hair}" opacity=".35"/>`
        : '';

  const head = `
<path d="M88 118h24v22h-24z" fill="${skinDark}"/>
<ellipse cx="72" cy="94" rx="6" ry="9" fill="${skinDark}"/>
<ellipse cx="128" cy="94" rx="6" ry="9" fill="${skinDark}"/>
<path d="M72 84q0-34 28-34t28 34v14q0 30-28 34q-28-4-28-34z" fill="${skin}"/>
<path d="M84 86q5-3 10 0M106 86q5-3 10 0" stroke="${hair}" stroke-width="3.2" stroke-linecap="round" fill="none"/>
<ellipse cx="89" cy="94" rx="3.2" ry="3.6" fill="#1a1a1a"/>
<ellipse cx="111" cy="94" rx="3.2" ry="3.6" fill="#1a1a1a"/>
<path d="M100 96q-3 10 0 13q3 1 5-1" stroke="${skinDark}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<path d="M92 116q8 5 16 0" stroke="#5b2a1a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
${beardSvg}`;

  const headgear = helmet
    ? // helmet: shell, peak, grille bars and side guards
      `<path d="M66 86q0-46 34-46t34 46v4H66z" fill="${dark}"/>
<path d="M66 86q0-46 34-46t34 46" fill="none" stroke="${light}" stroke-width="3" opacity=".5"/>
<path d="M60 88h80q2 6-4 8H64q-6-2-4-8z" fill="#0b0f17"/>
<path d="M70 100h60M70 110h60M72 120h56" stroke="#c9ced6" stroke-width="3"/>
<path d="M84 96v30M100 96v34M116 96v30" stroke="#c9ced6" stroke-width="2.5"/>
<path d="M64 90q-4 22 8 36M136 90q4 22-8 36" stroke="${dark}" stroke-width="7" fill="none" stroke-linecap="round"/>
<rect x="94" y="52" width="12" height="20" rx="3" fill="${trim}" opacity=".85"/>`
    : // cap: hair at the sides, crown and peak in the team colour
      `<path d="M70 86q-2-10 2-18M130 86q2-10-2-18" stroke="${hair}" stroke-width="6" stroke-linecap="round"/>
<path d="M68 76q0-34 32-34t32 34z" fill="${jersey}"/>
<path d="M68 76q0-34 32-34t32 34" fill="none" stroke="${jerseyDark}" stroke-width="2"/>
<path d="M98 42v34" stroke="${jerseyDark}" stroke-width="2" opacity=".6"/>
<path d="M66 76h68q16 2 22 10q-40-6-90-4z" fill="${jerseyDark}"/>
<circle cx="100" cy="44" r="3" fill="${trim}"/>`;

  const body = `
<path d="M30 220q2-70 70-80q68 10 70 80z" fill="${jersey}"/>
<path d="M30 220q2-70 70-80q-30 14-36 80z" fill="#000" opacity=".14"/>
<path d="M170 220q-2-70-70-80q30 14 36 80z" fill="#fff" opacity=".08"/>
<path d="M84 140l16 22l16-22" fill="none" stroke="${trim}" stroke-width="5" stroke-linejoin="round"/>
<path d="M88 140l12 16l12-16z" fill="${skinDark}"/>
<path d="M44 190q20-8 26-26M156 190q-20-8-26-26" stroke="${trim}" stroke-width="4" fill="none" opacity=".7"/>
<text x="128" y="196" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="900" font-size="26" fill="${trim}" opacity=".9">${number}</text>`;

  const figure = `${body}${head}${headgear}`;

  if (style === 'cutout') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" role="img" aria-label="${esc(text)}">${figure}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${esc(text)}">
<defs>
<radialGradient id="g" cx="0.3" cy="0.25" r="0.95"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
<clipPath id="c"><rect width="200" height="200" rx="24"/></clipPath>
</defs>
<g clip-path="url(#c)">
<rect width="200" height="200" fill="url(#g)"/>
<g transform="translate(14 8) scale(.86)">${figure}</g>
<rect x="0" y="160" width="200" height="40" fill="#000" opacity=".35"/>
<text x="20" y="190" font-family="Inter,Segoe UI,Arial,sans-serif" font-weight="800" font-size="24" fill="#fff" letter-spacing="1">${text}</text>
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

  avatarFile(name: string, color: string, role: PlayerRole, style: AvatarStyle = 'tile'): string {
    // v2 in the name: the drawing changed, older cached files are left alone
    const file = path.join(this.dir, `avatar-v2-${style}-${slugify(name)}-${color.replace('#', '')}-${role || 'x'}.svg`);
    if (!existsSync(file)) writeFileSync(file, avatarSvg(name, color, role, style));
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
