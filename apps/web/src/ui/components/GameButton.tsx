import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { audio, type SoundName } from '../../game/audio/AudioManager';

interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  size?: 'large' | 'small';
  /** Sound played on click; `null` for silent buttons. */
  sound?: SoundName | null;
}

/** Menu button skinned with the pack's button art. */
export const GameButton = forwardRef<HTMLButtonElement, GameButtonProps>(function GameButton(
  {
    variant = 'primary',
    size = 'large',
    sound = 'ui_click',
    className = '',
    onClick,
    type,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type === 'submit' ? 'submit' : 'button'}
      data-sfx
      className={`game-btn game-btn--${variant} game-btn--${size} ${className}`}
      onClick={(event) => {
        if (sound) audio.play(sound, { volume: 0.6 });
        onClick?.(event);
      }}
      {...rest}
    />
  );
});
