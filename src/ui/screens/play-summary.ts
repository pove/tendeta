import type { Mode } from '../../core/types';
import { STICKERS } from '../../data';
import { L, t } from '../../i18n';
import { play as sound } from '../../services/sound';
import { say } from '../../services/speech';
import { store, type GameConfig } from '../../state/store';
import { go } from '../app';
import { h } from '../dom';
import { icon } from '../svg/icons';

export interface CustomerResult {
  firstTry: boolean;
  solved: boolean;
  optimal?: boolean;
}

/** 1–3 stars from first-try accuracy. Never zero: no punishment. */
export function starsFor(results: CustomerResult[]): 1 | 2 | 3 {
  if (results.length === 0) return 1;
  const ratio = results.filter((r) => r.firstTry).length / results.length;
  if (ratio >= 0.8) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}

export function showSummary(opts: {
  root: HTMLElement;
  results: CustomerResult[];
  config: GameConfig;
  elapsedMs: number;
  showTime: boolean;
  guided: boolean;
  scorePieces?: boolean;
  then?: Mode;
  length?: number;
}): void {
  const { results, config } = opts;
  const profile = store.profile;
  const stars = starsFor(results);
  const first = results.filter((r) => r.firstTry).length;
  const solved = results.filter((r) => r.solved).length;
  // Extra points: change returned with the minimum number of pieces (level 6 / expert mode).
  const perfect = results.filter((r) => r.optimal && r.firstTry).length;
  const showPerfect = opts.scorePieces && results.some((r) => r.optimal !== undefined);

  // Stickers follow a fixed order (no random rewards).
  let sticker: (typeof STICKERS)[number] | undefined;
  if (profile && results.length > 0) {
    sticker = STICKERS.find((s) => !profile.stickers.includes(s.id));
    store.updateProfile(profile.id, {
      stickers: sticker ? [...profile.stickers, sticker.id] : profile.stickers,
      rounds: profile.rounds + 1,
    });
  }

  const starRow = h(
    'div',
    { class: 'stars', role: 'img', 'aria-label': t('summary.stars', { n: stars }) },
    ...[1, 2, 3].map((i) => h('span', { class: `star ${i <= stars ? 'is-on' : ''}`, style: `--d:${i * 180}ms`, html: icon('star', 64) })),
  );
  const time = Math.round(opts.elapsedMs / 1000);
  const timeText = `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
  const title = stars === 3 ? t('summary.great') : stars === 2 ? t('summary.good') : t('summary.keep');

  const again = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-go',
      'data-testid': 'play-again',
      onclick: () => {
        const mode = opts.guided ? (opts.then ?? 'auto') : config.mode;
        go('play', { config: { ...config, mode }, length: opts.length });
      },
    },
    h('span', { html: icon('replay', 22) }),
    opts.guided ? t('summary.continue') : t('summary.again'),
  );
  const decorate = h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'go-shop', onclick: () => go('shop') }, h('span', { html: icon('sticker', 22) }), t('summary.decorate'));
  const change = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => go('setup') }, t('summary.change'));

  const card = h(
    'section',
    { class: 'summary', 'data-testid': 'summary' },
    h('h2', { class: 'summary-title', tabindex: '-1' }, title),
    starRow,
    h(
      'ul',
      { class: 'summary-stats' },
      h('li', null, h('strong', null, `${first}/${results.length}`), h('span', null, t('summary.firstTry'))),
      h('li', null, h('strong', null, `${solved}/${results.length}`), h('span', null, t('summary.solved'))),
      showPerfect ? h('li', { class: 'is-bonus' }, h('strong', null, `⭐ ${perfect}`), h('span', null, t('summary.perfect'))) : null,
      opts.showTime ? h('li', null, h('strong', null, timeText), h('span', null, t('summary.time'))) : null,
    ),
    h(
      'ol',
      { class: 'summary-dots', 'aria-hidden': 'true' },
      ...results.map((r) => h('li', { class: r.firstTry ? 'is-ok' : r.solved ? 'is-retry' : 'is-miss' }, r.firstTry ? '✓' : r.solved ? '↺' : '·')),
    ),
    sticker
      ? h('div', { class: 'sticker-won' }, h('span', { class: 'sticker-big', 'aria-hidden': 'true' }, sticker.icon), h('p', null, t('summary.sticker', { name: L(sticker.name) })))
      : h('p', { class: 'help' }, t('summary.albumDone')),
    h('p', { class: 'help' }, t('summary.mistakes')),
    h('div', { class: 'summary-actions' }, again, decorate, change),
  );
  opts.root.replaceChildren(h('div', { class: 'summary-wrap' }, card));
  (card.querySelector('.summary-title') as HTMLElement).focus();
  sound('star');
  void say(`${title} ${t('summary.stars', { n: stars })}`, { interrupt: true });
}
