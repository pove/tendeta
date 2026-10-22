import { setLang, t } from '../i18n';
import { stopSpeaking } from '../services/speech';
import { pause } from '../services/wellbeing';
import { store } from '../state/store';
import { h } from './dom';
import { icon, type IconName } from './svg/icons';

export type ScreenName = 'home' | 'setup' | 'play' | 'shop' | 'adult';
type Cleanup = (() => void) | void;
type ScreenFn = (root: HTMLElement, params: Record<string, unknown>) => Cleanup;

const screens = new Map<ScreenName, ScreenFn>();
let root: HTMLElement;
let cleanup: Cleanup;
let currentName: ScreenName = 'home';
let currentParams: Record<string, unknown> = {};

export function registerScreen(name: ScreenName, fn: ScreenFn): void {
  screens.set(name, fn);
}

export function mount(el: HTMLElement): void {
  root = el;
  applySettings();
  store.subscribe(applySettings);
  window.addEventListener('popstate', () => {
    if (currentName !== 'home') go('home', {}, false);
  });
}

export function go(name: ScreenName, params: Record<string, unknown> = {}, push = true): void {
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  stopSpeaking();
  pause();
  document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
  currentName = name;
  currentParams = params;
  root.replaceChildren();
  root.dataset.screen = name;
  const fn = screens.get(name);
  if (!fn) throw new Error(`Unknown screen ${name}`);
  cleanup = fn(root, params);
  if (push && name !== 'home') {
    try {
      history.pushState({ screen: name }, '');
    } catch {
      /* ignore */
    }
  }
  window.scrollTo(0, 0);
  const heading = root.querySelector<HTMLElement>('h1, [data-autofocus]');
  heading?.focus({ preventScroll: true });
}

/** Re-render the current screen (e.g. after a language change). */
export function refresh(): void {
  go(currentName, currentParams, false);
}

let lastLang = '';
function applySettings(): void {
  const s = store.settings;
  if (s.lang !== lastLang) {
    setLang(s.lang);
    lastLang = s.lang;
    document.title = `Tendeta · ${t('app.subtitle')}`;
  }
  const html = document.documentElement;
  html.dataset.font = s.fontSize;
  if (s.reduceMotion) html.dataset.motion = 'reduce';
  else delete html.dataset.motion;
}

/** Striped awning used as the header of every screen. */
export function awning(compact = false): HTMLElement {
  return h('div', { class: `awning ${compact ? 'is-compact' : ''}`, 'aria-hidden': 'true' });
}

export function iconButton(name: IconName, label: string, onclick: () => void, extra: Record<string, unknown> = {}): HTMLButtonElement {
  return h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, html: icon(name), onclick, ...extra });
}

export function topbar(opts: { title: string; back?: () => void; right?: HTMLElement[]; center?: HTMLElement | null }): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    awning(true),
    h(
      'div',
      { class: 'topbar-row' },
      opts.back ? iconButton('back', t('common.back'), opts.back) : h('span', { class: 'icon-spacer' }),
      h('h1', { class: 'topbar-title', tabindex: '-1' }, opts.title),
      opts.center ?? null,
      h('div', { class: 'topbar-right' }, ...(opts.right ?? [])),
    ),
  );
}
