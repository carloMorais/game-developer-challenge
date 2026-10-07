import { useAnnouncer } from './announcer';

/** Single polite live region; discrete announcements only (never per frame). */
export function LiveRegion() {
  const { message, nonce } = useAnnouncer();
  return (
    <div
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="live-region"
    >
      {/* A zero-width suffix flips so identical consecutive messages re-announce. */}
      {message}
      {nonce % 2 === 0 ? '' : '​'}
    </div>
  );
}
