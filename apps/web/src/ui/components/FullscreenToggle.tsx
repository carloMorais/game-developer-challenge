import { useEffect, useState } from 'react';
import { audio } from '../../game/audio/AudioManager';
import {
  canFullscreen,
  enterFullscreen,
  exitFullscreen,
  isFullscreen,
  onFullscreenChange,
} from '../../lib/fullscreen';

/** Enter/exit fullscreen; hidden where the browser cannot go fullscreen (iPhone). */
export function FullscreenToggle({
  size = 52,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const [supported] = useState(() => canFullscreen());
  const [active, setActive] = useState(isFullscreen);

  // Follows every change, including the system back gesture leaving fullscreen.
  useEffect(() => onFullscreenChange(() => setActive(isFullscreen())), []);

  if (!supported) return null;
  const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
  const icon = Math.round(size * 0.52);
  return (
    <button
      type="button"
      data-sfx
      className={`round-btn fullscreen-toggle ${className}`}
      style={{ width: size, height: size }}
      aria-label={label}
      title={label}
      data-testid="fullscreen-toggle"
      onClick={() => {
        audio.play('ui_click', { volume: 0.6 });
        void (active ? exitFullscreen() : enterFullscreen());
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width={icon}
        height={icon}
        className="mute-toggle__icon"
      >
        <path
          d={
            active
              ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
              : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'
          }
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </button>
  );
}
