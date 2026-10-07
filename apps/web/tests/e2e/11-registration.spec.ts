import { expect, test } from './support/fixtures';
import { finishQuickMatch, mocks, openApp, reloadWithoutScenario } from './support/app';

test.describe('11. Recording a match, refreshing both tabs and recovering pending records', () => {
  test('a finished match appears in Match History and in the Ranking', async ({ page }) => {
    await openApp(page, { noSpawns: true, settings: { sessionTime: 60, spawnInterval: 3 } });
    const before = await mocks.recordCount(page);
    await finishQuickMatch(page);
    await expect(page.getByTestId('result-registration')).toHaveAttribute(
      'data-status',
      'recorded',
    );
    expect(await mocks.recordCount(page)).toBe(before + 1);

    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.getByRole('button', { name: 'Match history' }).click();
    const history = page.getByTestId('history-table').locator('tbody tr');
    await expect(history).toHaveCount(1);
    await expect(history.first()).toContainText('01:00');
    await expect(history.first()).toContainText('Time up');

    await page.getByRole('tab', { name: 'Ranking' }).click();
    // The ranking opens on the player's own settings (60 s / 3 s).
    await expect(page.getByLabel('Battle settings')).toHaveValue('60s/3s');
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.locator('tr.is-own')).toContainText('Captain Test');
    await expect(page.locator('tr.is-own .badge')).toHaveText('You');
  });

  test.describe('failures', () => {
    test.use({ allowNetworkErrors: true });

    test('a pending record survives a refresh and is sent after recovery', async ({ page }) => {
      await openApp(page, {
        noSpawns: true,
        scenario: 'registerUnavailable',
        settings: { sessionTime: 60, spawnInterval: 3 },
      });
      const before = await mocks.recordCount(page);
      await finishQuickMatch(page);
      const status = page.getByTestId('result-registration');
      await expect(status).toHaveAttribute('data-status', 'failed', { timeout: 15_000 });
      await expect(status).toContainText('Not recorded yet');

      // The player can start another battle while the record is pending.
      await page.getByRole('button', { name: 'Play again' }).click();
      await expect(page.getByTestId('hud-score')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Main menu' }).click();

      await page.reload();
      await page.getByRole('button', { name: 'Match history' }).click();
      await expect(page.getByTestId('pending-box')).toContainText('1 battle is waiting');
      expect(await mocks.recordCount(page)).toBe(before);

      // Let the automatic retry on start fail first, then recover manually.
      const retry = page.getByRole('button', { name: 'Retry now' });
      await expect(retry).toBeEnabled({ timeout: 15_000 });
      await mocks.setScenario(page, 'success');
      await retry.click();
      await expect(page.getByTestId('pending-box')).toBeHidden();
      await expect(page.getByTestId('history-table').locator('tbody tr')).toHaveCount(1);
      expect(await mocks.recordCount(page)).toBe(before + 1);
    });

    test('pending records are retried automatically on the next start', async ({ page }) => {
      await openApp(page, {
        noSpawns: true,
        scenario: 'offline',
        settings: { sessionTime: 60, spawnInterval: 3 },
      });
      await finishQuickMatch(page);
      await expect(page.getByTestId('result-registration')).toHaveAttribute(
        'data-status',
        'failed',
        {
          timeout: 15_000,
        },
      );
      await mocks.setScenario(page, 'success');
      await reloadWithoutScenario(page);
      await expect(page.getByTestId('result-registration')).toHaveAttribute(
        'data-status',
        'recorded',
      );
    });
  });
});
