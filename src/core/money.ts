/**
 * Money utilities. Every amount in the game is an integer number of cents.
 * No floating point arithmetic is ever used on money values.
 */

export type Cents = number;

/** All euro denominations, in cents, ascending. */
export const DENOMINATIONS: readonly Cents[] = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
];

export const COINS: readonly Cents[] = [1, 2, 5, 10, 20, 50, 100, 200];
export const BILLS: readonly Cents[] = [500, 1000, 2000, 5000, 10000];

export function isCoin(value: Cents): boolean {
  return COINS.includes(value);
}

export function assertCents(value: number): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Money must be an integer number of cents, got ${value}`);
  }
}

/** Sum a list of pieces/amounts (in cents). */
export function sum(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * Format cents with Spanish conventions: comma decimal separator, dot for
 * thousands and the euro sign after a (non-breaking) space: `1.234,50 €`.
 */
export function formatEuro(cents: Cents, opts: { symbol?: boolean; decimals?: 'always' | 'auto' } = {}): string {
  assertCents(cents);
  const { symbol = true, decimals = 'always' } = opts;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const eurosStr = groupThousands(String(euros));
  let text = eurosStr;
  if (decimals === 'always' || rest !== 0) {
    text += ',' + String(rest).padStart(2, '0');
  }
  if (negative) text = '−' + text;
  return symbol ? `${text} €` : text;
}

/** Short format: `50 c` for amounts under one euro, `2 €`, `3,50 €` otherwise. */
export function formatShort(cents: Cents): string {
  assertCents(cents);
  if (cents > 0 && cents < 100) return `${cents} c`;
  return formatEuro(cents, { decimals: 'auto' });
}

function groupThousands(digits: string): string {
  // Spanish style groups thousands from 5 digits on (RAE), but 4-digit amounts
  // never appear in the game. Keep the standard 3-digit grouping for safety.
  if (digits.length <= 4) return digits;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Parse a user-typed amount in euros into cents. Accepts `12`, `12,5`,
 * `12,50`, `12.50`, `0,05`, `,5`, optional `€`, spaces. Returns `null` when
 * the text is not a valid amount (more than 2 decimals, letters, empty…).
 * Uses string manipulation only — never floating point.
 */
export function parseEuro(text: string): Cents | null {
  const cleaned = text.replace(/[\s €]/g, '').replace('.', ',');
  if (cleaned === '' || cleaned === ',') return null;
  const match = /^(\d{0,6})(?:,(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const intPart = match[1] ?? '';
  const decPart = match[2] ?? '';
  if (intPart === '' && decPart === '') return null;
  const euros = intPart === '' ? 0 : Number.parseInt(intPart, 10);
  const cents = decPart === '' ? 0 : Number.parseInt(decPart.padEnd(2, '0'), 10);
  return euros * 100 + cents;
}

/**
 * Greedy change-making. For the euro system (1-2-5 series) the greedy
 * algorithm is optimal: it always returns the minimum number of pieces.
 * Returns the pieces in descending order.
 */
export function greedyChange(amount: Cents, denominations: readonly Cents[] = DENOMINATIONS): Cents[] {
  assertCents(amount);
  if (amount < 0) throw new Error('Negative amount');
  const pieces: Cents[] = [];
  const sorted = [...denominations].sort((a, b) => b - a);
  let rest = amount;
  for (const d of sorted) {
    while (rest >= d) {
      pieces.push(d);
      rest -= d;
    }
  }
  if (rest !== 0) throw new Error(`Amount ${amount} cannot be paid with ${denominations.join(',')}`);
  return pieces;
}

/** Can `amount` be composed exactly with unlimited pieces of `denominations`? */
export function isComposable(amount: Cents, denominations: readonly Cents[]): boolean {
  if (amount < 0) return false;
  try {
    greedyChange(amount, denominations);
    return true;
  } catch {
    return minPiecesDP(amount, denominations) !== Infinity;
  }
}

/** Minimum number of pieces by dynamic programming (reference implementation). */
export function minPiecesDP(amount: Cents, denominations: readonly Cents[]): number {
  const best = new Array<number>(amount + 1).fill(Infinity);
  best[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const d of denominations) {
      if (d <= a && best[a - d]! + 1 < best[a]!) best[a] = best[a - d]! + 1;
    }
  }
  return best[amount]!;
}

/** Group pieces into `[value, count]` pairs, descending by value. */
export function groupPieces(pieces: readonly Cents[]): Array<[Cents, number]> {
  const map = new Map<Cents, number>();
  for (const p of pieces) map.set(p, (map.get(p) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
}

export type Lang = 'es' | 'va' | 'en';

/** Text meant for speech synthesis: «7 euros i 40 cèntims». */
export function speakEuro(cents: Cents, lang: Lang): string {
  const euros = Math.floor(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const w = SPEECH_WORDS[lang];
  const parts: string[] = [];
  if (euros > 0) parts.push(`${euros} ${euros === 1 ? w.euro : w.euros}`);
  if (rest > 0) parts.push(`${rest} ${rest === 1 ? w.cent : w.cents}`);
  if (parts.length === 0) return `0 ${w.euros}`;
  return parts.join(` ${w.and} `);
}

const SPEECH_WORDS: Record<Lang, { euro: string; euros: string; cent: string; cents: string; and: string }> = {
  va: { euro: 'euro', euros: 'euros', cent: 'cèntim', cents: 'cèntims', and: 'i' },
  es: { euro: 'euro', euros: 'euros', cent: 'céntimo', cents: 'céntimos', and: 'con' },
  en: { euro: 'euro', euros: 'euros', cent: 'cent', cents: 'cents', and: 'and' },
};
