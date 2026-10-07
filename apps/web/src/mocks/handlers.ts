import { HttpResponse, delay, http, type JsonBodyType } from 'msw';
import {
  API_BASE,
  API_ROUTE_PATTERNS,
  compareRanking,
  configKey,
  paginate,
  parseMatchConfig,
  parseMatchRecordInput,
  parsePagination,
  type ApiErrorBody,
  type MatchConfigDto,
  type MatchRecord,
  type Page,
  type RankingConfigsResponse,
  type RankingEntry,
  type RegisterMatchResponse,
} from '@pirate/contracts';
import { db } from './db';
import { generateRecords } from './fixtures';
import { HANG_MS, network, type RequestKind } from './scenarios';

const url = (path: string) => `${API_BASE}${path}`;

function errorResponse(status: number, code: ApiErrorBody['error']['code'], message: string) {
  return HttpResponse.json<ApiErrorBody>({ error: { code, message } }, { status });
}

/**
 * Applies the active scenario: latency, then an optional failure. Returns a
 * response to short-circuit with, or null to continue normally.
 *
 * List endpoints build their payload *before* calling this, so a slow response
 * carries the data as it was when the request arrived (realistic staleness).
 */
async function simulate(kind: RequestKind): Promise<HttpResponse<JsonBodyType> | null> {
  const latency = network.nextLatency(kind);
  if (latency > 0) await delay(latency);

  const failure = network.scenario.failure?.(kind) ?? null;
  if (!failure) return null;
  switch (failure.type) {
    case 'network':
      return HttpResponse.error();
    case 'timeout':
      await delay(HANG_MS);
      return errorResponse(504, 'UNAVAILABLE', 'Gateway timeout');
    case 'status':
      return errorResponse(failure.status, failure.code, `Simulated HTTP ${failure.status}`);
  }
}

/** Records visible to list endpoints under the current scenario. */
function visibleRecords(extra: { config?: MatchConfigDto; playerId?: string } = {}): MatchRecord[] {
  const data = network.scenario.data;
  if (data === 'empty') return [];
  const records = db.all();
  if (data === 'manyPages') {
    if (extra.config)
      records.push(...generateRecords(extra.config, 37, 9001, { idPrefix: 'many' }));
    if (extra.playerId) {
      records.push(
        ...generateRecords({ sessionTime: 120, spawnInterval: 3 }, 23, 9002, {
          playerId: extra.playerId,
          playerName: 'You',
          idPrefix: 'many-history',
        }),
      );
    }
  }
  return records;
}

function page<T>(items: readonly T[], pageNumber: number, pageSize: number): Page<T> {
  return { ...paginate(items, pageNumber, pageSize), revision: db.revision };
}

export const handlers = [
  http.get(url(API_ROUTE_PATTERNS.ranking), async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const config = parseMatchConfig({
      sessionTime: Number(params.get('sessionTime')),
      spawnInterval: Number(params.get('spawnInterval')),
    });
    const pagination = parsePagination({
      page: params.get('page'),
      pageSize: params.get('pageSize'),
    });
    if (!config.ok) return errorResponse(400, 'BAD_REQUEST', config.error);
    if (!pagination.ok) return errorResponse(400, 'BAD_REQUEST', pagination.error);

    const key = configKey(config.value);
    const entries: RankingEntry[] = visibleRecords({ config: config.value })
      .filter((r) => configKey(r.config) === key)
      .sort(compareRanking)
      .map((r, i) => ({
        rank: i + 1,
        matchId: r.matchId,
        playerId: r.playerId,
        playerName: r.playerName,
        score: r.score,
        durationMs: r.durationMs,
        endedAt: r.endedAt,
      }));
    const { page: p, pageSize } = pagination.value;
    const body = page(entries, p, pageSize);
    return (await simulate('ranking')) ?? HttpResponse.json(body);
  }),

  http.get(url(API_ROUTE_PATTERNS.rankingConfigs), async () => {
    const counts = new Map<string, { config: MatchConfigDto; entries: number }>();
    for (const record of visibleRecords()) {
      const key = configKey(record.config);
      const current = counts.get(key) ?? { config: record.config, entries: 0 };
      current.entries++;
      counts.set(key, current);
    }
    const configs = [...counts.values()].sort(
      (a, b) =>
        a.config.sessionTime - b.config.sessionTime ||
        a.config.spawnInterval - b.config.spawnInterval,
    );
    return (await simulate('configs')) ?? HttpResponse.json<RankingConfigsResponse>({ configs });
  }),

  http.get(url(API_ROUTE_PATTERNS.playerMatches), async ({ request, params }) => {
    const playerId = String(params.playerId);
    const query = new URL(request.url).searchParams;
    const pagination = parsePagination({
      page: query.get('page'),
      pageSize: query.get('pageSize'),
    });
    if (!pagination.ok) return errorResponse(400, 'BAD_REQUEST', pagination.error);

    const matches = visibleRecords({ playerId })
      .filter((r) => r.playerId === playerId)
      .sort((a, b) =>
        a.endedAt === b.endedAt ? (a.matchId < b.matchId ? -1 : 1) : a.endedAt < b.endedAt ? 1 : -1,
      );
    const { page: p, pageSize } = pagination.value;
    const body = page(matches, p, pageSize);
    return (await simulate('history')) ?? HttpResponse.json(body);
  }),

  http.put(url(API_ROUTE_PATTERNS.match), async ({ request, params }) => {
    const parsed = parseMatchRecordInput(await request.json().catch(() => null));
    if (!parsed.ok) return errorResponse(400, 'BAD_REQUEST', parsed.error);
    if (parsed.value.matchId !== params.matchId) {
      return errorResponse(400, 'BAD_REQUEST', 'matchId in path and body differ');
    }

    const simulated = await simulate('register');
    if (simulated) return simulated;

    const result = db.insert(parsed.value);
    if (result.kind === 'conflict') {
      return errorResponse(409, 'CONFLICT', 'A different match with this id already exists');
    }

    // Commit happened; drop the first response for this match to force a retry.
    if (network.scenario.timeoutAfterCommit && !network.lostResponses.has(parsed.value.matchId)) {
      network.lostResponses.add(parsed.value.matchId);
      await delay(HANG_MS);
    }

    return HttpResponse.json<RegisterMatchResponse>(
      { record: result.record, created: result.kind === 'created' },
      { status: result.kind === 'created' ? 201 : 200 },
    );
  }),
];
