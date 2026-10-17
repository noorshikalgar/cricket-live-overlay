import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { log } from './log';
import { sameName, slugify } from './players';

/**
 * Where a player's picture can come from, in priority order:
 *
 * 1. **own**: a file the user dropped into the player-photos folder. Always
 *    wins: it's their explicit choice, works offline and needs no API.
 * 2. **api**: the cricket API's own player image (from the squads data),
 *    downloaded once and kept.
 * 3. **wikimedia**: a free-licence photo, shown with its credit.
 * 4. **avatar**: our drawn cricketer, always available.
 */
export type PhotoSource = 'own' | 'api' | 'wikimedia' | 'avatar';

export const PHOTO_EXTENSIONS: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export interface PhotoFile {
  file: string;
  contentType: string;
  /** has see-through parts (PNG / WebP with alpha): shown as a cut-out figure */
  cutout: boolean;
}

/**
 * Whether a PNG or WebP has transparency, from its header: PNG colour types 4
 * and 6 (or a palette with a tRNS chunk); WebP's extended-format alpha flag.
 * JPEG never does.
 */
export function hasAlpha(buf: Buffer, contentType: string): boolean {
  if (contentType === 'image/png' && buf.length > 26 && buf.toString('ascii', 12, 16) === 'IHDR') {
    const colourType = buf[25];
    if (colourType === 4 || colourType === 6) return true;
    return colourType === 3 && buf.subarray(0, 65536).includes('tRNS');
  }
  if (contentType === 'image/webp' && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return (buf[20] & 0x10) !== 0;
    // lossless WebP: alpha hint bit in the header
    if (chunk === 'VP8L') return (buf[24] & 0x10) !== 0;
  }
  return false;
}

interface OwnEntry {
  /** absolute path */
  file: string;
  /** team folder it sits in (upper-case code), or null for the root */
  team: string | null;
  name: string;
}

/**
 * The user's own photos: `player-photos/<Player Name>.png`, optionally inside a
 * team folder (`player-photos/IND/<Player Name>.png`) to tell apart two players
 * with the same name. Names are matched loosely (case, spaces, dashes,
 * underscores, accents; a near spelling of the surname). Re-scanned when files
 * change, so a dropped-in photo is used straight away.
 */
export class OwnPhotoFolder {
  private entries: OwnEntry[] = [];
  private watcher: FSWatcher | null = null;
  private rescanTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly dir: string,
    private readonly onChange: () => void = () => undefined,
  ) {
    mkdirSync(dir, { recursive: true });
    this.writeGuide();
    this.scan();
    try {
      this.watcher = watch(dir, { recursive: process.platform !== 'linux' }, () => this.queueRescan());
    } catch {
      // no file watching here: the folder is still re-read on each rescan() call
    }
  }

  get count(): number {
    return this.entries.length;
  }

  close(): void {
    this.watcher?.close();
  }

  private queueRescan(): void {
    if (this.rescanTimer) clearTimeout(this.rescanTimer);
    this.rescanTimer = setTimeout(() => {
      const before = this.entries.length;
      this.scan();
      log.info(`PHOTO your photos folder changed · ${this.entries.length} photo${this.entries.length === 1 ? '' : 's'} (was ${before})`);
      this.onChange();
    }, 400);
  }

  scan(): void {
    const out: OwnEntry[] = [];
    const add = (folder: string, team: string | null) => {
      for (const f of safeList(folder)) {
        const full = path.join(folder, f);
        const ext = path.extname(f).toLowerCase();
        if (PHOTO_EXTENSIONS[ext] && isFile(full)) out.push({ file: full, team, name: path.basename(f, path.extname(f)) });
        else if (!team && isDir(full) && !f.startsWith('.')) add(full, f.toUpperCase());
      }
    };
    add(this.dir, null);
    this.entries = out;
  }

  /** best file for this player: same team folder first, exact name before a near spelling */
  find(name: string, team?: string | null): OwnEntry | null {
    const want = slugify(name);
    const t = team?.toUpperCase() ?? null;
    const exact = this.entries.filter((e) => slugify(e.name) === want);
    const near = exact.length ? [] : this.entries.filter((e) => sameName(e.name.replace(/[-_]+/g, ' '), name));
    for (const list of [exact, near]) {
      const pick = list.find((e) => t && e.team === t) ?? list.find((e) => e.team === null) ?? list[0];
      if (pick) return pick;
    }
    return null;
  }

  read(entry: OwnEntry): PhotoFile & { body: Buffer } {
    const contentType = PHOTO_EXTENSIONS[path.extname(entry.file).toLowerCase()] ?? 'application/octet-stream';
    const body = readFileSync(entry.file);
    return { file: entry.file, contentType, cutout: hasAlpha(body, contentType), body };
  }

  private writeGuide(): void {
    const guide = path.join(this.dir, 'README.md');
    if (existsSync(guide)) return;
    writeFileSync(guide, OWN_FOLDER_GUIDE);
  }
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

interface ApiMeta {
  found: boolean;
  checkedAt: number;
  file?: string;
  contentType?: string;
}

/** an API photo that failed (no image, budget) is tried again after this long */
const API_RETRY_MS = 12 * 3_600_000;

/**
 * Photos from the cricket API, downloaded once per player and kept on disk.
 * The image URL comes from the squads data the app already has; each download
 * is one budgeted call, and nothing is fetched when the budget is low.
 */
export class ApiPhotoCache {
  private readonly inFlight = new Map<string, Promise<ApiMeta>>();

  constructor(
    private readonly dir: string,
    private readonly fetchImage: ((url: string) => Promise<{ body: Buffer; contentType: string }>) | null,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  get available(): boolean {
    return !!this.fetchImage;
  }

  private metaFile(name: string): string {
    return path.join(this.dir, `${slugify(name)}.json`);
  }

  cached(name: string): (PhotoFile & { body: Buffer }) | null {
    const meta = readJson<ApiMeta>(this.metaFile(name));
    if (!meta?.found || !meta.file) return null;
    const file = path.join(this.dir, meta.file);
    if (!existsSync(file)) return null;
    const body = readFileSync(file);
    const contentType = meta.contentType ?? 'image/jpeg';
    return { file, contentType, cutout: hasAlpha(body, contentType), body };
  }

  /** download (once) and return the photo, or null if the API has none / can't now */
  async get(name: string, url: string | null): Promise<(PhotoFile & { body: Buffer }) | null> {
    const hit = this.cached(name);
    if (hit) return hit;
    if (!url || !this.fetchImage) return null;
    const meta = readJson<ApiMeta>(this.metaFile(name));
    if (meta && !meta.found && Date.now() - meta.checkedAt < API_RETRY_MS) return null;
    let p = this.inFlight.get(name);
    if (!p) {
      p = this.download(name, url).finally(() => this.inFlight.delete(name));
      this.inFlight.set(name, p);
    }
    await p;
    return this.cached(name);
  }

  private async download(name: string, url: string): Promise<ApiMeta> {
    try {
      const { body, contentType } = await this.fetchImage!(url);
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
      const file = `${slugify(name)}.${ext}`;
      writeFileSync(path.join(this.dir, file), body);
      const meta: ApiMeta = { found: true, checkedAt: Date.now(), file, contentType };
      writeFileSync(this.metaFile(name), JSON.stringify(meta));
      log.info(`PHOTO ${name}: API photo downloaded · cached`);
      return meta;
    } catch (err) {
      const meta: ApiMeta = { found: false, checkedAt: Date.now() };
      writeFileSync(this.metaFile(name), JSON.stringify(meta));
      log.info(`PHOTO ${name}: no API photo (${err instanceof Error ? err.message : String(err)})`);
      return meta;
    }
  }
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export const OWN_FOLDER_GUIDE = `# Your player photos

Put photos of players in this folder and the overlay uses them everywhere a
player's picture appears (player panel, spotlight, player card). Your photos
always come first, before API or Wikimedia photos and the drawn avatars.

## File names

Name each file after the player, as the scoreboard spells it:

    Virat Kohli.png
    rohit-sharma.jpg
    JASPRIT_BUMRAH.webp

Case, spaces, dashes, underscores and accents don't matter, and a slightly
different spelling of the surname still matches (Chakravarthy / Chakaravarthy).

Two players with the same name? Put each in a folder named with the team's
short code, as the scoreboard shows it:

    IND/Rahul Sharma.png
    MUM/Rahul Sharma.png

## Format and size

- **PNG or WebP with a transparent background** look best: a head-and-shoulders
  cut-out sits on the team colour like a TV graphic.
- JPG works too; it is shown as a photo, cropped from the top.
- Square, about **600 × 600 px** (or 600 × 750 for a cut-out with shoulders),
  face in the upper half. Keep files under 2 MB.

New or changed files are picked up immediately. In the Studio, Overlay (all
scenes) → Player photos → "Check this match's players" shows which picture each
player will get.

Only use photos you have the right to show on your stream.
`;
