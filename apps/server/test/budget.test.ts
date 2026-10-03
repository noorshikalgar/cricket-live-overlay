import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CallBudget } from '../src/usage';

const file = () => path.join(mkdtempSync(path.join(tmpdir(), 'cos-')), 'usage.json');

afterEach(() => vi.useRealTimers());

describe('CallBudget', () => {
  it('never allows more than the per-minute cap', () => {
    const b = new CallBudget(file(), 100, 5);
    const ok = Array.from({ length: 8 }, () => b.tryAcquire()).filter(Boolean).length;
    expect(ok).toBe(5);
    expect(b.blockedReason()).toMatch(/Per-minute/);
  });

  it('frees the minute after 60 s', () => {
    vi.useFakeTimers();
    const b = new CallBudget(file(), 100, 5);
    for (let i = 0; i < 5; i++) b.tryAcquire();
    expect(b.tryAcquire()).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(b.tryAcquire()).toBe(true);
  });

  it('never allows more than the daily cap', () => {
    vi.useFakeTimers();
    const b = new CallBudget(file(), 100, 5);
    let ok = 0;
    for (let minute = 0; minute < 40; minute++) {
      for (let i = 0; i < 5; i++) if (b.tryAcquire()) ok++;
      vi.advanceTimersByTime(61_000);
    }
    expect(ok).toBe(100);
    expect(b.remainingToday).toBe(0);
  });

  it('keeps calls free for required requests', () => {
    const b = new CallBudget(file(), 100, 5);
    for (let i = 0; i < 4; i++) b.tryAcquire();
    expect(b.tryAcquire(1)).toBe(false); // optional must leave one
    expect(b.tryAcquire()).toBe(true); // required takes it
  });

  it('survives a restart', () => {
    const f = file();
    const a = new CallBudget(f, 100, 5);
    for (let i = 0; i < 5; i++) a.tryAcquire();
    const b = new CallBudget(f, 100, 5);
    expect(b.calls).toBe(5);
    expect(b.tryAcquire()).toBe(false); // same minute
  });
});
