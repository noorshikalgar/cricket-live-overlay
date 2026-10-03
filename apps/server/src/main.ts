import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { newId, type MatchEventType } from '@cos/shared';
import { manualEvent } from './events';
import { DATA_DIR, SCENES_DIR, STUDIO_DIST, UPLOADS_DIR, loadConfig } from './config';
import { Hub } from './hub';
import { ObsBridge } from './obs';
import { Poller } from './poller';
import { createProvider } from './providers';
import { SceneStore, validateScene } from './scenes';
import { CallBudget } from './usage';

const cfg = loadConfig();
mkdirSync(UPLOADS_DIR, { recursive: true });

const scenes = new SceneStore(SCENES_DIR);
const budget = new CallBudget(path.join(DATA_DIR, 'usage.json'), cfg.dailyCallLimit, cfg.perMinuteLimit);
const obs = new ObsBridge(cfg.obs, (status) => hub.broadcast({ type: 'obs:status', status }));
const hub = new Hub(scenes, obs);
const provider = createProvider(cfg);
const poller = new Poller(
  provider,
  budget,
  { minSeconds: cfg.minPollSeconds, fixedSeconds: cfg.pollSeconds },
  {
    onState: (state) => hub.broadcast({ type: 'match:state', state }),
    onEvent: (event) => hub.broadcast({ type: 'match:event', event }),
    onStatus: (status) => hub.broadcast({ type: 'poll:status', status }),
    onMatches: (matches) => hub.broadcast({ type: 'matches:list', matches }),
  },
);
hub.attach(poller);

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

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
};
app.addContentTypeParser(/^image\//, { parseAs: 'buffer', bodyLimit: 5 * 1024 * 1024 }, (_req, body, done) => done(null, body));
app.post('/api/uploads', async (req, reply) => {
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim();
  const ext = IMAGE_EXT[type];
  if (!ext || !Buffer.isBuffer(req.body)) return reply.code(415).send({ error: 'Upload a PNG, JPEG, WebP, SVG or GIF' });
  const name = `${newId()}.${ext}`;
  writeFileSync(path.join(UPLOADS_DIR, name), req.body);
  return { url: `/uploads/${name}` };
});

await app.register(fastifyStatic, { root: UPLOADS_DIR, prefix: '/uploads/', decorateReply: false });

const hasStudioBuild = existsSync(path.join(STUDIO_DIST, 'index.html'));
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
poller.start();
const selected = scenes.getSettings().selectedMatchId;
if (selected) poller.select(selected);
if (scenes.getSettings().obsBridge) void obs.setEnabled(true);

console.log(`\n  Cricket Overlay Studio server  ·  provider: ${provider.name}`);
console.log(`  Studio  http://localhost:${cfg.port}/studio${hasStudioBuild ? '' : '  (not built — use :4200 in dev)'}`);
console.log(`  Output  http://localhost:${cfg.port}/output   (OBS Browser Source, 1920×1080)\n`);

const shutdown = () => {
  scenes.flushAll();
  budget.flush();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
