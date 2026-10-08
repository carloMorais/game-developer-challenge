import { expect, test } from './support/fixtures';
import { openApp } from './support/app';

test.describe('10. Ranking and Match History: pagination, loading, empty and error', () => {
  test('ranking is paginated, ordered and filtered by battle settings', async ({ page }) => {
    await openApp(page, { route: '#/log/ranking' });
    const rows = page.getByTestId('ranking-table').locator('tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(page.getByText('Page 1 of 3')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    const points = async () =>
      (await rows.locator('.log-table__points').allTextContents()).map(Number);
    const firstPage = await points();
    expect([...firstPage].sort((a, b) => b - a)).toEqual(firstPage);

    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
    await expect(rows.first().locator('.log-table__rank')).toHaveText('06');
    expect(Math.max(...(await points()))).toBeLessThanOrEqual(Math.min(...firstPage));

    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 3 of 3')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await page
      .getByLabel('Waters')
      .selectOption({ label: 'Custom · 60 s battles · 3 s spawn interval' });
    await expect(page.getByText('Page 1 of 2')).toBeVisible();
  });

  test('tabs work with the keyboard', async ({ page }) => {
    await openApp(page, { route: '#/log/ranking' });
    const ranking = page.getByRole('tab', { name: 'Ranking' });
    await ranking.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Match history' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: 'Match history' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(ranking).toHaveAttribute('aria-selected', 'true');
  });

  test('history is paginated', async ({ page }) => {
    await openApp(page, { route: '#/log/history', scenario: 'manyPages' });
    await expect(page.getByTestId('history-table').locator('tbody tr')).toHaveCount(5);
    await expect(page.getByText('Page 1 of 5')).toBeVisible();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 2 of 5')).toBeVisible();
  });

  test('shows a loading state on a slow network', async ({ page }) => {
    await openApp(page, { route: '#/log/ranking', scenario: 'slow', mockLatency: null });
    await expect(page.getByText('Loading ranking…')).toBeVisible();
    await expect(page.getByTestId('ranking-table')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Loading ranking…')).toBeHidden();
  });

  test('shows empty states', async ({ page }) => {
    await openApp(page, { route: '#/log/ranking', scenario: 'empty' });
    await expect(page.getByText('No battles recorded with these settings yet.')).toBeVisible();
    await page.getByRole('tab', { name: 'Match history' }).click();
    await expect(page.getByText('No battles recorded yet')).toBeVisible();
  });

  test.describe('failures', () => {
    test.use({ allowNetworkErrors: true });

    test('ranking error offers a retry that recovers', async ({ page }) => {
      await openApp(page, { route: '#/log/ranking', scenario: 'serverError' });
      const alert = page.getByRole('alert');
      await expect(alert).toContainText("Couldn't load the ranking.", { timeout: 15_000 });
      await page.evaluate(() =>
        (window as { __pirateMocks?: { setScenario(s: string): void } }).__pirateMocks!.setScenario(
          'success',
        ),
      );
      await alert.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByTestId('ranking-table')).toBeVisible();
    });

    test('history failure does not affect the ranking', async ({ page }) => {
      await openApp(page, { route: '#/log/history', scenario: 'historyDown' });
      await expect(page.getByRole('alert')).toContainText("Couldn't load the match history.", {
        timeout: 15_000,
      });
      await page.getByRole('tab', { name: 'Ranking' }).click();
      await expect(page.getByTestId('ranking-table')).toBeVisible();
    });

    test('connection failures and timeouts show an error', async ({ page }) => {
      test.setTimeout(90_000);
      await openApp(page, { route: '#/log/ranking', scenario: 'offline' });
      await expect(page.getByRole('alert')).toContainText('Could not reach the server', {
        timeout: 15_000,
      });
      await openApp(page, { route: '#/log/ranking', scenario: 'timeout' });
      await expect(page.getByRole('alert')).toContainText('took too long', { timeout: 40_000 });
    });

    test('API failures never block playing', async ({ page }) => {
      await openApp(page, { scenario: 'serverError' });
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.getByRole('button', { name: 'Set sail' }).click();
      await expect(page.getByTestId('hud-score')).toBeVisible();
    });
  });
});
