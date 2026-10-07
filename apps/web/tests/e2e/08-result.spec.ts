import { expect, test } from './support/fixtures';
import { advanceUntil, aimAt, gameState, holdKeys, openApp, startMatch } from './support/app';

const mmss = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

test.describe('8. Result screen and its persistence after a refresh', () => {
  test('shows score, time played, reason and registration status; survives refresh', async ({
    page,
  }) => {
    await openApp(page, { settings: { sessionTime: 60, spawnInterval: 15 } });
    await startMatch(page);

    // Score a point so the result is not trivially zero.
    const spawned = await advanceUntil(page, (s) => s.enemies.length > 0, { maxMs: 5000 });
    for (let i = 0; i < 40; i++) {
      const s = await aimAt(page, spawned.enemies[0]!.id);
      if (!s.enemies.some((e) => e.id === spawned.enemies[0]!.id)) break;
      await holdKeys(page, ['Space'], 100);
    }
    // Play on to the end (time up or sunk: the seed decides, both are valid).
    const ended = await advanceUntil(page, (s) => s.status === 'ended', {
      stepMs: 5000,
      maxMs: 65_000,
    });
    expect(ended.score).toBeGreaterThanOrEqual(1);
    expect((await gameState(page)).score).toBe(ended.score);

    const heading = ended.endReason === 'timeUp' ? 'Battle complete' : 'Your ship sank';
    const reason = ended.endReason === 'timeUp' ? 'Time up' : 'Sunk';
    const check = async () => {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.getByTestId('result-score')).toContainText(String(ended.score));
      await expect(page.getByTestId('result-duration')).toHaveText(mmss(ended.elapsedMs));
      await expect(page.getByTestId('result-reason')).toHaveText(reason);
      await expect(page.getByTestId('result-registration')).toHaveAttribute(
        'data-status',
        'recorded',
      );
    };

    await check();
    await expect(page.getByRole('button', { name: 'Play again' })).toBeFocused();

    await page.reload();
    await check();

    await page.getByRole('button', { name: 'Main menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });
});
