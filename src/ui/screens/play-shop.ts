import { assembleTicket, makeItem, problemFromBasket } from '../../core/generator';
import { formatEuro, type Cents } from '../../core/money';
import { paymentCandidates, type PaymentCandidate } from '../../core/payment';
import { lineAmount } from '../../core/pricing';
import type { Rng } from '../../core/rng';
import type { ItemLine, LevelDef, PriceEntry, PriceList, Problem, Scenario } from '../../core/types';
import { L, t, type Key } from '../../i18n';
import { play as sound } from '../../services/sound';
import { say } from '../../services/speech';
import { openModal, toast } from '../components/modal';
import { pieceElement } from '../components/moneytray';
import { formatKg } from '../components/ticket';
import { h } from '../dom';
import { icon } from '../svg/icons';

interface BasketLine {
  entry: PriceEntry;
  qty: number;
  grams?: number;
}

const WEIGHTS = [500, 1000, 1500, 2000];

function entryTitle(e: PriceEntry): string {
  return e.size ? `${L(e.product.name)} (${L(e.size.name)})` : L(e.product.name);
}

function priceTag(e: PriceEntry): string {
  return e.product.unit === 'kg' ? `${formatEuro(e.price)}/kg` : formatEuro(e.price);
}

function promoBadge(e: PriceEntry): string | null {
  if (!e.promo) return null;
  if (e.promo.type === 'pct') return `−${e.promo.pct} %`;
  return e.promo.type === '2x1' ? '2×1' : '3×2';
}

/**
 * Free shop: the player is first the customer (fills the basket and chooses
 * how to pay) and then the cashier.
 */
export function shoppingPhase(ctx: {
  main: HTMLElement;
  register: HTMLElement;
  counter: HTMLElement;
  scenario: Scenario;
  level: LevelDef;
  priceList: PriceList;
  rng: Rng;
}): Promise<Problem | null> {
  const { main, scenario, level, priceList } = ctx;
  const maxLines = level.lines[1];
  const maxTotal = level.totalMaxRare ?? level.totalMax;
  const qtyMax = scenario.kind === 'table' ? Math.max(level.qtyMax, 4) : level.qtyMax;
  const basket = new Map<string, BasketLine>();

  return new Promise((resolve) => {
    const saved = [...main.childNodes];
    const subtotal = (): Cents => [...basket.values()].reduce((a, l) => a + lineAmount(l.entry.price, l.entry.product.unit, l.qty, l.grams), 0);

    const basketList = h('ul', { class: 'basket-list', 'aria-live': 'polite' });
    const basketInfo = h('p', { class: 'basket-info' });
    const checkout = h('button', { type: 'button', class: 'btn btn-go', 'data-testid': 'checkout' }, t('shop.checkout'), h('span', { html: icon('next', 22) }));
    const shelf = h('div', { class: 'shelf' });
    const cards = new Map<string, HTMLButtonElement>();

    const canAdd = (e: PriceEntry, grams?: number): boolean => {
      const line = basket.get(e.key);
      if (!line && basket.size >= maxLines) return false;
      if (line && e.product.unit === 'u' && line.qty >= qtyMax) return false;
      if (line && e.product.unit === 'kg') return false;
      const add = e.product.unit === 'kg' ? lineAmount(e.price, 'kg', 1, grams ?? 500) : e.price;
      return subtotal() + add <= maxTotal;
    };

    const render = (): void => {
      basketList.replaceChildren(
        ...[...basket.values()].map((l) =>
          h(
            'li',
            { class: 'basket-line' },
            h('span', { class: 'tk-icon', 'aria-hidden': 'true' }, l.entry.product.icon),
            h('span', { class: 'basket-name' }, entryTitle(l.entry), h('small', null, l.entry.product.unit === 'kg' ? formatKg(l.grams ?? 1000) : `× ${l.qty}`)),
            h('button', {
              type: 'button',
              class: 'icon-btn small',
              'aria-label': t('shop.remove', { name: entryTitle(l.entry) }),
              html: icon('minus', 20),
              onclick: () => {
                if (l.entry.product.unit === 'u' && l.qty > 1) l.qty--;
                else basket.delete(l.entry.key);
                sound('tap');
                render();
              },
            }),
          ),
        ),
      );
      if (basket.size === 0) basketList.appendChild(h('li', { class: 'basket-empty' }, t('shop.empty')));
      basketInfo.textContent = t('shop.limits', { lines: maxLines, max: formatEuro(maxTotal, { decimals: 'auto' }) });
      checkout.disabled = basket.size < level.lines[0];
      checkout.title = checkout.disabled ? t('shop.needMore', { n: level.lines[0] }) : '';
      for (const [key, btn] of cards) {
        const entry = priceList.entries.find((e) => e.key === key)!;
        const count = basket.get(key);
        btn.disabled = !canAdd(entry);
        btn.classList.toggle('in-basket', Boolean(count));
        const badge = btn.querySelector('.card-count') as HTMLElement;
        badge.textContent = count ? (entry.product.unit === 'kg' ? formatKg(count.grams ?? 1000) : `×${count.qty}`) : '';
      }
    };

    const addEntry = (e: PriceEntry): void => {
      if (e.product.unit === 'kg' && level.weights) {
        const options = WEIGHTS.filter((g) => canAdd(e, g) && subtotal() + lineAmount(e.price, 'kg', 1, g) <= maxTotal);
        if (options.length === 0) return;
        const m = openModal({
          title: t('shop.howMuch', { name: entryTitle(e) }),
          body: h(
            'div',
            { class: 'weight-options' },
            ...options.map((g) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-choice',
                  onclick: () => {
                    basket.set(e.key, { entry: e, qty: 1, grams: g });
                    sound('tap');
                    m.close();
                    render();
                  },
                },
                formatKg(g),
              ),
            ),
          ),
        });
        return;
      }
      if (!canAdd(e)) return;
      const line = basket.get(e.key);
      if (line) line.qty++;
      else basket.set(e.key, { entry: e, qty: 1, grams: e.product.unit === 'kg' ? 1000 : undefined });
      sound('tap');
      say(entryTitle(e));
      render();
    };

    // Shelf grouped by category
    const byCat = new Map<string, PriceEntry[]>();
    for (const e of priceList.entries) {
      const list = byCat.get(e.product.category) ?? [];
      list.push(e);
      byCat.set(e.product.category, list);
    }
    for (const [cat, entries] of byCat) {
      shelf.appendChild(h('h3', { class: 'shelf-cat' }, t(`cat.${cat}` as Key)));
      const row = h('div', { class: 'shelf-row' });
      for (const e of entries) {
        const badge = promoBadge(e);
        const card = h(
          'button',
          { type: 'button', class: 'product-card', 'data-testid': 'product', onclick: () => addEntry(e), 'aria-label': `${entryTitle(e)}, ${priceTag(e)}` },
          h('span', { class: 'product-icon', 'aria-hidden': 'true' }, e.product.icon),
          h('span', { class: 'product-name' }, entryTitle(e)),
          h('span', { class: 'price-tag' }, priceTag(e)),
          badge ? h('span', { class: 'promo-badge' }, badge) : null,
          h('span', { class: 'card-count', 'aria-hidden': 'true' }),
        );
        cards.set(e.key, card);
        row.appendChild(card);
      }
      shelf.appendChild(row);
    }

    checkout.addEventListener('click', () => {
      const items: ItemLine[] = [...basket.values()].map((l) => makeItem(l.entry, l.qty, l.grams));
      const { total } = assembleTicket(items);
      const candidates = paymentCandidates(total, level);
      if (candidates.length === 0) {
        toast(t('shop.noChange'));
        return;
      }
      choosePayment(candidates, total, (payment) => {
        const problem = problemFromBasket(scenario, level, items, payment, scenario.kind === 'table' ? Math.max(1, Math.min(4, Math.ceil(items.length / 2))) : 1);
        main.replaceChildren(...saved);
        resolve(problem);
      });
    });

    const view = h(
      'div',
      { class: 'shop-view' },
      h('section', { class: 'shelf-wrap', 'aria-label': t('shop.shelf') }, h('h2', { class: 'panel-title' }, scenario.kind === 'table' ? t('shop.titleTable') : t('shop.titleBasket')), shelf),
      h('aside', { class: 'basket', 'aria-label': t('shop.basket') }, h('h2', { class: 'panel-title' }, h('span', { html: icon('basket', 22) }), t('shop.basket')), basketList, basketInfo, checkout),
    );
    main.replaceChildren(view);
    render();
    say(scenario.kind === 'table' ? t('shop.titleTable') : t('shop.titleBasket'));
  });

  function choosePayment(candidates: PaymentCandidate[], due: Cents, onPick: (c: PaymentCandidate) => void): void {
    const unique = new Map<Cents, PaymentCandidate>();
    for (const c of [...candidates].sort((a, b) => b.weight - a.weight || a.pieces.length - b.pieces.length)) {
      if (!unique.has(c.paid)) unique.set(c.paid, c);
    }
    const options = [...unique.values()].slice(0, 4);
    const m = openModal({
      title: t('shop.payTitle', { total: formatEuro(due) }),
      body: h(
        'div',
        { class: 'pay-options' },
        ...options.map((c) =>
          h(
            'button',
            {
              type: 'button',
              class: 'pay-option',
              'data-testid': 'pay-option',
              onclick: () => {
                m.close();
                onPick(c);
              },
            },
            h('span', { class: 'pay-pieces' }, ...c.pieces.map((p) => pieceElement(p, 0.42))),
            h('strong', null, formatEuro(c.paid)),
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-ghost',
            'data-testid': 'pay-random',
            onclick: () => {
              m.close();
              onPick(ctx.rng.weighted(candidates, (c) => c.weight));
            },
          },
          '🎲 ',
          t('shop.payRandom'),
        ),
      ),
    });
  }
}
