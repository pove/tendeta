import { describe, expect, it } from 'vitest';
import { initialAdaptive, updateAdaptive } from '../src/core/adaptive';
import { checkChange, checkTotal, errorTypeOf, isUnitsConfusion } from '../src/core/errors';
import { estimateQuestion } from '../src/core/estimate';
import { assembleTicket, makeItem, problemFromBasket } from '../src/core/generator';
import { profileStats, toCSV, type StatEntry } from '../src/core/stats';
import type { PriceEntry, Problem, Scenario } from '../src/core/types';
import { getLevel, SCENARIOS } from '../src/data';

const scenario = SCENARIOS[0] as Scenario;
const product = scenario.products.find((p) => p.unit === 'u')!;
const entry = (price: number, promo?: PriceEntry['promo']): PriceEntry => ({ key: product.id, product, price, promo });

function problem(price: number, paid: number, level = 4, promo?: PriceEntry['promo'], qty = 1): Problem {
  const items = [makeItem(entry(price, promo), qty, undefined)];
  return problemFromBasket(scenario, getLevel(level as 4), items, { pieces: [paid], paid, trick: false });
}

describe('checkChange', () => {
  it('accepts the exact change', () => {
    const p = problem(370, 1000);
    expect(checkChange(p, 630)).toEqual({ correct: true, diff: 0, tags: [] });
  });
  it('says how much is over or under', () => {
    const p = problem(370, 1000);
    expect(checkChange(p, 730)).toMatchObject({ correct: false, kind: 'over', diff: 100 });
    expect(checkChange(p, 610)).toMatchObject({ correct: false, kind: 'under', diff: -20 });
  });
  it('detects euro/cent confusion', () => {
    const p = problem(370, 1000);
    const check = checkChange(p, 63000);
    expect(check.tags).toContain('units');
    expect(errorTypeOf(check)).toBe('units');
    expect(isUnitsConfusion(63, 630)).toBe(true);
    expect(isUnitsConfusion(640, 630)).toBe(false);
  });
  it('detects the typical borrowing mistakes', () => {
    const p = problem(370, 1000);
    expect(checkChange(p, 1370).tags).toContain('carry'); // digit by digit, no borrow
    expect(checkChange(p, 730).tags).toContain('carry'); // off by one euro
    expect(errorTypeOf(checkChange(p, 1370))).toBe('carry');
  });
  it('does not blame borrowing for a plain counting slip in whole euros', () => {
    const p = problem(100, 1000, 1);
    expect(checkChange(p, 800).tags).not.toContain('carry');
  });
  it('detects a forgotten offer', () => {
    const p = problem(300, 1000, 6, { type: '2x1' }, 2);
    expect(p.total).toBe(300);
    const check = checkChange(p, 400);
    expect(check.tags).toContain('percent');
    expect(errorTypeOf(check)).toBe('percent');
  });
  it('checks typed totals', () => {
    const p = problem(250, 1000, 4, undefined, 2);
    expect(checkTotal(p, 500).correct).toBe(true);
    expect(checkTotal(p, 400)).toMatchObject({ kind: 'under', diff: -100 });
  });
});

describe('ticket assembly', () => {
  it('adds offer lines with negative amounts', () => {
    const { lines, subtotal, total } = assembleTicket([makeItem(entry(120, { type: '3x2' }), 3, undefined)]);
    expect(subtotal).toBe(360);
    expect(total).toBe(240);
    expect(lines[1]).toMatchObject({ kind: 'promo', amount: -120 });
  });
  it('applies percentage discounts exactly', () => {
    const { total } = assembleTicket([makeItem(entry(1000, { type: 'pct', pct: 25 }), 1, undefined)]);
    expect(total).toBe(750);
  });
});

describe('estimation', () => {
  it('always asks about a round amount clearly away from the change', () => {
    for (let change = 1; change <= 20000; change += 7) {
      const q = estimateQuestion(change, () => 0);
      expect(Math.abs(change - q.threshold)).toBeGreaterThanOrEqual(q.threshold * 0.15);
      expect(q.answerMore).toBe(change > q.threshold);
    }
  });
});

describe('adaptive difficulty', () => {
  it('goes up after 5 first-try answers and down after 2 misses', () => {
    let s = initialAdaptive();
    for (let i = 0; i < 5; i++) s = updateAdaptive(s, true).state;
    expect(s.tier).toBe(1);
    s = updateAdaptive(s, false).state;
    const r = updateAdaptive(s, false);
    expect(r.state.tier).toBe(0);
    expect(r.offerHint).toBe(true);
    let low = initialAdaptive();
    low = updateAdaptive(low, false).state;
    low = updateAdaptive(low, false).state;
    expect(low.tier).toBe(-1);
  });
});

describe('statistics and CSV', () => {
  const base: StatEntry = {
    ts: Date.UTC(2026, 9, 22, 9, 30),
    profileId: 'p1',
    scenarioId: 'supermercado',
    mode: 'auto',
    level: 2,
    method: 'keypad',
    total: 1370,
    due: 1370,
    paid: 2000,
    change: 630,
    answers: [730, 630],
    firstTry: false,
    solved: true,
    errorType: 'carry',
    errorTypes: ['carry'],
    borrow: true,
    hints: 1,
    timeMs: 12300,
  };
  it('computes per profile figures', () => {
    const stats = profileStats([base, { ...base, firstTry: true, answers: [630], errorTypes: [], errorType: null, borrow: false, level: 3 }]);
    expect(stats.problems).toBe(2);
    expect(stats.firstTryPct).toBe(50);
    expect(stats.errors.carry).toBe(1);
    expect(stats.levels).toEqual([2, 3]);
    expect(stats.borrowFirstTryPct).toBe(0);
    expect(stats.noBorrowFirstTryPct).toBe(100);
  });
  it('exports Spanish-friendly CSV (; separator, comma decimals, BOM)', () => {
    const csv = toCSV([base], () => 'Naranja; veloz', ['a', 'b'], 'sí', 'no');
    expect(csv.startsWith('﻿')).toBe(true);
    const row = csv.split('\r\n')[1]!;
    expect(row).toContain('"Naranja; veloz"');
    expect(row).toContain(';13,70;');
    expect(row).toContain(';6,30;7,30;6,30;no;sí;carry;sí;1;12,3;');
  });
});
