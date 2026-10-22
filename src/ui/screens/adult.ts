import { ERROR_TYPES, profileStats, toCSV, type ProfileStats } from '../../core/stats';
import type { LevelId } from '../../core/types';
import { LEVEL_IDS, SCENARIOS } from '../../data';
import { getLang, L, LANGS, t, type Key, type UiLang } from '../../i18n';
import { hasVoiceFor, speechAvailable } from '../../services/speech';
import { store, type Profile, type Settings } from '../../state/store';
import { go, refresh, registerScreen, topbar } from '../app';
import { openModal, toast } from '../components/modal';
import { h, uid } from '../dom';
import { icon, type IconName } from '../svg/icons';
import { printSheets, printSummary, type MoneySize } from './printables';

type Tab = 'stats' | 'settings' | 'sheets' | 'data';

const TABS: { id: Tab; icon: IconName }[] = [
  { id: 'stats', icon: 'chart' },
  { id: 'settings', icon: 'gear' },
  { id: 'sheets', icon: 'print' },
  { id: 'data', icon: 'lock' },
];

// ---------- Files ----------

function downloadText(filename: string, text: string, mime: string): void {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    toast(t('adult.downloadError'));
  }
}

export function csvHeaders(): string[] {
  return t('csv.headers').split('|');
}

export function exportCSV(profileId: string | null): void {
  const entries = profileId ? store.logFor(profileId) : store.log;
  const alias = (id: string): string => store.profiles.find((p) => p.id === id)?.alias ?? '?';
  const csv = toCSV(entries, alias, csvHeaders(), t('common.yes'), t('common.no'));
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const name = profileId ? alias(profileId).replace(/[^\p{L}\p{N}]+/gu, '-') : t('csv.all');
  downloadText(`tendeta-${name}-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
}

// ---------- Building blocks ----------

/** A titled card that groups related content. */
function card(title: string | null, ...children: (Node | null)[]): HTMLElement {
  return h('section', { class: 'pcard' }, title ? h('h2', { class: 'pcard-title' }, title) : null, ...children.filter((c): c is Node => c !== null));
}

function iconButton(label: string, name: IconName, cls: string, onclick: () => void, testid?: string): HTMLButtonElement {
  return h('button', { type: 'button', class: `btn ${cls}`, 'data-testid': testid, onclick }, h('span', { class: 'ico', html: icon(name, 20) }), h('span', null, label));
}

/** Visible options instead of a drop-down: every choice can be seen and tapped. */
function segmented<T extends string | number>(opts: {
  labelledBy: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testid?: string;
}): HTMLElement & { setDisabled(d: boolean): void } {
  const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': opts.labelledBy, 'data-testid': opts.testid }) as unknown as HTMLElement & {
    setDisabled(d: boolean): void;
  };
  const buttons = opts.options.map((o) => {
    const b = h(
      'button',
      {
        type: 'button',
        role: 'radio',
        class: 'seg-option',
        'aria-checked': String(o.value === opts.value),
        dataset: { value: String(o.value) },
        onclick: () => {
          for (const x of buttons) x.setAttribute('aria-checked', String(x === b));
          opts.onChange(o.value);
        },
      },
      o.label,
    );
    return b;
  });
  group.append(...buttons);
  group.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = buttons[(i + step + buttons.length) % buttons.length]!;
    next.focus();
    next.click();
  });
  group.setDisabled = (d: boolean) => {
    for (const b of buttons) b.disabled = d;
    group.classList.toggle('is-disabled', d);
  };
  return group;
}

/** A settings row: label and help on the left, a switch on the right. */
function switchRow(opts: { id: string; label: string; help?: string; checked: boolean; onChange: (v: boolean) => void }): HTMLElement {
  const sw = h('button', {
    type: 'button',
    role: 'switch',
    class: 'switch',
    id: opts.id,
    'aria-checked': String(opts.checked),
    'data-testid': opts.id,
    onclick: () => {
      const next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(next));
      opts.onChange(next);
    },
  });
  return h(
    'div',
    { class: 'srow' },
    h('div', { class: 'srow-text' }, h('label', { for: opts.id, class: 'srow-label' }, opts.label), opts.help ? h('p', { class: 'srow-help' }, opts.help) : null),
    sw,
  );
}

/** A settings row whose control (option buttons) goes underneath the label. */
function choiceRow(label: string, help: string | null, control: (labelId: string) => HTMLElement): HTMLElement {
  const labelId = uid('lbl');
  return h(
    'div',
    { class: 'srow is-stacked' },
    h('div', { class: 'srow-text' }, h('p', { class: 'srow-label', id: labelId }, label), help ? h('p', { class: 'srow-help' }, help) : null),
    control(labelId),
  );
}

function settingSwitch(key: keyof Settings, label: string, help?: string): HTMLElement {
  return switchRow({
    id: `set-${key}`,
    label,
    help,
    checked: store.settings[key] as boolean,
    onChange: (v) => store.updateSettings({ [key]: v } as Partial<Settings>),
  });
}

function settingChoice<K extends keyof Settings>(key: K, label: string, help: string | null, options: { value: Settings[K] & (string | number); label: string }[], after?: () => void): HTMLElement {
  return choiceRow(label, help, (labelledBy) =>
    segmented({
      labelledBy,
      options,
      value: store.settings[key] as Settings[K] & (string | number),
      testid: `set-${String(key)}`,
      onChange: (v) => {
        store.updateSettings({ [key]: v } as Partial<Settings>);
        after?.();
      },
    }),
  );
}

function confirmDialog(title: string, text: string, onYes: () => void): void {
  const yes = h('button', { type: 'button', class: 'btn btn-danger', 'data-testid': 'confirm-yes' }, t('common.delete'));
  const no = h('button', { type: 'button', class: 'btn btn-ghost' }, t('common.cancel'));
  const m = openModal({ title, body: h('p', null, text), actions: [no, yes] });
  yes.addEventListener('click', () => {
    m.close();
    onYes();
  });
  no.addEventListener('click', () => m.close());
}

// ---------- Statistics ----------

/** Single-series horizontal bars: one hue, values in text ink, table semantics underneath. */
function bars(rows: { label: string; value: number; max: number; display: string }[], caption: string): HTMLElement {
  return h(
    'table',
    { class: 'bars' },
    h('caption', { class: 'visually-hidden' }, caption),
    h(
      'tbody',
      null,
      ...rows.map((r) =>
        h(
          'tr',
          { title: `${r.label}: ${r.display}` },
          h('th', { scope: 'row' }, r.label),
          h(
            'td',
            null,
            h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `--v:${r.max === 0 || r.value === 0 ? 0 : Math.max(0.02, r.value / r.max)}` })),
            h('span', { class: 'bar-value' }, r.display),
          ),
        ),
      ),
    ),
  );
}

function shortDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return t('stats.today');
  return d.toLocaleDateString(getLang() === 'va' ? 'ca-ES' : 'es-ES', { day: 'numeric', month: 'short' });
}

/** The statistics of one profile as cards (also used by the printable summary). */
export function statsBlock(stats: ProfileStats): HTMLElement {
  const kpi = (value: string, label: string): HTMLElement => h('div', { class: 'kpi' }, h('strong', null, value), h('span', null, label));
  const summary = card(
    t('stats.summary'),
    h(
      'div',
      { class: 'kpis' },
      kpi(String(stats.problems), t('stats.problems')),
      kpi(`${stats.firstTryPct} %`, t('stats.firstTry')),
      kpi(`${String(stats.avgTimeS).replace('.', ',')} s`, t('stats.avgTime')),
      kpi(stats.lastPlayed ? shortDate(stats.lastPlayed) : '—', t('stats.lastPlayed')),
    ),
  );
  const byLevel = card(
    t('stats.byLevel'),
    bars(
      stats.byLevel.map((l) => ({ label: t('play.levelChip', { n: l.level }), value: l.firstTryPct, max: 100, display: `${l.firstTryPct} %` })),
      t('stats.byLevel'),
    ),
    h('p', { class: 'srow-help' }, t('stats.byLevelHelp')),
  );
  const pct = (v: number | null): string => (v === null ? '—' : `${v} %`);
  const borrow = card(
    t('stats.borrowTitle'),
    h('div', { class: 'kpis is-two' }, kpi(pct(stats.borrowFirstTryPct), t('stats.withBorrow')), kpi(pct(stats.noBorrowFirstTryPct), t('stats.withoutBorrow'))),
  );
  const errors = ERROR_TYPES.filter((e) => stats.errors[e] > 0).sort((a, b) => stats.errors[b] - stats.errors[a]);
  const maxErr = Math.max(0, ...errors.map((e) => stats.errors[e]));
  const errorCard = card(
    t('stats.errors'),
    errors.length > 0
      ? bars(
          errors.map((e) => ({ label: t(`err.${e}` as Key), value: stats.errors[e], max: maxErr, display: String(stats.errors[e]) })),
          t('stats.errors'),
        )
      : h('p', { class: 'srow-help' }, t('stats.noErrors')),
  );
  return h('div', { class: 'stats-block' }, summary, h('div', { class: 'pcard-grid' }, byLevel, borrow), errorCard);
}

function profilePicker(selected: string, onPick: (p: Profile) => void): HTMLElement {
  const labelId = uid('lbl');
  const chips = store.profiles.map((p) =>
    h(
      'button',
      {
        type: 'button',
        role: 'radio',
        class: 'pchip',
        'aria-checked': String(p.id === selected),
        onclick: () => {
          for (const c of chips) c.setAttribute('aria-checked', String(c === chip(p)));
          onPick(p);
        },
      },
      h('span', { class: 'pchip-avatar', 'aria-hidden': 'true' }, p.avatar),
      h('span', null, p.alias),
    ),
  );
  const chip = (p: Profile): HTMLButtonElement => chips[store.profiles.indexOf(p)]!;
  return h('div', { class: 'picker' }, h('p', { class: 'picker-label', id: labelId }, t('stats.profile')), h('div', { class: 'pchips', role: 'radiogroup', 'aria-labelledby': labelId }, ...chips));
}

function statsTab(): HTMLElement {
  if (store.profiles.length === 0) return card(null, h('p', { class: 'empty-state' }, t('stats.none')));
  let selected = store.profiles[0]!.id;
  const detail = h('div', { class: 'stats-detail' });
  const render = (): void => {
    const p = store.profiles.find((x) => x.id === selected)!;
    const entries = store.logFor(p.id);
    const stats = profileStats(entries);
    const actions = card(
      null,
      h(
        'div',
        { class: 'action-grid' },
        iconButton(t('stats.csv'), 'download', 'btn-ghost', () => exportCSV(p.id)),
        iconButton(t('stats.print'), 'print', 'btn-ghost', () => printSummary(p, stats)),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'link-danger',
          onclick: () =>
            confirmDialog(t('stats.deleteProfileTitle', { alias: p.alias }), t('stats.deleteProfileText'), () => {
              store.deleteProfile(p.id);
              refresh();
            }),
        },
        h('span', { class: 'ico', html: icon('trash', 18) }),
        h('span', null, t('stats.deleteProfile')),
      ),
    );
    detail.replaceChildren(entries.length === 0 ? card(null, h('p', { class: 'empty-state' }, t('stats.empty'))) : statsBlock(stats), actions);
  };
  render();
  return h(
    'div',
    { class: 'tab-stack' },
    profilePicker(selected, (p) => {
      selected = p.id;
      render();
    }),
    detail,
  );
}

// ---------- Settings ----------

function settingsTab(): HTMLElement {
  const voiceHelp = !speechAvailable() ? t('settings.voiceNone') : hasVoiceFor(store.settings.lang) ? t('settings.voiceHelp') : t('settings.voiceNoLang');
  return h(
    'div',
    { class: 'tab-stack' },
    card(
      t('settings.groupLanguage'),
      settingChoice('lang', t('settings.lang'), null, LANGS.map((l) => ({ value: l.id as UiLang, label: l.label })), () => go('adult', { tab: 'settings' }, false)),
      settingSwitch('voice', t('settings.voice'), voiceHelp),
      settingSwitch('sound', t('settings.sound'), t('settings.soundHelp')),
    ),
    card(
      t('settings.groupGame'),
      settingChoice('roundLength', t('settings.roundLength'), null, [
        { value: 5, label: t('settings.customers', { n: 5 }) },
        { value: 10, label: t('settings.customers', { n: 10 }) },
      ]),
      settingSwitch('calcTotal', t('settings.calcTotal'), t('settings.calcTotalHelp')),
      settingChoice('traySum', t('settings.traySum'), t('settings.traySumHelp'), [
        { value: 'auto', label: t('settings.byLevel') },
        { value: 'show', label: t('settings.always') },
        { value: 'hide', label: t('settings.never') },
      ]),
      settingChoice('estimation', t('settings.estimation'), t('settings.estimationHelp'), [
        { value: 'auto', label: t('settings.byLevel') },
        { value: 'on', label: t('settings.levels46') },
        { value: 'off', label: t('settings.never') },
      ]),
      settingSwitch('expert', t('settings.expert'), t('settings.expertHelp')),
      settingSwitch('timer', t('settings.timer'), t('settings.timerHelp')),
    ),
    card(
      t('settings.groupComfort'),
      settingChoice('fontSize', t('settings.fontSize'), null, [
        { value: 'm', label: t('settings.fontM') },
        { value: 'l', label: t('settings.fontL') },
        { value: 'xl', label: t('settings.fontXL') },
      ]),
      settingSwitch('reduceMotion', t('settings.motion'), t('settings.motionHelp')),
      settingSwitch('breakReminder', t('settings.break'), t('settings.breakHelp')),
    ),
  );
}

// ---------- Printable sheets ----------

function sheetsTab(): HTMLElement {
  const opts = {
    scenarioId: SCENARIOS[0]!.id,
    level: 1 as LevelId,
    count: 6,
    blankTotal: false,
    money: true,
    moneySize: 'classroom' as MoneySize,
    solutions: true,
  };
  const scenarioLabel = uid('lbl');
  const scenarios = h(
    'div',
    { class: 'scenario-picker', role: 'radiogroup', 'aria-labelledby': scenarioLabel, 'data-testid': 'sheet-scenario' },
    ...SCENARIOS.map((s) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: 'pchip is-wide',
          'aria-checked': String(s.id === opts.scenarioId),
          dataset: { value: s.id },
          onclick: (e: Event) => {
            opts.scenarioId = s.id;
            scenarios.querySelectorAll('[role=radio]').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
          },
        },
        h('span', { class: 'pchip-avatar', 'aria-hidden': 'true' }, s.icon),
        h('span', null, L(s.name)),
      ),
    ),
  );
  let moneySize: ReturnType<typeof segmented> | null = null;
  const print = iconButton(t('sheets.print'), 'print', 'btn-go btn-block', () => printSheets({ ...opts }), 'print-sheets');
  return h(
    'div',
    { class: 'tab-stack' },
    h('p', { class: 'tab-intro' }, t('sheets.intro')),
    card(
      t('sheets.ticketsTitle'),
      h('div', { class: 'srow is-stacked' }, h('p', { class: 'srow-label', id: scenarioLabel }, t('sheets.scenario')), scenarios),
      choiceRow(t('sheets.level'), null, (labelledBy) =>
        segmented({
          labelledBy,
          testid: 'sheet-level',
          options: LEVEL_IDS.map((l) => ({ value: l, label: String(l) })),
          value: opts.level,
          onChange: (v) => (opts.level = v),
        }),
      ),
      choiceRow(t('sheets.count'), null, (labelledBy) =>
        segmented({
          labelledBy,
          testid: 'sheet-count',
          options: [6, 12, 18].map((n) => ({ value: n, label: String(n) })),
          value: opts.count,
          onChange: (v) => (opts.count = v),
        }),
      ),
    ),
    card(
      t('sheets.optionsTitle'),
      switchRow({ id: 'sheet-total', label: t('sheets.blankTotal'), checked: opts.blankTotal, onChange: (v) => (opts.blankTotal = v) }),
      switchRow({ id: 'sheet-solutions', label: t('sheets.solutions'), checked: opts.solutions, onChange: (v) => (opts.solutions = v) }),
      switchRow({
        id: 'sheet-money',
        label: t('sheets.money'),
        checked: opts.money,
        onChange: (v) => {
          opts.money = v;
          moneySize?.setDisabled(!v);
        },
      }),
      choiceRow(t('sheets.moneySize'), t('sheets.moneySizeHelp'), (labelledBy) => {
        moneySize = segmented({
          labelledBy,
          testid: 'sheet-money-size',
          options: [
            { value: 'classroom', label: t('sheets.sizeClassroom') },
            { value: 'real', label: t('sheets.sizeReal') },
          ],
          value: opts.moneySize,
          onChange: (v) => (opts.moneySize = v as MoneySize),
        });
        return moneySize;
      }),
    ),
    print,
  );
}

// ---------- Data and privacy ----------

function dataTab(): HTMLElement {
  const point = (text: string): HTMLElement => h('li', null, h('span', { class: 'ico check-ico', html: icon('check', 18) }), h('span', null, text));
  return h(
    'div',
    { class: 'tab-stack' },
    card(t('data.privacyTitle'), h('ul', { class: 'checklist' }, point(t('data.p1')), point(t('data.p2')), point(t('data.p3')), point(t('data.p4')))),
    card(t('data.exportTitle'), h('p', { class: 'srow-help' }, t('data.exportHelp')), iconButton(t('data.exportAll'), 'download', 'btn-ghost btn-block', () => exportCSV(null))),
    h(
      'section',
      { class: 'pcard is-danger' },
      h('h2', { class: 'pcard-title' }, t('data.deleteTitle')),
      h('p', { class: 'srow-help' }, t('data.deleteHelp')),
      iconButton(
        t('data.deleteAll'),
        'trash',
        'btn-danger btn-block',
        () =>
          confirmDialog(t('data.deleteTitle'), t('data.deleteConfirm'), () => {
            store.clearAll();
            toast(t('data.deleted'));
            go('home');
          }),
        'delete-all',
      ),
    ),
  );
}

// ---------- Screen ----------

registerScreen('adult', (root, params) => {
  let tab: Tab = (params.tab as Tab) ?? 'stats';
  const panel = h('div', { class: 'tab-panel', role: 'tabpanel', id: 'adult-panel', tabindex: '-1' });
  const buttons = TABS.map(({ id, icon: name }) =>
    h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `tab-${id}`,
        class: 'tab',
        'aria-controls': 'adult-panel',
        'data-testid': `tab-${id}`,
        onclick: () => select(id),
      },
      h('span', { class: 'ico', html: icon(name, 22) }),
      h('span', { class: 'tab-label' }, t(`adult.tab.${id}` as Key)),
    ),
  );
  const select = (id: Tab): void => {
    tab = id;
    buttons.forEach((b, i) => {
      const on = TABS[i]!.id === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `tab-${id}`);
    panel.replaceChildren(id === 'stats' ? statsTab() : id === 'settings' ? settingsTab() : id === 'sheets' ? sheetsTab() : dataTab());
  };
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('adult.title') }, ...buttons);
  tablist.addEventListener('keydown', (e) => {
    const i = TABS.findIndex((x) => x.id === tab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const j = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
      select(TABS[j]!.id);
      buttons[j]!.focus();
    }
  });
  root.append(h('div', { class: 'adult' }, topbar({ title: t('adult.title'), back: () => go('home') }), h('main', { class: 'adult-main' }, tablist, panel)));
  select(tab);
});
