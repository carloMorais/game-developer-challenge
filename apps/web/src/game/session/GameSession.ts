import { Application, type Ticker } from 'pixi.js';
import {
  FixedStepLoop,
  applyCommand,
  createWorld,
  drainEvents,
  getHudSnapshot,
  stepWorld,
  type EndReason,
  type GameConfig,
  type GameEvent,
  type HudSnapshot,
  type World,
} from '@pirate/game-core';
import type { GameAssets } from '../assets/loadGameAssets';
import { InputState, type GameAction } from '../input/InputState';
import { attachKeyboard } from '../input/keyboard';
import { WorldView } from '../render/WorldView';
import { NO_INSETS, type Insets } from '../render/viewport';

export type PauseReason = 'manual' | 'hidden' | 'blur' | 'orientation';

export interface MatchOutcome {
  score: number;
  elapsedMs: number;
  endReason: EndReason;
  seed: number;
  config: Readonly<GameConfig>;
}

export interface SessionCallbacks {
  /** Throttled HUD updates (never per frame). */
  onHud?(hud: HudSnapshot): void;
  onPauseChange?(paused: boolean, reason: PauseReason | null): void;
  /** Raw simulation events, once per frame batch (audio, analytics). */
  onEvents?(events: readonly GameEvent[]): void;
  onEnd?(outcome: MatchOutcome): void;
  /** Every rendered frame, after the view syncs (keep it cheap). */
  onFrame?(): void;
}

export interface GameSessionOptions {
  config: Readonly<GameConfig>;
  seed: number;
  assets: GameAssets;
  ownerId?: string;
  /**
   * 'realtime' advances with the display; 'manual' only advances through
   * {@link GameSession.advance} (deterministic tests).
   */
  clock?: 'realtime' | 'manual';
}

const HUD_INTERVAL_MS = 100;
const MAX_RESOLUTION = 2;

/**
 * One match: owns the world, the PixiJS application, input capture and the
 * frame loop. React creates one per match and calls `destroy()` on unmount;
 * `mount()` tolerates being destroyed mid-initialisation (React Strict Mode).
 */
export class GameSession {
  readonly world: World;
  readonly input = new InputState();
  private readonly loop = new FixedStepLoop();
  private readonly clock: 'realtime' | 'manual';
  private app: Application | null = null;
  private view: WorldView | null = null;
  private detachKeyboard: (() => void) | null = null;
  private readonly cleanups: (() => void)[] = [];
  private destroyed = false;
  private paused = false;
  private pauseReason: PauseReason | null = null;
  private ended = false;
  private alpha = 0;
  /** Render clock for effects: advances only while the match is live or finishing. */
  private renderTime = 0;
  private lastHudAt = -Infinity;
  private lastHud: HudSnapshot | null = null;
  /** Running totals derived from simulation events (tests, profiling). */
  readonly stats = {
    shots: { front: 0, port: 0, starboard: 0 },
    kills: 0,
    spawned: { chaser: 0, shooter: 0 },
    playerHits: 0,
  };
  private insets: Insets = NO_INSETS;
  private relayout: (() => void) | null = null;

  constructor(
    private readonly options: GameSessionOptions,
    private readonly callbacks: SessionCallbacks = {},
  ) {
    this.clock = options.clock ?? 'realtime';
    this.world = createWorld({
      config: options.config,
      seed: options.seed,
      ownerId: options.ownerId ?? 'local',
    });
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  /** Display objects currently alive (ships, projectiles, effects). */
  get renderedEntities(): number {
    return this.view?.entityCount ?? 0;
  }

  async mount(container: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: container,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, MAX_RESOLUTION),
      background: 0x1d6fa5,
      preference: 'webgl',
    });
    if (this.destroyed) {
      app.destroy({ removeView: true }, { children: true });
      return;
    }

    this.app = app;
    app.canvas.setAttribute('aria-hidden', 'true');
    app.canvas.dataset.testid = 'game-canvas';
    container.appendChild(app.canvas);

    this.view = new WorldView(this.world, this.options.assets, app.renderer);
    app.stage.addChild(this.view.root);

    const onResize = () => {
      this.view?.resize(app.screen.width, app.screen.height, this.insets);
      this.view?.sync(this.alpha, this.renderTime);
      app.render();
    };
    this.relayout = onResize;
    app.renderer.on('resize', onResize);
    this.cleanups.push(() => app.renderer.off('resize', onResize));
    onResize();

    if (this.clock === 'realtime') {
      app.ticker.add(this.onTick);
      this.cleanups.push(() => app.ticker.remove(this.onTick));
    } else {
      // Manual clock: nothing changes between advance() calls, so don't burn
      // CPU re-rendering identical frames; advance() renders on demand.
      app.ticker.stop();
      this.flushFrame();
      app.render();
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') this.pause('hidden');
    };
    const onBlur = () => this.pause('blur');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    this.cleanups.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    });

    this.captureInput(true);
    this.publishHud(true);
  }

  pause(reason: PauseReason): void {
    if (this.paused || this.ended || this.destroyed) return;
    this.paused = true;
    this.pauseReason = reason;
    this.captureInput(false);
    this.callbacks.onPauseChange?.(true, reason);
  }

  /** Resuming requires an explicit player action; time spent paused is discarded. */
  resume(): void {
    if (!this.paused || this.ended || this.destroyed) return;
    this.paused = false;
    this.pauseReason = null;
    this.loop.reset();
    this.input.clear();
    this.captureInput(true);
    this.callbacks.onPauseChange?.(false, null);
  }

  get currentPauseReason(): PauseReason | null {
    return this.pauseReason;
  }

  /** Reserves screen space around the arena (e.g. for touch controls). */
  setInsets(insets: Insets): void {
    this.insets = insets;
    this.relayout?.();
  }

  /** Touch controls feed input here; ignored unless gameplay is active. */
  setTouchAction(action: GameAction, down: boolean): void {
    if (down && (this.paused || this.ended || this.destroyed)) return;
    if (down) this.input.press('touch', action);
    else this.input.release('touch', action);
  }

  /** Manual clock: advances the simulation by `ms` and renders one frame. */
  advance(ms: number): void {
    if (this.destroyed || this.paused) return;
    const steps = Math.round(ms / this.loop.stepMs);
    for (let i = 0; i < steps && !this.ended; i++) this.step(this.loop.stepMs);
    this.renderTime += ms;
    this.alpha = 0;
    this.flushFrame();
    this.app?.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.captureInput(false);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.relayout = null;
    this.view?.destroy();
    this.view = null;
    // Keep cached atlas textures alive for the next match.
    this.app?.destroy({ removeView: true }, { children: true });
    this.app = null;
  }

  private readonly onTick = (ticker: Ticker): void => {
    if (this.clock === 'realtime' && !this.paused) {
      if (!this.ended) {
        this.alpha = this.loop.advance(ticker.deltaMS, (dt) => this.step(dt));
      }
      this.renderTime += Math.min(ticker.deltaMS, 100);
    }
    this.flushFrame();
  };

  private step(dtMs: number): void {
    applyCommand(this.world, {
      tick: this.world.tick + 1,
      shipId: this.world.playerId,
      intents: this.input.toIntents(),
    });
    stepWorld(this.world, dtMs);
  }

  /** Forwards events, syncs the view and publishes HUD/end state. */
  private flushFrame(): void {
    const events = drainEvents(this.world);
    if (events.length > 0) {
      this.tally(events);
      this.view?.handleEvents(events, this.renderTime);
      this.callbacks.onEvents?.(events);
    }
    this.view?.sync(this.alpha, this.renderTime);
    this.callbacks.onFrame?.();

    const justEnded = !this.ended && this.world.status === 'ended';
    if (justEnded) {
      this.ended = true;
      this.captureInput(false);
      this.input.clear();
    }
    this.publishHud(justEnded || events.some(isHudEvent));

    if (justEnded && this.world.endReason) {
      this.callbacks.onEnd?.({
        score: this.world.score,
        elapsedMs: this.world.elapsedMs,
        endReason: this.world.endReason,
        seed: this.world.seed,
        config: this.world.config,
      });
    }
  }

  private tally(events: readonly GameEvent[]): void {
    const playerId = this.world.playerId;
    for (const event of events) {
      if (event.type === 'shotFired' && event.shipId === playerId) this.stats.shots[event.slot]++;
      else if (event.type === 'shipDestroyed' && event.byTeam === 'player') this.stats.kills++;
      else if (event.type === 'shipSpawned' && event.kind !== 'player')
        this.stats.spawned[event.kind]++;
      else if (event.type === 'shipDamaged' && event.shipId === playerId) this.stats.playerHits++;
    }
  }

  private publishHud(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastHudAt < HUD_INTERVAL_MS) return;
    const hud = getHudSnapshot(this.world);
    const last = this.lastHud;
    // Skip identical snapshots (e.g. while paused) to avoid React renders.
    if (
      last &&
      last.hp === hud.hp &&
      last.score === hud.score &&
      last.status === hud.status &&
      last.enemiesAlive === hud.enemiesAlive &&
      Math.floor(last.remainingMs / 100) === Math.floor(hud.remainingMs / 100)
    ) {
      return;
    }
    this.lastHudAt = now;
    this.lastHud = hud;
    this.callbacks.onHud?.(hud);
  }

  private captureInput(active: boolean): void {
    if (active && !this.detachKeyboard && !this.destroyed && !this.ended) {
      this.detachKeyboard = attachKeyboard(this.input);
    } else if (!active && this.detachKeyboard) {
      this.detachKeyboard();
      this.detachKeyboard = null;
      this.input.clear();
    }
  }
}

function isHudEvent(event: GameEvent): boolean {
  return (
    event.type === 'scoreChanged' ||
    event.type === 'shipDamaged' ||
    event.type === 'shipDestroyed' ||
    event.type === 'matchEnded'
  );
}
