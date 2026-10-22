import { formatEuro, type Cents } from '../../core/money';
import type { ItemLine, Problem, PromoLine, TicketLine } from '../../core/types';
import { L, t } from '../../i18n';
import { play } from '../../services/sound';
import { h, wait } from '../dom';

export function itemTitle(line: ItemLine): string {
  const name = L(line.name);
  return line.sizeName ? `${name} (${L(line.sizeName)})` : name;
}

export function formatKg(grams: number): string {
  const kg = grams / 1000;
  return `${String(kg).replace('.', ',')} kg`;
}

export function itemDetail(line: ItemLine): string | null {
  if (line.unit === 'kg') return `${formatKg(line.grams ?? 1000)} × ${formatEuro(line.unitPrice)}/kg`;
  if (line.qty > 1) return `${line.qty} × ${formatEuro(line.unitPrice)}`;
  return null;
}

export function promoTitle(line: PromoLine): string {
  if (line.promo.type === 'pct') return t('ticket.discount', { pct: line.promo.pct ?? 0, name: L(line.name) });
  return t('ticket.offer', { offer: line.promo.type === '2x1' ? '2×1' : '3×2', name: L(line.name) });
}

function lineRow(line: TicketLine): HTMLElement {
  if (line.kind === 'promo') {
    return h(
      'li',
      { class: 'tk-line tk-promo' },
      h('span', { class: 'tk-icon', 'aria-hidden': 'true' }, '🏷️'),
      h('span', { class: 'tk-name' }, promoTitle(line)),
      h('span', { class: 'tk-amount' }, formatEuro(line.amount)),
    );
  }
  const detail = itemDetail(line);
  return h(
    'li',
    { class: 'tk-line' },
    h('span', { class: 'tk-icon', 'aria-hidden': 'true' }, line.icon),
    h('span', { class: 'tk-name' }, itemTitle(line), detail ? h('small', { class: 'tk-detail' }, detail) : null),
    h('span', { class: 'tk-amount' }, formatEuro(line.amount)),
  );
}

export interface TicketView {
  el: HTMLElement;
  /** Animate the lines being scanned one by one. */
  scan(fast?: boolean): Promise<void>;
  revealTotal(): void;
}

export function ticketView(problem: Problem, shopName: string, opts: { hideTotal?: boolean } = {}): TicketView {
  const list = h('ol', { class: 'tk-lines', 'aria-label': t('ticket.lines') });
  const rows = problem.lines.map(lineRow);
  const totalValue = h('span', { class: 'tk-total-value', 'data-testid': 'ticket-total' }, opts.hideTotal ? '?' : formatEuro(0));
  const totalRow = h('div', { class: 'tk-total' }, h('span', null, t('ticket.total')), totalValue);
  const split = problem.split
    ? h(
        'div',
        { class: 'tk-split' },
        h('span', null, t('ticket.split', { people: problem.split.people })),
        h('strong', { 'data-testid': 'ticket-due' }, opts.hideTotal ? '?' : formatEuro(problem.split.share)),
      )
    : null;
  const head = h(
    'header',
    { class: 'tk-head' },
    h('strong', null, 'TENDETA'),
    h('span', null, shopName),
    problem.people > 1 ? h('span', { class: 'tk-table' }, t('ticket.table', { people: problem.people })) : null,
  );
  // The split-bill share only appears once the whole bill is known.
  if (split) split.hidden = true;
  const el = h('section', { class: 'ticket', 'aria-label': t('ticket.label') }, head, list, h('div', { class: 'tk-sep', 'aria-hidden': 'true' }), totalRow, split);
  const flash = (): void => {
    totalRow.classList.remove('tk-flash');
    void totalRow.offsetWidth;
    totalRow.classList.add('tk-flash');
  };
  const revealTotal = (): void => {
    totalValue.textContent = formatEuro(problem.total);
    if (split && problem.split) {
      (split.querySelector('strong') as HTMLElement).textContent = formatEuro(problem.split.share);
      split.hidden = false;
    }
    flash();
  };
  return {
    el,
    async scan(fast = false) {
      // Like a real till: the total grows as each product is scanned.
      let running = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        list.appendChild(row);
        row.classList.add('tk-in');
        running += problem.lines[i]!.amount;
        if (!opts.hideTotal) {
          totalValue.textContent = formatEuro(running);
          totalValue.classList.remove('tk-tick');
          void totalValue.offsetWidth;
          totalValue.classList.add('tk-tick');
        }
        play('beep');
        if (!fast) await wait(320);
      }
      if (!opts.hideTotal) revealTotal();
    },
    revealTotal,
  };
}

export function dueLabel(problem: Problem): Cents {
  return problem.due;
}
