/**
 * Short procedural sounds built from oscillators and noise, for cues the asset
 * pack has no file for (countdown, reloads, grade stamp...). Each recipe
 * schedules its nodes on `out` starting at `t` and disconnects after itself.
 */
export const SYNTHS = [
  'countdown_tick',
  'countdown_final',
  'reload_port',
  'reload_starboard',
  'reload_bow',
  'fanfare',
  'sink_sting',
  'grade_stamp',
  'unlock',
] as const;

export type SynthName = (typeof SYNTHS)[number];

type Recipe = (ctx: BaseAudioContext, out: AudioNode, t: number, noise: AudioBuffer) => number;

/** One enveloped oscillator note; returns its end time. */
function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  {
    type = 'sine',
    from,
    to = from,
    start,
    duration,
    peak = 0.5,
    attack = 0.005,
  }: {
    type?: OscillatorType;
    from: number;
    to?: number;
    start: number;
    duration: number;
    peak?: number;
    attack?: number;
  },
): number {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  return start + duration;
}

/** A filtered noise burst (wood knocks, thuds). */
function knock(
  ctx: BaseAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  {
    start,
    duration,
    frequency,
    q = 4,
    peak = 0.6,
  }: {
    start: number;
    duration: number;
    frequency: number;
    q?: number;
    peak?: number;
  },
): number {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(gain).connect(out);
  src.start(start);
  src.stop(start + duration + 0.02);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  return start + duration;
}

/** Notes in Hz. */
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const B5 = 987.77;
const C6 = 1046.5;
const E6 = 1318.5;
const G6 = 1567.98;

const RECIPES: Record<SynthName, Recipe> = {
  // A clock "tock": a wooden knock under a short bright tone, clear over the battle.
  countdown_tick: (ctx, out, t, noise) => {
    knock(ctx, out, noise, { start: t, duration: 0.05, frequency: 1500, peak: 0.6 });
    return tone(ctx, out, { type: 'triangle', from: 988, start: t, duration: 0.12, peak: 0.5 });
  },

  countdown_final: (ctx, out, t) => {
    tone(ctx, out, { type: 'triangle', from: 1320, start: t, duration: 0.14, peak: 0.45 });
    return tone(ctx, out, { type: 'sine', from: 660, start: t, duration: 0.16, peak: 0.25 });
  },

  // Port and starboard differ in pitch as well as in stereo side.
  reload_port: (ctx, out, t, noise) => {
    knock(ctx, out, noise, { start: t, duration: 0.05, frequency: 1100, peak: 0.7 });
    return tone(ctx, out, { from: 190, to: 140, start: t, duration: 0.09, peak: 0.45 });
  },

  reload_starboard: (ctx, out, t, noise) => {
    knock(ctx, out, noise, { start: t, duration: 0.05, frequency: 1900, peak: 0.7 });
    return tone(ctx, out, { from: 290, to: 220, start: t, duration: 0.09, peak: 0.45 });
  },

  reload_bow: (ctx, out, t) =>
    tone(ctx, out, {
      type: 'triangle',
      from: 2400,
      to: 2000,
      start: t,
      duration: 0.04,
      peak: 0.18,
    }),

  fanfare: (ctx, out, t) => {
    const notes = [C5, E5, G5];
    notes.forEach((f, i) =>
      tone(ctx, out, { type: 'triangle', from: f, start: t + i * 0.11, duration: 0.16, peak: 0.4 }),
    );
    tone(ctx, out, { type: 'triangle', from: C6, start: t + 0.33, duration: 0.6, peak: 0.45 });
    return tone(ctx, out, { type: 'sine', from: G5, start: t + 0.33, duration: 0.6, peak: 0.25 });
  },

  sink_sting: (ctx, out, t) => {
    tone(ctx, out, { type: 'triangle', from: 392, to: 98, start: t, duration: 0.9, peak: 0.4 });
    return tone(ctx, out, {
      type: 'sine',
      from: 196,
      to: 55,
      start: t + 0.1,
      duration: 1,
      peak: 0.35,
    });
  },

  grade_stamp: (ctx, out, t, noise) => {
    knock(ctx, out, noise, { start: t, duration: 0.12, frequency: 400, q: 1, peak: 0.9 });
    return tone(ctx, out, { from: 150, to: 55, start: t, duration: 0.22, peak: 0.7 });
  },

  unlock: (ctx, out, t) => {
    [G5, B5, E6, G6].forEach((f, i) =>
      tone(ctx, out, { type: 'triangle', from: f, start: t + i * 0.07, duration: 0.25, peak: 0.3 }),
    );
    return t + 0.5;
  },
};

let noiseBuffer: AudioBuffer | null = null;

function whiteNoise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/** Schedules `name` into `out` now. */
export function playSynth(ctx: BaseAudioContext, out: AudioNode, name: SynthName): void {
  RECIPES[name](ctx, out, ctx.currentTime + 0.005, whiteNoise(ctx));
}
