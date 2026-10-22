import { ERROR_TYPES, profileStats, toCSV, type ProfileStats } from '../../core/stats';
import type { LevelId } from '../../core/types';
import { LEVEL_IDS, SCENARIOS } from '../../data';
import { L, LANGS, t, type Key, type UiLang } from '../../i18n';
import { hasVoiceFor, speechAvailable } from '../../services/speech';
import { store, type Settings } from '../../state/store';
import { go, refresh, registerScreen, topbar } from '../app';
import { openModal, toast } from '../components/modal';
import { h } from '../dom';
import { icon } from '../svg/icons';
import { printSheets, printSummary, type MoneySize } from './printables';

type Tab = 'stats' | 'settings' | 'sheets' | 'data';

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

/** Single-series horizontal bars: one hue, values in text ink, table semantics underneath. */
function bars(rows: { label: string; value: number; max: number; display: string }[], caption: string): HTMLElement {
  return h(
    'table',
    { class: 'bars' },
    h('caption', null, caption),
    h(
      'tbody',
      null,
      ...rows.map((r) =>
        h(
          'tr',
          { title: `${r.label}: ${r.display}` },
          h('th', { scope: 'row' }, r.label),
          h('td', null, h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `--v:${r.max === 0 ? 0 : Math.max(0.02, r.value / r.max)}` })), h('span', { class: 'bar-value' }, r.display)),
        ),
      ),
    ),
  );
}

export function statsBlock(stats: ProfileStats): HTMLElement {
  const tiles = h(
    'div',
    { class: 'kpis' },
    h('div', { class: 'kpi' }, h('strong', null, String(stats.problems)), h('span', null, t('stats.problems'))),
    h('div', { class: 'kpi' }, h('strong', null, `${stats.firstTryPct} %`), h('span', null, t('stats.firstTry'))),
    h('div', { class: 'kpi' }, h('strong', null, `${String(stats.avgTimeS).replace('.', ',')} s`), h('span', null, t('stats.avgTime'))),
    h('div', { class: 'kpi' }, h('strong', null, stats.levels.length ? stats.levels.map((n) => t('play.levelChip', { n })).join(' · ') : '—'), h('span', null, t('stats.levels'))),
  );
  const levelBars = bars(
    stats.byLevel.map((l) => ({ label: t('play.levelChip', { n: l.level }), value: l.firstTryPct, max: 100, display: `${l.firstTryPct} % · ${l.problems}` })),
    t('stats.byLevel'),
  );
  const maxErr = Math.max(0, ...ERROR_TYPES.map((e) => stats.errors[e]));
  const errorBars = bars(
    ERROR_TYPES.map((e) => ({ label: t(`err.${e}` as Key), value: stats.errors[e], max: maxErr, display: String(stats.errors[e]) })),
    t('stats.errors'),
  );
  const borrow = h(
    'p',
    { class: 'help' },
    t('stats.borrow', {
      with: stats.borrowFirstTryPct === null ? '—' : `${stats.borrowFirstTryPct} %`,
      without: stats.noBorrowFirstTryPct === null ? '—' : `${stats.noBorrowFirstTryPct} %`,
    }),
  );
  return h('div', { class: 'stats-block' }, tiles, h('div', { class: 'stats-charts' }, levelBars, errorBars), borrow);
}

function statsTab(): HTMLElement {
  if (store.profiles.length === 0) return h('p', { class: 'empty-state' }, t('stats.none'));
  let selected = store.profiles[0]!.id;
  const detail = h('div', { class: 'stats-detail' });
  const select = h(
    'select',
    { class: 'select', id: 'profile-select', 'aria-label': t('stats.profile') },
    ...store.profiles.map((p) => h('option', { value: p.id }, `${p.avatar} ${p.alias}`)),
  );
  const renderDetail = (): void => {
    const p = store.profiles.find((x) => x.id === selected)!;
    const stats = profileStats(store.logFor(p.id));
    detail.replaceChildren(
      statsBlock(stats),
      h(
        'div',
        { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('download', 20)}<span>${t('stats.csv')}</span>`, onclick: () => exportCSV(p.id) }),
        h('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('print', 20)}<span>${t('stats.print')}</span>`, onclick: () => printSummary(p, stats) }),
        h('button', {
          type: 'button',
          class: 'btn btn-danger-ghost',
          html: `${icon('trash', 20)}<span>${t('stats.deleteProfile')}</span>`,
          onclick: () =>
            confirmDialog(t('stats.deleteProfileTitle', { alias: p.alias }), t('stats.deleteProfileText'), () => {
              store.deleteProfile(p.id);
              refresh();
            }),
        }),
      ),
    );
  };
  select.addEventListener('change', () => {
    selected = select.value;
    renderDetail();
  });
  renderDetail();
  return h('div', null, h('label', { class: 'field-label', for: 'profile-select' }, t('stats.profile')), select, detail);
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

function toggle(key: keyof Settings, label: string, help?: string): HTMLElement {
  const id = `set-${key}`;
  const value = store.settings[key] as boolean;
  const sw = h('button', {
    type: 'button',
    role: 'switch',
    class: 'switch',
    id,
    'aria-checked': String(value),
    'data-testid': id,
    onclick: () => {
      const next = !(store.settings[key] as boolean);
      store.updateSettings({ [key]: next } as Partial<Settings>);
      sw.setAttribute('aria-checked', String(next));
    },
  });
  return h('div', { class: 'setting' }, h('div', null, h('label', { for: id, class: 'setting-label' }, label), help ? h('p', { class: 'help' }, help) : null), sw);
}

function choice<K extends keyof Settings>(key: K, label: string, options: { value: Settings[K]; label: string }[], onChange?: () => void): HTMLElement {
  const id = `set-${String(key)}`;
  const select = h('select', { class: 'select', id }, ...options.map((o) => h('option', { value: String(o.value), selected: o.value === store.settings[key] }, o.label)));
  select.addEventListener('change', () => {
    const opt = options.find((o) => String(o.value) === select.value)!;
    store.updateSettings({ [key]: opt.value } as Partial<Settings>);
    onChange?.();
  });
  return h('div', { class: 'setting' }, h('label', { for: id, class: 'setting-label' }, label), select);
}

function settingsTab(): HTMLElement {
  const voiceHelp = !speechAvailable() ? t('settings.voiceNone') : hasVoiceFor(store.settings.lang) ? t('settings.voiceHelp') : t('settings.voiceNoLang');
  return h(
    'div',
    { class: 'settings' },
    choice('lang', t('settings.lang'), LANGS.map((l) => ({ value: l.id as UiLang, label: l.label })), () => go('adult', { tab: 'settings' }, false)),
    toggle('voice', t('settings.voice'), voiceHelp),
    toggle('sound', t('settings.sound'), t('settings.soundHelp')),
    choice('fontSize', t('settings.fontSize'), [
      { value: 'm', label: t('settings.fontM') },
      { value: 'l', label: t('settings.fontL') },
      { value: 'xl', label: t('settings.fontXL') },
    ]),
    choice('roundLength', t('settings.roundLength'), [
      { value: 5, label: t('settings.customers', { n: 5 }) },
      { value: 10, label: t('settings.customers', { n: 10 }) },
    ]),
    toggle('calcTotal', t('settings.calcTotal'), t('settings.calcTotalHelp')),
    choice('traySum', t('settings.traySum'), [
      { value: 'auto', label: t('settings.traySumAuto') },
      { value: 'show', label: t('settings.show') },
      { value: 'hide', label: t('settings.hide') },
    ]),
    choice('estimation', t('settings.estimation'), [
      { value: 'auto', label: t('settings.estimationAuto') },
      { value: 'on', label: t('settings.estimationOn') },
      { value: 'off', label: t('settings.off') },
    ]),
    toggle('expert', t('settings.expert'), t('settings.expertHelp')),
    toggle('timer', t('settings.timer'), t('settings.timerHelp')),
    toggle('breakReminder', t('settings.break'), t('settings.breakHelp')),
    toggle('reduceMotion', t('settings.motion'), t('settings.motionHelp')),
  );
}

function sheetsTab(): HTMLElement {
  const scenario = h('select', { class: 'select', id: 'sheet-scenario' }, ...SCENARIOS.map((s) => h('option', { value: s.id }, `${s.icon} ${L(s.name)}`)));
  const level = h('select', { class: 'select', id: 'sheet-level' }, ...LEVEL_IDS.map((l) => h('option', { value: String(l) }, t('play.levelChip', { n: l }))));
  const count = h('select', { class: 'select', id: 'sheet-count' }, ...[6, 12, 18].map((n) => h('option', { value: String(n) }, String(n))));
  const withTotal = h('input', { type: 'checkbox', id: 'sheet-total', class: 'check' });
  const withMoney = h('input', { type: 'checkbox', id: 'sheet-money', class: 'check', checked: true });
  const withSolutions = h('input', { type: 'checkbox', id: 'sheet-solutions', class: 'check', checked: true });
  const moneySize = h(
    'select',
    { class: 'select', id: 'sheet-money-size' },
    h('option', { value: 'classroom' }, t('sheets.sizeClassroom')),
    h('option', { value: 'real' }, t('sheets.sizeReal')),
  );
  const field = (id: string, label: string, control: HTMLElement): HTMLElement => h('div', { class: 'setting' }, h('label', { for: id, class: 'setting-label' }, label), control);
  const check = (id: string, label: string, control: HTMLElement): HTMLElement => h('label', { class: 'check-row', for: id }, control, h('span', null, label));
  return h(
    'div',
    { class: 'sheets' },
    h('p', { class: 'lead' }, t('sheets.intro')),
    field('sheet-scenario', t('sheets.scenario'), scenario),
    field('sheet-level', t('sheets.level'), level),
    field('sheet-count', t('sheets.count'), count),
    check('sheet-total', t('sheets.blankTotal'), withTotal),
    check('sheet-money', t('sheets.money'), withMoney),
    field('sheet-money-size', t('sheets.moneySize'), moneySize),
    check('sheet-solutions', t('sheets.solutions'), withSolutions),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-go',
        'data-testid': 'print-sheets',
        html: `${icon('print', 22)}<span>${t('sheets.print')}</span>`,
        onclick: () =>
          printSheets({
            scenarioId: scenario.value,
            level: Number(level.value) as LevelId,
            count: Number(count.value),
            blankTotal: withTotal.checked,
            money: withMoney.checked,
            moneySize: moneySize.value as MoneySize,
            solutions: withSolutions.checked,
          }),
      },
    ),
  );
}

function dataTab(): HTMLElement {
  return h(
    'div',
    { class: 'data-tab' },
    h('p', { class: 'lead' }, t('data.privacy')),
    h('ul', { class: 'privacy-list' }, h('li', null, t('data.p1')), h('li', null, t('data.p2')), h('li', null, t('data.p3')), h('li', null, t('data.p4'))),
    h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('download', 20)}<span>${t('data.exportAll')}</span>`, onclick: () => exportCSV(null) })),
    h(
      'div',
      { class: 'danger-zone' },
      h('h3', null, t('data.deleteTitle')),
      h('p', { class: 'help' }, t('data.deleteHelp')),
      h('button', {
        type: 'button',
        class: 'btn btn-danger',
        'data-testid': 'delete-all',
        html: `${icon('trash', 20)}<span>${t('data.deleteAll')}</span>`,
        onclick: () =>
          confirmDialog(t('data.deleteTitle'), t('data.deleteConfirm'), () => {
            store.clearAll();
            toast(t('data.deleted'));
            go('home');
          }),
      }),
    ),
  );
}

registerScreen('adult', (root, params) => {
  let tab: Tab = (params.tab as Tab) ?? 'stats';
  const tabs: Tab[] = ['stats', 'settings', 'sheets', 'data'];
  const panel = h('div', { class: 'tab-panel', role: 'tabpanel', id: 'adult-panel', tabindex: '0' });
  const buttons = tabs.map((id) =>
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
      t(`adult.tab.${id}` as Key),
    ),
  );
  const select = (id: Tab): void => {
    tab = id;
    buttons.forEach((b, i) => {
      const on = tabs[i] === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `tab-${id}`);
    panel.replaceChildren(id === 'stats' ? statsTab() : id === 'settings' ? settingsTab() : id === 'sheets' ? sheetsTab() : dataTab());
  };
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('adult.title') }, ...buttons);
  tablist.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(tab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      select(tabs[j]!);
      buttons[j]!.focus();
    }
  });
  root.append(h('div', { class: 'adult' }, topbar({ title: t('adult.title'), back: () => go('home') }), h('main', { class: 'adult-main' }, tablist, panel)));
  select(tab);
});
