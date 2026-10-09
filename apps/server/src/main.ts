import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { CARD_WIDGET_TYPES, newId, type AppSettings, type MatchEventType } from '@cos/shared';
import { CardService } from './cards';
import { manualEvent } from './events';
import { DATA_DIR, SCENES_DIR, STUDIO_DIST, UPLOADS_DIR, loadConfig } from './config';
import { Hub } from './hub';
import { ObsBridge } from './obs';
import { Poller } from './poller';
import { createProvider } from './providers';
import { SceneStore, validateScene } from './scenes';
import { log } from './log';
import { PlayerImageService, roleOf } from './players';
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
  return {
    scorecard: widgets.some((w) => (CARD_WIDGET_TYPES as readonly string[]).includes(w.type)),
    squads: widgets.some((w) => w.type === 'teamCard' || w.type === 'playerCard'),
  };
}

const poller = new Poller(
  provider,
  budget,
  { minSeconds: cfg.minPollSeconds, fixedSeconds: cfg.pollSeconds, cacheDir: path.join(DATA_DIR, 'cache') },
  {
    onState: (state) => {
      hub.broadcast({ type: 'match:state', state });
      // cards only fetch when they have nothing yet; reloads are manual (⟳)
      if (state) cards.ensure(cardsOnAir());
    },
    onEvent: (event) => hub.broadcast({ type: 'match:event', event }),
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

app.get<{ Querystring: { name?: string; color?: string; role?: string; source?: string } }>(
  '/api/players/image',
  async (req, reply) => {
    const name = String(req.query.name ?? '').slice(0, 80).trim();
    if (!name) return reply.code(400).send({ error: 'name required' });
    const color = /^#?[0-9a-f]{6}$/i.test(req.query.color ?? '') ? `#${String(req.query.color).replace('#', '')}` : '#1D4ED8';
    const role = roleOf(String(req.query.role ?? ''));
    if (req.query.source === 'photo') {
      // wait briefly for a first-time lookup; otherwise show the avatar now and the photo next time
      const meta = await Promise.race([players.photo(name), new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
      if (meta?.found && meta.file) {
        return reply
          .header('cache-control', 'public, max-age=86400')
          .type(meta.contentType ?? 'image/jpeg')
          .send(readFileSync(path.join(DATA_DIR, 'players', meta.file)));
      }
    }
    return reply
      .header('cache-control', 'public, max-age=3600')
      .type('image/svg+xml')
      .send(readFileSync(players.avatarFile(name, color, role)));
  },
);

app.get<{ Querystring: { name?: string } }>('/api/players/credit', async (req) => {
  const meta = players.cachedPhoto(String(req.query.name ?? ''));
  return meta?.found ? { credit: meta.credit, sourcePage: meta.sourcePage } : {};
});

app.post<{ Body: { names?: unknown } }>('/api/players/prefetch', async (req) => {
  const names = (Array.isArray(req.body?.names) ? req.body.names : []).map(String).filter(Boolean).slice(0, 60);
  log.info(`PHOTO looking up ${names.length} players on Wikimedia (cached ones are skipped)`);
  for (const n of names) void players.photo(n);
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
