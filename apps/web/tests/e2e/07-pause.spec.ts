import { expect, test } from './support/fixtures';
import { gameState, openApp, startMatch } from './support/app';

// Pause behaviour is about real time passing, so these use the realtime clock.
test.describe('7. Pause, focus loss and resume without timer drift', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { noSpawns: true, clock: 'realtime' });
    await startMatch(page);
  });

  test('manual pause freezes the clock until the player resumes', async ({ page }) => {
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    const dialog = page.getByRole('dialog', { name: 'Paused' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();

    const frozen = await gameState(page);
    expect(frozen.paused).toBe(true);
    await page.waitForTimeout(1500);
    const stillFrozen = await gameState(page);
    expect(stillFrozen.elapsedMs).toBe(frozen.elapsedMs);
    expect(stillFrozen.tick).toBe(frozen.tick);
    // The HUD clock shows the same frozen time.
    const hudTime = await page.getByTestId('hud-time').innerText();
    await page.waitForTimeout(300);
    await expect(page.getByTestId('hud-time')).toHaveText(hudTime);

    const resumedAt = Date.now();
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(500);
    const resumed = await gameState(page);
    const realSinceResume = Date.now() - resumedAt;
    // Only time after resuming counts, never the 1.5 s spent paused.
    const simulated = resumed.elapsedMs - frozen.elapsedMs;
    expect(simulated).toBeGreaterThan(200);
    expect(simulated).toBeLessThanOrEqual(realSinceResume + 50);
  });

  test('losing focus pauses automatically and resuming needs an action', async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    const frozen = await gameState(page);
    await page.waitForTimeout(800);
    expect((await gameState(page)).elapsedMs).toBe(frozen.elapsedMs);

    // Focus coming back does not resume by itself.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(300);
    expect((await gameState(page)).paused).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();
  });

  test('hiding the tab pauses the battle', async ({ page }) => {
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    expect((await gameState(page)).paused).toBe(true);
  });

  test('keys held during the pause do not move the ship after resuming', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    const before = (await gameState(page)).player!;
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyW');
    const after = (await gameState(page)).player!;
    expect(after.y).toBe(before.y);
    expect(after.speed).toBe(0);
  });
});
