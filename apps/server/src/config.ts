import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** apps/server, both when running src/*.ts via tsx and dist/main.js. */
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(SERVER_ROOT, 'data');
export const SCENES_DIR = path.join(DATA_DIR, 'scenes');
export const RECORDINGS_DIR = path.join(DATA_DIR, 'recordings');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const STUDIO_DIST = path.resolve(SERVER_ROOT, '..', 'studio', 'dist', 'studio', 'browser');

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export interface Config {
  port: number;
  provider: string;
  apiKey: string;
  dailyCallLimit: number;
  minPollSeconds: number;
  mockBallSeconds: number;
  obs: { url: string; password: string; webcamSource: string };
}

export function loadConfig(): Config {
  return {
    port: num('SERVER_PORT', num('PORT', 4300)),
    provider: (process.env['CRICKET_PROVIDER'] ?? 'mock').trim().toLowerCase(),
    apiKey: process.env['CRICKET_API_KEY'] ?? '',
    dailyCallLimit: num('DAILY_CALL_LIMIT', 5000),
    minPollSeconds: num('MIN_POLL_SECONDS', 3),
    mockBallSeconds: num('MOCK_BALL_SECONDS', 3),
    obs: {
      url: process.env['OBS_WS_URL'] ?? 'ws://127.0.0.1:4455',
      password: process.env['OBS_WS_PASSWORD'] ?? '',
      webcamSource: process.env['OBS_WEBCAM_SOURCE'] ?? 'Webcam',
    },
  };
}
