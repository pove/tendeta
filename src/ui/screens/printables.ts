import { countUpPoints } from '../../core/countup';
import { generateProblem } from '../../core/generator';
import { BILLS, COINS, formatEuro, formatShort } from '../../core/money';
import { buildPriceList } from '../../core/pricing';
import { createRng } from '../../core/rng';
import type { ProfileStats } from '../../core/stats';
import type { LevelId, Problem } from '../../core/types';
import { getLevel, getScenario } from '../../data';
import { L, t } from '../../i18n';
import type { Profile } from '../../state/store';
import { pieceElement } from '../components/moneytray';
import { itemDetail, itemTitle, promoTitle } from '../components/ticket';
import { h } from '../dom';
import { statsBlock } from './adult';

/**
 * Printable worksheets built from the same problem generator: tickets to play
 * shop in class without screens, an answer key and cut-out play money.
 */
function printRoot(): HTMLElement {
  let el = document.getElementById('print-root');
  if (!el) {
    el = h('div', { id: 'print-root' });
    document.body.appendChild(el);
  }
  return el;
}

function doPrint(content: HTMLElement): void {
  const root = printRoot();
  root.replaceChildren(content);
  document.body.classList.add('has-print');
  const cleanup = (): void => {
    document.body.classList.remove('has-print');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // Let fonts/SVG settle before opening the dialog.
  setTimeout(() => window.print(), 150);
}

function paperTicket(p: Problem, n: number, shopName: string, blankTotal: boolean): HTMLElement {
  return h(
    'article',
    { class: 'paper-ticket' },
    h('header', null, h('span', { class: 'pt-n' }, `#${n}`), h('strong', null, 'TENDETA'), h('span', null, shopName)),
    h(
      'table',
      null,
      h(
        'tbody',
        null,
        ...p.lines.map((l) =>
          l.kind === 'item'
            ? h('tr', null, h('td', null, `${l.icon} ${itemTitle(l)}`, itemDetail(l) ? h('small', null, itemDetail(l)) : null), h('td', { class: 'num' }, formatEuro(l.amount)))
            : h('tr', { class: 'pt-promo' }, h('td', null, promoTitle(l)), h('td', { class: 'num' }, formatEuro(l.amount))),
        ),
      ),
    ),
    h('p', { class: 'pt-total' }, h('span', null, t('ticket.total')), h('strong', null, blankTotal ? '________' : formatEuro(p.total))),
    p.split ? h('p', { class: 'pt-split' }, t('ticket.split', { people: p.split.people }), ' ', h('strong', null, blankTotal ? '________' : formatEuro(p.split.share))) : null,
    h('p', { class: 'pt-paid' }, t('sheets.pays'), ' ', h('strong', null, formatEuro(p.paid)), h('span', { class: 'pt-pieces' }, ...p.payment.map((x) => pieceElement(x, 0.36)))),
    h('p', { class: 'pt-change' }, t('sheets.change'), ' ________'),
    h('div', { class: 'pt-line', 'aria-hidden': 'true' }),
  );
}

export function printSheets(opts: { scenarioId: string; level: LevelId; count: number; blankTotal: boolean; money: boolean; solutions: boolean }): void {
  const scenario = getScenario(opts.scenarioId);
  const level = getLevel(opts.level);
  const rng = createRng();
  const list = buildPriceList(scenario, level, rng);
  const problems = Array.from({ length: opts.count }, () => generateProblem(scenario, level, list, { seed: rng.int(0, 2 ** 31) }));
  const shopName = L(scenario.name);
  const title = h('h1', { class: 'sheet-title' }, `Tendeta · ${shopName} · ${t('play.levelChip', { n: level.level })}`);
  const pages: HTMLElement[] = [];
  for (let i = 0; i < problems.length; i += 6) {
    pages.push(
      h(
        'section',
        { class: 'sheet-page' },
        i === 0 ? title : null,
        i === 0 ? h('p', { class: 'sheet-instructions' }, t('sheets.instructions')) : null,
        h('div', { class: 'ticket-grid' }, ...problems.slice(i, i + 6).map((p, j) => paperTicket(p, i + j + 1, shopName, opts.blankTotal))),
      ),
    );
  }
  if (opts.solutions) {
    pages.push(
      h(
        'section',
        { class: 'sheet-page' },
        h('h2', null, t('sheets.solutionsTitle')),
        h(
          'ol',
          { class: 'solutions' },
          ...problems.map((p) =>
            h(
              'li',
              null,
              h('strong', null, formatEuro(p.change)),
              ` — ${t('ticket.total')}: ${formatEuro(p.due)} · ${t('sheets.pays')} ${formatEuro(p.paid)} · `,
              h('span', { class: 'sol-count' }, countUpPoints(p.due, p.paid).map((x) => formatShort(x)).join(' → ')),
            ),
          ),
        ),
      ),
    );
  }
  if (opts.money) {
    const usable = [...COINS, ...BILLS].filter((v) => level.money.includes(v) || level.pay.pieces.includes(v));
    pages.push(
      h(
        'section',
        { class: 'sheet-page money-page' },
        h('h2', null, t('sheets.moneyTitle')),
        h('p', { class: 'sheet-instructions' }, t('sheets.moneyHelp')),
        h('div', { class: 'cut-money' }, ...usable.flatMap((v) => Array.from({ length: v >= 500 ? 3 : 4 }, () => h('span', { class: 'cut' }, pieceElement(v, v >= 500 ? 0.85 : 0.9))))),
      ),
    );
  }
  doPrint(h('div', { class: 'print-doc' }, ...pages));
}

export function printSummary(profile: Profile, stats: ProfileStats): void {
  const d = new Date();
  doPrint(
    h(
      'div',
      { class: 'print-doc' },
      h(
        'section',
        { class: 'sheet-page' },
        h('h1', { class: 'sheet-title' }, `Tendeta · ${t('stats.summaryTitle')}`),
        h('p', null, `${profile.avatar} ${profile.alias} · ${d.toLocaleDateString(document.documentElement.lang)}`),
        statsBlock(stats),
        h('p', { class: 'help' }, t('stats.printNote')),
      ),
    ),
  );
}
