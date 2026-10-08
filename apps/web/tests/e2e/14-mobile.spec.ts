import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { advance, openApp, placePlayerAt, startMatch } from './support/app';

/** Headless browsers cannot really go fullscreen: record the requests instead. */
async function stubFullscreen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { __fullscreenCalls: string[] }).__fullscreenCalls = calls;
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => true });
    Element.prototype.requestFullscreen = function () {
      calls.push('request');
      return Promise.resolve();
    };
  });
}

function fullscreenCalls(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __fullscreenCalls: string[] }).__fullscreenCalls,
  );
}

/** The element shows all its content without scrolling. */
async function expectNoScroll(page: Page, selector: string): Promise<void> {
  const overflow = await page
    .locator(selector)
    .first()
    .evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(overflow, `${selector} scrolls`).toBeLessThanOrEqual(1);
}

test.describe('14. Mobile: fullscreen, touch overlay, HUD fade, short screens @mobile', () => {
  test('Play requests fullscreen on touch devices', async ({ page }) => {
    await stubFullscreen(page);
    await openApp(page, { noSpawns: true });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    expect(await fullscreenCalls(page)).toEqual(['request']);
  });

  test('portrait covers the setup screen until the phone is turned', async ({ page }) => {
    await stubFullscreen(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, { noSpawns: true });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByTestId('landscape-gate')).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByTestId('landscape-gate')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Set sail' })).toBeVisible();
  });

  test('touch buttons overlay the full-screen arena: large and translucent', async ({ page }) => {
    await openApp(page, { noSpawns: true });
    await startMatch(page);
    const canvas = (await page.getByTestId('game-canvas').boundingBox())!;
    expect(canvas.width).toBe(page.viewportSize()!.width);
    for (const name of ['Sail forward', 'Turn left', 'Fire bow cannon', 'Fire port broadside']) {
      const button = page.getByRole('button', { name });
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(72);
      const opacity = Number(await button.evaluate((el) => getComputedStyle(el).opacity));
      expect(opacity).toBeLessThan(0.6);
    }
  });

  test('HUD elements fade while a ship sails under them', async ({ page }) => {
    await openApp(page, { noSpawns: true });
    await startMatch(page);
    const health = page.getByTestId('hud-health');
    await expect(health).not.toHaveAttribute('data-obscured');
    const box = (await health.boundingBox())!;
    await placePlayerAt(page, box.x + box.width / 2, box.y + box.height / 2);
    await expect(health).toHaveAttribute('data-obscured', 'true');
    await expect(page.getByTestId('hud-time')).not.toHaveAttribute('data-obscured');

    const fire = (await page.getByTestId('touch-fire').boundingBox())!;
    await placePlayerAt(page, fire.x + fire.width / 2, fire.y + fire.height / 2);
    await expect(page.getByTestId('touch-fire')).toHaveAttribute('data-obscured', 'true');
    await expect(health).not.toHaveAttribute('data-obscured');

    // Faded, the pause button still works.
    const pause = page.getByTestId('hud-pause');
    const pauseBox = (await pause.boundingBox())!;
    await placePlayerAt(page, pauseBox.x + pauseBox.width / 2, pauseBox.y + pauseBox.height / 2);
    await expect(pause).toHaveAttribute('data-obscured', 'true');
    await pause.click();
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  });

  test('the difficulty cards scroll as a carousel that follows the selection', async ({ page }) => {
    await openApp(page, { unlockAll: true, settings: { difficulty: 'easy' } });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const cards = page.getByTestId('difficulty-cards');
    const scrollLeft = () => cards.evaluate((el) => el.scrollLeft);
    expect(await cards.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const start = await scrollLeft();

    await page.getByTestId('difficulty-easy').locator('input').focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('difficulty-custom').locator('input')).toBeChecked();
    await expect.poll(scrollLeft).toBeGreaterThan(start + 100);
    await expect
      .poll(async () => {
        const box = (await page.getByTestId('difficulty-custom').boundingBox())!;
        return box.x + box.width <= page.viewportSize()!.width;
      })
      .toBe(true);
  });

  for (const size of [
    { width: 844, height: 390 },
    { width: 740, height: 360 },
  ]) {
    test(`menu, setup, pause, confirmation and result fit ${size.width}x${size.height} without scrolling`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await openApp(page, { settings: { sessionTime: 60, howToPlayOpen: false } });
      await expectNoScroll(page, '.screen');
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Set sail' })).toBeVisible();
      await expectNoScroll(page, '.screen');

      await page.getByRole('button', { name: 'Set sail' }).click();
      await expect(page.getByTestId('hud-score')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('hud-pause').click();
      await expectNoScroll(page, '.dialog-backdrop');
      await page.getByRole('button', { name: 'Main menu' }).click();
      await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible();
      await expectNoScroll(page, '.dialog-backdrop');
      await page.getByRole('button', { name: 'Keep playing' }).click();
      await page.getByRole('button', { name: 'Resume' }).click();
      await expect(page.getByTestId('resume-countdown')).toBeHidden({ timeout: 10_000 });
      await advance(page, 65_000);
      await expect(page.getByTestId('result-grade')).toBeVisible({ timeout: 15_000 });
      await expectNoScroll(page, '.screen');
    });
  }
});
