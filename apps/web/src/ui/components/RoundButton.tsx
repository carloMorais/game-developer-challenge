import type { ButtonHTMLAttributes } from 'react';
import { audio } from '../../game/audio/AudioManager';
import { UiSprite } from './UiSprite';
import type { UiFrame } from './uiSpriteStyle';

interface RoundButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: UiFrame;
  label: string;
  size?: number;
}

/** Round icon button (pack's `button_round_*`); `label` is its accessible name. */
export function RoundButton({
  icon,
  label,
  size = 52,
  className = '',
  onClick,
  ...rest
}: RoundButtonProps) {
  return (
    <button
      type="button"
      data-sfx
      className={`round-btn ${className}`}
      style={{ width: size, height: size }}
      aria-label={label}
      title={label}
      onClick={(event) => {
        audio.play('ui_click', { volume: 0.6 });
        onClick?.(event);
      }}
      {...rest}
    >
      <UiSprite name={icon} width={Math.round(size * 0.5)} />
    </button>
  );
}
