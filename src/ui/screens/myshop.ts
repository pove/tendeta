import { STICKERS } from '../../data';
import { L, t } from '../../i18n';
import { play as sound } from '../../services/sound';
import { store } from '../../state/store';
import { go, registerScreen, topbar } from '../app';
import { h } from '../dom';

/** Slots on the shop facade, as % of the drawing (x, y). */
const SLOTS: [number, number][] = [
  [12, 47], [30, 47], [70, 47], [88, 47],
  [10, 72], [27, 72], [73, 72], [90, 72],
  [50, 33], [42, 88], [58, 88], [50, 60],
];

const FACADE = `<svg viewBox="0 0 400 300" class="facade-svg" aria-hidden="true" focusable="false">
  <rect x="0" y="250" width="400" height="50" fill="#D9C7A8"/>
  <rect x="20" y="70" width="360" height="190" rx="6" fill="#FFF1DC" stroke="#C9A97A" stroke-width="3"/>
  <rect x="20" y="70" width="360" height="22" fill="#E7D3B3"/>
  <g>
    <path d="M14 92h372v34H14z" fill="#FFF6E9"/>
    <path d="M14 92h31v34H14zM76 92h31v34H76zM138 92h31v34h-31zM200 92h31v34h-31zM262 92h31v34h-31zM324 92h31v34h-31z" fill="#F08A24"/>
    <path d="M14 126q15.5 18 31 0q15.5 18 31 0q15.5 18 31 0q15.5 18 31 0q15.5 18 31 0q15.5 18 31 0q15.5 18 31 0q15.5 18 31 0q15.5 18 31 0q15.5 18 31 0q15.5 18 31 0q15.5 18 31 0z" fill="#F08A24"/>
  </g>
  <rect x="120" y="40" width="160" height="42" rx="10" fill="#1E5AA8"/>
  <text x="200" y="69" text-anchor="middle" font-family="Atkinson Hyperlegible, system-ui, sans-serif" font-weight="700" font-size="24" fill="#FFF6E9" letter-spacing="3">TENDETA</text>
  <rect x="160" y="150" width="80" height="110" rx="6" fill="#1E5AA8"/>
  <rect x="170" y="160" width="60" height="40" rx="4" fill="#BFD6F2"/>
  <circle cx="226" cy="210" r="4" fill="#F5C443"/>
  <rect x="40" y="150" width="100" height="70" rx="6" fill="#BFD6F2" stroke="#1E5AA8" stroke-width="4"/>
  <rect x="260" y="150" width="100" height="70" rx="6" fill="#BFD6F2" stroke="#1E5AA8" stroke-width="4"/>
  <path d="M90 150v70M40 185h100M310 150v70M260 185h100" stroke="#1E5AA8" stroke-width="3"/>
  <g fill="#1E5AA8" opacity="0.18">
    <path d="M20 230h140v30H20zM240 230h140v30H240z"/>
  </g>
  <g fill="none" stroke="#1E5AA8" stroke-width="2" opacity="0.35">
    <path d="M20 245h140M240 245h140M55 230v30M90 230v30M125 230v30M275 230v30M310 230v30M345 230v30"/>
  </g>
</svg>`;

registerScreen('shop', (root) => {
  const profile = store.profile;
  if (!profile) {
    go('home');
    return;
  }
  let selected: string | null = null;
  const facade = h('div', { class: 'facade', html: FACADE });
  const tray = h('div', { class: 'sticker-tray', role: 'listbox', 'aria-label': t('shop.stickers') });
  const status = h('p', { class: 'help', 'aria-live': 'polite' });

  const render = (): void => {
    const p = store.profile!;
    const placedIds = new Set(Object.values(p.placed));
    facade.querySelectorAll('.slot').forEach((s) => s.remove());
    SLOTS.forEach(([x, y], i) => {
      const id = p.placed[String(i)];
      const st = STICKERS.find((s) => s.id === id);
      const slot = h(
        'button',
        {
          type: 'button',
          class: `slot ${st ? 'is-filled' : ''} ${selected ? 'is-ready' : ''}`,
          style: `left:${x}%;top:${y}%`,
          'aria-label': st ? t('shop.slotFilled', { name: L(st.name) }) : t('shop.slotEmpty', { n: i + 1 }),
          onclick: () => {
            const placed = { ...store.profile!.placed };
            if (selected) {
              for (const [k, v] of Object.entries(placed)) if (v === selected) delete placed[k];
              placed[String(i)] = selected;
              selected = null;
              sound('star');
            } else if (st) {
              delete placed[String(i)];
              sound('tap');
            } else {
              status.textContent = t('shop.pickFirst');
              return;
            }
            store.updateProfile(p.id, { placed });
            render();
          },
        },
        st ? st.icon : '+',
      );
      facade.appendChild(slot);
    });
    tray.replaceChildren(
      ...STICKERS.map((s) => {
        const owned = p.stickers.includes(s.id);
        return h(
          'button',
          {
            type: 'button',
            role: 'option',
            class: `sticker ${owned ? '' : 'is-locked'} ${placedIds.has(s.id) ? 'is-placed' : ''} ${selected === s.id ? 'is-selected' : ''}`,
            'aria-selected': String(selected === s.id),
            'aria-label': owned ? L(s.name) : t('shop.locked'),
            disabled: !owned,
            onclick: () => {
              selected = selected === s.id ? null : s.id;
              status.textContent = selected ? t('shop.nowPlace', { name: L(s.name) }) : '';
              sound('tap');
              render();
            },
          },
          owned ? s.icon : '🔒',
        );
      }),
    );
  };

  root.append(
    h(
      'div',
      { class: 'myshop' },
      topbar({ title: t('shop.title'), back: () => go('setup') }),
      h(
        'main',
        { class: 'myshop-main' },
        h('p', { class: 'lead' }, t('shop.intro', { n: profile.stickers.length, total: STICKERS.length })),
        facade,
        status,
        h('h2', { class: 'section-title' }, t('shop.stickers')),
        tray,
      ),
    ),
  );
  render();
});
