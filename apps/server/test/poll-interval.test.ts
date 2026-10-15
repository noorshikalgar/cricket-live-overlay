import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PollStatus } from '@cos/shared';
import { Poller } from '../src/poller';
import { generateRecording } from '../src/providers/mock-generator';
import { buildState } from '../src/providers/recording';
import { CallBudget } from '../src/usage';

/** a paid-API-like provider: counts toward a quota, no fixed interval */
function fakeProvider() {
  const rec = generateRecording();
  let n = 30;
  return {
    name: 'fake',
    countsTowardQuota: true,
    minIntervalSeconds: 10,
    listLiveMatches: async () => [],
    getMatchState: async () => buildState(rec, (n += 1), Date.now()),
  };
}

describe('poll interval from the Studio', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('moves the next poll when the interval changes', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'poll-'));
    let status: PollStatus | null = null;
    const poller = new Poller(
      fakeProvider(),
      new CallBudget(path.join(dir, 'usage.json'), 1000, 0),
      { minSeconds: 3, fixedSeconds: 60, cacheDir: dir },
      { onState: () => undefined, onEvent: () => undefined, onStatus: (s) => (status = s), onMatches: () => undefined },
    );
    poller.setControl('auto', 60);
    poller.select('m1');
    await vi.advanceTimersByTimeAsync(10);
    const first = status!.nextPollAt! - Date.now();
    expect(Math.round(first / 1000)).toBe(60);
    poller.setControl('auto', 20);
    expect(Math.round((status!.nextPollAt! - Date.now()) / 1000)).toBe(20);
    poller.setControl('auto', 30);
    expect(Math.round((status!.nextPollAt! - Date.now()) / 1000)).toBe(30);
  });
});
