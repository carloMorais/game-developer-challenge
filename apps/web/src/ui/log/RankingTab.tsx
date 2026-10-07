import { useId, useState } from 'react';
import { configKey, type MatchConfigDto } from '@pirate/contracts';
import { useRankingConfigsQuery, useRankingQuery } from '../../data/queries';
import { useSettingsStore } from '../../store/settingsStore';
import { formatConfig, formatDateTime, formatTime } from '../format';
import { Pagination } from './Pagination';
import { QueryState } from './QueryState';

/** Leaderboard for one match configuration (only equal settings compete). */
export function RankingTab() {
  const playerId = useSettingsStore((s) => s.playerId);
  const currentOptions = useSettingsStore((s) => s.options);
  const [config, setConfig] = useState<MatchConfigDto>(currentOptions);
  const [page, setPage] = useState(1);
  const selectId = useId();

  const configs = useRankingConfigsQuery();
  const ranking = useRankingQuery(config, page);
  const data = ranking.data;

  // The player's own settings are always selectable, even with no entries yet.
  const options = new Map<string, MatchConfigDto>([[configKey(currentOptions), currentOptions]]);
  for (const summary of configs.data?.configs ?? [])
    options.set(configKey(summary.config), summary.config);

  return (
    <div className="log-tab">
      <div className="log-toolbar">
        <label htmlFor={selectId}>Battle settings</label>
        <select
          id={selectId}
          value={configKey(config)}
          onChange={(event) => {
            const next = options.get(event.target.value);
            if (next) {
              setConfig(next);
              setPage(1);
            }
          }}
        >
          {[...options.entries()].map(([key, value]) => (
            <option key={key} value={key}>
              {formatConfig(value)}
              {key === configKey(currentOptions) ? ' (yours)' : ''}
            </option>
          ))}
        </select>
      </div>

      <QueryState
        what="ranking"
        isPending={ranking.isPending}
        isFetching={ranking.isFetching}
        error={ranking.error}
        hasData={!!data}
        onRetry={() => void ranking.refetch()}
      />

      {data && data.items.length === 0 && (
        <p className="log-state">No battles recorded with these settings yet. Be the first!</p>
      )}

      {data && data.items.length > 0 && (
        <>
          <table className="log-table" aria-busy={ranking.isFetching} data-testid="ranking-table">
            <caption className="sr-only">Ranking for {formatConfig(config)}</caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Captain</th>
                <th scope="col">Points</th>
                <th scope="col">Time</th>
                <th scope="col">Played</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((entry) => {
                const own = entry.playerId === playerId;
                const { date, time } = formatDateTime(entry.endedAt);
                return (
                  <tr key={entry.matchId} className={own ? 'is-own' : undefined}>
                    <td className="log-table__rank">{String(entry.rank).padStart(2, '0')}</td>
                    <td>
                      {entry.playerName}
                      {own && <span className="badge">You</span>}
                    </td>
                    <td className="log-table__points">{entry.score}</td>
                    <td>{formatTime(entry.durationMs)}</td>
                    <td className="log-table__date">
                      {date} · {time}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination
            label="Ranking"
            page={data.page}
            totalPages={data.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
