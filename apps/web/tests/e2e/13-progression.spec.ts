import { expect, test } from './support/fixtures';
import { advance, advanceUntil, gameState, openApp, startMatch } from './support/app';

const PROGRESS_KEY = 'pirate-battle:progress:v1';

test.describe('13. Difficulties, final countdown, match summary and How to play', () => {
  test('a new captain can only sail Calm Waters or Custom', async ({ page }) => {
    await openApp(page, { settings: { difficulty: 'easy' } });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Choose your waters' })).toBeVisible();

    await expect(page.getByRole('radio', { name: 'Calm Waters, Easy' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Custom, Your settings' })).toBeEnabled();
    for (const name of ['Open Sea, Normal', 'Storm, Challenging', 'Kraken’s Wrath, Hard']) {
      await expect(page.getByRole('radio', { name })).toBeDisabled();
    }
    await expect(page.getByTestId('difficulty-normal')).toContainText(
      'Survive Calm Waters with grade B or better',
    );
  });

  test('saved progress unlocks the next waters and shows the best grade', async ({ page }) => {
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem('progress-seeded')) {
        localStorage.setItem(key, JSON.stringify({ unlockedIndex: 1, best: { easy: 'A' } }));
        sessionStorage.setItem('progress-seeded', '1');
      }
    }, PROGRESS_KEY);
    await openApp(page, { route: '#/setup' });

    await expect(page.getByRole('radio', { name: 'Open Sea, Normal' })).toBeEnabled();
    await expect(page.getByRole('radio', { name: 'Storm, Challenging' })).toBeDisabled();
    await expect(page.getByTestId('difficulty-easy')).toContainText('Best A');
  });

  test('a preset runs its own settings, counts down and ends with a summary', async ({ page }) => {
    // Custom options must not leak into a preset (Calm Waters: 90 s).
    await openApp(page, {
      noSpawns: true,
      settings: { difficulty: 'easy', sessionTime: 60, spawnInterval: 3 },
    });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Set sail' }).click();
    await expect(page.getByTestId('hud-time')).toContainText('01:30');
    await expect(page.getByTestId('countdown')).toHaveCount(0);

    await advance(page, 81_000);
    await expect(page.getByTestId('countdown')).toContainText('9');
    await expect(page.getByTestId('hud-time')).toHaveClass(/hud-counter--critical/);

    // Pausing freezes the countdown with the rest of the match.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
    await expect(page.getByTestId('countdown')).toHaveClass(/is-paused/);
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByTestId('resume-countdown')).toBeHidden();

    await advance(page, 9_000);
    expect((await gameState(page)).status).toBe('ended');
    await expect(page.getByText('Time is up!')).toBeVisible();
    await expect(page.getByTestId('countdown')).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible();
    await expect(page.getByText('Calm Waters')).toBeVisible();
    // No kills, full health, survived: 0 + 25 + 15 = 40 → C, which unlocks nothing.
    await expect(page.getByTestId('result-grade')).toHaveText('Grade C');
    await expect(page.getByTestId('result-kills-chaser')).toHaveText('0');
    await expect(page.getByTestId('result-kills-shooter')).toHaveText('0');
    await expect(page.getByTestId('result-health')).toHaveText('100 / 100');
    await expect(page.getByTestId('result-accuracy')).toHaveText('—');
    await expect(page.getByTestId('result-unlock')).toHaveCount(0);

    // Play again keeps the same waters.
    await page.getByRole('button', { name: 'Play again' }).click();
    await expect(page.getByTestId('hud-time')).toContainText('01:30');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.getByRole('button', { name: 'Leave' }).click();

    await page.getByRole('button', { name: 'Match history' }).click();
    const row = page.getByTestId('history-table').locator('tbody tr').first();
    await expect(row).toContainText('Calm Waters');
    await expect(row.locator('.grade-chip')).toHaveText('C');
  });

  test('saving Options selects the Custom battle', async ({ page }) => {
    await openApp(page, { settings: { difficulty: 'easy' }, route: '#/options' });
    await page.getByRole('spinbutton', { name: 'Game session time' }).fill('75');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Options saved.')).toBeVisible();

    await page.goto(page.url().replace('#/options', '#/setup'));
    await expect(page.getByRole('radio', { name: 'Custom, Your settings' })).toBeChecked();
    await expect(page.getByTestId('difficulty-custom')).toContainText('01:15');
  });

  test('the pencil edits the Custom battle without leaving the setup screen', async ({ page }) => {
    await openApp(page, { settings: { difficulty: 'easy' }, route: '#/setup' });
    await page.getByRole('button', { name: 'Edit custom battle settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Custom battle' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('spinbutton', { name: 'Game session time' }).fill('75');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Choose your waters' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Custom, Your settings' })).toBeChecked();
    await expect(page.getByTestId('difficulty-custom')).toContainText('01:15');

    // Back asks before discarding unsaved changes, then closes without saving.
    await page.getByRole('button', { name: 'Edit custom battle settings' }).click();
    await dialog.getByRole('spinbutton', { name: 'Game session time' }).fill('90');
    await dialog.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('difficulty-custom')).toContainText('01:15');
  });

  test('the screen pulses red while the ship is badly hurt', async ({ page }) => {
    await openApp(page, { settings: { sessionTime: 180, spawnInterval: 1 } });
    await startMatch(page);
    await expect(page.getByTestId('low-health')).toHaveCount(0);
    await advanceUntil(
      page,
      (s) => !!s.player && s.player.hp > 0 && s.player.hp / s.player.maxHp <= 0.3,
      { maxMs: 170_000 },
    );
    await expect(page.getByTestId('low-health')).toBeVisible();
  });

  test('How to play starts open and remembers being collapsed', async ({ page }) => {
    await openApp(page, { settings: { howToPlayOpen: true } });
    // It lives on the setup screen, not the main menu.
    await expect(page.getByTestId('key-space')).toHaveCount(0);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const summary = page.getByText('How to play', { exact: true });
    const spaceKey = page.getByTestId('key-space');
    await expect(spaceKey).toBeVisible();
    await expect(page.getByTestId('key-q')).toContainText('Q');
    await expect(page.getByTestId('key-q')).toHaveAttribute('title', /port broadside/i);

    await summary.click();
    await expect(spaceKey).toBeHidden();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Set sail' })).toBeVisible();
    await expect(spaceKey).toBeHidden();

    await summary.click();
    await expect(spaceKey).toBeVisible();
  });
});
