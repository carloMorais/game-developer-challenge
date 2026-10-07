import { createRng, type Rng } from '@pirate/game-core';
import { isRecord, readJson, writeJson } from '../lib/storage';

export type RequestKind = 'ranking' | 'configs' | 'history' | 'register';

export type Failure =
  | { type: 'network' }
  | { type: 'timeout' }
  | {
      type: 'status';
      status: number;
      code: 'BAD_REQUEST' | 'RATE_LIMITED' | 'INTERNAL' | 'UNAVAILABLE';
    };

export interface ScenarioDef {
  label: string;
  description: string;
  /** Overrides the list data returned by GET endpoints. */
  data?: 'empty' | 'manyPages';
  /** Latency in ms for the n-th request (0-based) of this scenario. */
  latency?: (kind: RequestKind, n: number, rng: Rng) => number;
  failure?: (kind: RequestKind) => Failure | null;
  /** Register commits, then the response never arrives (first attempt per match). */
  timeoutAfterCommit?: boolean;
}

/** Longer than the client timeout: the request is abandoned by the client. */
export const HANG_MS = 20_000;

const fail = (failure: Failure, kinds?: RequestKind[]) => (kind: RequestKind) =>
  !kinds || kinds.includes(kind) ? failure : null;

export const SCENARIOS = {
  success: { label: 'Success', description: 'Normal responses with realistic latency.' },
  empty: {
    label: 'Empty lists',
    description: 'Ranking and history return no entries.',
    data: 'empty',
  },
  manyPages: {
    label: 'Many pages',
    description: 'Large ranking and history to exercise pagination.',
    data: 'manyPages',
  },
  slow: { label: 'Slow network', description: 'Every response takes ~2.5 s.', latency: () => 2500 },
  jitter: {
    label: 'Variable latency',
    description: 'Seeded random latency between 50 ms and 2 s.',
    latency: (_k, _n, rng) => Math.round(rng.range(50, 2000)),
  },
  outOfOrder: {
    label: 'Out-of-order responses',
    description: 'Alternate requests are slow, so older responses arrive after newer ones.',
    latency: (_k, n) => (n % 2 === 0 ? 2500 : 150),
  },
  timeout: {
    label: 'Timeout',
    description: 'Requests never answer; the client times out.',
    failure: fail({ type: 'timeout' }),
  },
  offline: {
    label: 'Connection failure',
    description: 'Requests fail with a network error.',
    failure: fail({ type: 'network' }),
  },
  serverError: {
    label: 'HTTP 500',
    description: 'The server answers 500 Internal Server Error.',
    failure: fail({ type: 'status', status: 500, code: 'INTERNAL' }),
  },
  clientError: {
    label: 'HTTP 4xx',
    description: 'The server rejects requests with 429 Too Many Requests.',
    failure: fail({ type: 'status', status: 429, code: 'RATE_LIMITED' }),
  },
  rankingDown: {
    label: 'Ranking fails',
    description: 'Only the ranking endpoints fail (HTTP 500).',
    failure: fail({ type: 'status', status: 500, code: 'INTERNAL' }, ['ranking', 'configs']),
  },
  historyDown: {
    label: 'History fails',
    description: 'Only the match history endpoint fails (HTTP 500).',
    failure: fail({ type: 'status', status: 500, code: 'INTERNAL' }, ['history']),
  },
  registerTimeoutAfterCommit: {
    label: 'Register: timeout after commit',
    description:
      'The match is stored but the first response is lost; the retry must not create a duplicate.',
    timeoutAfterCommit: true,
  },
  registerUnavailable: {
    label: 'Register: service unavailable',
    description: 'Recording matches fails with 503 until another scenario is selected.',
    failure: fail({ type: 'status', status: 503, code: 'UNAVAILABLE' }, ['register']),
  },
} satisfies Record<string, ScenarioDef>;

export type ScenarioId = keyof typeof SCENARIOS;

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === 'string' && Object.hasOwn(SCENARIOS, value);
}

export interface MockNetworkConfig {
  scenario: ScenarioId;
  /** Fixed latency for every request (tests use 0); null = scenario default. */
  latencyMs: number | null;
  /** Seed for latency randomness. */
  seed: number;
}

const CONFIG_KEY = 'pirate-battle:mock-network:v1';
export const DEFAULT_NETWORK_CONFIG: MockNetworkConfig = {
  scenario: 'success',
  latencyMs: null,
  seed: 1,
};

function parseConfig(raw: unknown): MockNetworkConfig | null {
  if (!isRecord(raw) || !isScenarioId(raw.scenario)) return null;
  const latencyMs = typeof raw.latencyMs === 'number' && raw.latencyMs >= 0 ? raw.latencyMs : null;
  const seed = typeof raw.seed === 'number' ? raw.seed : 1;
  return { scenario: raw.scenario, latencyMs, seed };
}

type Listener = (config: MockNetworkConfig) => void;

/**
 * Current scenario, latency override and seed. Read by handlers on every
 * request, so switching takes effect immediately. Persisted, and overridable
 * via `?scenario=`, `?mockLatency=` and `?mockSeed=` query parameters.
 */
class NetworkState {
  private config: MockNetworkConfig;
  private rng: Rng;
  private requestCount = 0;
  private readonly listeners = new Set<Listener>();
  /** Matches whose first register response was already "lost". */
  readonly lostResponses = new Set<string>();

  constructor() {
    const stored = readJson(CONFIG_KEY, parseConfig) ?? DEFAULT_NETWORK_CONFIG;
    this.config = { ...stored, ...readUrlOverrides() };
    this.rng = createRng(this.config.seed);
    writeJson(CONFIG_KEY, this.config);
  }

  get(): MockNetworkConfig {
    return this.config;
  }

  get scenario(): ScenarioDef {
    return SCENARIOS[this.config.scenario];
  }

  update(patch: Partial<MockNetworkConfig>): void {
    this.config = { ...this.config, ...patch };
    this.rng = createRng(this.config.seed);
    this.requestCount = 0;
    this.lostResponses.clear();
    writeJson(CONFIG_KEY, this.config);
    for (const listener of this.listeners) listener(this.config);
  }

  reset(): void {
    this.update({ ...DEFAULT_NETWORK_CONFIG });
  }

  /** Latency for the next request of `kind`. */
  nextLatency(kind: RequestKind): number {
    const n = this.requestCount++;
    if (this.config.latencyMs !== null && this.config.scenario !== 'outOfOrder') {
      return this.config.latencyMs;
    }
    const custom = this.scenario.latency?.(kind, n, this.rng);
    if (custom !== undefined) return custom;
    return this.config.latencyMs ?? Math.round(this.rng.range(150, 450));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function readUrlOverrides(): Partial<MockNetworkConfig> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const overrides: Partial<MockNetworkConfig> = {};
  const scenario = params.get('scenario');
  if (isScenarioId(scenario)) overrides.scenario = scenario;
  const latency = params.get('mockLatency');
  if (latency !== null && Number.isFinite(Number(latency)))
    overrides.latencyMs = Math.max(0, Number(latency));
  const seed = params.get('mockSeed');
  if (seed !== null && Number.isInteger(Number(seed))) overrides.seed = Number(seed);
  return overrides;
}

export const network = new NetworkState();
