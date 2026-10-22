import { t } from '../../i18n';
import { h, uid } from '../dom';
import { icon } from '../svg/icons';

export interface ModalHandle {
  close(): void;
  el: HTMLElement;
}

/** Accessible dialog with focus trap, Escape to close and focus restore. */
export function openModal(opts: {
  title: string;
  body: Node | Node[];
  actions?: HTMLElement[];
  onClose?: () => void;
  dismissable?: boolean;
  className?: string;
}): ModalHandle {
  const previous = document.activeElement as HTMLElement | null;
  const titleId = uid('dlg');
  const closeBtn = opts.dismissable === false
    ? null
    : h('button', { type: 'button', class: 'icon-btn modal-close', 'aria-label': t('common.close'), html: icon('close'), onclick: () => close() });
  const box = h(
    'div',
    { class: `modal ${opts.className ?? ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    closeBtn,
    h('h2', { id: titleId, class: 'modal-title' }, opts.title),
    h('div', { class: 'modal-body' }, ...(Array.isArray(opts.body) ? opts.body : [opts.body])),
    opts.actions && opts.actions.length > 0 ? h('div', { class: 'modal-actions' }, ...opts.actions) : null,
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, box);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && opts.dismissable !== false) {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const focusables = [...box.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  backdrop.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop && opts.dismissable !== false) close();
  });
  document.body.appendChild(backdrop);
  const firstAction = opts.actions?.[0] ?? box.querySelector<HTMLElement>('input, button');
  requestAnimationFrame(() => firstAction?.focus());
  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    backdrop.remove();
    previous?.focus?.();
    opts.onClose?.();
  }
  return { close, el: box };
}

/** Small transient message for screen readers and sighted users. */
export function toast(message: string): void {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('is-out'), 2600);
  setTimeout(() => el.remove(), 3200);
}
