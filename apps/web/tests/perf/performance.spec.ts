import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type CDPSession, type Page, type TestInfo } from '@playwright/test';
import { openApp, startMatch } from '../e2e/support/app';

/**
 * Profiling runs (`pnpm perf`), not regression tests: they play real-time
 * matches in the production build and write their measurements to
 * `docs/reports/performance/`. Assertions only guard against broken runs and
 * gross regressions.
 *
 * The ship is steered by a small in-page autopilot that dispatches the same
 * keyboard events a player would. `?sturdy=1` gives the player a huge HP pool
 * (config only) so every run lasts the full three minutes.
 */

const MATCH_SECONDS = 180;
const CYCLES = Number(process.env.PERF_CYCLES) || 5;
const CYCLE_PLAY_MS = 30_000;

/**
 * - `hunter`: aims at the nearest enemy and fires whatever bears (a player).
 * - `spray`: circles and holds every trigger, sinking few enemies, so the
 *   arena fills up (worst case for entity count).
 */
type BotMode = 'hunter' | 'spray';

interface Sample {
  t: number;
  enemies: number;
  projectiles: number;
  rendered: number;
}

interface PerfWindow {
  __perfProbe?: {
    frames: number[];
    samples: Sample[];
    longTasks: number[];
    stop(): void;
  };
  __pirate?: { state(): BotState };
}

interface BotState {
  status: string;
  paused: boolean;
  player: { x: number; y: number; angle: number } | null;
  enemies: { x: number; y: number }[];
  projectiles: unknown[];
  renderedEntities: number;
}

/** Installs the frame/entity probe and the autopilot in the page. */
function installProbe(page: Page, mode: BotMode): Promise<void> {
  return page.evaluate((botMode) => {
    const w = window as unknown as PerfWindow;
    const frames: number[] = [];
    const samples: Sample[] = [];
    const longTasks: number[] = [];
    const start = performance.now();
    let last = start;
    let running = true;

    const frame = (now: number) => {
      if (!running) return;
      frames.push(now - last);
      last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame((now) => {
      last = now;
      requestAnimationFrame(frame);
    });

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    try {
      observer.observe({ type: 'longtask', buffered: false });
    } catch {
      // Long task timing unsupported: the report shows none.
    }

    const sampler = window.setInterval(() => {
      const s = w.__pirate?.state();
      if (!s || s.status !== 'running') return;
      samples.push({
        t: Math.round(performance.now() - start),
        enemies: s.enemies.length,
        projectiles: s.projectiles.length,
        rendered: s.renderedEntities,
      });
    }, 1000);

    // Autopilot: real keyboard events on window, like a player's.
    const held = new Map<string, boolean>();
    const key = (code: string, down: boolean) => {
      if ((held.get(code) ?? false) === down) return;
      held.set(code, down);
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    };
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const bot = window.setInterval(() => {
      const s = w.__pirate?.state();
      const p = s?.player;
      if (!s || !p || s.status !== 'running' || s.paused) {
        for (const code of held.keys()) key(code, false);
        return;
      }
      if (botMode === 'spray') {
        for (const code of ['KeyW', 'KeyD', 'Space', 'KeyQ', 'KeyE']) key(code, true);
        return;
      }
      let target: { delta: number; dist: number } | null = null;
      let port = false;
      let starboard = false;
      for (const e of s.enemies) {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        const delta = wrap(Math.atan2(e.y - p.y, e.x - p.x) - p.angle);
        if (!target || dist < target.dist) target = { delta, dist };
        if (dist < 330 && Math.abs(delta + Math.PI / 2) < 0.45) port = true;
        if (dist < 330 && Math.abs(delta - Math.PI / 2) < 0.45) starboard = true;
      }
      if (!target) {
        key('KeyW', true);
        key('KeyA', true);
        key('KeyD', false);
        key('Space', false);
      } else {
        key('KeyD', target.delta > 0.08);
        key('KeyA', target.delta < -0.08);
        key('KeyW', target.dist > 220);
        key('Space', Math.abs(target.delta) < 0.2 && target.dist < 470);
      }
      key('KeyQ', port);
      key('KeyE', starboard);
    }, 50);

    w.__perfProbe = {
      frames,
      samples,
      longTasks,
      stop: () => {
        running = false;
        observer.disconnect();
        window.clearInterval(sampler);
        window.clearInterval(bot);
        for (const code of held.keys()) key(code, false);
      },
    };
  }, mode);
}

async function collectProbe(page: Page) {
  return page.evaluate(() => {
    const probe = (window as unknown as PerfWindow).__perfProbe!;
    probe.stop();
    return { frames: probe.frames, samples: probe.samples, longTasks: probe.longTasks };
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const toMb = (bytes: number) => round(bytes / 2 ** 20);

function frameStats(frames: number[]) {
  const sorted = [...frames].sort((a, b) => a - b);
  const total = frames.reduce((sum, f) => sum + f, 0);
  return {
    frames: frames.length,
    durationS: round(total / 1000, 1),
    avgFps: round(frames.length / (total / 1000), 1),
    frameTimeMs: {
      mean: round(total / frames.length),
      p50: round(percentile(sorted, 50)),
      p95: round(percentile(sorted, 95)),
      p99: round(percentile(sorted, 99)),
      max: round(sorted[sorted.length - 1] ?? 0),
    },
    framesOver20ms: frames.filter((f) => f > 20).length,
    framesOver33ms: frames.filter((f) => f > 33.4).length,
  };
}

/** Lowest FPS over any 1-second window (frames counted per wall-clock second). */
function worstSecondFps(frames: number[]): number {
  let worst = Infinity;
  let acc = 0;
  let count = 0;
  for (const f of frames) {
    acc += f;
    count++;
    if (acc >= 1000) {
      worst = Math.min(worst, count / (acc / 1000));
      acc = 0;
      count = 0;
    }
  }
  return round(worst === Infinity ? 0 : worst, 1);
}

async function environment(page: Page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      gpu: gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown',
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency,
    };
  });
}

function writeReport(testInfo: TestInfo, name: string, data: unknown): void {
  const dir = path.resolve(
    path.dirname(testInfo.config.configFile ?? process.cwd()),
    '../../docs/reports/performance',
  );
  mkdirSync(dir, { recursive: true });
  const json = JSON.stringify(data, null, 2);
  writeFileSync(path.join(dir, `${name}.json`), `${json}\n`);
  void testInfo.attach(`${name}.json`, { body: json, contentType: 'application/json' });
}

async function heapUsedMb(cdp: CDPSession): Promise<number> {
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return toMb(usedSize);
}

async function profileMatch(
  page: Page,
  testInfo: TestInfo,
  name: string,
  spawnInterval: number,
  mode: BotMode,
) {
  const cdp = await page.context().newCDPSession(page);
  await openApp(page, {
    clock: 'realtime',
    sturdy: true,
    settings: { sessionTime: MATCH_SECONDS, spawnInterval, muted: false },
  });
  await startMatch(page);
  await installProbe(page, mode);

  // Heap over time, from outside the page (no forced GC: steady-state usage).
  const heap: { t: number; usedMb: number }[] = [];
  const started = Date.now();
  const resultHeading = page.getByRole('heading', { name: /Battle complete|Your ship sank/ });
  while (!(await resultHeading.isVisible())) {
    heap.push({ t: Math.round((Date.now() - started) / 1000), usedMb: await heapUsedMb(cdp) });
    if (Date.now() - started > (MATCH_SECONDS + 30) * 1000) break;
    await page.waitForTimeout(5000);
  }
  await expect(resultHeading).toBeVisible();

  const probe = await collectProbe(page);
  const result = await page.evaluate(() => {
    const raw = localStorage.getItem('pirate-battle:last-result:v2');
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  });

  const samples = probe.samples;
  const max = (key: keyof Omit<Sample, 't'>) => Math.max(0, ...samples.map((s) => s[key]));
  const avg = (key: keyof Omit<Sample, 't'>) =>
    round(samples.reduce((sum, s) => sum + s[key], 0) / Math.max(1, samples.length), 1);
  const stats = frameStats(probe.frames);
  const report = {
    generatedAt: new Date().toISOString(),
    environment: await environment(page),
    config: { sessionTime: MATCH_SECONDS, spawnInterval, sound: true, autopilot: mode },
    match: result,
    frames: { ...stats, worstSecondFps: worstSecondFps(probe.frames) },
    longTasks: {
      count: probe.longTasks.length,
      maxMs: round(Math.max(0, ...probe.longTasks)),
    },
    entities: {
      enemies: { avg: avg('enemies'), max: max('enemies') },
      projectiles: { avg: avg('projectiles'), max: max('projectiles') },
      renderedDisplayObjects: { avg: avg('rendered'), max: max('rendered') },
    },
    heapUsedMb: {
      min: Math.min(...heap.map((h) => h.usedMb)),
      max: Math.max(...heap.map((h) => h.usedMb)),
      last: heap[heap.length - 1]?.usedMb ?? null,
      series: heap,
    },
    samples,
  };
  writeReport(testInfo, name, report);

  expect(result?.endReason).toBe('timeUp');
  expect(stats.durationS).toBeGreaterThan(MATCH_SECONDS);
  expect(max('enemies')).toBeGreaterThan(0);
}

test('3-minute match, default spawn interval (3 s)', async ({ page }, testInfo) => {
  await profileMatch(page, testInfo, 'match-3min-default', 3, 'hunter');
});

test('3-minute match, stress (1 s spawns, arena full)', async ({ page }, testInfo) => {
  await profileMatch(page, testInfo, 'match-3min-stress', 1, 'spray');
});

test(`memory after ${CYCLES} start / play / exit cycles`, async ({ page }, testInfo) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const measure = async (label: string) => {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const metric = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
    const dom = await page.evaluate(() => ({
      canvases: document.querySelectorAll('canvas').length,
      testHooks: !!(window as unknown as PerfWindow).__pirate,
    }));
    return {
      label,
      jsHeapUsedMb: toMb(metric('JSHeapUsedSize')),
      jsHeapTotalMb: toMb(metric('JSHeapTotalSize')),
      domNodes: metric('Nodes'),
      jsEventListeners: metric('JSEventListeners'),
      documents: metric('Documents'),
      ...dom,
    };
  };

  await openApp(page, {
    clock: 'realtime',
    sturdy: true,
    settings: { sessionTime: MATCH_SECONDS, spawnInterval: 1, muted: false },
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const snapshots: (Awaited<ReturnType<typeof measure>> & {
    cycleAvgFps?: number;
    cycleMaxEnemies?: number;
  })[] = [await measure('menu (before any match)')];

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    await startMatch(page);
    await installProbe(page, 'spray');
    await page.waitForTimeout(CYCLE_PLAY_MS);
    const probe = await collectProbe(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    // Let the last rAF/timer callbacks of the destroyed session run out.
    await page.waitForTimeout(500);
    snapshots.push({
      ...(await measure(`after cycle ${cycle}`)),
      cycleAvgFps: frameStats(probe.frames).avgFps,
      cycleMaxEnemies: Math.max(0, ...probe.samples.map((s) => s.enemies)),
    });
  }

  const first = snapshots[1]!;
  const last = snapshots[snapshots.length - 1]!;
  const report = {
    generatedAt: new Date().toISOString(),
    environment: await environment(page),
    config: {
      sessionTime: MATCH_SECONDS,
      spawnInterval: 1,
      cycles: CYCLES,
      playPerCycleS: CYCLE_PLAY_MS / 1000,
      sound: true,
      autopilot: 'spray',
    },
    growthFromCycle1ToLast: {
      jsHeapUsedMb: round(last.jsHeapUsedMb - first.jsHeapUsedMb),
      domNodes: last.domNodes - first.domNodes,
      jsEventListeners: last.jsEventListeners - first.jsEventListeners,
    },
    snapshots,
  };
  writeReport(testInfo, CYCLES === 5 ? 'memory-5-cycles' : `memory-${CYCLES}-cycles`, report);

  // Nothing of a match survives leaving it.
  for (const s of snapshots) {
    expect(s.canvases).toBe(0);
    expect(s.testHooks).toBe(false);
  }
  expect(last.jsEventListeners - first.jsEventListeners).toBeLessThanOrEqual(5);
  expect(last.jsHeapUsedMb - first.jsHeapUsedMb).toBeLessThan(5);
});
