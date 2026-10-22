import { expect, type Page } from '@playwright/test';

/** «12,50 €» → 1250 (cents). */
export function cents(text: string): number {
  const clean = text.replace(/[^\d,]/g, '');
  const [e, c = '0'] = clean.split(',');
  return Number(e) * 100 + Number(c.padEnd(2, '0').slice(0, 2));
}

export function greedy(amount: number, denoms: number[]): number[] {
  const out: number[] = [];
  let rest = amount;
  for (const d of [...denoms].sort((a, b) => b - a)) {
    while (rest >= d) {
      out.push(d);
      rest -= d;
    }
  }
  return out;
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function createProfile(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('new-profile').click();
  await page.getByTestId('create-profile').click();
  await expect(page.getByTestId('start')).toBeVisible();
}

export async function startGame(
  page: Page,
  opts: { scenario: string; level: number; mode?: string; method?: 'keypad' | 'money'; guided?: boolean },
): Promise<void> {
  await page.getByTestId(`scenario-${opts.scenario}`).click();
  await page.getByTestId(`mode-${opts.mode ?? 'auto'}`).click();
  await page.getByTestId(`level-${opts.level}`).click();
  await page.getByTestId(`method-${opts.method ?? 'keypad'}`).click();
  await expectNoHorizontalScroll(page);
  await page.getByTestId('start').click();
  const answer = page.getByTestId(opts.guided ? 'guided-yes' : 'guided-no');
  if (await answer.isVisible({ timeout: 1500 }).catch(() => false)) await answer.click();
}

/** Reads the current customer and returns the exact change. */
export async function readChange(page: Page): Promise<number> {
  const paidText = await page.getByTestId('paid').textContent({ timeout: 20_000 });
  const dueEl = page.getByTestId('ticket-due');
  const dueText = (await dueEl.count()) > 0 ? await dueEl.textContent() : await page.getByTestId('ticket-total').textContent();
  return cents(paidText ?? '') - cents(dueText ?? '');
}

export async function maybeEstimate(page: Page): Promise<void> {
  const more = page.getByTestId('estimate-more');
  if (await more.isVisible({ timeout: 1500 }).catch(() => false)) {
    await more.click();
    await page.getByTestId('estimate-continue').click();
  }
}

export async function typeAmount(page: Page, amount: number, decimal: boolean): Promise<void> {
  const euros = Math.floor(amount / 100);
  const rest = amount % 100;
  let text = String(euros);
  if (decimal && rest > 0) text += ',' + String(rest).padStart(2, '0');
  for (const ch of text) {
    await page.locator(`.kp-key[data-key="${ch}"]`).click();
  }
}

export async function payWithMoney(page: Page, amount: number): Promise<void> {
  const values = await page.locator('.drawer-slot').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.value)));
  for (const piece of greedy(amount, values)) {
    await page.locator(`.drawer-slot[data-value="${piece}"]`).click();
  }
}
