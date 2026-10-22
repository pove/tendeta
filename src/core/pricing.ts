import type { Cents } from './money';
import type { LevelDef, PriceEntry, PriceList, Product, Promo, Scenario } from './types';
import type { Rng } from './rng';

/**
 * Draw a price inside the realistic range of a product, constrained by the
 * level range and rounded to the level step. Returns null when the product
 * does not fit the level (a 12 € paella never appears in level 1).
 */
export function drawPrice(range: [Cents, Cents], level: LevelDef, rng: Rng, step: Cents = level.price.step): Cents | null {
  const lo = Math.max(range[0], level.price.min);
  const hi = Math.min(range[1], level.price.max);
  const first = Math.ceil(lo / step) * step;
  const last = Math.floor(hi / step) * step;
  if (first > last || first <= 0) return null;
  return first + step * rng.int(0, (last - first) / step);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

/**
 * Price step for a product: the level step, never below the shop's own
 * rounding (restaurants use 5 cents), and even for kilo prices so half a
 * kilo always has exact cents.
 */
export function stepFor(product: Product, level: LevelDef, scenario?: Pick<Scenario, 'minStep'>): Cents {
  let step = level.price.step;
  if (scenario?.minStep && scenario.minStep > step) step = lcm(step, scenario.minStep);
  if (product.unit === 'kg' && level.weights) step = lcm(step, 2);
  return step;
}

export function buildPriceList(scenario: Scenario, level: LevelDef, rng: Rng): PriceList {
  const entries: PriceEntry[] = [];
  for (const product of scenario.products) {
    if (product.sizes && product.sizes.length > 0) {
      const drawn = product.sizes
        .map((size) => ({ size, price: drawPrice(size.price, level, rng, stepFor(product, level, scenario)) }))
        .filter((d): d is { size: (typeof d)['size']; price: Cents } => d.price !== null);
      // Bigger sizes always cost more: sort the drawn prices and drop duplicates.
      const prices = [...new Set(drawn.map((d) => d.price))].sort((a, b) => a - b);
      const sizes = drawn.map((d) => d.size).slice(0, prices.length);
      sizes.forEach((size, i) => {
        entries.push({ key: `${product.id}:${size.id}`, product, size, price: prices[i]! });
      });
    } else if (product.price) {
      const price = drawPrice(product.price, level, rng, stepFor(product, level, scenario));
      if (price !== null) entries.push({ key: product.id, product, price });
    }
  }
  if (level.promos && scenario.kind === 'basket') assignPromos(entries, level, rng, scenario.minStep ?? 1);
  return { scenarioId: scenario.id, level: level.level, entries };
}

/** Level 6: a few offers (2×1, 3×2) and discounts with «friendly» percentages. */
function assignPromos(entries: PriceEntry[], level: LevelDef, rng: Rng, minStep: Cents): void {
  const eligible = rng.shuffle(entries.filter((e) => e.product.unit === 'u'));
  const plan: Promo[] = [
    { type: rng.pick(['2x1', '3x2'] as const) },
    { type: 'pct', pct: rng.pick([10, 25, 50] as const) },
    { type: 'pct', pct: rng.pick([10, 25, 50] as const) },
  ];
  for (const promo of plan) {
    const entry = eligible.shift();
    if (!entry) break;
    if (promo.type === 'pct') {
      const divisor = lcm(promo.pct === 10 ? 10 : promo.pct === 25 ? 4 : 2, Math.max(minStep, level.price.step));
      const rounded = Math.max(divisor, Math.round(entry.price / divisor) * divisor);
      if (rounded < level.price.min || rounded > level.price.max) continue;
      entry.price = rounded;
    }
    entry.promo = promo;
  }
}

/** Amount saved by a promo on a line of `qty` units at `price`. Always exact cents. */
export function promoSaving(promo: Promo, price: Cents, qty: number): Cents {
  switch (promo.type) {
    case '2x1':
      return Math.floor(qty / 2) * price;
    case '3x2':
      return Math.floor(qty / 3) * price;
    case 'pct': {
      const gross = price * qty;
      const saving = (gross * (promo.pct ?? 0)) / 100;
      if (!Number.isInteger(saving)) throw new Error(`Inexact discount ${promo.pct}% of ${gross}`);
      return saving;
    }
  }
}

/** Line amount for a product: units × price, or price per kilo × weight. */
export function lineAmount(price: Cents, unit: 'u' | 'kg', qty: number, grams?: number): Cents {
  if (unit === 'kg') {
    const g = grams ?? 1000;
    const amount = (price * g) / 1000;
    if (!Number.isInteger(amount)) throw new Error(`Inexact weight price ${price} × ${g} g`);
    return amount;
  }
  return price * qty;
}
