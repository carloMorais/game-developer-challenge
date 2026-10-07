import { TIME_EPSILON } from './math';
import { STEP_MS } from './simulation';

/**
 * Fixed-timestep accumulator. Feed it real elapsed time; it calls `step` a whole
 * number of times so simulation results are independent of the frame rate.
 */
export class FixedStepLoop {
  private accumulator = 0;

  constructor(
    readonly stepMs: number = STEP_MS,
    /** Caps catch-up after a long frame (tab hitch) to avoid a spiral of death. */
    readonly maxFrameMs: number = 250,
  ) {}

  /** Returns the interpolation factor (0..1) between the last two steps. */
  advance(frameMs: number, step: (dtMs: number) => void): number {
    this.accumulator += Math.min(Math.max(frameMs, 0), this.maxFrameMs);
    while (this.accumulator >= this.stepMs - TIME_EPSILON) {
      step(this.stepMs);
      this.accumulator -= this.stepMs;
    }
    return Math.max(0, this.accumulator) / this.stepMs;
  }

  /** Drops leftover time, e.g. on resume so paused time is never simulated. */
  reset(): void {
    this.accumulator = 0;
  }
}
