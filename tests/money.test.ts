import { describe, expect, it } from 'vitest';
import {
  DENOMINATIONS,
  formatEuro,
  formatShort,
  greedyChange,
  groupPieces,
  minPiecesDP,
  parseEuro,
  speakEuro,
  sum,
} from '../src/core/money';
import { createRng } from '../src/core/rng';

describe('formatEuro', () => {
  it('uses comma decimals and the euro sign after a space', () => {
    expect(formatEuro(350)).toBe('3,50 €');
    expect(formatEuro(5)).toBe('0,05 €');
    expect(formatEuro(1200)).toBe('12,00 €');
    expect(formatEuro(0)).toBe('0,00 €');
    expect(formatEuro(-125)).toBe('−1,25 €');
  });
  it('can drop decimals for whole euros', () => {
    expect(formatEuro(1200, { decimals: 'auto' })).toBe('12 €');
    expect(formatEuro(1250, { decimals: 'auto' })).toBe('12,50 €');
  });
  it('groups thousands with a dot', () => {
    expect(formatEuro(1234500)).toBe('12.345,00 €');
  });
  it('rejects non integer cents', () => {
    expect(() => formatEuro(1.5)).toThrow();
  });
  it('short format uses c for cents', () => {
    expect(formatShort(50)).toBe('50 c');
    expect(formatShort(200)).toBe('2 €');
    expect(formatShort(10000)).toBe('100 €');
  });
});

describe('parseEuro', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['12.50', 1250],
    ['0,05', 5],
    [',5', 50],
    ['7,', 700],
    [' 3,70 € ', 370],
    ['0', 0],
  ])('parses %s', (text, cents) => {
    expect(parseEuro(text)).toBe(cents);
  });
  it.each(['', ',', 'abc', '1,234', '1,2,3', '-3', '12a'])('rejects %s', (text) => {
    expect(parseEuro(text)).toBeNull();
  });
  it('round-trips every amount up to 200 € without floating point errors', () => {
    for (let c = 0; c <= 20000; c++) {
      expect(parseEuro(formatEuro(c))).toBe(c);
    }
  });
});

describe('greedyChange', () => {
  it('returns the classic cashier decomposition', () => {
    expect(greedyChange(1260)).toEqual([1000, 200, 50, 10]);
    expect(greedyChange(388)).toEqual([200, 100, 50, 20, 10, 5, 2, 1]);
    expect(greedyChange(0)).toEqual([]);
  });
  it('is optimal (minimum pieces) for the euro system — checked against DP', () => {
    for (let a = 0; a <= 5000; a++) {
      expect(greedyChange(a).length).toBe(minPiecesDP(a, DENOMINATIONS));
    }
    const rng = createRng(7);
    for (let i = 0; i < 300; i++) {
      const a = rng.int(5000, 20000);
      expect(sum(greedyChange(a))).toBe(a);
    }
  });
  it('is optimal for every level money subset', () => {
    const subsets = [
      [100, 200, 500],
      [100, 200, 500, 1000, 2000],
      [50, 100, 200, 500, 1000, 2000],
      [10, 20, 50, 100, 200, 500, 1000, 2000, 5000],
    ];
    for (const s of subsets) {
      for (let a = 0; a <= 5000; a += s[0]!) {
        expect(greedyChange(a, s).length).toBe(minPiecesDP(a, s));
      }
    }
  });
  it('throws when the amount cannot be composed', () => {
    expect(() => greedyChange(50, [100, 200])).toThrow();
  });
});

describe('helpers', () => {
  it('groups pieces', () => {
    expect(groupPieces([200, 100, 200, 5])).toEqual([[200, 2], [100, 1], [5, 1]]);
  });
  it('speaks amounts in both languages', () => {
    expect(speakEuro(740, 'va')).toBe('7 euros i 40 cèntims');
    expect(speakEuro(740, 'es')).toBe('7 euros con 40 céntimos');
    expect(speakEuro(100, 'va')).toBe('1 euro');
    expect(speakEuro(1, 'es')).toBe('1 céntimo');
    expect(speakEuro(0, 'va')).toBe('0 euros');
  });
});
