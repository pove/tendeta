import { LANGS, t, type UiLang } from '../../i18n';
import { store } from '../../state/store';
import { awning, go, refresh, registerScreen } from '../app';
import { openModal } from '../components/modal';
import { h } from '../dom';
import { icon } from '../svg/icons';
import { logoSvg } from '../svg/logo';
import { openAdultGate } from './adult-gate';

export const AVATARS = ['🦊', '🐢', '🐙', '🦉', '🐝', '🐬', '🦔', '🐸', '🐱', '🐼', '🦁', '🐰', '🐨', '🦒', '🐧', '🦜'];

const ALIAS_A_ES = ['Naranja', 'Sardina', 'Tomate', 'Cometa', 'Abanico', 'Barquito', 'Girasol', 'Farolillo', 'Palmera', 'Caracola'];
const ALIAS_B_ES = ['veloz', 'risueña', 'valiente', 'curiosa', 'brillante', 'tranquila', 'saltarina', 'genial'];
const ALIAS_A_VA = ['Taronja', 'Sardina', 'Tomaca', 'Estel', 'Ventall', 'Barqueta', 'Gira-sol', 'Fanalet', 'Palmera', 'Caragola'];
const ALIAS_B_VA = ['veloç', 'rialler', 'valent', 'curiós', 'brillant', 'tranquil', 'saltador', 'genial'];

function randomAlias(): string {
  const va = store.settings.lang === 'va';
  const a = va ? ALIAS_A_VA : ALIAS_A_ES;
  const b = va ? ALIAS_B_VA : ALIAS_B_ES;
  return `${a[Math.floor(Math.random() * a.length)]} ${b[Math.floor(Math.random() * b.length)]}`;
}

export function langSwitch(): HTMLElement {
  return h(
    'div',
    { class: 'segmented lang-switch', role: 'group', 'aria-label': t('home.language') },
    ...LANGS.map((l) =>
      h(
        'button',
        {
          type: 'button',
          class: store.settings.lang === l.id ? 'is-on' : '',
          'aria-pressed': String(store.settings.lang === l.id),
          lang: l.bcp47,
          onclick: () => {
            store.updateSettings({ lang: l.id as UiLang });
            refresh();
          },
        },
        l.label,
      ),
    ),
  );
}

function newProfileDialog(): void {
  let avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)]!;
  const input = h('input', {
    type: 'text',
    class: 'text-input',
    maxLength: 24,
    value: randomAlias(),
    'aria-describedby': 'alias-help',
    autocomplete: 'off',
    id: 'alias-input',
  });
  const avatars = h(
    'div',
    { class: 'avatar-grid', role: 'radiogroup', 'aria-label': t('profile.avatar') },
    ...AVATARS.map((a) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: `avatar-choice ${a === avatar ? 'is-on' : ''}`,
          'aria-checked': String(a === avatar),
          'aria-label': a,
          onclick: (e: Event) => {
            avatar = a;
            avatars.querySelectorAll('.avatar-choice').forEach((b) => {
              b.classList.remove('is-on');
              b.setAttribute('aria-checked', 'false');
            });
            const btn = e.currentTarget as HTMLElement;
            btn.classList.add('is-on');
            btn.setAttribute('aria-checked', 'true');
          },
        },
        a,
      ),
    ),
  );
  const create = h('button', { type: 'button', class: 'btn btn-go', 'data-testid': 'create-profile' }, t('profile.create'));
  const modal = openModal({
    title: t('profile.new'),
    body: [
      h('label', { class: 'field-label', for: 'alias-input' }, t('profile.alias')),
      h('div', { class: 'alias-row' }, input, h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('profile.randomAlias'), title: t('profile.randomAlias'), onclick: () => (input.value = randomAlias()) }, '🎲')),
      h('p', { id: 'alias-help', class: 'help' }, t('profile.aliasHelp')),
      h('p', { class: 'field-label' }, t('profile.avatar')),
      avatars,
    ],
    actions: [create],
  });
  const submit = (): void => {
    const alias = input.value.trim() || randomAlias();
    store.addProfile(alias, avatar);
    modal.close();
    go('setup');
  };
  create.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}

registerScreen('home', (root) => {
  const profiles = store.profiles;
  const list = h(
    'div',
    { class: 'profile-grid' },
    ...profiles.map((p) =>
      h(
        'button',
        {
          type: 'button',
          class: 'profile-card',
          'data-testid': 'profile-card',
          onclick: () => {
            store.selectProfile(p.id);
            go('setup');
          },
        },
        h('span', { class: 'profile-avatar', 'aria-hidden': 'true' }, p.avatar),
        h('span', { class: 'profile-alias' }, p.alias),
        h('span', { class: 'profile-stickers', 'aria-label': t('home.stickers', { n: p.stickers.length }) }, `⭐ ${p.stickers.length}`),
      ),
    ),
    h(
      'button',
      { type: 'button', class: 'profile-card is-new', 'data-testid': 'new-profile', onclick: newProfileDialog },
      h('span', { class: 'profile-avatar', html: icon('plus', 34) }),
      h('span', { class: 'profile-alias' }, t('home.newProfile')),
    ),
  );

  // Adult access: tap opens the multiplication gate; holding 3 s opens directly.
  const adultBtn = h('button', { type: 'button', class: 'adult-btn', 'data-testid': 'adult-btn' }, h('span', { class: 'ico', html: icon('gear', 20) }), h('span', null, t('home.adults')));
  let holdTimer: number | undefined;
  let held = false;
  adultBtn.addEventListener('pointerdown', () => {
    held = false;
    adultBtn.classList.add('is-holding');
    holdTimer = window.setTimeout(() => {
      held = true;
      adultBtn.classList.remove('is-holding');
      go('adult');
    }, 3000);
  });
  const cancelHold = (): void => {
    window.clearTimeout(holdTimer);
    adultBtn.classList.remove('is-holding');
  };
  adultBtn.addEventListener('pointerup', cancelHold);
  adultBtn.addEventListener('pointerleave', cancelHold);
  adultBtn.addEventListener('click', () => {
    if (!held) openAdultGate(() => go('adult'));
  });

  root.append(
    h(
      'div',
      { class: 'home' },
      awning(),
      h(
        'header',
        { class: 'home-hero' },
        h('div', { class: 'home-logo', html: logoSvg() }),
        h('h1', { class: 'home-title', tabindex: '-1' }, 'Tendeta'),
        h('p', { class: 'home-subtitle' }, t('app.subtitle')),
        langSwitch(),
      ),
      h('main', { class: 'home-main' }, h('h2', { class: 'section-title' }, profiles.length > 0 ? t('home.whoPlays') : t('home.firstTime')), list),
      h('footer', { class: 'home-foot' }, adultBtn, h('p', { class: 'privacy-note' }, t('home.privacy'))),
    ),
  );
});
