import { useState } from 'react';
import { useHistoryQuery } from '../../data/queries';
import { flushPendingMatches, useRegistrationStore } from '../../data/registration';
import { useSettingsStore } from '../../store/settingsStore';
import { GameButton } from '../components/GameButton';
import { END_REASON_LABEL, formatDateTime, formatTime } from '../format';
import { Pagination } from './Pagination';
import { QueryState } from './QueryState';

/** The player's own recorded battles, plus any still waiting to be recorded. */
export function HistoryTab() {
  const playerId = useSettingsStore((s) => s.playerId);
  const playerName = useSettingsStore((s) => s.playerName);
  const [page, setPage] = useState(1);
  const history = useHistoryQuery(playerId, page);
  const pending = useRegistrationStore((s) => s.pending);
  const sending = useRegistrationStore((s) => s.sending);
  const data = history.data;
  const ownPending = pending.filter((p) => p.input.playerId === playerId);

  return (
    <div className="log-tab">
      <p className="log-subtitle">{playerName} · your recent battles</p>

      {ownPending.length > 0 && (
        <div className="pending-box" data-testid="pending-box">
          <p>
            {ownPending.length === 1
              ? '1 battle is waiting to be recorded.'
              : `${ownPending.length} battles are waiting to be recorded.`}{' '}
            It is saved on this device and will be sent automatically.
          </p>
          <GameButton
            size="small"
            variant="secondary"
            disabled={ownPending.every((p) => sending.includes(p.input.matchId))}
            onClick={() => void flushPendingMatches()}
          >
            Retry now
          </GameButton>
        </div>
      )}

      <QueryState
        what="match history"
        isPending={history.isPending}
        isFetching={history.isFetching}
        error={history.error}
        hasData={!!data}
        onRetry={() => void history.refetch()}
      />

      {data && data.items.length === 0 && (
        <p className="log-state">No battles recorded yet. Set sail and make history!</p>
      )}

      {data && data.items.length > 0 && (
        <>
          <table className="log-table" aria-busy={history.isFetching} data-testid="history-table">
            <caption className="sr-only">Your match history</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Points</th>
                <th scope="col">Duration</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((match) => {
                const { date, time } = formatDateTime(match.endedAt);
                return (
                  <tr key={match.matchId}>
                    <td className="log-table__date">
                      <strong>{date}</strong> · {time}
                    </td>
                    <td className="log-table__points">{match.score}</td>
                    <td>{formatTime(match.durationMs)}</td>
                    <td className={`log-table__reason log-table__reason--${match.endReason}`}>
                      {END_REASON_LABEL[match.endReason]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination
            label="Match history"
            page={data.page}
            totalPages={data.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
