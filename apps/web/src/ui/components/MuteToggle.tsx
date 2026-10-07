import { useSettingsStore } from '../../store/settingsStore';

/** Sound on/off, persisted with the other settings. */
export function MuteToggle({ className = '' }: { className?: string }) {
  const muted = useSettingsStore((s) => s.muted);
  const setMuted = useSettingsStore((s) => s.setMuted);
  return (
    <button
      type="button"
      className={`round-btn mute-toggle ${className}`}
      aria-pressed={!muted}
      aria-label="Sound"
      title={muted ? 'Sound off' : 'Sound on'}
      onClick={() => setMuted(!muted)}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="28"
        height="28"
        className="mute-toggle__icon"
      >
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {muted ? (
          <path
            d="M16 9l5 6M21 9l-5 6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        )}
      </svg>
    </button>
  );
}
