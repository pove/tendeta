import type { Cents } from './money';

const THRESHOLDS: readonly Cents[] = [100, 200, 500, 1000, 2000, 5000, 10000];

export interface EstimateQuestion {
  threshold: Cents;
  /** True when the change is more than the threshold. */
  answerMore: boolean;
}

/**
 * «Will the change be more or less than 5 €?». The threshold is a round amount
 * close to the change but never too close (at least 15 % away) so the question
 * can be answered by estimation, without exact calculation.
 */
export function estimateQuestion(change: Cents, pick: (n: number) => number = (n) => Math.floor(Math.random() * n)): EstimateQuestion {
  const options = THRESHOLDS.filter((t) => Math.abs(change - t) >= t * 0.15);
  const ranked = [...options].sort((a, b) => Math.abs(Math.log(change / a)) - Math.abs(Math.log(change / b)));
  const top = ranked.slice(0, 2);
  const threshold = top.length > 0 ? top[pick(top.length)]! : 500;
  return { threshold, answerMore: change > threshold };
}
