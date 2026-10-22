import type { AnswerMethod, LevelId, Mode } from '../../core/types';
import { LEVEL_IDS, SCENARIOS, getLevel } from '../../data';
import { L, randomCashier, t, tc, type Key } from '../../i18n';
import { store, type GameConfig } from '../../state/store';
import { go, iconButton, registerScreen, topbar } from '../app';
import { openModal } from '../components/modal';
import { h } from '../dom';
import { icon } from '../svg/icons';

const MODES: { id: Mode; icon: string }[] = [
  { id: 'auto', icon: '🧑‍🤝‍🧑' },
  { id: 'free', icon: '🛍️' },
  { id: 'challenge', icon: '🏁' },
  { id: 'guided', icon: '🧭' },
];

function choiceGroup<T extends string | number>(opts: {
  label: string;
  items: { id: T; render: () => (Node | string)[] }[];
  value: T;
  onChange: (v: T) => void;
  className: string;
  testid: string;
}): HTMLElement {
  const group = h('div', { class: `choice-group ${opts.className}`, role: 'radiogroup', 'aria-label': opts.label });
  const buttons: HTMLButtonElement[] = [];
  for (const item of opts.items) {
    const btn = h(
      'button',
      {
        type: 'button',
        role: 'radio',
        class: 'choice',
        'aria-checked': String(item.id === opts.value),
        dataset: { value: String(item.id) },
        'data-testid': `${opts.testid}-${item.id}`,
        onclick: () => {
          for (const b of buttons) b.setAttribute('aria-checked', String(b === btn));
          opts.onChange(item.id);
        },
      },
      ...item.render(),
    );
    buttons.push(btn);
    group.appendChild(btn);
  }
  // Arrow keys move between options (radiogroup pattern).
  group.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % buttons.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + buttons.length) % buttons.length;
    if (j >= 0) {
      e.preventDefault();
      buttons[j]!.focus();
      buttons[j]!.click();
    }
  });
  return group;
}

registerScreen('setup', (root) => {
  const profile = store.profile;
  if (!profile) {
    go('home');
    return;
  }
  const cfg: GameConfig = {
    scenarioId: SCENARIOS[0]!.id,
    level: 1,
    mode: 'auto',
    method: 'keypad',
    ...(profile.lastConfig ?? {}),
  };
  if (!SCENARIOS.some((s) => s.id === cfg.scenarioId)) cfg.scenarioId = SCENARIOS[0]!.id;

  const levelInfo = h('p', { class: 'level-info', 'aria-live': 'polite' });
  const updateLevelInfo = (): void => {
    const def = getLevel(cfg.level);
    levelInfo.textContent = `${t(`level.${cfg.level}.title` as Key)} · ${t(`level.${cfg.level}.desc` as Key)}`;
    levelInfo.dataset.level = String(def.level);
  };
  updateLevelInfo();

  const scenarioGroup = choiceGroup({
    label: t('setup.where'),
    className: 'scenario-cards',
    testid: 'scenario',
    value: cfg.scenarioId,
    onChange: (v) => (cfg.scenarioId = v),
    items: SCENARIOS.map((s) => ({
      id: s.id,
      render: () => [
        h('span', { class: 'choice-icon', style: `--accent:${s.color}`, 'aria-hidden': 'true' }, s.icon),
        h('span', { class: 'choice-title' }, L(s.name)),
        h('span', { class: 'choice-sub' }, L(s.tagline)),
      ],
    })),
  });

  const modeGroup = choiceGroup({
    label: t('setup.how'),
    className: 'mode-cards',
    testid: 'mode',
    value: cfg.mode,
    onChange: (v) => {
      cfg.mode = v;
      lengthBox.hidden = v !== 'challenge';
    },
    items: MODES.map((m) => ({
      id: m.id,
      render: () => [
        h('span', { class: 'choice-icon', 'aria-hidden': 'true' }, m.icon),
        h('span', { class: 'choice-title' }, t(`mode.${m.id}` as Key)),
        h('span', { class: 'choice-sub' }, t(`mode.${m.id}.desc` as Key)),
      ],
    })),
  });

  let challengeLength: 5 | 10 = store.settings.roundLength;
  const lengthBox = h(
    'div',
    { class: 'length-box' },
    h('p', { class: 'field-label' }, t('setup.length')),
    choiceGroup<5 | 10>({
      label: t('setup.length'),
      className: 'length-chips',
      testid: 'length',
      value: challengeLength,
      onChange: (v) => (challengeLength = v),
      items: [5, 10].map((n) => ({ id: n as 5 | 10, render: () => [h('span', { class: 'level-num' }, String(n)), h('span', { class: 'level-course' }, t('settings.customers', { n }))] })),
    }),
  );
  lengthBox.hidden = cfg.mode !== 'challenge';

  const levelGroup = choiceGroup<LevelId>({
    label: t('setup.level'),
    className: 'level-chips',
    testid: 'level',
    value: cfg.level,
    onChange: (v) => {
      cfg.level = v;
      updateLevelInfo();
    },
    items: LEVEL_IDS.map((l) => ({
      id: l,
      render: () => [h('span', { class: 'level-num' }, String(l)), h('span', { class: 'level-course' }, t('setup.course', { n: getLevel(l).course }))],
    })),
  });

  const methodGroup = choiceGroup<AnswerMethod>({
    label: t('setup.method'),
    className: 'method-cards',
    testid: 'method',
    value: cfg.method,
    onChange: (v) => (cfg.method = v),
    items: [
      { id: 'keypad', render: () => [h('span', { class: 'choice-icon', html: icon('keypad', 30) }), h('span', { class: 'choice-title' }, t('method.keypad'))] },
      { id: 'money', render: () => [h('span', { class: 'choice-icon', html: icon('coin', 30) }), h('span', { class: 'choice-title' }, t('method.money'))] },
    ],
  });

  const start = (): void => {
    const length = cfg.mode === 'challenge' ? challengeLength : undefined;
    store.updateProfile(profile.id, { lastConfig: { ...cfg } });
    const firstTime = !profile.guidedSeen.includes(cfg.level) && cfg.mode !== 'guided';
    if (firstTime) {
      const yes = h('button', { type: 'button', class: 'btn btn-go', 'data-testid': 'guided-yes' }, t('setup.guidedYes'));
      const no = h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'guided-no' }, t('setup.guidedNo'));
      const m = openModal({ title: t('setup.firstTimeTitle'), body: h('p', null, tc('setup.firstTimeText', randomCashier(), { level: cfg.level })), actions: [yes, no] });
      yes.addEventListener('click', () => {
        m.close();
        go('play', { config: { ...cfg, mode: 'guided' }, then: cfg.mode, length });
      });
      no.addEventListener('click', () => {
        const seen = [...profile.guidedSeen, cfg.level];
        store.updateProfile(profile.id, { guidedSeen: seen });
        m.close();
        go('play', { config: { ...cfg }, length });
      });
      return;
    }
    go('play', { config: { ...cfg }, length });
  };

  root.append(
    h(
      'div',
      { class: 'setup' },
      topbar({
        title: t('setup.hello', { alias: profile.alias }),
        back: () => go('home'),
        right: [iconButton('sticker', t('shop.title'), () => go('shop'), { 'data-testid': 'my-shop' })],
      }),
      h(
        'main',
        { class: 'setup-main' },
        h('section', { class: 'setup-step' }, h('h2', { class: 'step-title' }, h('span', { class: 'step-n' }, '1'), t('setup.where')), scenarioGroup),
        h('section', { class: 'setup-step' }, h('h2', { class: 'step-title' }, h('span', { class: 'step-n' }, '2'), t('setup.how')), modeGroup, lengthBox),
        h('section', { class: 'setup-step' }, h('h2', { class: 'step-title' }, h('span', { class: 'step-n' }, '3'), t('setup.level')), levelGroup, levelInfo),
        h('section', { class: 'setup-step' }, h('h2', { class: 'step-title' }, h('span', { class: 'step-n' }, '4'), t('setup.method')), methodGroup),
        h('div', { class: 'setup-go' }, h('button', { type: 'button', class: 'btn btn-go btn-xl', 'data-testid': 'start', onclick: start }, t('setup.start'), h('span', { html: icon('next', 26) }))),
      ),
    ),
  );
});
