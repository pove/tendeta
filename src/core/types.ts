import type { Cents, Lang } from './money';

export type L10n = Record<'es' | 'va', string> & Partial<Record<Lang, string>>;

export type LevelId = 1 | 2 | 3 | 4 | 5 | 6;

export interface LevelDef {
  level: LevelId;
  /** Orientative school year (1.º … 6.º). */
  course: number;
  /** Min/max number of different lines on the ticket. */
  lines: [number, number];
  price: { min: Cents; max: Cents; step: Cents };
  /** Max units of the same product on one line. */
  qtyMax: number;
  totalMax: Cents;
  /** Occasionally allow a bigger total (level 2: «a veces 50 €»). */
  totalMaxRare?: Cents;
  rareChance?: number;
  pay: {
    /** Pieces the customer may pay with, in cents. */
    pieces: Cents[];
    maxPieces: number;
    /** Relative weight of payments that add the price cents (13,50 → 20,50). */
    trickWeight: number;
  };
  /** Pieces available in the drawer to return the change. */
  money: Cents[];
  decimalKey: boolean;
  /** Default visibility of the tray sum. */
  traySum: boolean;
  /** Target share of problems with borrowing in the subtraction. */
  borrowShare: number;
  /** Half-kilo quantities for products sold by weight. */
  weights: boolean;
  /** Offers 2×1, 3×2 and percentage discounts. */
  promos: boolean;
  /** Restaurant bill split between diners. */
  split: boolean;
  /** Estimation question default: on, optional (off by default) or unavailable. */
  estimation: 'on' | 'optional' | 'off';
  /** Bonus for returning the change with the minimum number of pieces. */
  minPieces: boolean;
  /** «Calcula tú el total» can be enabled. */
  calcTotal: boolean;
  /** Diners at the restaurant table. */
  people: [number, number];
}

export type Unit = 'u' | 'kg';

export interface ProductSize {
  id: string;
  name: L10n;
  price: [Cents, Cents];
}

export interface Product {
  id: string;
  name: L10n;
  icon: string;
  category: string;
  unit: Unit;
  /** Realistic price range (per unit or per kilo). */
  price?: [Cents, Cents];
  sizes?: ProductSize[];
}

export type ScenarioKind = 'basket' | 'table';

export interface Scenario {
  id: string;
  name: L10n;
  tagline: L10n;
  icon: string;
  kind: ScenarioKind;
  /** Accent colour for the scenario cards. */
  color: string;
  /** Smallest price step in this shop (restaurants round to 5 cents). */
  minStep?: Cents;
  products: Product[];
}

export type PromoType = '2x1' | '3x2' | 'pct';

export interface Promo {
  type: PromoType;
  pct?: 10 | 25 | 50;
}

/** One sellable entry of a price list (a product, or a product in a given size). */
export interface PriceEntry {
  key: string;
  product: Product;
  size?: ProductSize;
  /** Price per unit or per kilo. */
  price: Cents;
  promo?: Promo;
}

export interface PriceList {
  scenarioId: string;
  level: LevelId;
  entries: PriceEntry[];
}

export interface ItemLine {
  kind: 'item';
  key: string;
  productId: string;
  icon: string;
  name: L10n;
  sizeName?: L10n;
  unit: Unit;
  /** Units (unit products) — for kilo products always 1. */
  qty: number;
  /** Weight in grams (kilo products). */
  grams?: number;
  unitPrice: Cents;
  amount: Cents;
  promo?: Promo;
}

export interface PromoLine {
  kind: 'promo';
  key: string;
  promo: Promo;
  name: L10n;
  amount: Cents;
}

export type TicketLine = ItemLine | PromoLine;

export interface Problem {
  seed: number;
  scenarioId: string;
  level: LevelId;
  lines: TicketLine[];
  /** Sum of item lines before offers/discounts. */
  subtotal: Cents;
  total: Cents;
  split?: { people: number; share: Cents };
  /** What this customer must pay (total or their share). */
  due: Cents;
  payment: Cents[];
  paid: Cents;
  change: Cents;
  borrow: boolean;
  /** Customer handed over the price cents to get round change. */
  trick: boolean;
  people: number;
  customerSeed: number;
}

export type Mode = 'free' | 'auto' | 'challenge' | 'guided';
export type AnswerMethod = 'keypad' | 'money';
