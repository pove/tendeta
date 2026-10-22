import type { Cents } from './money';

/**
 * Number of borrows ("llevades") needed to compute `paid − price` with the
 * written column method, working on the digits of the amounts in cents.
 *   10,00 − 3,70 → 2 borrows (cents column and units column)
 *    5,00 − 3,00 → 0 borrows
 */
export function borrowCount(paid: Cents, price: Cents): number {
  if (paid < price) throw new Error('paid must be ≥ price');
  let a = paid;
  let b = price;
  let borrow = 0;
  let count = 0;
  while (a > 0 || b > 0) {
    const da = (a % 10) - borrow;
    const db = b % 10;
    if (da < db) {
      borrow = 1;
      count++;
    } else {
      borrow = 0;
    }
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return count;
}

export function hasBorrow(paid: Cents, price: Cents): boolean {
  return borrowCount(paid, price) > 0;
}

/**
 * Result of the typical mistake of subtracting digit by digit without
 * borrowing (always the smaller digit from the bigger one). Used to detect
 * "fallo con llevada".
 */
export function noBorrowMistake(paid: Cents, price: Cents): Cents {
  let a = paid;
  let b = price;
  let result = 0;
  let factor = 1;
  while (a > 0 || b > 0) {
    const da = a % 10;
    const db = b % 10;
    result += Math.abs(da - db) * factor;
    factor *= 10;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return result;
}

/**
 * Result of forgetting to subtract the borrowed unit (subtracting
 * `10 + da − db` correctly in a column but not taking the 1 from the next one).
 */
export function forgotBorrowMistake(paid: Cents, price: Cents): Cents {
  let a = paid;
  let b = price;
  let result = 0;
  let factor = 1;
  while (a > 0 || b > 0) {
    const da = a % 10;
    const db = b % 10;
    result += (da >= db ? da - db : 10 + da - db) * factor;
    factor *= 10;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return result;
}
