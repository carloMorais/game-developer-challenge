import { registerMatch, useRegistration } from '../../data/registration';
import { toRecordInput, type MatchResult } from '../../store/resultStore';
import { GameButton } from '../components/GameButton';

/** Whether the finished match made it to the ranking, with a manual retry. */
export function RegistrationStatus({ result }: { result: MatchResult }) {
  const { status, error } = useRegistration(result.matchId);

  let message: string;
  switch (status) {
    case 'recorded':
      message = 'Battle recorded in the ranking and match history.';
      break;
    case 'sending':
      message = 'Recording your battle…';
      break;
    case 'failed':
      message = `Not recorded yet: ${error ?? 'the server is unreachable'}. It is saved on this device and will retry.`;
      break;
    case 'pending':
      message = 'Waiting to record your battle…';
      break;
    default:
      message = 'Saved on this device.';
  }

  return (
    <div className="registration" data-testid="result-registration" data-status={status ?? 'local'}>
      <p role="status">{message}</p>
      {(status === 'failed' || status === 'pending') && (
        <GameButton
          size="small"
          variant="secondary"
          onClick={() => void registerMatch(toRecordInput(result))}
        >
          Retry now
        </GameButton>
      )}
    </div>
  );
}
