import { getPlayer, type GameEvent, type World } from '@pirate/game-core';
import { audio, type LoopHandle, type SoundName } from './AudioManager';

export const GAME_SOUNDS: readonly SoundName[] = [
  'cannonball_water_hit_1',
  'cannonball_water_hit_2',
  'cannon_broadside',
  'cannon_fire_1',
  'cannon_fire_2',
  'cannon_fire_3',
  'game_complete',
  'game_over',
  'game_pause',
  'game_resume',
  'game_start',
  'health_low',
  'ocean_ambience_loop',
  'score_point',
  'ship_collision',
  'ship_explosion_1',
  'ship_explosion_2',
  'ship_sailing_loop',
  'ship_sinking',
  'ship_wood_hit_1',
  'ship_wood_hit_2',
  'time_warning',
];

const LOW_HEALTH_RATIO = 0.3;
const TIME_WARNING_MS = 10_000;

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;
const detune = () => (Math.random() - 0.5) * 160;

/**
 * Maps simulation events and match state to sound. Purely a listener: it reads
 * the world and never changes it.
 */
export class GameAudio {
  private ambience: LoopHandle | null = null;
  private sailing: LoopHandle | null = null;
  private lowHealthPlayed = false;
  private timeWarningPlayed = false;

  constructor(private readonly world: World) {}

  start(): void {
    audio.play('game_start', { volume: 0.7 });
    this.startLoops();
  }

  handle(events: readonly GameEvent[]): void {
    const playerId = this.world.playerId;
    for (const event of events) {
      switch (event.type) {
        case 'shotFired': {
          const own = event.shipId === playerId;
          if (event.slot === 'front') {
            audio.play(pick(['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3'] as const), {
              volume: own ? 0.55 : 0.3,
              detune: detune(),
            });
          } else {
            audio.play('cannon_broadside', { volume: 0.65, detune: detune() });
          }
          break;
        }
        case 'shipDamaged':
          audio.play(pick(['ship_wood_hit_1', 'ship_wood_hit_2'] as const), {
            volume: event.shipId === playerId ? 0.7 : 0.45,
            detune: detune(),
          });
          break;
        case 'shipDestroyed':
          if (event.cause === 'impact') audio.play('ship_collision', { volume: 0.8 });
          audio.play(pick(['ship_explosion_1', 'ship_explosion_2'] as const), {
            volume: event.shipId === playerId ? 0.9 : 0.6,
            detune: detune(),
          });
          audio.play('ship_sinking', { volume: 0.35 });
          break;
        case 'projectileEnded':
          if (event.cause === 'expired' || event.cause === 'outOfBounds') {
            audio.play(pick(['cannonball_water_hit_1', 'cannonball_water_hit_2'] as const), {
              volume: 0.2,
              detune: detune(),
            });
          }
          break;
        case 'scoreChanged':
          audio.play('score_point', { volume: 0.5 });
          break;
        case 'matchEnded':
          this.stopLoops();
          audio.play(event.reason === 'timeUp' ? 'game_complete' : 'game_over', { volume: 0.8 });
          break;
        default:
          break;
      }
    }
  }

  /** Called every frame: keeps the sailing loop in step with the player's speed. */
  update(): void {
    const player = getPlayer(this.world);
    const maxSpeed = this.world.config.player.movement.maxSpeed;
    this.sailing?.setVolume(player ? (player.speed / maxSpeed) * 0.35 : 0);
    this.checkThresholds();
  }

  pause(): void {
    this.stopLoops();
    audio.play('game_pause', { volume: 0.6 });
  }

  resume(): void {
    audio.play('game_resume', { volume: 0.6 });
    this.startLoops();
  }

  dispose(): void {
    this.stopLoops();
  }

  private checkThresholds(): void {
    const player = getPlayer(this.world);
    if (player && !this.lowHealthPlayed && player.hp / player.maxHp <= LOW_HEALTH_RATIO) {
      this.lowHealthPlayed = true;
      audio.play('health_low', { volume: 0.7 });
    }
    const remaining = this.world.config.match.duration * 1000 - this.world.elapsedMs;
    if (
      !this.timeWarningPlayed &&
      this.world.status === 'running' &&
      remaining <= TIME_WARNING_MS
    ) {
      this.timeWarningPlayed = true;
      audio.play('time_warning', { volume: 0.7 });
    }
  }

  private startLoops(): void {
    if (this.world.status !== 'running') return;
    this.ambience ??= audio.loop('ocean_ambience_loop', 0.25);
    this.sailing ??= audio.loop('ship_sailing_loop', 0);
  }

  private stopLoops(): void {
    this.ambience?.stop();
    this.sailing?.stop();
    this.ambience = null;
    this.sailing = null;
  }
}
