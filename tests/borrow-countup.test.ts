import { describe, expect, it } from 'vitest';
import { borrowCount, forgotBorrowMistake, hasBorrow, noBorrowMistake } from '../src/core/borrow';
import { countUpPoints, countUpSteps } from '../src/core/countup';
import { createRng } from '../src/core/rng';

describe('borrow detection', () => {
  it('detects borrowing in column subtraction', () => {
    expect(borrowCount(1000, 370)).toBe(2);
    expect(hasBorrow(500, 300)).toBe(false);
    expect(hasBorrow(1500, 1300)).toBe(false);
    expect(hasBorrow(2000, 1300)).toBe(true);
    expect(hasBorrow(2547, 2347)).toBe(false);
  });
  it('models the typical mistakes', () => {
    expect(noBorrowMistake(1000, 370)).toBe(1370); // |0-0| |0-7| |0-3| |1-0| → 13,70
    expect(forgotBorrowMistake(1000, 370)).toBe(1730);
  });
});

describe('count up (cashier strategy)', () => {
  it('follows the example of the spec', () => {
    expect(countUpPoints(740, 2000)).toEqual([740, 750, 800, 1000, 2000]);
  });
  it('lets matching cents cancel out', () => {
    expect(countUpPoints(1505, 2005)).toEqual([1505, 2005]);
    expect(countUpPoints(1350, 2050)).toEqual([1350, 1550, 2050]);
  });
  it('always sums the change exactly and moves forward', () => {
    const rng = createRng(42);
    for (let i = 0; i < 10000; i++) {
      const price = rng.int(1, 19999);
      const paid = price + rng.int(1, 20000 - price);
      const steps = countUpSteps(price, paid);
      expect(steps.reduce((a, s) => a + s.add, 0)).toBe(paid - price);
      for (const s of steps) {
        expect(s.add).toBeGreaterThan(0);
        expect(s.to - s.from).toBe(s.add);
      }
      expect(steps.length).toBeLessThan(14);
      expect(steps[steps.length - 1]!.to).toBe(paid);
    }
  });
});
