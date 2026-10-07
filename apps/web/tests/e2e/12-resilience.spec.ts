import { expect, test } from './support/fixtures';
import { finishQuickMatch, matchInput, mocks, openApp } from './support/app';

test.describe('12. Resending after a timeout without duplicates; late responses never win', () => {
  test.use({ allowNetworkErrors: true });

  test('a timeout after the record was stored recovers without duplicating it', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openApp(page, {
      noSpawns: true,
      scenario: 'registerTimeoutAfterCommit',
      settings: { sessionTime: 60, spawnInterval: 3 },
    });
    const before = await mocks.recordCount(page);
    await finishQuickMatch(page);

    const status = page.getByTestId('result-registration');
    await expect(status).toHaveAttribute('data-status', 'sending');
    // First response is lost (client timeout), the retry gets the stored record.
    await expect(status).toHaveAttribute('data-status', 'recorded', { timeout: 30_000 });
    expect(await mocks.recordCount(page)).toBe(before + 1);

    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.getByRole('button', { name: 'Match history' }).click();
    await expect(page.getByTestId('history-table').locator('tbody tr')).toHaveCount(1);
  });

  test('repeated submissions of the same match create a single record', async ({ page }) => {
    await openApp(page);
    const before = await mocks.recordCount(page);
    const input = matchInput('e2e-dup-0001');
    await Promise.all([
      mocks.registerMatch(page, input),
      mocks.registerMatch(page, input),
      mocks.registerMatch(page, input),
    ]);
    await mocks.registerMatch(page, input);
    expect(await mocks.recordCount(page)).toBe(before + 1);

    await page.getByRole('button', { name: 'Match history' }).click();
    await expect(page.getByTestId('history-table').locator('tbody tr')).toHaveCount(1);
  });

  test('an older, slower response does not overwrite newer data', async ({ page }) => {
    // Alternate list requests take 2.5 s vs 150 ms; payloads reflect the data
    // at request time, so the slow one carries the older (empty) history.
    await openApp(page, { route: '#/log/history', scenario: 'outOfOrder' });
    await expect(page.getByText('Loading match history…')).toBeVisible();

    // While the slow request is in flight, a match gets recorded: its success
    // invalidates the list and a fast request returns the new data.
    await mocks.registerMatch(page, matchInput('e2e-order-0001'));
    const rows = page.getByTestId('history-table').locator('tbody tr');
    await expect(rows).toHaveCount(1);

    // Well past the slow response's arrival time: the newer data stays.
    await page.waitForTimeout(3500);
    await expect(rows).toHaveCount(1);
    await expect(page.getByText('No battles recorded yet')).toHaveCount(0);
  });

  test('the result screen shows the recording outcome for repeated clicks', async ({ page }) => {
    await openApp(page, {
      noSpawns: true,
      scenario: 'registerUnavailable',
      settings: { sessionTime: 60, spawnInterval: 3 },
    });
    const before = await mocks.recordCount(page);
    await finishQuickMatch(page);
    const status = page.getByTestId('result-registration');
    await expect(status).toHaveAttribute('data-status', 'failed', { timeout: 15_000 });

    await mocks.setScenario(page, 'success');
    const retry = status.getByRole('button', { name: 'Retry now' });
    // Two clicks in the same frame, before React re-renders the button away.
    await retry.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(status).toHaveAttribute('data-status', 'recorded');
    expect(await mocks.recordCount(page)).toBe(before + 1);
  });
});
