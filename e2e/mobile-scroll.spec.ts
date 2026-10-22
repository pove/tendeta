import { expect, test } from '@playwright/test';
import { createProfile, startGame } from './helpers';

test('on phones the till scrolls into view when it is time to answer', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout only');
  await createProfile(page);
  await startGame(page, { scenario: 'restaurante', level: 2 });
  await expect(page.getByTestId('submit-answer')).toBeAttached({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await expect(page.getByTestId('paid')).toBeInViewport();
});
