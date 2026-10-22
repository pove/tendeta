import type { Cents } from './money';

/** Landmarks a cashier counts towards, in cents. */
const LANDMARKS: readonly Cents[] = [5, 10, 50, 100, 500, 1000, 2000, 5000, 10000, 20000];

export interface CountStep {
  from: Cents;
  to: Cents;
  /** Amount added in this step (to − from). */
  add: Cents;
}

/**
 * The cashier strategy ("escala ascendente"): count forward from the price to
 * the amount paid, jumping each time to the next round number.
 *   7,40 → 7,50 → 8,00 → 10,00 → 20,00
 *
 * When the customer hands over the same cents as the price (15,05 € paid with
 * 20,05 €) those cents cancel out and the count starts from the round part.
 */
export function countUpSteps(price: Cents, paid: Cents): CountStep[] {
  if (paid < price) throw new Error('paid must be ≥ price');
  const shift = paid % 100 !== 0 && price % 100 === paid % 100 ? paid % 100 : 0;
  const steps = rawSteps(price - shift, paid - shift);
  return steps.map((s) => ({ from: s.from + shift, to: s.to + shift, add: s.add }));
}

function rawSteps(price: Cents, paid: Cents): CountStep[] {
  const steps: CountStep[] = [];
  let current = price;
  while (current < paid) {
    let target = paid;
    for (const m of LANDMARKS) {
      if (current % m !== 0) {
        const next = Math.ceil(current / m) * m;
        if (next <= paid) target = next;
        break;
      }
    }
    steps.push({ from: current, to: target, add: target - current });
    current = target;
  }
  return steps;
}

/** All the points on the number line (price, intermediate landmarks, paid). */
export function countUpPoints(price: Cents, paid: Cents): Cents[] {
  const steps = countUpSteps(price, paid);
  return [steps[0]?.from ?? price, ...steps.map((s) => s.to)];
}
