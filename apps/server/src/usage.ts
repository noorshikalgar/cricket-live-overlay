import { existsSync, readFileSync, writeFileSync } from 'node:fs';

interface UsageFile {
  /** UTC day the count belongs to */
  date: string;
  calls: number;
  /** epoch ms of calls in the last minute, so a restart can't double-spend the minute */
  recent: number[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Hard API call budget: a daily cap and a per-minute cap. Every outgoing call
 * must `tryAcquire` first; a refused acquire means the call is not made at all.
 * Written to disk on every call so restarts (tsx watch reloads included) keep
 * the count.
 */
export class CallBudget {
  private data: UsageFile = { date: today(), calls: 0, recent: [] };

  constructor(
    private readonly file: string,
    readonly dailyLimit: number,
    readonly perMinute: number,
  ) {
    if (existsSync(file)) {
      try {
        const p = JSON.parse(readFileSync(file, 'utf8')) as Partial<UsageFile>;
        if (p.date === today() && typeof p.calls === 'number') {
          this.data = { date: p.date, calls: p.calls, recent: Array.isArray(p.recent) ? p.recent : [] };
        }
      } catch {
        // corrupt file: start fresh
      }
    }
  }

  get calls(): number {
    this.rollover();
    return this.data.calls;
  }

  get remainingToday(): number {
    return this.dailyLimit > 0 ? Math.max(0, this.dailyLimit - this.calls) : Infinity;
  }

  /** calls in the last 60 s */
  get lastMinute(): number {
    this.prune();
    return this.data.recent.length;
  }

  /**
   * Reserve one call. `keepFree` leaves that many calls unspent in both windows,
   * so optional requests never starve the one that matters (the ball feed).
   */
  tryAcquire(keepFree = 0): boolean {
    this.rollover();
    this.prune();
    if (this.dailyLimit > 0 && this.data.calls + 1 + keepFree > this.dailyLimit) return false;
    if (this.perMinute > 0 && this.data.recent.length + 1 + keepFree > this.perMinute) return false;
    this.data.calls += 1;
    this.data.recent.push(Date.now());
    this.save();
    return true;
  }

  /** Why the next call would be refused, or null if it would go through. */
  blockedReason(): string | null {
    if (this.dailyLimit > 0 && this.calls >= this.dailyLimit) return `Daily limit of ${this.dailyLimit} API calls reached (resets 00:00 UTC)`;
    if (this.perMinute > 0 && this.lastMinute >= this.perMinute) return `Per-minute limit of ${this.perMinute} calls reached`;
    return null;
  }

  private prune(): void {
    const cutoff = Date.now() - 60_000;
    this.data.recent = this.data.recent.filter((t) => t > cutoff);
  }

  private rollover(): void {
    const d = today();
    if (this.data.date !== d) this.data = { date: d, calls: 0, recent: this.data.recent };
  }

  private save(): void {
    writeFileSync(this.file, JSON.stringify(this.data));
  }

  /** kept for the shutdown hook; every acquire already saves */
  flush(): void {
    this.save();
  }
}
