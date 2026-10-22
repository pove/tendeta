import type { Tier } from './generator';

/**
 * Gentle adaptive adjustment inside a level (spec §7):
 *  - 5 correct answers in a row (first try) → a bit harder,
 *  - 2 failed problems in a row → a bit easier and the hint is offered.
 */
export interface AdaptiveState {
  tier: Tier;
  streak: number;
  fails: number;
}

export function initialAdaptive(): AdaptiveState {
  return { tier: 0, streak: 0, fails: 0 };
}

export function updateAdaptive(state: AdaptiveState, firstTry: boolean): { state: AdaptiveState; offerHint: boolean } {
  if (firstTry) {
    const streak = state.streak + 1;
    if (streak >= 5) {
      return { state: { tier: Math.min(1, state.tier + 1) as Tier, streak: 0, fails: 0 }, offerHint: false };
    }
    return { state: { ...state, streak, fails: 0 }, offerHint: false };
  }
  const fails = state.fails + 1;
  if (fails >= 2) {
    return { state: { tier: Math.max(-1, state.tier - 1) as Tier, streak: 0, fails: 0 }, offerHint: true };
  }
  return { state: { ...state, streak: 0, fails }, offerHint: false };
}
