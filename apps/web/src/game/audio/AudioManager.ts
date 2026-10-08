import { playSynth, type SynthName } from './synth';

export const SOUNDS = [
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
  'ui_back',
  'ui_click',
  'ui_close',
  'ui_hover',
  'ui_open',
] as const;

export type SoundName = (typeof SOUNDS)[number];

export const UI_SOUNDS: readonly SoundName[] = [
  'ui_click',
  'ui_back',
  'ui_open',
  'ui_close',
  'ui_hover',
];

export interface LoopHandle {
  setVolume(volume: number): void;
  stop(): void;
}

/** Same sound retriggered faster than this is dropped (avoids volume spikes). */
const MIN_RETRIGGER_MS = 45;
/** Longer than the longest synth recipe. */
const SYNTH_RELEASE_MS = 2000;

/**
 * Small Web Audio wrapper. Sound is optional: if the context or a file fails,
 * playback calls simply do nothing and the game keeps running.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly pending = new Map<SoundName, Promise<void>>();
  private readonly lastPlayed = new Map<SoundName, number>();
  private muted = false;

  /** Call from a user gesture: browsers only allow audio after one. */
  unlock(): void {
    const ctx = this.context();
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
  }

  /** Fetches and decodes sounds; failures are reported and otherwise ignored. */
  async preload(names: readonly SoundName[]): Promise<void> {
    await Promise.all(names.map((name) => this.load(name)));
  }

  play(
    name: SoundName,
    { volume = 1, detune = 0 }: { volume?: number; detune?: number } = {},
  ): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !this.master || !buffer || ctx.state !== 'running') return;

    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < MIN_RETRIGGER_MS) return;
    this.lastPlayed.set(name, now);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.detune.value = detune;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.master);
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }

  /** Plays a procedural cue; `pan` is -1 (left) .. 1 (right). */
  synth(name: SynthName, { volume = 1, pan = 0 }: { volume?: number; pan?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running' || this.muted) return;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    let panner: StereoPannerNode | null = null;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner).connect(this.master);
    } else {
      gain.connect(this.master);
    }
    playSynth(ctx, gain, name);
    // Recipes stop their own nodes; release the shared chain once they are done.
    window.setTimeout(() => {
      gain.disconnect();
      panner?.disconnect();
    }, SYNTH_RELEASE_MS);
  }

  loop(name: SoundName, volume: number): LoopHandle {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !this.master || !buffer)
      return { setVolume: () => undefined, stop: () => undefined };

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.3);
    source.connect(gain).connect(this.master);
    source.start();

    let stopped = false;
    return {
      setVolume: (v) => {
        if (!stopped) gain.gain.setTargetAtTime(v, ctx.currentTime, 0.15);
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        source.stop(ctx.currentTime + 0.4);
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
        };
      },
    };
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = typeof window !== 'undefined' ? window.AudioContext : undefined;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private load(name: SoundName): Promise<void> {
    if (this.buffers.has(name)) return Promise.resolve();
    const existing = this.pending.get(name);
    if (existing) return existing;

    const ctx = this.context();
    if (!ctx) return Promise.resolve();
    const promise = fetch(`${import.meta.env.BASE_URL}game/sounds/${name}.wav`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(name, buffer);
      })
      .catch((error: unknown) => {
        console.warn(`Sound "${name}" unavailable`, error);
      })
      .finally(() => this.pending.delete(name));
    this.pending.set(name, promise);
    return promise;
  }
}

export const audio = new AudioManager();
