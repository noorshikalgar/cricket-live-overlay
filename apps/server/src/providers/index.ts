import type { Config } from '../config';
import { RECORDINGS_DIR } from '../config';
import { CricketLiveApiProvider } from './cricketliveapi';
import { MockProvider } from './mock';
import { SportmonksProvider } from './sportmonks';
import type { CricketProvider } from './types';

export function createProvider(cfg: Config): CricketProvider {
  switch (cfg.provider) {
    case 'cricketliveapi':
      return new CricketLiveApiProvider(cfg.apiKey, cfg.apiBaseUrl);
    case 'sportmonks':
      return new SportmonksProvider(cfg.apiKey);
    case 'mock':
      return new MockProvider(RECORDINGS_DIR, cfg.mockBallSeconds);
    default:
      throw new Error(`Unknown CRICKET_PROVIDER "${cfg.provider}" (use mock, cricketliveapi or sportmonks)`);
  }
}

export type { CricketProvider } from './types';
