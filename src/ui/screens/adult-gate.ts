import { t } from '../../i18n';
import { openModal } from '../components/modal';
import { h } from '../dom';

/**
 * Simple «adult gesture»: a multiplication question (no password).
 * Holding the adults button for 3 seconds is the alternative.
 */
export function openAdultGate(onPass: () => void): void {
  const a = 6 + Math.floor(Math.random() * 4);
  const b = 6 + Math.floor(Math.random() * 4);
  const input = h('input', { type: 'text', inputMode: 'numeric', class: 'text-input gate-input', id: 'gate-input', autocomplete: 'off', 'data-testid': 'gate-input' });
  const msg = h('p', { class: 'help', 'aria-live': 'polite' });
  const ok = h('button', { type: 'button', class: 'btn btn-go', 'data-testid': 'gate-ok' }, t('common.enter'));
  const modal = openModal({
    title: t('gate.title'),
    body: [
      h('p', null, t('gate.text')),
      h('label', { class: 'gate-question', for: 'gate-input' }, `${a} × ${b} = ?`),
      input,
      msg,
      h('p', { class: 'help' }, t('gate.hold')),
    ],
    actions: [ok],
  });
  const check = (): void => {
    if (Number.parseInt(input.value, 10) === a * b) {
      modal.close();
      onPass();
    } else {
      msg.textContent = t('gate.wrong');
      input.select();
    }
  };
  ok.addEventListener('click', check);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') check();
  });
  requestAnimationFrame(() => input.focus());
}
