import { existsSync, readFileSync, writeFileSync } from 'node:fs';

interface UsageFile {
  date: string;
  calls: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Calls-used-today counter, persisted so a restart mid-match doesn't reset the budget. */
export class UsageCounter {
  private data: UsageFile;
  private dirty = false;

  constructor(private readonly file: string) {
    this.data = { date: today(), calls: 0 };
    if (existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<UsageFile>;
        if (parsed.date === today() && typeof parsed.calls === 'number') this.data = { date: parsed.date, calls: parsed.calls };
      } catch {
        // corrupt file: start fresh
      }
    }
    setInterval(() => this.flush(), 5000).unref();
  }

  get calls(): number {
    this.rollover();
    return this.data.calls;
  }

  increment(): void {
    this.rollover();
    this.data.calls += 1;
    this.dirty = true;
  }

  private rollover(): void {
    const d = today();
    if (this.data.date !== d) {
      this.data = { date: d, calls: 0 };
      this.dirty = true;
    }
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    writeFileSync(this.file, JSON.stringify(this.data));
  }
}
