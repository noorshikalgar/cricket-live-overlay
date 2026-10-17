import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { CARD_WIDGET_TYPES, newId, type AppSettings, type MatchEventType, type MatchState } from '@cos/shared';
import { CardService } from './cards';
import { manualEvent } from './events';
import { DATA_DIR, PLAYER_PHOTOS_DIR, SCENES_DIR, STUDIO_DIST, UPLOADS_DIR, loadConfig } from './config';
import { Hub } from './hub';
import { ObsBridge } from './obs';
import { Poller } from './poller';
import { createProvider } from './providers';
import { SceneStore, validateScene } from './scenes';
import { log } from './log';
import { ApiPhotoCache, OwnPhotoFolder, PHOTO_EXTENSIONS, type PhotoSource } from './photo-sources';
import { PlayerImageService, roleOf, sameName, type AvatarStyle, type PlayerRole } from './players';
import { CallBudget } from './usage';

const cfg = loadConfig();
mkdirSync(UPLOADS_DIR, { recursive: true });

const scenes = new SceneStore(SCENES_DIR);
const budget = new CallBudget(path.join(DATA_DIR, 'usage.json'), cfg.dailyCallLimit, cfg.perMinuteLimit);
log.init(path.join(DATA_DIR, 'logs'), () => {
  const day = cfg.dailyCallLimit > 0 ? `${budget.calls}/${cfg.dailyCallLimit}` : `${budget.calls}`;
  const min = cfg.perMinuteLimit > 0 ? ` · ${budget.lastMinute}/${cfg.perMinuteLimit} min` : '';
  return `calls ${day} today${min}`;
});
const obs = new ObsBridge(cfg.obs, (status) => hub.broadcast({ type: 'obs:status', status }));
const hub = new Hub(scenes, obs);
const provider = createProvider(cfg);
const cards = new CardService(provider, path.join(DATA_DIR, 'cards'), {
  onScorecard: (scorecard) => hub.broadcast({ type: 'cards:scorecard', scorecard }),
  onSquads: (squads) => hub.broadcast({ type: 'cards:squads', squads }),
  onError: (message) => hub.broadcast({ type: 'error', message }),
});

/** Which card data the on-air scene needs right now. */
function cardsOnAir(): { scorecard: boolean; squads: boolean } {
  const id = scenes.getSettings().activeSceneId;
  const widgets = (id ? scenes.get(id)?.widgets : undefined)?.filter((w) => w.visible) ?? [];
  // the info rail's "next batters" / "overs left" slides read the scorecard and XIs
  const rail =
    widgets.some((w) => w.type === 'infoRail' && railUsesCards(w.props)) ||
    // innings compare: boundaries, and estimates for an innings we didn't follow
    widgets.some((w) => w.type === 'compare');
  return {
    scorecard: rail || widgets.some((w) => (CARD_WIDGET_TYPES as readonly string[]).includes(w.type)),
    squads: rail || widgets.some((w) => w.type === 'teamCard' || w.type === 'playerCard'),
  };
}

function railUsesCards(props: Record<string, unknown>): boolean {
  const slides = (props['slides'] ?? {}) as Record<string, boolean>;
  return slides['nextBatters'] !== false || slides['bowlersLeft'] !== false;
}

/**
 * A full scorecard on air must not show a different score from the rest of
 * the overlay. When the live score has moved on from the card's, the card is
 * refreshed, at most once a minute (1 API call). Only for a visible scorecard
 * widget; nothing is fetched otherwise.
 */
const SCORECARD_SYNC_MS = 60_000;
function keepScorecardInStep(state: MatchState): void {
  const id = scenes.getSettings().activeSceneId;
  const onAir = (id ? scenes.get(id)?.widgets : undefined)?.some((w) => w.visible && w.type === 'scorecard' && w.props['minimized'] !== true);
  const card = cards.current.scorecard;
  if (!onAir || !card) return;
  const live = state.innings.at(-1);
  const shown = card.innings[state.innings.length - 1];
  const differs = !shown || !live || shown.runs !== live.runs || shown.wickets !== live.wickets || shown.overs !== live.overs;
  if (differs && Date.now() - card.updatedAt >= SCORECARD_SYNC_MS) void cards.fetch('scorecard', true);
}

/**
 * After a wicket the batting order and bowling figures change, so a scorecard
 * that is in use is refreshed once (1 API call), a little later so the API has
 * caught up. Nothing is fetched when no card or rail needs it.
 */
let wicketRefresh: ReturnType<typeof setTimeout> | null = null;
function refreshCardsAfterWicket(): void {
  if (!cardsOnAir().scorecard) return;
  if (wicketRefresh) clearTimeout(wicketRefresh);
  wicketRefresh = setTimeout(() => void cards.fetch('scorecard', true), 20_000);
}

const poller = new Poller(
  provider,
  budget,
  { minSeconds: cfg.minPollSeconds, fixedSeconds: cfg.pollSeconds, cacheDir: path.join(DATA_DIR, 'cache') },
  {
    onState: (state) => {
      hub.broadcast({ type: 'match:state', state });
      // cards fetch when they have nothing yet; a scorecard on air also keeps up with the score
      if (state) {
        cards.ensure(cardsOnAir());
        keepScorecardInStep(state);
      }
    },
    onEvent: (event) => {
      hub.broadcast({ type: 'match:event', event });
      if (event.type === 'WICKET' && !event.manual) refreshCardsAfterWicket();
    },
    onStatus: (status) => hub.broadcast({ type: 'poll:status', status }),
    onMatches: (matches) => hub.broadcast({ type: 'matches:list', matches }),
  },
);
hub.attach(poller, cards);

const app = Fastify({ logger: { level: 'warn' }, bodyLimit: 6 * 1024 * 1024 });

app.get('/api/health', async () => ({ ok: true, provider: provider.name, poll: poller.pollStatus }));
app.get('/api/matches', async () => poller.refreshMatches());
app.get('/api/scenes', async () => scenes.list());

app.get<{ Params: { id: string } }>('/api/scenes/:id/export', async (req, reply) => {
  const scene = scenes.get(req.params.id);
  if (!scene) return reply.code(404).send({ error: 'Scene not found' });
  const file = `${scene.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'scene'}.scene.json`;
  return reply.header('content-disposition', `attachment; filename="${file}"`).send(scene);
});

app.post('/api/scenes/import', async (req, reply) => {
  const scene = validateScene(req.body);
  if (!scene) return reply.code(400).send({ error: 'Not a valid scene file' });
  // always import as a new scene so nothing is overwritten
  const imported = scenes.upsert({ ...scene, id: newId(), name: `${scene.name} (imported)` });
  hub.broadcast({ type: 'scene:update', scene: imported, origin: null });
  return imported;
});

// Manual moments over HTTP, for Stream Deck / Touch Portal / curl:
//   curl -X POST http://localhost:4300/api/events/SIX
const MANUAL_TYPES = new Set<MatchEventType>(['FOUR', 'SIX', 'WICKET', 'FIFTY', 'HUNDRED', 'MAIDEN', 'DRS', 'DRINKS', 'INNINGS_BREAK', 'INNINGS_END', 'MATCH_RESULT']);
app.post<{ Params: { type: string } }>('/api/events/:type', async (req, reply) => {
  const type = req.params.type.toUpperCase() as MatchEventType;
  if (!MANUAL_TYPES.has(type)) return reply.code(400).send({ error: `Unknown event ${req.params.type}` });
  const event = manualEvent(type, poller.state);
  hub.broadcast({ type: 'match:event', event });
  return event;
});

// Emergency blackout, also for a Stream Deck button:
//   curl -X POST localhost:4300/api/blackout -H 'content-type: application/json' -d '{"on":true,"text":"Back soon"}'
app.post<{ Body: { on?: boolean; text?: string; subtext?: string } }>('/api/blackout', async (req) => {
  const b = req.body ?? {};
  const patch: Partial<AppSettings> = { blackout: b.on === undefined ? !scenes.getSettings().blackout : b.on === true };
  if (typeof b.text === 'string') patch.blackoutText = b.text;
  if (typeof b.subtext === 'string') patch.blackoutSubtext = b.subtext;
  const settings = scenes.updateSettings(patch);
  hub.broadcastSettings();
  return { blackout: settings.blackout, text: settings.blackoutText };
});

// ---- player images: our own SVG avatars, or cached free Wikimedia photos (never the cricket API) ----
const players = new PlayerImageService(path.join(DATA_DIR, 'players'));
const ownPhotos = new OwnPhotoFolder(PLAYER_PHOTOS_DIR, () => hub.broadcast({ type: 'players:changed' }));
const apiPhotos = new ApiPhotoCache(
  path.join(DATA_DIR, 'players', 'api'),
  provider.fetchPlayerImage ? (url) => provider.fetchPlayerImage!(url) : null,
);
log.info(`PHOTO your photos folder: ${PLAYER_PHOTOS_DIR} (${ownPhotos.count} photo${ownPhotos.count === 1 ? '' : 's'})`);

/** the API's image URL for a player, from the playing XIs the app already has */
function apiImageUrl(name: string, team: string | null): string | null {
  const teams = cards.current.squads?.teams ?? [];
  const ordered = team ? [...teams].sort((a, b) => Number(b.code === team) - Number(a.code === team)) : teams;
  for (const t of ordered) {
    const p = [...t.playingXI, ...t.bench].find((x) => x.name === name) ?? [...t.playingXI, ...t.bench].find((x) => sameName(x.name, name));
    if (p?.imageUrl) return p.imageUrl;
  }
  return null;
}

interface Resolved {
  source: PhotoSource;
  src: string;
  /** see-through background: draw as a cut-out figure, not a cropped photo */
  cutout: boolean;
  credit?: string;
  /** dry run only: a source that would be used once downloaded */
  pending?: boolean;
}

/** a version for picture URLs so a changed file is fetched again */
const stamp = (file: string) => {
  try {
    const st = statSync(file);
    return `${st.size}-${Math.round(st.mtimeMs)}`;
  } catch {
    return '0';
  }
};

/**
 * Which picture a player gets, by the user's sources in priority order:
 * own folder → API → Wikimedia → drawn avatar. `dryRun` reports what would be
 * used without downloading anything (for the Studio's check list).
 */
async function resolvePhoto(
  q: { name: string; team: string | null; color: string; role: PlayerRole; style: AvatarStyle },
  dryRun = false,
): Promise<Resolved> {
  const src = scenes.getSettings().playerPhotoSources;
  if (src.own) {
    const e = ownPhotos.find(q.name, q.team);
    if (e) {
      const f = ownPhotos.read(e);
      const rel = path.relative(PLAYER_PHOTOS_DIR, e.file).split(path.sep).join('/');
      return { source: 'own', src: `/api/players/file/own?f=${encodeURIComponent(rel)}&v=${stamp(e.file)}`, cutout: f.cutout };
    }
  }
  if (src.api && apiPhotos.available) {
    const url = apiImageUrl(q.name, q.team);
    const hit = apiPhotos.cached(q.name);
    if (hit) return { source: 'api', src: `/api/players/file/api?f=${encodeURIComponent(path.basename(hit.file))}&v=${stamp(hit.file)}`, cutout: hit.cutout };
    if (url && dryRun) return { source: 'api', src: '', cutout: false, pending: true };
    if (url) {
      const got = await apiPhotos.get(q.name, url);
      if (got) return { source: 'api', src: `/api/players/file/api?f=${encodeURIComponent(path.basename(got.file))}&v=${stamp(got.file)}`, cutout: got.cutout };
    }
  }
  if (src.wikimedia) {
    const cached = players.cachedPhoto(q.name);
    const meta = dryRun
      ? cached
      : await Promise.race([players.photo(q.name), new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
    if (meta?.found && meta.file) {
      const file = path.join(DATA_DIR, 'players', meta.file);
      return { source: 'wikimedia', src: `/api/players/file/wiki?f=${encodeURIComponent(meta.file)}&v=${stamp(file)}`, cutout: false, credit: meta.credit };
    }
    if (dryRun && !cached) return { source: 'wikimedia', src: '', cutout: false, pending: true };
  }
  const avatar = new URLSearchParams({ name: q.name, color: q.color.replace('#', ''), role: q.role, style: q.style, v: '3' });
  return { source: 'avatar', src: `/api/players/image?${avatar.toString()}`, cutout: q.style === 'cutout' };
}

function photoQuery(qs: { name?: string; team?: string; color?: string; role?: string; style?: string }) {
  const name = String(qs.name ?? '').slice(0, 80).trim();
  const color = /^#?[0-9a-f]{6}$/i.test(qs.color ?? '') ? `#${String(qs.color).replace('#', '')}` : '#1D4ED8';
  return {
    name,
    team: qs.team ? String(qs.team).slice(0, 8).toUpperCase() : null,
    color,
    role: roleOf(String(qs.role ?? '')),
    style: (qs.style === 'cutout' ? 'cutout' : 'tile') as AvatarStyle,
  };
}

// our drawn avatar (always available); `source=photo` is the older Wikimedia-or-avatar link
app.get<{ Querystring: { name?: string; color?: string; role?: string; source?: string; style?: string } }>(
  '/api/players/image',
  async (req, reply) => {
    const q = photoQuery(req.query);
    if (!q.name) return reply.code(400).send({ error: 'name required' });
    if (req.query.source === 'photo') {
      const meta = await Promise.race([players.photo(q.name), new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
      if (meta?.found && meta.file) {
        return reply
          .header('cache-control', 'public, max-age=600')
          .type(meta.contentType ?? 'image/jpeg')
          .send(readFileSync(path.join(DATA_DIR, 'players', meta.file)));
      }
    }
    return reply
      .header('cache-control', 'public, max-age=600')
      .type('image/svg+xml')
      .send(readFileSync(players.avatarFile(q.name, q.color, q.role, q.style)));
  },
);

app.get<{ Querystring: { name?: string } }>('/api/players/credit', async (req) => {
  const meta = players.cachedPhoto(String(req.query.name ?? ''));
  return meta?.found ? { credit: meta.credit, sourcePage: meta.sourcePage } : {};
});

// which picture a player gets (JSON); widgets show the drawn avatar until this answers
app.get<{ Querystring: { name?: string; team?: string; color?: string; role?: string; style?: string } }>(
  '/api/players/resolve',
  async (req, reply) => {
    const q = photoQuery(req.query);
    if (!q.name) return reply.code(400).send({ error: 'name required' });
    return resolvePhoto(q);
  },
);

// the picture files themselves; revalidated (ETag) so a replaced photo shows at once
app.get<{ Params: { kind: string }; Querystring: { f?: string } }>('/api/players/file/:kind', async (req, reply) => {
  const roots: Record<string, string> = {
    own: PLAYER_PHOTOS_DIR,
    api: path.join(DATA_DIR, 'players', 'api'),
    wiki: path.join(DATA_DIR, 'players'),
  };
  const root = roots[req.params.kind];
  const rel = String(req.query.f ?? '');
  if (!root || !rel) return reply.code(404).send({ error: 'Not found' });
  const file = path.resolve(root, rel);
  // never outside its folder
  if (!file.startsWith(root + path.sep) || !existsSync(file)) return reply.code(404).send({ error: 'Not found' });
  const type = PHOTO_EXTENSIONS[path.extname(file).toLowerCase()];
  if (!type) return reply.code(404).send({ error: 'Not found' });
  const etag = `"${stamp(file)}"`;
  if (req.headers['if-none-match'] === etag) return reply.code(304).send();
  return reply.header('cache-control', 'no-cache').header('etag', etag).type(type).send(readFileSync(file));
});

// the Studio's photo panel: folder, counts, what each source can do
app.get('/api/players/sources', async () => ({
  folder: PLAYER_PHOTOS_DIR,
  ownCount: ownPhotos.count,
  apiAvailable: apiPhotos.available,
  provider: provider.name,
}));

// "Check this match's players": who gets which picture, without downloading anything
app.get('/api/players/check', async () => {
  const state = poller.state;
  const squads = cards.current.squads?.teams ?? [];
  const list: { team: string; name: string }[] = squads.length
    ? squads.flatMap((t) => t.playingXI.map((p) => ({ team: t.code, name: p.name })))
    : state
      ? [...state.batters.map((b) => ({ team: state.innings.at(-1)?.battingTeam ?? '', name: b.name })), ...(state.bowler ? [{ team: '', name: state.bowler.name }] : [])]
      : [];
  const rows = [];
  for (const p of list) {
    const r = await resolvePhoto({ name: p.name, team: p.team || null, color: '#1D4ED8', role: '', style: 'cutout' }, true);
    rows.push({ ...p, source: r.source, pending: r.pending ?? false, cutout: r.cutout });
  }
  return { fromSquads: squads.length > 0, rows };
});

// open the photos folder in Explorer / Finder (the server runs on the user's own computer)
app.post('/api/players/open-folder', async (req, reply) => {
  const ip = req.ip;
  if (!/^(127\.|::1$|::ffff:127\.)/.test(ip)) return reply.code(403).send({ error: 'Only from this computer' });
  const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [PLAYER_PHOTOS_DIR], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true, folder: PLAYER_PHOTOS_DIR };
});

// look up pictures for many players ahead of time (e.g. both XIs before going live)
app.post<{ Body: { names?: unknown } }>('/api/players/prefetch', async (req) => {
  const names = Array.isArray(req.body?.names) ? req.body.names.map(String).slice(0, 40) : [];
  void (async () => {
    for (const name of names) await resolvePhoto({ name, team: null, color: '#1D4ED8', role: '', style: 'cutout' });
  })();
  return { queued: names.length };
});

const MEDIA_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
};
app.addContentTypeParser(/^image\//, { parseAs: 'buffer', bodyLimit: 5 * 1024 * 1024 }, (_req, body, done) => done(null, body));
app.addContentTypeParser(/^video\//, { parseAs: 'buffer', bodyLimit: 300 * 1024 * 1024 }, (_req, body, done) => done(null, body));
app.post('/api/uploads', async (req, reply) => {
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim();
  const ext = MEDIA_EXT[type];
  if (!ext || !Buffer.isBuffer(req.body)) return reply.code(415).send({ error: 'Upload an image (PNG, JPEG, WebP, SVG, GIF) or a video (MP4, WebM, MOV)' });
  const name = `${newId()}.${ext}`;
  writeFileSync(path.join(UPLOADS_DIR, name), req.body);
  return { url: `/uploads/${name}` };
});

await app.register(fastifyStatic, { root: UPLOADS_DIR, prefix: '/uploads/', decorateReply: false });

// in dev the Angular dev server (:4200) serves the UI; never serve a stale production build
const devMode = process.argv.includes('--dev');
const hasStudioBuild = !devMode && existsSync(path.join(STUDIO_DIST, 'index.html'));
if (hasStudioBuild) {
  await app.register(fastifyStatic, { root: STUDIO_DIST, prefix: '/', wildcard: false });
}

app.setNotFoundHandler((req, reply) => {
  if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) {
    return reply.code(404).send({ error: 'Not found' });
  }
  if (!hasStudioBuild) {
    return reply
      .type('text/plain')
      .send('Studio not built. In development open http://localhost:4200/studio, or run `npm run build` then `npm start`.');
  }
  // Angular routes (/studio, /output/:id) all serve the SPA shell
  return reply.sendFile('index.html', STUDIO_DIST);
});

app.server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws')) hub.handleUpgrade(req, socket, head);
  else socket.destroy();
});

await app.listen({ port: cfg.port, host: '0.0.0.0' });
poller.setControl(scenes.getSettings().pollMode, scenes.getSettings().pollSeconds, scenes.getSettings().pollPaused);
poller.start();
const selected = scenes.getSettings().selectedMatchId;
if (selected) {
  cards.reset(selected);
  poller.select(selected);
}
if (scenes.getSettings().obsBridge) void obs.setEnabled(true);

console.log(`\n  Cricket Overlay Studio server  ·  provider: ${provider.name}`);
if (provider.countsTowardQuota) {
  console.log(
    `  API limits  ${cfg.dailyCallLimit || '∞'}/day · ${cfg.perMinuteLimit || '∞'}/min · used today ${budget.calls}  ·  logs: data/logs/`,
  );
}
const uiPort = devMode ? 4200 : cfg.port;
console.log(`  Studio  http://localhost:${uiPort}/studio${hasStudioBuild || devMode ? '' : '  (not built — run npm run build)'}`);
console.log(`  Output  http://localhost:${uiPort}/output   (OBS Browser Source, 1920×1080)\n`);

const shutdown = () => {
  scenes.flushAll();
  budget.flush();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
