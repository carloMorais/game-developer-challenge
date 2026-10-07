import { Container, Rectangle, Sprite, Texture, type Spritesheet } from 'pixi.js';
import { HEALTH_BAR } from './theme';

/**
 * Health bar drawn above a ship using the UI atlas frame + fill. The fill is a
 * sub-texture clipped to the remaining health (atlas metadata: clip x from left),
 * rebuilt only when health changes.
 */
export class HealthBar extends Container {
  private readonly fill: Sprite;
  private readonly fillSource: Texture;
  private ratio = -1;

  constructor(ui: Spritesheet, isPlayer: boolean) {
    super();
    const frame = new Sprite(ui.textures[HEALTH_BAR.frame]!);
    this.fillSource = ui.textures[isPlayer ? HEALTH_BAR.playerFill : HEALTH_BAR.enemyFill]!;
    this.fill = new Sprite();
    this.addChild(frame, this.fill);
    this.scale.set(HEALTH_BAR.scale);
    this.pivot.set(frame.width / 2, frame.height / 2);
  }

  setRatio(ratio: number): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    if (Math.abs(clamped - this.ratio) < 0.005) return;
    this.ratio = clamped;

    const source = this.fillSource;
    const { fillRect } = HEALTH_BAR;
    const width = fillRect.x + fillRect.w * clamped;
    const previous = this.fill.texture;
    this.fill.texture =
      clamped <= 0
        ? Texture.EMPTY
        : new Texture({
            source: source.source,
            frame: new Rectangle(source.frame.x, source.frame.y, width, source.frame.height),
          });
    if (previous !== Texture.EMPTY && previous !== source) previous.destroy(false);
  }

  override destroy(): void {
    const texture = this.fill.texture;
    super.destroy({ children: true });
    if (texture !== Texture.EMPTY) texture.destroy(false);
  }
}
