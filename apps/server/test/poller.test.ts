import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchState, PollStatus } from '@cos/shared';
import { Poller } from '../src/poller';
import { generateRecording } from '../src/providers/mock-generator';
import { buildState } from '../src/providers/recording';
import type { CricketProvider } from '../src/providers/types';
import { CallBudget } from '../src/usage';

const rec = generateRecording();

function setup() {
  const getMatchState = vi.fn(async (): Promise<MatchState> => buildState(rec, 30, Date.now()));
  const provider: CricketProvider = {
    name: 'fake',
    countsTowardQuota: true,
    listLiveMatches: async () => [],
    getMatchState,
  };
  const budget = new CallBudget(path.join(mkdtempSync(path.join(tmpdir(), 'cos-')), 'u.json'), 100, 5);
  const statuses: PollStatus[] = [];
  const poller = new Poller(provider, budget, { minSeconds: 3, fixedSeconds: 60 }, {
    onState: () => undefined,
    onEvent: () => undefined,
    onStatus: (s) => statuses.push(s),
    onMatches: () => undefined,
  });
  return { poller, getMatchState, budget, statuses };
}

afterEach(() => vi.useRealTimers());

describe('Poller control', () => {
  it('auto mode polls on the chosen interval', async () => {
    vi.useFakeTimers();
    const { poller, getMatchState } = setup();
    poller.setControl('auto', 30);
    poller.select('m1');
    await vi.advanceTimersByTimeAsync(0);
    expect(getMatchState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getMatchState).toHaveBeenCalledTimes(2);
  });

  it('manual mode fetches once on select, then only on Update now', async () => {
    vi.useFakeTimers();
    const { poller, getMatchState, budget, statuses } = setup();
    poller.setControl('manual', null);
    poller.select('m1');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(getMatchState).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)?.nextPollAt).toBeNull();
    poller.pollNow();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(getMatchState).toHaveBeenCalledTimes(2);
    expect(budget.calls).toBe(2);
  });

  it('switching to manual cancels the pending auto poll', async () => {
    vi.useFakeTimers();
    const { poller, getMatchState } = setup();
    poller.setControl('auto', 30);
    poller.select('m1');
    await vi.advanceTimersByTimeAsync(0);
    poller.setControl('manual', 30);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(getMatchState).toHaveBeenCalledTimes(1);
  });

  it('pause stops automatic polling; Update now still works; resume restarts', async () => {
    vi.useFakeTimers();
    const { poller, getMatchState, statuses } = setup();
    poller.setControl('auto', 30);
    poller.select('m1');
    await vi.advanceTimersByTimeAsync(0);
    poller.setControl('auto', 30, true);
    expect(statuses.at(-1)?.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(getMatchState).toHaveBeenCalledTimes(1);
    poller.pollNow();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(getMatchState).toHaveBeenCalledTimes(2);
    poller.setControl('auto', 30, false);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(getMatchState).toHaveBeenCalledTimes(3);
  });
});
