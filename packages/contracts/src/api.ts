/** REST surface for ranking and match history. All paths are relative to {@link API_BASE}. */
export const API_BASE = '/api';

export const API_ROUTES = {
  /** GET ?difficulty&sessionTime&spawnInterval&page&pageSize → Page<RankingEntry> */
  ranking: '/ranking',
  /** GET → RankingConfigsResponse */
  rankingConfigs: '/ranking/configs',
  /** PUT (idempotent create) → RegisterMatchResponse; 201 created, 200 already recorded */
  match: (matchId: string) => `/matches/${encodeURIComponent(matchId)}`,
  /** GET ?page&pageSize → Page<MatchRecord> */
  playerMatches: (playerId: string) => `/players/${encodeURIComponent(playerId)}/matches`,
} as const;

/** Route patterns with `:params`, for server/mock routers (never URL-encoded). */
export const API_ROUTE_PATTERNS = {
  ranking: API_ROUTES.ranking,
  rankingConfigs: API_ROUTES.rankingConfigs,
  match: '/matches/:matchId',
  playerMatches: '/players/:playerId/matches',
} as const;

export const PAGE_SIZE_LIMITS = { min: 1, max: 50, default: 5 } as const;

export interface Page<T> {
  items: T[];
  /** 1-based. */
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  /**
   * Monotonic data revision of the backing store when the page was produced.
   * Clients use it to drop responses older than data they already show.
   */
  revision: number;
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'UNAVAILABLE';

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}
