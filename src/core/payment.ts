import { greedyChange, sum, type Cents } from './money';
import type { LevelDef } from './types';

export interface PaymentCandidate {
  pieces: Cents[];
  paid: Cents;
  /** The customer added the price cents to get round change (13,50 → 20,50). */
  trick: boolean;
  weight: number;
}

/**
 * Realistic ways a customer could pay `due` with the pieces allowed in the level:
 *  - the payment covers the amount and is strictly bigger (there is change),
 *  - no piece is superfluous: removing any piece would not be enough,
 *  - the biggest piece is at most one step above the smallest piece that
 *    covers the amount (nobody pays 2 € with a 100 € bill),
 *  - from level 3 on, the customer may add the price cents so the change is round.
 */
export function paymentCandidates(due: Cents, level: LevelDef): PaymentCandidate[] {
  const pieces = [...level.pay.pieces].sort((a, b) => a - b);
  const covering = pieces.filter((p) => p > due);
  let cap: Cents;
  if (covering.length === 0) cap = pieces[pieces.length - 1]!;
  else cap = covering[1] ?? covering[0]!;
  const usable = pieces.filter((p) => p <= cap);

  const result: PaymentCandidate[] = [];
  const seen = new Set<string>();
  const add = (c: PaymentCandidate): void => {
    const key = c.pieces.join('+');
    if (seen.has(key)) return;
    seen.add(key);
    result.push(c);
  };

  // Enumerate multisets as non-increasing sequences.
  const walk = (start: number, chosen: Cents[]): void => {
    if (chosen.length > 0) {
      const paid = sum(chosen);
      if (paid > due) {
        const smallest = chosen[chosen.length - 1]!;
        if (paid - smallest < due) {
          const minimalSingle = chosen.length === 1 && chosen[0] === covering[0];
          const weight = (1 / chosen.length ** 2) * (chosen.length === 1 && !minimalSingle ? 0.45 : 1);
          add({ pieces: [...chosen], paid, trick: false, weight });
        }
        return; // adding more pieces would make one superfluous
      }
    }
    if (chosen.length >= level.pay.maxPieces) return;
    for (let i = start; i >= 0; i--) {
      chosen.push(usable[i]!);
      walk(i, chosen);
      chosen.pop();
    }
  };
  walk(usable.length - 1, []);

  if (level.pay.trickWeight > 0) {
    const cents = due % 100;
    if (cents !== 0) {
      const extra = greedyChange(cents, [1, 2, 5, 10, 20, 50]);
      if (extra.length <= 3) {
        for (const base of [...result]) {
          if (base.paid % 100 !== 0) continue;
          const paid = base.paid + cents;
          if (paid - due <= 0) continue;
          add({
            pieces: [...base.pieces, ...extra],
            paid,
            trick: true,
            weight: base.weight * level.pay.trickWeight,
          });
        }
      }
    }
  }
  return result;
}
