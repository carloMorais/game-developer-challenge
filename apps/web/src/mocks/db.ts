import { isSameMatch, type MatchRecord, type MatchRecordInput } from '@pirate/contracts';
import { isRecord, readJson, removeKey, writeJson } from '../lib/storage';
import { initialFixtures } from './fixtures';

const DB_KEY = 'pirate-battle:mock-db:v2';

interface Snapshot {
  revision: number;
  records: MatchRecord[];
}

function parseSnapshot(raw: unknown): Snapshot | null {
  if (!isRecord(raw) || typeof raw.revision !== 'number' || !Array.isArray(raw.records))
    return null;
  return { revision: raw.revision, records: raw.records as MatchRecord[] };
}

export type InsertResult =
  | { kind: 'created'; record: MatchRecord }
  | { kind: 'existing'; record: MatchRecord }
  | { kind: 'conflict'; record: MatchRecord };

/**
 * The mock backend's storage. Confirmed records are persisted in localStorage
 * so they survive reloads; `reset()` restores the fixtures.
 */
class MockDatabase {
  private records = new Map<string, MatchRecord>();
  private revisionValue = 1;

  constructor() {
    const stored = readJson(DB_KEY, parseSnapshot);
    if (stored) {
      this.revisionValue = stored.revision;
      for (const record of stored.records) this.records.set(record.matchId, record);
    } else {
      this.seed();
    }
  }

  get revision(): number {
    return this.revisionValue;
  }

  all(): MatchRecord[] {
    return [...this.records.values()];
  }

  /** Idempotent insert keyed by matchId. */
  insert(input: MatchRecordInput): InsertResult {
    const existing = this.records.get(input.matchId);
    if (existing) {
      return isSameMatch(existing, input)
        ? { kind: 'existing', record: existing }
        : { kind: 'conflict', record: existing };
    }
    const record: MatchRecord = { ...input, recordedAt: new Date().toISOString() };
    this.records.set(record.matchId, record);
    this.revisionValue++;
    this.persist();
    return { kind: 'created', record };
  }

  reset(): void {
    removeKey(DB_KEY);
    this.records.clear();
    // Keep revisions increasing so clients never mistake new data for old.
    this.revisionValue++;
    this.seed();
  }

  private seed(): void {
    for (const record of initialFixtures()) this.records.set(record.matchId, record);
    this.persist();
  }

  private persist(): void {
    writeJson(DB_KEY, { revision: this.revisionValue, records: this.all() } satisfies Snapshot);
  }
}

export const db = new MockDatabase();
