import { formatEuro, parseEuro, type Cents } from '../../core/money';
import { t } from '../../i18n';
import { play } from '../../services/sound';
import { h } from '../dom';
import { icon } from '../svg/icons';

export interface KeypadView {
  el: HTMLElement;
  value(): Cents | null;
  clear(): void;
  setDisabled(disabled: boolean): void;
  destroy(): void;
}

/**
 * Big numeric keypad. Shows the amount being typed with Spanish format.
 * Physical keyboard: digits, comma/dot, Backspace, Enter.
 */
export function keypad(opts: { decimal: boolean; label: string; submitLabel: string; onSubmit: (value: Cents) => void }): KeypadView {
  let text = '';
  let disabled = false;
  const display = h('output', { class: 'kp-display', 'aria-live': 'polite', 'data-testid': 'keypad-display' });
  const render = (): void => {
    display.textContent = text === '' ? '' : `${text} €`;
    display.classList.toggle('is-empty', text === '');
    display.dataset.placeholder = opts.decimal ? '0,00 €' : '0 €';
    submit.disabled = disabled || parseEuro(text) === null;
  };
  const press = (key: string): void => {
    if (disabled) return;
    if (key === 'back') text = text.slice(0, -1);
    else if (key === ',') {
      if (!opts.decimal || text.includes(',')) return;
      text = text === '' ? '0,' : text + ',';
    } else {
      const [int, dec] = text.split(',');
      if (dec !== undefined && dec.length >= 2) return;
      if (dec === undefined && (int ?? '').length >= 4) return;
      if (text === '0') text = key;
      else text += key;
    }
    play('tap');
    render();
  };
  const doSubmit = (): void => {
    const v = parseEuro(text);
    if (disabled || v === null) return;
    opts.onSubmit(v);
  };
  const key = (k: string, label: string | Node, aria?: string, extra = ''): HTMLButtonElement =>
    h('button', { type: 'button', class: `kp-key ${extra}`, 'aria-label': aria ?? undefined, dataset: { key: k }, onclick: () => press(k) }, label);
  const keys = h(
    'div',
    { class: 'kp-keys' },
    ...['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => key(d, d)),
    opts.decimal ? key(',', ',', t('keypad.comma'), 'kp-comma') : h('span', { class: 'kp-spacer', 'aria-hidden': 'true' }),
    key('0', '0'),
    (() => {
      const b = key('back', '', t('keypad.back'), 'kp-back');
      b.innerHTML = icon('backspace', 28);
      return b;
    })(),
  );
  const submit = h('button', { type: 'button', class: 'btn btn-go kp-submit', 'data-testid': 'submit-answer', onclick: doSubmit }, opts.submitLabel);
  const onKey = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === ',' || e.key === '.') press(',');
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Enter') {
      if (document.activeElement instanceof HTMLButtonElement && !document.activeElement.classList.contains('kp-key')) return;
      e.preventDefault();
      doSubmit();
    } else return;
  };
  document.addEventListener('keydown', onKey);
  const el = h('div', { class: 'keypad' }, h('p', { class: 'kp-label' }, opts.label), display, keys, submit);
  render();
  return {
    el,
    value: () => parseEuro(text),
    clear() {
      text = '';
      render();
    },
    setDisabled(d) {
      disabled = d;
      el.classList.toggle('is-disabled', d);
      render();
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
    },
  };
}

export function formatTyped(value: Cents): string {
  return formatEuro(value);
}
