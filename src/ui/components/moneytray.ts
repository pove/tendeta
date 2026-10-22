import { formatEuro, formatShort, groupPieces, sum, type Cents } from '../../core/money';
import { t } from '../../i18n';
import { play } from '../../services/sound';
import { fromHTML, h } from '../dom';
import { isBill, pieceSize, pieceSvg } from '../svg/money';

export interface MoneyTrayView {
  el: HTMLElement;
  pieces(): Cents[];
  total(): Cents;
  clear(): void;
  setDisabled(disabled: boolean): void;
  destroy(): void;
}

export function pieceName(value: Cents): string {
  return isBill(value) ? t('money.bill', { amount: formatShort(value) }) : t('money.coin', { amount: formatShort(value) });
}

export function pieceElement(value: Cents, scale = 0.78): HTMLElement {
  const { w, h: hh } = pieceSize(value, scale);
  // Decorative: the button or list around it carries the accessible name.
  const wrap = h('span', { class: `piece ${isBill(value) ? 'is-bill' : 'is-coin'}`, style: `--w:${w}px;--h:${hh}px`, 'aria-hidden': 'true' });
  wrap.appendChild(fromHTML(pieceSvg(value)));
  return wrap;
}

/**
 * Cash drawer + change tray. Tap a piece in the drawer to put it on the tray
 * (or drag it there); tap a piece on the tray to put it back.
 */
export function moneyTray(opts: {
  denominations: Cents[];
  showSum: boolean;
  submitLabel: string;
  onSubmit: (pieces: Cents[]) => void;
}): MoneyTrayView {
  const tray: Cents[] = [];
  let disabled = false;
  const denoms = [...opts.denominations].sort((a, b) => b - a);

  const traySum = h('output', { class: 'tray-sum', 'aria-live': 'polite', 'data-testid': 'tray-sum' });
  const trayArea = h('div', { class: 'tray-area', 'aria-label': t('money.tray'), role: 'group' });
  const empty = h('p', { class: 'tray-empty' }, t('money.trayEmpty'));
  const submit = h('button', { type: 'button', class: 'btn btn-go', 'data-testid': 'submit-answer', onclick: () => !disabled && tray.length > 0 && opts.onSubmit([...tray]) }, opts.submitLabel);
  const clearBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => clear() }, t('money.clear'));

  const render = (): void => {
    trayArea.replaceChildren();
    if (tray.length === 0) trayArea.appendChild(empty);
    for (const [value, count] of groupPieces(tray)) {
      const btn = h(
        'button',
        {
          type: 'button',
          class: 'tray-stack',
          'aria-label': `${count} × ${pieceName(value)}. ${t('money.removeOne')}`,
          dataset: { value: String(value) },
          onclick: () => remove(value),
        },
        pieceElement(value),
        count > 1 ? h('span', { class: 'stack-count', 'aria-hidden': 'true' }, `×${count}`) : null,
      );
      trayArea.appendChild(btn);
    }
    const total = sum(tray);
    traySum.textContent = opts.showSum ? formatEuro(total) : t('money.sumHidden');
    traySum.classList.toggle('is-hidden-sum', !opts.showSum);
    submit.disabled = disabled || tray.length === 0;
    clearBtn.disabled = disabled || tray.length === 0;
  };

  const add = (value: Cents): void => {
    if (disabled || tray.length >= 40) return;
    tray.push(value);
    play(isBill(value) ? 'bill' : 'coin');
    render();
  };
  const remove = (value: Cents): void => {
    if (disabled) return;
    const i = tray.lastIndexOf(value);
    if (i >= 0) tray.splice(i, 1);
    play('tap');
    render();
  };
  const clear = (): void => {
    tray.length = 0;
    render();
  };

  // Drawer with drag & drop (Pointer Events) and tap fallback.
  const drawer = h('div', { class: 'drawer', role: 'group', 'aria-label': t('money.drawer') });
  let drag: { value: Cents; ghost: HTMLElement; startX: number; startY: number; moved: boolean; pointerId: number } | null = null;

  const overTray = (x: number, y: number): boolean => {
    const r = trayArea.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  for (const value of denoms) {
    const btn = h('button', {
      type: 'button',
      class: `drawer-slot ${isBill(value) ? 'slot-bill' : 'slot-coin'}`,
      'aria-label': `${t('money.add')} ${pieceName(value)}`,
      dataset: { value: String(value) },
    });
    btn.appendChild(pieceElement(value));
    btn.addEventListener('pointerdown', (e) => {
      if (disabled || e.button !== 0) return;
      const ghost = pieceElement(value, 0.7);
      ghost.classList.add('drag-ghost');
      drag = { value, ghost, startX: e.clientX, startY: e.clientY, moved: false, pointerId: e.pointerId };
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    btn.addEventListener('pointermove', (e) => {
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (!drag.moved && dist > 12) {
        drag.moved = true;
        document.body.appendChild(drag.ghost);
      }
      if (drag.moved) {
        drag.ghost.style.left = `${e.clientX}px`;
        drag.ghost.style.top = `${e.clientY}px`;
        trayArea.classList.toggle('is-target', overTray(e.clientX, e.clientY));
      }
    });
    const end = (e: PointerEvent, cancelled: boolean): void => {
      if (!drag || drag.pointerId !== e.pointerId) return;
      const d = drag;
      drag = null;
      d.ghost.remove();
      trayArea.classList.remove('is-target');
      if (cancelled) return;
      if (!d.moved || overTray(e.clientX, e.clientY)) add(d.value);
    };
    btn.addEventListener('pointerup', (e) => end(e, false));
    btn.addEventListener('pointercancel', (e) => end(e, true));
    // Keyboard activation (Enter/Space) produces a click without pointer events.
    btn.addEventListener('click', (e) => {
      if ((e as MouseEvent).detail === 0) add(value);
    });
    drawer.appendChild(btn);
  }

  const el = h(
    'div',
    { class: 'money-tray' },
    h('div', { class: 'tray' }, h('div', { class: 'tray-head' }, h('span', null, t('money.yourChange')), traySum), trayArea),
    drawer,
    h('div', { class: 'tray-actions' }, clearBtn, submit),
  );
  render();
  return {
    el,
    pieces: () => [...tray],
    total: () => sum(tray),
    clear,
    setDisabled(d) {
      disabled = d;
      el.classList.toggle('is-disabled', d);
      render();
    },
    destroy() {
      drag?.ghost.remove();
    },
  };
}
