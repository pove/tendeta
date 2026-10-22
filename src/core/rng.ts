/** Small seeded PRNG (mulberry32) so problems and printable sheets are reproducible. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Weighted pick; weights must be ≥ 0 and not all zero. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  chance(p: number): boolean;
  shuffle<T>(items: readonly T[]): T[];
  readonly seed: number;
}

export function createRng(seed: number = randomSeed()): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => {
    if (max < min) throw new Error(`Invalid range ${min}..${max}`);
    return min + Math.floor(next() * (max - min + 1));
  };
  return {
    seed,
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Cannot pick from an empty list');
      return items[int(0, items.length - 1)]!;
    },
    weighted<T>(items: readonly T[], weight: (item: T) => number): T {
      const weights = items.map(weight);
      const total = weights.reduce((a, b) => a + b, 0);
      if (items.length === 0 || total <= 0) throw new Error('Cannot pick from an empty weighted list');
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i]!;
        if (r < 0) return items[i]!;
      }
      return items[items.length - 1]!;
    },
    chance(p: number): boolean {
      return next() < p;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
  };
}

export function randomSeed(): number {
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]!;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}
