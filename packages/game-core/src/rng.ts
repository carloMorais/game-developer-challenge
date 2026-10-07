/**
 * Mulberry32: small, fast, seedable PRNG with a single 32-bit state.
 *
 * The state is a plain number so it can live inside the (serializable) world
 * and be snapshotted, replayed or sent over the network.
 */
export function rngNext(state: number): [value: number, nextState: number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Current internal state. */
  readonly state: number;
}

/** Convenience wrapper over {@link rngNext} for code that owns its own state. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    const [value, nextState] = rngNext(state);
    state = nextState;
    return value;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    get state() {
      return state;
    },
  };
}
