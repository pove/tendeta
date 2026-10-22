import { expect, test } from '@playwright/test';
import { createProfile, expectNoHorizontalScroll, maybeEstimate, payWithMoney, readChange, startGame, typeAmount } from './helpers';

test.describe('Tendeta', () => {
  test('a complete automatic round with the keypad (supermercado, nivel 1)', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await createProfile(page);
    await startGame(page, { scenario: 'supermercado', level: 1 });
    for (let i = 0; i < 5; i++) {
      const change = await readChange(page);
      expect(change).toBeGreaterThan(0);
      expect(change % 100).toBe(0);
      await expectNoHorizontalScroll(page);
      await typeAmount(page, change, false);
      await page.getByTestId('submit-answer').click();
      await expect(page.getByTestId('feedback')).toHaveClass(/is-ok/);
      await page.getByTestId('next-customer').click();
    }
    await expect(page.getByTestId('summary')).toBeVisible();
    await expect(page.locator('.star.is-on')).toHaveCount(3);
    await expectNoHorizontalScroll(page);
    // Privacy: no request ever leaves the app origin.
    for (const url of requests) expect(url.startsWith('http://localhost:4173')).toBe(true);
  });

  test('wrong answers get specific feedback, a hint and the worked solution', async ({ page }) => {
    await createProfile(page);
    await startGame(page, { scenario: 'supermercado', level: 2 });
    const change = await readChange(page);
    await typeAmount(page, change + 100, false);
    await page.getByTestId('submit-answer').click();
    await expect(page.getByTestId('feedback')).toContainText(/1,00\s€ de más/);
    await page.getByTestId('hint').click();
    await expect(page.locator('.hint-box .numberline')).toBeVisible();
    await typeAmount(page, change + 200, false);
    await page.getByTestId('submit-answer').click();
    await expect(page.getByTestId('solution')).toBeVisible();
    await expect(page.locator('.solution-steps li').first()).toBeVisible();
  });

  test('returning change with bills and coins (restaurante, nivel 3)', async ({ page }) => {
    await createProfile(page);
    await startGame(page, { scenario: 'restaurante', level: 3, method: 'money' });
    for (let i = 0; i < 5; i++) {
      const change = await readChange(page);
      await payWithMoney(page, change);
      await expect(page.getByTestId('tray-sum')).toBeVisible();
      await page.getByTestId('submit-answer').click();
      await expect(page.getByTestId('feedback')).toHaveClass(/is-ok/);
      await page.getByTestId('next-customer').click();
    }
    await expect(page.getByTestId('summary')).toBeVisible();
  });

  test('level 6 with estimation, offers and minimum pieces (mercado)', async ({ page }) => {
    await createProfile(page);
    await startGame(page, { scenario: 'mercado', level: 6, method: 'money' });
    for (let i = 0; i < 5; i++) {
      await page.getByTestId('paid').waitFor();
      await maybeEstimate(page);
      const change = await readChange(page);
      await payWithMoney(page, change);
      await page.getByTestId('submit-answer').click();
      await expect(page.getByTestId('feedback')).toContainText(/mínimo de piezas/);
      await page.getByTestId('next-customer').click();
    }
    await expect(page.getByTestId('summary')).toBeVisible();
  });

  test('free shop: the player fills the basket, pays and gives change', async ({ page }) => {
    await createProfile(page);
    await startGame(page, { scenario: 'horchateria', level: 2, mode: 'free' });
    for (let round = 0; round < 5; round++) {
      const products = page.getByTestId('product');
      let added = 0;
      const n = await products.count();
      for (let i = 0; i < n && added < 2; i++) {
        if (await products.nth(i).isEnabled()) {
          await products.nth(i).click();
          added++;
        }
      }
      await page.getByTestId('checkout').click();
      await page.getByTestId('pay-option').first().click();
      const change = await readChange(page);
      await typeAmount(page, change, false);
      await page.getByTestId('submit-answer').click();
      await expect(page.getByTestId('feedback')).toHaveClass(/is-ok/);
      await page.getByTestId('next-customer').click();
    }
    await expect(page.getByTestId('summary')).toBeVisible();
  });

  test('guided practice shows the worked example first', async ({ page }) => {
    await createProfile(page);
    await startGame(page, { scenario: 'supermercado', level: 4, guided: true });
    const next = page.getByTestId('guided-next');
    await expect(next).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < 12 && (await next.isVisible().catch(() => false)); i++) await next.click();
    await expect(page.getByTestId('submit-answer')).toBeVisible();
    await expect(page.locator('.hint-box .numberline')).toBeVisible();
  });

  test('adult panel: gate, statistics, CSV export and delete everything', async ({ page }) => {
    await createProfile(page);
    await startGame(page, { scenario: 'supermercado', level: 1 });
    const change = await readChange(page);
    await typeAmount(page, change, false);
    await page.getByTestId('submit-answer').click();
    await expect(page.getByTestId('feedback')).toHaveClass(/is-ok/);
    await page.getByTestId('next-customer').click();
    await page.goto('/');
    await page.getByTestId('adult-btn').click();
    const q = await page.locator('.gate-question').textContent();
    const [a, b] = (q ?? '').match(/\d+/g)!.map(Number);
    await page.getByTestId('gate-input').fill(String(a! * b!));
    await page.getByTestId('gate-ok').click();
    await expect(page.locator('.kpis')).toBeVisible();
    await expect(page.locator('.kpi strong').first()).toHaveText('1');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Exportar CSV/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^tendeta-.*\.csv$/);
    await page.getByTestId('tab-settings').click();
    await expect(page.getByTestId('set-voice')).toBeVisible();
    await page.getByTestId('tab-data').click();
    await page.getByTestId('delete-all').click();
    await page.getByTestId('confirm-yes').click();
    await expect(page.getByTestId('new-profile')).toBeVisible();
    await expect(page.getByTestId('profile-card')).toHaveCount(0);
  });

  test('the whole interface is available in Valencian', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Valencià' }).click();
    await expect(page.locator('.home-subtitle')).toHaveText('Cobra i torna el canvi');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ca-ES-valencia');
    await page.getByTestId('new-profile').click();
    await page.getByTestId('create-profile').click();
    await expect(page.getByTestId('start')).toContainText('A la caixa!');
  });

  test('works offline after the first visit', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.home-title')).toHaveText('Tendeta');
    await page.getByTestId('new-profile').click();
    await page.getByTestId('create-profile').click();
    await startGame(page, { scenario: 'supermercado', level: 1 });
    await expect(page.getByTestId('paid')).toBeVisible({ timeout: 20_000 });
    await context.setOffline(false);
  });
});
