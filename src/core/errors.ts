import { forgotBorrowMistake, noBorrowMistake } from './borrow';
import type { Cents } from './money';
import type { Problem } from './types';

export type ErrorTag = 'units' | 'carry' | 'percent' | 'split';
export type ErrorKind = 'over' | 'under';

/** Error categories recorded in the log (spec §9). */
export type ErrorType = ErrorKind | 'carry' | 'units' | 'percent' | 'split' | 'total' | 'estimate';

export interface AnswerCheck {
  correct: boolean;
  /** answer − expected (positive: too much change). */
  diff: Cents;
  kind?: ErrorKind;
  tags: ErrorTag[];
}

/** Compare an answer with the expected amount and diagnose the most likely mistake. */
export function checkChange(problem: Problem, answer: Cents): AnswerCheck {
  const expected = problem.change;
  const diff = answer - expected;
  if (diff === 0) return { correct: true, diff, tags: [] };
  const tags: ErrorTag[] = [];

  if (isUnitsConfusion(answer, expected)) tags.push('units');

  if (problem.borrow) {
    const naive = noBorrowMistake(problem.paid, problem.due);
    const forgot = forgotBorrowMistake(problem.paid, problem.due);
    const hasCents = problem.due % 100 !== 0 || problem.paid % 100 !== 0;
    const tenJump = isPowerOfTen(Math.abs(diff)) && (hasCents || Math.abs(diff) >= 1000);
    if (answer === naive || answer === forgot || tenJump) tags.push('carry');
  }

  const hasPromo = problem.lines.some((l) => l.kind === 'promo');
  if (hasPromo && problem.paid >= problem.subtotal) {
    if (answer === problem.paid - problem.subtotal) tags.push('percent');
  }
  if (hasPromo && problem.paid < problem.subtotal && answer < 0) tags.push('percent');

  if (problem.split) {
    // Paid the whole bill instead of the share, or used the total.
    if (problem.paid >= problem.total && answer === problem.paid - problem.total) tags.push('split');
    if (answer === problem.change * problem.split.people) tags.push('split');
  }

  return { correct: false, diff, kind: diff > 0 ? 'over' : 'under', tags };
}

/** The main error type stored for statistics (most specific first). */
export function errorTypeOf(check: AnswerCheck): ErrorType | null {
  if (check.correct) return null;
  if (check.tags.includes('units')) return 'units';
  if (check.tags.includes('percent')) return 'percent';
  if (check.tags.includes('split')) return 'split';
  if (check.tags.includes('carry')) return 'carry';
  return check.kind ?? null;
}

export function isUnitsConfusion(answer: Cents, expected: Cents): boolean {
  if (answer <= 0 || expected <= 0) return false;
  return (
    answer === expected * 100 ||
    answer * 100 === expected ||
    answer === expected * 10 ||
    answer * 10 === expected ||
    // Cents typed as euros: 0,40 € → 40 € ; or euros typed as cents: 3 € → 0,03 €
    (expected < 100 && answer === expected * 100) ||
    (expected % 100 === 0 && answer === expected / 100)
  );
}

function isPowerOfTen(n: number): boolean {
  if (n <= 0) return false;
  while (n % 10 === 0) n /= 10;
  return n === 1;
}

/** Check a total typed by the player in «calcula tú el total». */
export function checkTotal(problem: Problem, answer: Cents): AnswerCheck {
  const diff = answer - problem.total;
  if (diff === 0) return { correct: true, diff, tags: [] };
  const tags: ErrorTag[] = [];
  if (isUnitsConfusion(answer, problem.total)) tags.push('units');
  if (problem.lines.some((l) => l.kind === 'promo') && answer === problem.subtotal) tags.push('percent');
  return { correct: false, diff, kind: diff > 0 ? 'over' : 'under', tags };
}
