/**
 * Final seconds: a big pulsing number and a red vignette that tightens as time
 * runs out. Purely visual; the HUD timer stays the accessible source of time.
 */
export function Countdown({ second, paused }: { second: number; paused: boolean }) {
  const urgency = second <= 3 ? 'high' : second <= 6 ? 'mid' : 'low';
  return (
    <div
      className={`countdown countdown--${urgency} ${paused ? 'is-paused' : ''}`}
      aria-hidden="true"
      data-testid="countdown"
    >
      <div className="countdown__vignette" />
      {/* Re-keyed every second so the pulse animation restarts. */}
      <span key={second} className="countdown__number">
        {second}
      </span>
    </div>
  );
}
