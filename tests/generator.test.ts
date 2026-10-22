import { describe, expect, it } from 'vitest';
import { hasBorrow } from '../src/core/borrow';
import { generateProblem, type Tier } from '../src/core/generator';
import { greedyChange, isComposable, sum } from '../src/core/money';
import { paymentCandidates } from '../src/core/payment';
import { buildPriceList, promoSaving, stepFor } from '../src/core/pricing';
import { createRng } from '../src/core/rng';
import type { ItemLine, Problem } from '../src/core/types';
import { LEVEL_IDS, SCENARIOS, getLevel } from '../src/data';

const CASES = 10000;

function checkProblem(p: Problem): void {
  const level = getLevel(p.level);
  const all = [p.subtotal, p.total, p.due, p.paid, p.change, ...p.payment, ...p.lines.map((l) => l.amount)];
  for (const v of all) expect(Number.isInteger(v)).toBe(true);

  const items = p.lines.filter((l): l is ItemLine => l.kind === 'item');
  expect(items.length).toBeGreaterThanOrEqual(level.lines[0]);
  expect(items.length).toBeLessThanOrEqual(level.lines[1]);
  expect(sum(items.map((l) => l.amount))).toBe(p.subtotal);
  expect(sum(p.lines.map((l) => l.amount))).toBe(p.total);
  expect(p.total).toBeLessThanOrEqual(level.totalMaxRare ?? level.totalMax);
  expect(p.total).toBeGreaterThan(0);

  for (const item of items) {
    const scenario = SCENARIOS.find((s) => s.id === p.scenarioId)!;
    const product = scenario.products.find((x) => x.id === item.productId)!;
    expect(item.unitPrice % stepFor(product, level, scenario)).toBe(0);
    expect(item.unitPrice).toBeGreaterThanOrEqual(level.price.min);
    expect(item.unitPrice).toBeLessThanOrEqual(level.price.max);
    if (item.unit === 'u') expect(item.qty).toBeLessThanOrEqual(Math.max(level.qtyMax, p.people));
    if (!level.weights && item.unit === 'kg') expect(item.grams).toBe(1000);
    if (!level.promos) expect(item.promo).toBeUndefined();
    if (item.promo) expect(promoSaving(item.promo, item.unitPrice, item.qty)).toBeGreaterThanOrEqual(0);
  }

  if (p.split) {
    expect(level.split).toBe(true);
    expect(p.split.share * p.split.people).toBe(p.total);
    expect(p.due).toBe(p.split.share);
  } else {
    expect(p.due).toBe(p.total);
  }

  // Payment: enough, realistic and with change
  expect(sum(p.payment)).toBe(p.paid);
  expect(p.paid).toBeGreaterThan(p.due);
  expect(p.change).toBe(p.paid - p.due);
  expect(p.change).toBeGreaterThan(0);
  for (const piece of p.payment) {
    expect([...level.pay.pieces, 1, 2, 5, 10, 20, 50]).toContain(piece);
  }
  if (!p.trick) {
    // no superfluous piece
    const smallest = Math.min(...p.payment);
    expect(p.paid - smallest).toBeLessThan(p.due);
    expect(p.payment.length).toBeLessThanOrEqual(level.pay.maxPieces);
  }
  // nobody pays a small amount with a huge bill
  const covering = [...level.pay.pieces].sort((a, b) => a - b).filter((x) => x > p.due);
  if (covering.length > 0) {
    expect(Math.max(...p.payment)).toBeLessThanOrEqual(covering[1] ?? covering[0]!);
  }

  // Change can always be returned with the level money
  expect(isComposable(p.change, level.money)).toBe(true);
  expect(sum(greedyChange(p.change, level.money))).toBe(p.change);
  if (p.level <= 2) expect(p.change % 100).toBe(0);
  if (p.level === 3) expect([0, 50]).toContain(p.change % 100);
  if (p.level === 4) expect(p.change % 10).toBe(0);

  expect(p.borrow).toBe(hasBorrow(p.paid, p.due));
}

describe.each(SCENARIOS.map((s) => [s.id, s] as const))('generator · %s', (_id, scenario) => {
  it.each(LEVEL_IDS)(`level %i respects every constraint in ${CASES} random cases`, (levelId) => {
    const level = getLevel(levelId);
    const rng = createRng(levelId * 1000 + scenario.id.length);
    let list = buildPriceList(scenario, level, rng);
    let borrows = 0;
    let promos = 0;
    let splits = 0;
    let tricks = 0;
    for (let i = 0; i < CASES; i++) {
      if (i % 25 === 0) list = buildPriceList(scenario, level, rng);
      const tier = ((i % 3) - 1) as Tier;
      const p = generateProblem(scenario, level, list, { seed: rng.int(0, 2 ** 31), tier });
      checkProblem(p);
      if (p.borrow) borrows++;
      if (p.lines.some((l) => l.kind === 'promo')) promos++;
      if (p.split) splits++;
      if (p.trick) tricks++;
    }
    const share = borrows / CASES;
    if (process.env.GEN_STATS) console.log(scenario.id, levelId, { share, promos: promos / CASES, splits: splits / CASES, tricks: tricks / CASES });
    // Both kinds of problems appear, borrow share near the target.
    expect(share).toBeGreaterThan(level.borrowShare - 0.2);
    expect(share).toBeLessThan(Math.min(0.995, level.borrowShare + 0.2));
    if (level.promos && scenario.kind === 'basket') expect(promos / CASES).toBeGreaterThan(0.3);
    if (level.split && scenario.kind === 'table') expect(splits / CASES).toBeGreaterThan(0.15);
    if (level.pay.trickWeight > 0) expect(tricks).toBeGreaterThan(0);
  });
});

describe('payment candidates', () => {
  it('level 1 pays 3 € with 5 € or 10 €, and 7 € only with 10 €', () => {
    const l1 = getLevel(1);
    expect(paymentCandidates(300, l1).map((c) => c.paid).sort()).toEqual([1000, 500]);
    expect(paymentCandidates(700, l1).map((c) => c.paid)).toEqual([1000]);
    expect(paymentCandidates(1000, l1)).toEqual([]);
  });
  it('never offers a payment with a superfluous piece (except the cents trick)', () => {
    for (const levelId of LEVEL_IDS) {
      const level = getLevel(levelId);
      for (let due = level.price.step; due <= level.totalMax; due += level.price.step * 7) {
        for (const c of paymentCandidates(due, level)) {
          expect(c.paid).toBeGreaterThan(due);
          if (!c.trick) expect(c.paid - Math.min(...c.pieces)).toBeLessThan(due);
        }
      }
    }
  });
  it('level 6 includes «rare» payments that give round change', () => {
    const l6 = getLevel(6);
    const c = paymentCandidates(1505, l6).find((x) => x.paid === 2005);
    expect(c?.trick).toBe(true);
  });
});

describe('price list', () => {
  it('bigger sizes cost more and products only appear when their price fits the level', () => {
    const rng = createRng(3);
    for (const scenario of SCENARIOS) {
      for (const levelId of LEVEL_IDS) {
        const level = getLevel(levelId);
        const list = buildPriceList(scenario, level, rng);
        expect(list.entries.length).toBeGreaterThanOrEqual(4);
        for (const product of scenario.products) {
          const sized = list.entries.filter((e) => e.product.id === product.id && e.size);
          for (let i = 1; i < sized.length; i++) expect(sized[i]!.price).toBeGreaterThan(sized[i - 1]!.price);
        }
      }
    }
  });
  it('percentage discounts always give exact cents', () => {
    const rng = createRng(11);
    for (let i = 0; i < 2000; i++) {
      const list = buildPriceList(SCENARIOS[0]!, getLevel(6), rng);
      for (const e of list.entries) {
        if (e.promo) for (let q = 1; q <= 6; q++) expect(Number.isInteger(promoSaving(e.promo, e.price, q))).toBe(true);
      }
    }
  });
});
