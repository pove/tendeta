import { expect, test, type Page } from '@playwright/test';
import { readChange, startGame, typeAmount } from './helpers';

interface Spoken {
  text: string;
  start: number;
  end?: number;
  cancelled: boolean;
}

/**
 * Fake speech synthesis that behaves like a real one (one phrase at a time,
 * ~25 ms per character) and records what is said and whether it was cut off.
 */
async function installFakeVoice(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: unknown[] };
    w.__spoken = [];
    type U = { text: string; lang?: string; voice?: unknown; onstart?: () => void; onend?: () => void; onerror?: (e: unknown) => void; _t?: number };
    const fake = {
      speaking: false,
      pending: false,
      queue: [] as U[],
      current: null as U | null,
      speak(u: U) {
        this.queue.push(u);
        this.pending = true;
        this.next();
      },
      next() {
        if (this.current || this.queue.length === 0) return;
        const u = this.queue.shift()!;
        this.pending = this.queue.length > 0;
        this.current = u;
        this.speaking = true;
        const rec = { text: u.text, start: Date.now(), cancelled: false } as { text: string; start: number; end?: number; cancelled: boolean };
        w.__spoken.push(rec);
        u.onstart?.();
        u._t = window.setTimeout(() => {
          rec.end = Date.now();
          this.current = null;
          this.speaking = false;
          u.onend?.();
          this.next();
        }, 25 * u.text.length);
      },
      cancel() {
        if (this.current) {
          window.clearTimeout(this.current._t);
          (w.__spoken[w.__spoken.length - 1] as { cancelled: boolean }).cancelled = true;
          const u = this.current;
          this.current = null;
          this.speaking = false;
          u.onerror?.({ error: 'interrupted' });
        }
        this.queue = [];
        this.pending = false;
      },
      getVoices: () => [{ lang: 'es-ES', name: 'fake' }],
      addEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      text: string;
      constructor(t: string) {
        this.text = t;
      }
    };
    if (!localStorage.getItem('tendeta:state')) {
      localStorage.setItem('tendeta:state', JSON.stringify({ settings: { voice: true }, profiles: [], currentProfileId: null }));
    }
  });
}

const spoken = (page: Page): Promise<Spoken[]> => page.evaluate(() => (window as unknown as { __spoken: Spoken[] }).__spoken);

test.describe('read-aloud', () => {
  test.beforeEach(async ({ page }) => {
    await installFakeVoice(page);
    await page.goto('/');
    await page.getByTestId('new-profile').click();
    await page.getByTestId('create-profile').click();
  });

  test('says greeting, total, payment and question in order without cutting any of them', async ({ page }) => {
    await startGame(page, { scenario: 'supermercado', level: 2 });
    await expect.poll(async () => (await spoken(page)).some((s) => s.text.startsWith('¿Cuánto cambio'))).toBe(true);
    const list = await spoken(page);
    const idx = (re: RegExp): number => list.findIndex((s) => re.test(s.text));
    const greeting = idx(/^¡(Hola|Buenas)/);
    const totalI = idx(/^Son \d+ euros?/);
    const pays = idx(/^El cliente (paga con|te da)/);
    const question = idx(/^¿Cuánto cambio/);
    expect(greeting).toBeGreaterThanOrEqual(0);
    expect(totalI).toBeGreaterThan(greeting);
    expect(pays).toBeGreaterThan(totalI);
    expect(question).toBeGreaterThan(pays);
    // Nothing was cut off: every phrase finished before the next one started.
    await expect.poll(async () => (await spoken(page)).every((s) => s.end !== undefined)).toBe(true);
    const done = await spoken(page);
    for (const s of done) expect(s.cancelled, s.text).toBe(false);
    for (let i = 1; i < done.length; i++) expect(done[i]!.start).toBeGreaterThanOrEqual(done[i - 1]!.end!);
    // The payment appears only after the total has been said.
    expect(list[totalI]!.text).not.toMatch(/,\d\d\s?€/);
  });

  test('on a correct answer it counts forward step by step, in sync with the number line', async ({ page }) => {
    await startGame(page, { scenario: 'supermercado', level: 2 });
    const change = await readChange(page);
    await expect.poll(async () => (await spoken(page)).some((s) => s.text.startsWith('¿Cuánto cambio'))).toBe(true);
    await typeAmount(page, change, false);
    await page.getByTestId('submit-answer').click();
    await expect.poll(async () => (await spoken(page)).some((s) => s.text.startsWith('En total, el cambio es'))).toBe(true);
    const list = (await spoken(page)).map((s) => s.text);
    const from = list.findIndex((s) => s.startsWith('Contamos hacia delante desde'));
    const end = list.findIndex((s) => s.startsWith('En total, el cambio es'));
    expect(from).toBeGreaterThan(0);
    const steps = list.slice(from + 1, end);
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) expect(s).toMatch(/^Más .+, y llegamos a .+\.$/);
    expect(list[end]).toContain(`${change / 100} euro`);
    // Every jump drawn on the line was said.
    await expect(page.locator('.feedback .nl-jump.is-shown')).toHaveCount(steps.length);
    // Amounts are spoken in words, never with the visual format.
    for (const s of list) expect(s).not.toMatch(/\d,\d\d|€/);
  });

  test('after two mistakes it explains the solution aloud', async ({ page }) => {
    await startGame(page, { scenario: 'supermercado', level: 2 });
    const change = await readChange(page);
    await typeAmount(page, change + 100, false);
    await page.getByTestId('submit-answer').click();
    await expect.poll(async () => (await spoken(page)).some((s) => /de más/.test(s.text))).toBe(true);
    await typeAmount(page, change + 200, false);
    await page.getByTestId('submit-answer').click();
    await expect.poll(async () => (await spoken(page)).some((s) => s.text.startsWith('En total, el cambio es'))).toBe(true);
    const list = (await spoken(page)).map((s) => s.text);
    expect(list.some((s) => s.startsWith('Mira cómo se hace'))).toBe(true);
    expect(list.some((s) => /2 euros de más/.test(s))).toBe(true);
  });
});
