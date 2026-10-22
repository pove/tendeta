import { hasBorrow } from './borrow';
import type { Cents } from './money';
import { paymentCandidates } from './payment';
import { lineAmount, promoSaving } from './pricing';
import { createRng, type Rng } from './rng';
import type { ItemLine, LevelDef, PriceEntry, PriceList, Problem, PromoLine, Scenario, TicketLine } from './types';

export type Tier = -1 | 0 | 1;
export type Focus = 'carry' | 'percent' | 'cents' | null;

export interface GenOptions {
  /** Soft adaptive adjustment inside the level. */
  tier?: Tier;
  /** Review the most frequent kind of mistake. */
  focus?: Focus;
  seed?: number;
}

const MAX_ATTEMPTS = 120;

export function generateProblem(
  scenario: Scenario,
  level: LevelDef,
  priceList: PriceList,
  opts: GenOptions = {},
): Problem {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  const rng = createRng(seed);
  const tier = opts.tier ?? 0;
  let borrowShare = level.borrowShare + (tier === -1 ? -0.2 : tier === 1 ? 0.08 : 0);
  if (opts.focus === 'carry') borrowShare += 0.15;
  borrowShare = Math.min(0.95, Math.max(0.2, borrowShare));
  const wantBorrow = rng.chance(borrowShare);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rare = level.totalMaxRare !== undefined && rng.chance(level.rareChance ?? 0);
    let totalMax = rare ? level.totalMaxRare! : level.totalMax;
    if (tier === -1) totalMax = Math.max(level.price.max, Math.round((totalMax * 0.6) / 100) * 100);

    const built =
      scenario.kind === 'table'
        ? buildTable(level, priceList, rng, totalMax, tier)
        : buildBasket(level, priceList, rng, totalMax, tier, opts.focus ?? null);
    if (!built) continue;
    const { items, people } = built;

    const { lines, subtotal, total } = assembleTicket(items);
    if (total <= 0 || total > totalMax) continue;

    let split: Problem['split'];
    if (level.split && scenario.kind === 'table' && people >= 2 && rng.chance(0.5)) {
      if (total % people !== 0) continue;
      split = { people, share: total / people };
    }
    const due = split ? split.share : total;

    const candidates = paymentCandidates(due, level);
    if (candidates.length === 0) continue;
    let pool = candidates.filter((c) => hasBorrow(c.paid, due) === wantBorrow);
    if (pool.length === 0) {
      if (attempt < MAX_ATTEMPTS * 0.75) continue;
      pool = candidates;
    }
    const payment = rng.weighted(pool, (c) => c.weight);
    const change = payment.paid - due;
    if (change <= 0) continue;

    return {
      seed,
      scenarioId: scenario.id,
      level: level.level,
      lines,
      subtotal,
      total,
      split,
      due,
      payment: [...payment.pieces].sort((a, b) => b - a),
      paid: payment.paid,
      change,
      borrow: hasBorrow(payment.paid, due),
      trick: payment.trick,
      people,
      customerSeed: rng.int(0, 2 ** 31),
    };
  }
  throw new Error(`Could not generate a problem for ${scenario.id} level ${level.level}`);
}

/** Ticket lines (items followed by their offer lines) and totals. */
export function assembleTicket(items: ItemLine[]): { lines: TicketLine[]; subtotal: Cents; total: Cents } {
  const lines: TicketLine[] = [];
  let subtotal = 0;
  let savings = 0;
  for (const item of items) {
    lines.push(item);
    subtotal += item.amount;
    if (item.promo) {
      const saving = promoSaving(item.promo, item.unitPrice, item.qty);
      if (saving > 0) {
        const promoLine: PromoLine = { kind: 'promo', key: item.key, promo: item.promo, name: item.name, amount: -saving };
        lines.push(promoLine);
        savings += saving;
      }
    }
  }
  return { lines, subtotal, total: subtotal - savings };
}

/** Build a complete problem from a basket chosen by the player (free shop mode). */
export function problemFromBasket(
  scenario: Scenario,
  level: LevelDef,
  items: ItemLine[],
  payment: { pieces: Cents[]; paid: Cents; trick: boolean },
  people = 1,
): Problem {
  const { lines, subtotal, total } = assembleTicket(items);
  const seed = Math.floor(Math.random() * 2 ** 31);
  return {
    seed,
    scenarioId: scenario.id,
    level: level.level,
    lines,
    subtotal,
    total,
    due: total,
    payment: [...payment.pieces].sort((a, b) => b - a),
    paid: payment.paid,
    change: payment.paid - total,
    borrow: hasBorrow(payment.paid, total),
    trick: payment.trick,
    people,
    customerSeed: seed,
  };
}

function linesRange(level: LevelDef, tier: Tier): [number, number] {
  const [lo, hi] = level.lines;
  if (tier === -1) return [lo, Math.max(lo, hi - 1)];
  if (tier === 1) return [Math.min(hi, lo + 1), hi];
  return [lo, hi];
}

export function makeItem(entry: PriceEntry, qty: number, grams: number | undefined): ItemLine {
  const unit = entry.product.unit;
  return {
    kind: 'item',
    key: entry.key,
    productId: entry.product.id,
    icon: entry.product.icon,
    name: entry.product.name,
    sizeName: entry.size?.name,
    unit,
    qty: unit === 'kg' ? 1 : qty,
    grams: unit === 'kg' ? (grams ?? 1000) : undefined,
    unitPrice: entry.price,
    amount: lineAmount(entry.price, unit, qty, grams),
    promo: entry.promo,
  };
}

const WEIGHTS = [500, 1000, 1500, 2000];

function chooseQty(entry: PriceEntry, level: LevelDef, rng: Rng, room: Cents): number {
  const promo = entry.promo;
  if (promo?.type === '2x1') return Math.min(level.qtyMax, rng.pick([2, 2, 3, 4]));
  if (promo?.type === '3x2') return Math.min(level.qtyMax, rng.pick([3, 3, 4, 6]));
  if (level.qtyMax > 1 && rng.chance(0.4)) {
    const max = Math.min(level.qtyMax, Math.floor(room / entry.price));
    if (max >= 2) return rng.int(2, max);
  }
  return 1;
}

function buildBasket(
  level: LevelDef,
  list: PriceList,
  rng: Rng,
  totalMax: Cents,
  tier: Tier,
  focus: Focus,
): { items: ItemLine[]; people: number } | null {
  const [lo, hi] = linesRange(level, tier);
  const target = rng.int(lo, hi);
  let pool = rng.shuffle(list.entries);
  // Level 6: most customers bring at least one product on offer.
  if (level.promos && (focus === 'percent' || rng.chance(0.7))) {
    const promos = pool.filter((e) => e.promo);
    const rest = pool.filter((e) => !e.promo);
    pool = [...promos.slice(0, rng.int(1, Math.max(1, promos.length))), ...rest];
  }
  const items: ItemLine[] = [];
  const usedProducts = new Set<string>();
  let subtotal = 0;
  for (const entry of pool) {
    if (items.length >= target) break;
    if (usedProducts.has(entry.product.id)) continue;
    const room = totalMax - subtotal;
    if (entry.product.unit === 'kg') {
      const options = level.weights ? rng.shuffle(WEIGHTS) : [1000];
      const grams = options.find((g) => lineAmount(entry.price, 'kg', 1, g) <= room);
      if (grams === undefined) continue;
      const item = makeItem(entry, 1, grams);
      items.push(item);
      subtotal += item.amount;
    } else {
      let qty = chooseQty(entry, level, rng, room);
      while (qty > 1 && entry.price * qty > room) qty--;
      if (entry.price * qty > room) continue;
      const item = makeItem(entry, qty, undefined);
      items.push(item);
      subtotal += item.amount;
    }
    usedProducts.add(entry.product.id);
  }
  if (items.length < lo) return null;
  return { items, people: 1 };
}

function buildTable(
  level: LevelDef,
  list: PriceList,
  rng: Rng,
  totalMax: Cents,
  tier: Tier,
): { items: ItemLine[]; people: number } | null {
  const [lo, hi] = linesRange(level, tier);
  const people = rng.int(level.people[0], level.people[1]);
  const byCategory = (cats: string[]): PriceEntry[] => list.entries.filter((e) => cats.includes(e.product.category));
  const menus = byCategory(['menu']);
  const mains = byCategory(['primero', 'segundo', 'tapa']);
  const desserts = byCategory(['postre']);
  const drinks = byCategory(['bebida']);
  if (mains.length === 0 && menus.length === 0) return null;

  const counts = new Map<string, { entry: PriceEntry; qty: number }>();
  let subtotal = 0;
  const order = (entry: PriceEntry | undefined): void => {
    if (!entry) return;
    const existing = counts.get(entry.key);
    if (!existing && counts.size >= hi) return;
    if (subtotal + entry.price > totalMax) return;
    if (existing) existing.qty++;
    else counts.set(entry.key, { entry, qty: 1 });
    subtotal += entry.price;
  };

  for (let p = 0; p < people; p++) {
    if (menus.length > 0 && rng.chance(0.45)) {
      order(rng.pick(menus));
    } else if (mains.length > 0) {
      order(rng.pick(mains));
      if (desserts.length > 0 && rng.chance(0.45)) order(rng.pick(desserts));
    }
    if (drinks.length > 0 && rng.chance(0.75)) order(rng.pick(drinks));
  }
  const items = [...counts.values()].map(({ entry, qty }) => makeItem(entry, qty, undefined));
  if (items.length < lo || items.length > hi) return null;
  return { items, people };
}
