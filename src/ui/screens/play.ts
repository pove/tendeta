import { initialAdaptive, updateAdaptive, type AdaptiveState } from '../../core/adaptive';
import { countUpPoints, countUpSteps } from '../../core/countup';
import { checkChange, checkTotal, errorTypeOf, type AnswerCheck, type ErrorType } from '../../core/errors';
import { estimateQuestion } from '../../core/estimate';
import { generateProblem, type Focus } from '../../core/generator';
import { formatEuro, greedyChange, speakEuro, sum, type Cents } from '../../core/money';
import { buildPriceList } from '../../core/pricing';
import { createRng } from '../../core/rng';
import type { LevelDef, Mode, Problem, Scenario } from '../../core/types';
import { getLevel, getScenario } from '../../data';
import { L, getLang, randomCashier, t, tc, type Key } from '../../i18n';
import { play as sound } from '../../services/sound';
import { say } from '../../services/speech';
import * as wellbeing from '../../services/wellbeing';
import { store, type GameConfig, type LogEntry } from '../../state/store';
import { go, iconButton, registerScreen, topbar } from '../app';
import { keypad, type KeypadView } from '../components/keypad';
import { openModal } from '../components/modal';
import { moneyTray, pieceElement, type MoneyTrayView } from '../components/moneytray';
import { ticketView, type TicketView } from '../components/ticket';
import { clear, h, prefersReducedMotion, wait } from '../dom';
import { customerSvg, type Mood } from '../svg/customer';
import { icon } from '../svg/icons';
import { numberLineSvg } from '../svg/numberline';
import { shoppingPhase } from './play-shop';
import { showSummary, type CustomerResult } from './play-summary';

export interface PlayParams {
  config: GameConfig;
  /** After the guided practice, continue with this mode. */
  then?: Mode;
  length?: number;
}

function computeFocus(profileId: string): Focus {
  const recent = store.logFor(profileId).slice(-40);
  const counts: Partial<Record<ErrorType, number>> = {};
  for (const e of recent) for (const type of e.errorTypes) counts[type] = (counts[type] ?? 0) + 1;
  const ranked = (['carry', 'percent', 'units'] as const).map((k) => [k, counts[k] ?? 0] as const).sort((a, b) => b[1] - a[1]);
  const [top, n] = ranked[0]!;
  if (n < 3) return null;
  return top === 'units' ? 'cents' : top;
}

function estimationEnabled(level: LevelDef): boolean {
  const s = store.settings.estimation;
  if (s === 'off' || level.estimation === 'off') return false;
  if (s === 'on') return true;
  return level.estimation === 'on';
}

function showTraySum(level: LevelDef): boolean {
  const s = store.settings.traySum;
  if (s === 'show') return true;
  if (s === 'hide') return false;
  return level.traySum;
}

registerScreen('play', (root, rawParams) => {
  const params = rawParams as unknown as PlayParams;
  const profile = store.profile;
  if (!profile || !params.config) {
    go('home');
    return;
  }
  const config = params.config;
  const scenario: Scenario = getScenario(config.scenarioId);
  const level: LevelDef = getLevel(config.level);
  const mode = config.mode;
  const settings = store.settings;
  const guided = mode === 'guided';
  const total = guided ? 3 : (params.length ?? settings.roundLength);
  const timerOn = mode === 'challenge' && settings.timer;
  const rng = createRng();
  const priceList = buildPriceList(scenario, level, rng);
  const adaptiveKey = `${scenario.id}:${level.level}`;
  let adaptive: AdaptiveState = profile.adaptive?.[adaptiveKey] ?? initialAdaptive();
  const focus = computeFocus(profile.id);
  const results: CustomerResult[] = [];
  const roundStart = Date.now();
  let destroyed = false;
  let activeAnswer: { destroy(): void } | null = null;
  let offerHint = false;
  // The cashier who models the strategy is a woman or a man at random.
  const cashier = randomCashier();

  // ---------- Layout ----------
  const dots = h('ol', { class: 'progress-dots', 'aria-label': t('play.progress') });
  const renderDots = (): void => {
    dots.replaceChildren(
      ...Array.from({ length: total }, (_, i) => {
        const r = results[i];
        const cls = r ? (r.firstTry ? 'is-ok' : r.solved ? 'is-retry' : 'is-miss') : i === results.length ? 'is-now' : '';
        return h('li', { class: `dot ${cls}`, 'aria-label': t('play.customerN', { n: i + 1 }) });
      }),
    );
  };
  const timerEl = h('span', { class: 'timer-chip', 'aria-live': 'off' });
  let timerHandle: number | undefined;
  if (timerOn) {
    const tickTimer = (): void => {
      const s = Math.floor((Date.now() - roundStart) / 1000);
      timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    tickTimer();
    timerHandle = window.setInterval(tickTimer, 1000);
  }
  const voiceBtn = iconButton(settings.voice ? 'voice' : 'voiceOff', t('play.voice'), () => {
    store.updateSettings({ voice: !store.settings.voice });
    voiceBtn.innerHTML = icon(store.settings.voice ? 'voice' : 'voiceOff');
    voiceBtn.setAttribute('aria-pressed', String(store.settings.voice));
    if (store.settings.voice) say(t('play.voiceOn'));
  });
  voiceBtn.setAttribute('aria-pressed', String(settings.voice));
  const soundBtn = iconButton(settings.sound ? 'sound' : 'soundOff', t('play.sound'), () => {
    store.updateSettings({ sound: !store.settings.sound });
    soundBtn.innerHTML = icon(store.settings.sound ? 'sound' : 'soundOff');
    soundBtn.setAttribute('aria-pressed', String(store.settings.sound));
    sound('tap');
  });
  soundBtn.setAttribute('aria-pressed', String(settings.sound));

  const levelChip = h('span', { class: 'level-chip' }, t('play.levelChip', { n: level.level }));
  const header = topbar({
    title: `${scenario.icon} ${L(scenario.name)}`,
    back: () => confirmExit(),
    center: h('div', { class: 'topbar-center' }, levelChip, dots, timerOn ? timerEl : null),
    right: [voiceBtn, soundBtn],
  });

  const customerBox = h('div', { class: 'customer' });
  const bubble = h('p', { class: 'bubble', 'aria-live': 'polite' });
  const ticketSlot = h('div', { class: 'ticket-slot' });
  const givenSlot = h('div', { class: 'given', 'aria-live': 'polite' });
  const counter = h('section', { class: 'counter', 'aria-label': t('play.counter') }, h('div', { class: 'customer-row' }, customerBox, bubble), ticketSlot, givenSlot);
  const register = h('section', { class: 'register', 'aria-label': t('play.register') });
  const main = h('main', { class: 'play-grid' }, counter, register);
  const shell = h('div', { class: `play mode-${mode}` }, header, main);
  root.append(shell);

  function confirmExit(): void {
    if (results.length === 0) {
      go('setup');
      return;
    }
    const yes = h('button', { type: 'button', class: 'btn btn-danger' }, t('play.exitYes'));
    const no = h('button', { type: 'button', class: 'btn btn-ghost' }, t('play.exitNo'));
    const m = openModal({ title: t('play.exitTitle'), body: h('p', null, t('play.exitText')), actions: [no, yes] });
    yes.addEventListener('click', () => {
      m.close();
      go('setup');
    });
    no.addEventListener('click', () => m.close());
  }

  function setMood(seed: number, mood: Mood): void {
    customerBox.innerHTML = customerSvg(seed, mood, t('play.customer'));
  }

  function setBubble(text: string): void {
    bubble.textContent = text;
    bubble.classList.remove('pop');
    void bubble.offsetWidth;
    bubble.classList.add('pop');
  }

  function showGiven(problem: Problem): void {
    givenSlot.replaceChildren(
      h('p', { class: 'given-label' }, t('play.givesYou')),
      h('div', { class: 'given-pieces' }, ...problem.payment.map((p) => pieceElement(p, 0.8))),
      h('p', { class: 'given-total', 'data-testid': 'paid' }, formatEuro(problem.paid)),
    );
    givenSlot.classList.add('is-in');
  }

  function registerPanel(...children: (Node | null)[]): void {
    activeAnswer?.destroy();
    activeAnswer = null;
    register.replaceChildren(...children.filter((c): c is Node => c !== null));
  }

  /** On narrow screens the till is below the ticket: bring the payment and the till into view. */
  function focusTill(): void {
    if (!window.matchMedia('(max-width: 859px)').matches) return;
    const target = givenSlot.classList.contains('is-in') ? givenSlot : register;
    target.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  // ---------- Round loop ----------
  async function run(): Promise<void> {
    renderDots();
    for (let i = 0; i < total && !destroyed; i++) {
      wellbeing.tick();
      if (i > 0 && settings.breakReminder && wellbeing.shouldSuggestBreak()) {
        const goOn = await breakReminder();
        if (!goOn || destroyed) return;
      }
      if (guided && i === 0) {
        await workedExample();
        if (destroyed) return;
      }
      const result = await customer(i);
      if (destroyed) return;
      results.push(result);
      renderDots();
      wellbeing.tick();
    }
    if (destroyed) return;
    finish();
  }

  function breakReminder(): Promise<boolean> {
    return new Promise((resolve) => {
      const rest = h('button', { type: 'button', class: 'btn btn-go' }, t('break.rest'));
      const more = h('button', { type: 'button', class: 'btn btn-ghost' }, t('break.more'));
      const m = openModal({
        title: t('break.title'),
        body: [h('p', { class: 'break-emoji', 'aria-hidden': 'true' }, '🌿'), h('p', null, t('break.text', { min: wellbeing.playedMinutes() }))],
        actions: [rest, more],
        dismissable: false,
      });
      rest.addEventListener('click', () => {
        m.close();
        wellbeing.resetPlayTime();
        resolve(false);
        go('home');
      });
      more.addEventListener('click', () => {
        wellbeing.acknowledgeBreak();
        m.close();
        resolve(true);
      });
    });
  }

  function newProblem(): Problem {
    return generateProblem(scenario, level, priceList, { tier: adaptive.tier, focus: guided ? null : focus, seed: rng.int(0, 2 ** 31) });
  }

  async function presentProblem(problem: Problem, opts: { hideTotal: boolean }): Promise<TicketView> {
    setMood(problem.customerSeed, 'neutral');
    customerBox.classList.remove('enter');
    void customerBox.offsetWidth;
    customerBox.classList.add('enter');
    givenSlot.replaceChildren();
    givenSlot.classList.remove('is-in');
    setBubble(problem.people > 1 ? t('play.helloTable', { people: problem.people }) : t('play.hello'));
    const tv = ticketView(problem, L(scenario.name), { hideTotal: opts.hideTotal });
    clear(ticketSlot);
    ticketSlot.appendChild(tv.el);
    registerPanel(h('div', { class: 'register-wait' }, h('p', null, t('play.scanning')), h('div', { class: 'scanner', 'aria-hidden': 'true' })));
    await wait(450);
    await tv.scan(prefersReducedMotion());
    if (!opts.hideTotal) say(t('say.total', { amount: speakEuro(problem.due, getLang()) }));
    return tv;
  }

  // ----- Guided practice: worked example -----
  async function workedExample(): Promise<void> {
    const problem = newProblem();
    await presentProblem(problem, { hideTotal: false });
    showGiven(problem);
    setBubble(t('play.payWith', { amount: formatEuro(problem.paid) }));
    const steps = countUpSteps(problem.due, problem.paid);
    let revealed = 0;
    const lineBox = h('div', { class: 'nl-box' });
    const explain = h('p', { class: 'guided-explain', 'aria-live': 'polite' });
    const nextBtn = h('button', { type: 'button', class: 'btn btn-go', 'data-testid': 'guided-next' }, t('guided.nextStep'));
    const render = (): void => {
      lineBox.innerHTML = numberLineSvg(problem.due, problem.paid, { revealed, label: t('nl.label') });
      if (revealed === 0) explain.textContent = t('guided.start', { price: formatEuro(problem.due), paid: formatEuro(problem.paid) });
      else if (revealed <= steps.length) {
        const s = steps[revealed - 1]!;
        explain.textContent = t('guided.step', { from: formatEuro(s.from), to: formatEuro(s.to), add: formatEuro(s.add) });
      }
      if (revealed === steps.length) {
        explain.textContent += ' ' + t('guided.done', { change: formatEuro(problem.change) });
        nextBtn.textContent = t('guided.yourTurn');
      }
      say(explain.textContent ?? '');
    };
    registerPanel(
      h(
        'div',
        { class: 'guided' },
        h('h2', { class: 'panel-title' }, tc('guided.title', cashier)),
        h('p', { class: 'help' }, t('guided.intro')),
        lineBox,
        explain,
        h('div', { class: 'guided-pieces', 'aria-label': t('guided.pieces') }),
        nextBtn,
      ),
    );
    render();
    await new Promise<void>((resolve) => {
      nextBtn.addEventListener('click', () => {
        if (revealed < steps.length) {
          revealed++;
          render();
          if (revealed === steps.length) {
            const box = register.querySelector('.guided-pieces')!;
            box.replaceChildren(...greedyChange(problem.change, level.money).map((p) => pieceElement(p, 0.72)));
          }
        } else resolve();
      });
    });
  }

  // ----- One customer -----
  async function customer(index: number): Promise<CustomerResult> {
    let problem: Problem;
    if (mode === 'free') {
      const chosen = await shoppingPhase({ main, register, counter, scenario, level, priceList, rng });
      if (destroyed || !chosen) return { firstTry: false, solved: false };
      problem = chosen;
    } else {
      problem = newProblem();
    }
    const calcTotal = settings.calcTotal && level.calcTotal && !guided;
    const tv = await presentProblem(problem, { hideTotal: calcTotal });
    if (destroyed) return { firstTry: false, solved: false };

    const extra: Partial<LogEntry> = {};
    const errorTypes: ErrorType[] = [];

    if (calcTotal) {
      const ok = await totalPhase(problem);
      extra.totalOk = ok;
      if (!ok) errorTypes.push('total');
      tv.revealTotal();
      say(t('say.total', { amount: speakEuro(problem.due, getLang()) }));
    }

    await wait(250);
    showGiven(problem);
    setBubble(problem.trick ? t('play.payWithTrick', { amount: formatEuro(problem.paid) }) : t('play.payWith', { amount: formatEuro(problem.paid) }));
    say(t('say.pays', { amount: speakEuro(problem.paid, getLang()) }));
    sound('bill');

    if (estimationEnabled(level) && !guided) {
      const ok = await estimatePhase(problem);
      extra.estimateOk = ok;
      if (!ok) errorTypes.push('estimate');
    }

    const answer = await answerPhase(problem, index);
    for (const e of answer.errorTypes) if (!errorTypes.includes(e)) errorTypes.push(e);

    const entry: LogEntry = {
      id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e5).toString(36)}`,
      profileId: profile!.id,
      ts: Date.now(),
      scenarioId: scenario.id,
      mode,
      level: level.level,
      method: config.method,
      total: problem.total,
      due: problem.due,
      paid: problem.paid,
      change: problem.change,
      answers: answer.answers,
      firstTry: answer.firstTry,
      solved: answer.solved,
      errorType: answer.errorType,
      errorTypes,
      borrow: problem.borrow,
      hints: answer.hints,
      timeMs: answer.timeMs,
      optimal: answer.optimal,
      ...extra,
    };
    store.addLog(entry);
    if (!guided) {
      const upd = updateAdaptive(adaptive, answer.firstTry);
      adaptive = upd.state;
      offerHint = upd.offerHint;
    }
    return { firstTry: answer.firstTry, solved: answer.solved, optimal: answer.optimal };
  }

  // ----- «Calcula tú el total» -----
  function totalPhase(problem: Problem): Promise<boolean> {
    return new Promise((resolve) => {
      let tries = 0;
      const fb = h('div', { class: 'feedback', 'aria-live': 'assertive' });
      const kp = keypad({
        decimal: level.decimalKey,
        label: t('total.question'),
        submitLabel: t('total.submit'),
        onSubmit: (value) => {
          tries++;
          const check = checkTotal(problem, value);
          if (check.correct) {
            sound('success');
            fb.className = 'feedback is-ok';
            fb.textContent = t('total.ok');
            kp.setDisabled(true);
            setTimeout(() => resolve(tries === 1), 900);
          } else if (tries < 2) {
            sound('oops');
            fb.className = 'feedback is-ko';
            fb.textContent = diffMessage(check) + ' ' + t('total.retry');
            say(fb.textContent);
            kp.clear();
          } else {
            fb.className = 'feedback is-ko';
            fb.textContent = t('total.reveal', { total: formatEuro(problem.total) });
            say(fb.textContent);
            kp.setDisabled(true);
            const cont = h('button', { type: 'button', class: 'btn btn-go', onclick: () => resolve(false) }, t('common.continue'));
            fb.appendChild(cont);
            cont.focus();
          }
        },
      });
      registerPanel(h('div', { class: 'answer' }, h('h2', { class: 'panel-title' }, t('total.title')), fb, kp.el));
      if (window.matchMedia('(max-width: 859px)').matches) ticketSlot.scrollIntoView({ block: 'end', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      activeAnswer = kp;
    });
  }

  // ----- Estimation -----
  function estimatePhase(problem: Problem): Promise<boolean> {
    return new Promise((resolve) => {
      const q = estimateQuestion(problem.change, (n) => rng.int(0, n - 1));
      const fb = h('p', { class: 'feedback', 'aria-live': 'assertive' });
      const amount = formatEuro(q.threshold, { decimals: 'auto' });
      const choose = (more: boolean): void => {
        const ok = more === q.answerMore;
        less.disabled = true;
        moreBtn.disabled = true;
        sound(ok ? 'success' : 'oops');
        fb.className = `feedback ${ok ? 'is-ok' : 'is-ko'}`;
        fb.textContent = (ok ? t('estimate.ok') : t('estimate.ko')) + ' ' + (q.answerMore ? t('estimate.isMore', { amount }) : t('estimate.isLess', { amount }));
        say(fb.textContent);
        const cont = h('button', { type: 'button', class: 'btn btn-go', 'data-testid': 'estimate-continue', onclick: () => resolve(ok) }, t('estimate.now'));
        fb.appendChild(cont);
        cont.focus();
      };
      const less = h('button', { type: 'button', class: 'btn btn-choice', 'data-testid': 'estimate-less', onclick: () => choose(false) }, '⬇ ', t('estimate.less', { amount }));
      const moreBtn = h('button', { type: 'button', class: 'btn btn-choice', 'data-testid': 'estimate-more', onclick: () => choose(true) }, '⬆ ', t('estimate.more', { amount }));
      const question = t('estimate.question', { amount });
      setTimeout(focusTill, 50);
      registerPanel(h('div', { class: 'estimate' }, h('h2', { class: 'panel-title' }, t('estimate.title')), h('p', { class: 'estimate-q' }, question), h('div', { class: 'estimate-btns' }, less, moreBtn), fb));
      say(question);
    });
  }

  function diffMessage(check: AnswerCheck): string {
    const amount = formatEuro(Math.abs(check.diff));
    return check.diff > 0 ? t('fb.over', { amount }) : t('fb.under', { amount });
  }

  function tagMessages(check: AnswerCheck): string[] {
    const msgs: string[] = [];
    if (check.tags.includes('units')) msgs.push(t('fb.units'));
    if (check.tags.includes('percent')) msgs.push(t('fb.percent'));
    if (check.tags.includes('split')) msgs.push(t('fb.split'));
    if (check.tags.includes('carry') && !check.tags.includes('units')) msgs.push(t('fb.carry'));
    return msgs;
  }

  // ----- Answer (keypad or money) -----
  interface AnswerResult {
    answers: Cents[];
    firstTry: boolean;
    solved: boolean;
    errorType: ErrorType | null;
    errorTypes: ErrorType[];
    hints: number;
    timeMs: number;
    optimal?: boolean;
  }

  function answerPhase(problem: Problem, index: number): Promise<AnswerResult> {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const answers: Cents[] = [];
      const errorTypes: ErrorType[] = [];
      let firstError: ErrorType | null = null;
      let hints = 0;
      // Guided practice: hints fade out (points shown → first jump → nothing).
      const scaffold = guided ? 2 - index : 0;
      let hintRevealed = scaffold === 2 ? 0 : -1;
      const steps = countUpSteps(problem.due, problem.paid);

      const fb = h('div', { class: 'feedback', 'aria-live': 'assertive', 'data-testid': 'feedback' });
      const hintBox = h('div', { class: 'hint-box' });
      const renderHint = (): void => {
        if (hintRevealed < 0) {
          hintBox.replaceChildren();
          return;
        }
        const first = steps[0];
        const text =
          hintRevealed === 0
            ? t('hint.points', { price: formatEuro(problem.due), paid: formatEuro(problem.paid) })
            : first
              ? t('hint.first', { from: formatEuro(first.from), to: formatEuro(first.to) })
              : '';
        hintBox.replaceChildren(
          h('p', { class: 'hint-text' }, '💡 ', text),
          h('div', { class: 'nl-box', html: numberLineSvg(problem.due, problem.paid, { revealed: Math.max(0, hintRevealed), showPoints: true, label: t('nl.label') }) }),
        );
      };
      const hintBtn = h('button', { type: 'button', class: 'btn btn-hint', 'data-testid': 'hint', html: `${icon('hint', 22)}<span>${t('hint.button')}</span>` });
      hintBtn.addEventListener('click', () => {
        hints++;
        hintRevealed = Math.min(steps.length - 1, hintRevealed + 1);
        if (hintRevealed < 1 && steps.length > 1) hintRevealed = 1;
        renderHint();
        const txt = hintBox.querySelector('.hint-text')?.textContent;
        if (txt) say(txt);
        if (hintRevealed >= steps.length - 1) hintBtn.disabled = true;
      });
      const showHintButton = (guided && scaffold >= 1) || offerHint;
      hintBtn.hidden = !showHintButton;
      if (offerHint) {
        hintBtn.classList.add('is-glow');
        offerHint = false;
      }
      renderHint();

      const finish = (solved: boolean, optimal?: boolean): void => {
        const res: AnswerResult = {
          answers,
          firstTry: solved && answers.length === 1,
          solved,
          errorType: firstError,
          errorTypes,
          hints,
          timeMs: Date.now() - t0,
          optimal,
        };
        resolve(res);
      };

      const nextLabel = index + 1 >= total ? t('play.finish') : t('play.next');

      const onAnswer = (value: Cents, pieces?: Cents[]): void => {
        answers.push(value);
        const check = checkChange(problem, value);
        if (check.correct) {
          answerUi.setDisabled(true);
          let optimal: boolean | undefined;
          let extraMsg = '';
          if (pieces) {
            const best = greedyChange(problem.change, level.money).length;
            optimal = pieces.length <= best;
            if (level.minPieces || settings.expert) {
              extraMsg = optimal ? t('fb.optimal') : t('fb.notOptimal', { n: best });
            }
          }
          container.classList.add('is-resolved');
          celebrate(problem, fb, extraMsg, nextLabel, () => finish(true, optimal));
          return;
        }
        const type = errorTypeOf(check);
        if (type) {
          if (!firstError) firstError = type;
          if (!errorTypes.includes(type)) errorTypes.push(type);
        }
        sound('oops');
        setMood(problem.customerSeed, 'thinking');
        if (answers.length < 2) {
          const msgs = [diffMessage(check), ...tagMessages(check)];
          fb.className = 'feedback is-ko';
          fb.replaceChildren(h('p', { class: 'fb-main' }, msgs[0]!), ...msgs.slice(1).map((m) => h('p', { class: 'fb-tip' }, m)), h('p', { class: 'fb-tip' }, t('fb.tryAgain')));
          say(msgs.join(' '));
          hintBtn.hidden = false;
          hintBtn.classList.add('is-glow');
          if ('clear' in answerUi && config.method === 'keypad') (answerUi as KeypadView).clear();
          setBubble(t('play.hmm'));
        } else {
          answerUi.setDisabled(true);
          hintBtn.hidden = true;
          container.classList.add('is-resolved');
          showSolution(problem, fb, check, nextLabel, () => finish(false));
        }
      };

      let answerUi: KeypadView | MoneyTrayView;
      const question = guided && scaffold === 2 ? tc('answer.questionGuided', cashier) : t('answer.question');
      if (config.method === 'keypad') {
        answerUi = keypad({ decimal: level.decimalKey, label: question, submitLabel: t('answer.submit'), onSubmit: (v) => onAnswer(v) });
      } else {
        answerUi = moneyTray({ denominations: level.money, showSum: showTraySum(level), submitLabel: t('answer.submit'), onSubmit: (pieces) => onAnswer(sum(pieces), pieces) });
      }
      const container = h(
        'div',
        { class: `answer method-${config.method}` },
        h('div', { class: 'answer-head' }, h('h2', { class: 'panel-title' }, config.method === 'money' ? question : t('answer.title')), hintBtn),
        hintBox,
        fb,
        answerUi.el,
      );
      registerPanel(container);
      activeAnswer = answerUi;
      focusTill();
      say(t('say.question'), { interrupt: false });
    });
  }

  function celebrate(problem: Problem, fb: HTMLElement, extraMsg: string, nextLabel: string, done: () => void): void {
    sound('success');
    setMood(problem.customerSeed, 'happy');
    setBubble(t(`thanks.${1 + (problem.seed % 4)}` as Key));
    const points = countUpPoints(problem.due, problem.paid);
    const praise = t(`praise.${1 + (problem.seed % 5)}` as Key);
    const line = h('div', { class: 'nl-box is-celebrate' });
    const steps = countUpSteps(problem.due, problem.paid);
    const next = h('button', { type: 'button', class: 'btn btn-go', 'data-testid': 'next-customer', onclick: done }, nextLabel, h('span', { html: icon('next', 22) }));
    fb.className = 'feedback is-ok';
    const parts: (Node | null)[] = [
        h('p', { class: 'fb-main' }, '🎉 ', praise),
        h('p', { class: 'fb-tip' }, t('fb.countUp')),
        line,
        extraMsg ? h('p', { class: 'fb-tip fb-bonus' }, extraMsg) : null,
        next,
      ];
    fb.replaceChildren(...parts.filter((n): n is Node => n !== null));
    // Count forward aloud: 7,40 … 7,50, 8, 10 and 20.
    const spoken = points.map((p) => speakEuro(p, getLang())).join(', ');
    say(`${praise} ${spoken}.`);
    let revealed = 0;
    const draw = (): void => {
      line.innerHTML = numberLineSvg(problem.due, problem.paid, { revealed, label: t('nl.label') });
    };
    draw();
    const stepAnim = async (): Promise<void> => {
      for (let i = 0; i < steps.length; i++) {
        await wait(prefersReducedMotion() ? 0 : 420);
        if (destroyed) return;
        revealed = i + 1;
        draw();
        sound('coin');
      }
    };
    void stepAnim();
    next.focus({ preventScroll: true });
  }

  function showSolution(problem: Problem, fb: HTMLElement, check: AnswerCheck, nextLabel: string, done: () => void): void {
    const steps = countUpSteps(problem.due, problem.paid);
    const msgs = [diffMessage(check), ...tagMessages(check)];
    const next = h('button', { type: 'button', class: 'btn btn-go', 'data-testid': 'next-customer', onclick: done }, nextLabel, h('span', { html: icon('next', 22) }));
    fb.className = 'feedback is-solution';
    fb.replaceChildren(
      h('p', { class: 'fb-main' }, msgs.join(' ')),
      h('p', { class: 'fb-tip' }, t('fb.solutionIntro')),
      h('div', { class: 'nl-box', html: numberLineSvg(problem.due, problem.paid, { revealed: steps.length, label: t('nl.label') }) }),
      h(
        'ol',
        { class: 'solution-steps' },
        ...steps.map((s) => h('li', null, t('guided.step', { from: formatEuro(s.from), to: formatEuro(s.to), add: formatEuro(s.add) }))),
      ),
      h('p', { class: 'fb-answer', 'data-testid': 'solution' }, t('fb.solution', { change: formatEuro(problem.change) })),
      h('div', { class: 'guided-pieces' }, ...greedyChange(problem.change, level.money).map((p) => pieceElement(p, 0.72))),
      h('p', { class: 'fb-tip' }, t('fb.keepGoing')),
      next,
    );
    say(`${msgs.join(' ')} ${t('fb.solution', { change: speakEuro(problem.change, getLang()) })}`);
    next.focus({ preventScroll: true });
  }

  function finish(): void {
    if (timerHandle) window.clearInterval(timerHandle);
    const p = store.profile;
    if (!p) return;
    const adaptiveMap = { ...(p.adaptive ?? {}), [adaptiveKey]: adaptive };
    const guidedSeen = guided && !p.guidedSeen.includes(level.level) ? [...p.guidedSeen, level.level] : p.guidedSeen;
    store.updateProfile(p.id, { adaptive: adaptiveMap, guidedSeen });
    showSummary({
      root: main,
      results,
      config,
      elapsedMs: Date.now() - roundStart,
      showTime: timerOn,
      guided,
      scorePieces: level.minPieces || settings.expert,
      then: params.then,
      length: params.length,
    });
  }

  void run();

  return () => {
    destroyed = true;
    activeAnswer?.destroy();
    if (timerHandle) window.clearInterval(timerHandle);
    document.querySelectorAll('.drag-ghost').forEach((g) => g.remove());
  };
});

