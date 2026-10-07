import { uiSpriteStyle, type UiFrame } from './uiSpriteStyle';

interface UiSpriteProps {
  name: UiFrame;
  width?: number;
  className?: string;
}

/** Decorative sprite from the UI atlas; hidden from assistive technology. */
export function UiSprite({ name, width, className }: UiSpriteProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ display: 'inline-block', ...uiSpriteStyle(name, width) }}
    />
  );
}
