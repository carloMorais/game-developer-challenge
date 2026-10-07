import { keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query';
import { configKey, type MatchConfigDto, type Page } from '@pirate/contracts';
import { queryClient } from './queryClient';
import { repositories } from './repositories';

export const PAGE_SIZE = 5;

export const queryKeys = {
  ranking: ['ranking'] as const,
  rankingPage: (config: MatchConfigDto, page: number) =>
    ['ranking', 'list', configKey(config), page, PAGE_SIZE] as const,
  rankingConfigs: ['ranking', 'configs'] as const,
  history: ['history'] as const,
  historyPage: (playerId: string, page: number) => ['history', playerId, page, PAGE_SIZE] as const,
};

/**
 * Never let an older response replace newer data: TanStack Query already
 * cancels superseded requests for the same key, and this guard additionally
 * keeps the cached page when an incoming one carries an older revision.
 */
async function monotonic<T>(key: QueryKey, fetchPage: Promise<Page<T>>): Promise<Page<T>> {
  const fresh = await fetchPage;
  const cached = queryClient.getQueryData<Page<T>>(key);
  return cached && cached.revision > fresh.revision ? cached : fresh;
}

export function useRankingQuery(config: MatchConfigDto, page: number) {
  const queryKey = queryKeys.rankingPage(config, page);
  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      monotonic(
        queryKey,
        repositories.ranking.getRanking({ config, page, pageSize: PAGE_SIZE }, signal),
      ),
    placeholderData: keepPreviousData,
    // Refresh whenever the tab is shown again.
    refetchOnMount: 'always',
  });
}

export function useRankingConfigsQuery() {
  return useQuery({
    queryKey: queryKeys.rankingConfigs,
    queryFn: ({ signal }) => repositories.ranking.getConfigs(signal),
    refetchOnMount: 'always',
  });
}

export function useHistoryQuery(playerId: string, page: number) {
  const queryKey = queryKeys.historyPage(playerId, page);
  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      monotonic(
        queryKey,
        repositories.matches.getHistory({ playerId, page, pageSize: PAGE_SIZE }, signal),
      ),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  });
}

/** Both tabs refresh after a match is recorded. */
export async function invalidateMatchLists(): Promise<void> {
  // invalidateQueries() only cancels an in-flight fetch when the query already
  // has data; during a first load it would keep the (now stale) request. Cancel
  // explicitly so the refetch always reflects the newly recorded match.
  await Promise.all([
    queryClient.cancelQueries({ queryKey: queryKeys.ranking }),
    queryClient.cancelQueries({ queryKey: queryKeys.history }),
  ]);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.ranking }),
    queryClient.invalidateQueries({ queryKey: queryKeys.history }),
  ]);
}
