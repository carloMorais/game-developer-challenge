import {
  API_ROUTES,
  type MatchConfigDto,
  type MatchRecord,
  type MatchRecordInput,
  type Page,
  type RankingConfigsResponse,
  type RankingEntry,
  type RegisterMatchResponse,
} from '@pirate/contracts';
import { apiClient, toApiError } from './apiClient';

export interface RankingQuery {
  config: MatchConfigDto;
  page: number;
  pageSize: number;
}

export interface HistoryQuery {
  playerId: string;
  page: number;
  pageSize: number;
}

/**
 * Transport-agnostic data access. Components and hooks depend on these
 * interfaces; today they are backed by REST (Axios), later a WebSocket-backed
 * implementation can push updates without touching the UI.
 */
export interface RankingRepository {
  getRanking(query: RankingQuery, signal?: AbortSignal): Promise<Page<RankingEntry>>;
  getConfigs(signal?: AbortSignal): Promise<RankingConfigsResponse>;
}

export interface MatchRepository {
  /** Idempotent: re-sending the same match returns the stored record. */
  register(input: MatchRecordInput, signal?: AbortSignal): Promise<RegisterMatchResponse>;
  getHistory(query: HistoryQuery, signal?: AbortSignal): Promise<Page<MatchRecord>>;
}

/** Only pass `signal` when present (exactOptionalPropertyTypes). */
function withSignal(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal ? { signal } : {};
}

async function request<T>(run: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await run()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const restRankingRepository: RankingRepository = {
  getRanking: ({ config, page, pageSize }, signal) =>
    request(() =>
      apiClient.get<Page<RankingEntry>>(API_ROUTES.ranking, {
        params: {
          difficulty: config.difficulty,
          sessionTime: config.sessionTime,
          spawnInterval: config.spawnInterval,
          page,
          pageSize,
        },
        ...withSignal(signal),
      }),
    ),
  getConfigs: (signal) =>
    request(() =>
      apiClient.get<RankingConfigsResponse>(API_ROUTES.rankingConfigs, withSignal(signal)),
    ),
};

export const restMatchRepository: MatchRepository = {
  register: (input, signal) =>
    request(() =>
      apiClient.put<RegisterMatchResponse>(
        API_ROUTES.match(input.matchId),
        input,
        withSignal(signal),
      ),
    ),
  getHistory: ({ playerId, page, pageSize }, signal) =>
    request(() =>
      apiClient.get<Page<MatchRecord>>(API_ROUTES.playerMatches(playerId), {
        params: { page, pageSize },
        ...withSignal(signal),
      }),
    ),
};

export const repositories = {
  ranking: restRankingRepository,
  matches: restMatchRepository,
};
