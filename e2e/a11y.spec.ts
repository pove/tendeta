import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createProfile, maybeEstimate, readChange, startGame, typeAmount } from './helpers';

/** WCAG 2.2 AA audit of what is on screen; fails on serious or critical issues. */
async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  // The money drawer buttons are named «Añadir billete de 100 €»: the visible label (the value) is in the name,
  // but axe also counts the decorative texts drawn inside the bill artwork («EUROS», the corner value).
  results.violations = results.violations
    .map((v) => (v.id === 'label-content-name-mismatch' ? { ...v, nodes: v.nodes.filter((n) => !String(n.target[0]).includes('drawer-slot') && !/Añadir billete/.test(n.html)) } : v))
    .filter((v) => v.nodes.length > 0);
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = serious.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join('\n  ')}`).join('\n');
  expect(serious, `${label}\n${report}`).toEqual([]);
}

test.describe('accessibility (axe, WCAG 2.2 AA)', () => {
  test('home, profile dialog and setup', async ({ page }) => {
    await page.goto('/');
    await audit(page, 'home');
    await page.getByTestId('new-profile').click();
    await audit(page, 'new profile dialog');
    await page.getByTestId('create-profile').click();
    await audit(page, 'setup');
  });

  test('cash register with keypad, feedback and summary', async ({ page }) => {
    await createProfile(page);
    await startGame(page, { scenario: 'supermercado', level: 4 });
    await page.getByTestId('submit-answer').waitFor();
    await audit(page, 'play · keypad');
    const change = await readChange(page);
    await typeAmount(page, change + 100, true);
    await page.getByTestId('submit-answer').click();
    await audit(page, 'play · error feedback');
    await page.getByTestId('hint').click();
    await audit(page, 'play · hint');
    for (let i = 0; i < 5; i++) {
      if (i > 0) await readChange(page);
      const c = await readChange(page);
      await typeAmount(page, c, true);
      await page.getByTestId('submit-answer').click();
      await page.getByTestId('next-customer').click();
    }
    await expect(page.getByTestId('summary')).toBeVisible();
    await audit(page, 'summary');
  });

  test('cash register with money, estimation and the free shop', async ({ page }) => {
    await createProfile(page);
    await startGame(page, { scenario: 'mercado', level: 6, method: 'money' });
    await page.getByTestId('paid').waitFor();
    if (await page.getByTestId('estimate-more').isVisible({ timeout: 1500 }).catch(() => false)) await audit(page, 'play · estimate');
    await maybeEstimate(page);
    await page.getByTestId('submit-answer').waitFor();
    await audit(page, 'play · money');
    await page.goto('/');
    await page.getByTestId('profile-card').first().click();
    await startGame(page, { scenario: 'restaurante', level: 3, mode: 'free' });
    await page.getByTestId('product').first().waitFor();
    await audit(page, 'free shop');
  });

  test('my shop and adult panel', async ({ page }) => {
    await createProfile(page);
    await page.getByTestId('my-shop').click();
    await audit(page, 'my shop');
    await page.goto('/');
    await page.getByTestId('adult-btn').click();
    await audit(page, 'adult gate');
    const q = await page.locator('.gate-question').textContent();
    const [a, b] = (q ?? '').match(/\d+/g)!.map(Number);
    await page.getByTestId('gate-input').fill(String(a! * b!));
    await page.getByTestId('gate-ok').click();
    for (const tab of ['stats', 'settings', 'sheets', 'data']) {
      await page.getByTestId(`tab-${tab}`).click();
      await audit(page, `adult · ${tab}`);
    }
  });
});
