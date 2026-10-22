import { getLang } from '../i18n';
import { store } from '../state/store';

/**
 * Optional read-aloud with the Web Speech API.
 *
 * Phrases are QUEUED: a new phrase never cuts the previous one unless the
 * caller asks for `interrupt` (used when the player acts: answers, asks for a
 * hint, moves on…). Every call returns a promise that resolves when the
 * phrase has been spoken, so the game can wait for the voice before moving
 * on («Son 7 euros» … then «Te pago con 10 euros»).
 *
 * Degrades silently: without synthesis or with the voice switched off the
 * promises resolve immediately.
 */
const LANG_PREFS: Record<string, string[]> = {
  es: ['es-ES', 'es'],
  va: ['ca-ES', 'ca'],
};

function synth(): SpeechSynthesis | null {
  try {
    return 'speechSynthesis' in window ? window.speechSynthesis : null;
  } catch {
    return null;
  }
}

function findVoice(lang: string): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  const voices = s.getVoices();
  for (const pref of LANG_PREFS[lang] ?? []) {
    const exact = voices.find((v) => v.lang.toLowerCase().replace('_', '-') === pref.toLowerCase());
    if (exact) return exact;
    const prefix = voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(pref.toLowerCase()));
    if (prefix) return prefix;
  }
  return null;
}

export function speechAvailable(): boolean {
  return synth() !== null;
}

export function hasVoiceFor(lang: string): boolean {
  return findVoice(lang) !== null;
}

export function voiceEnabled(): boolean {
  return store.settings.voice && synth() !== null;
}

let queue: Promise<void> = Promise.resolve();
let lastCancel = 0;
/** Keep utterances referenced until they end: Chrome drops `onend` of collected ones. */
const alive = new Set<SpeechSynthesisUtterance>();
/** Incremented on every interruption: queued phrases of an older generation are dropped. */
let generation = 0;

export interface SayOptions {
  /** Stop what is being said and empty the queue first. */
  interrupt?: boolean;
  /** Speak even if the voice setting is off (e.g. testing the voice). */
  force?: boolean;
  /** Called when this phrase starts being spoken (or immediately when silent). */
  onStart?: () => void;
}

/** Rough duration if the browser never fires `onend` (some voices/OSes). */
function fallbackMs(text: string): number {
  return 1200 + text.length * 95;
}

async function speakNow(text: string, gen: number, onStart?: () => void): Promise<void> {
  // Chrome may swallow a phrase spoken right after cancel(): leave it a moment.
  const sinceCancel = Date.now() - lastCancel;
  if (sinceCancel < 120) await new Promise((r) => setTimeout(r, 120 - sinceCancel));
  return new Promise((resolve) => {
    const s = synth();
    if (!s || gen !== generation || text.trim() === '') {
      onStart?.();
      resolve();
      return;
    }
    let finished = false;
    let timer = 0;
    let u: SpeechSynthesisUtterance | null = null;
    const done = (): void => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      if (u) alive.delete(u);
      resolve();
    };
    try {
      u = new SpeechSynthesisUtterance(text);
      alive.add(u);
      const lang = getLang();
      const voice = findVoice(lang);
      u.lang = voice?.lang ?? LANG_PREFS[lang]?.[0] ?? 'es-ES';
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.pitch = 1.05;
      let started = false;
      u.onstart = () => {
        started = true;
        onStart?.();
      };
      u.onend = done;
      u.onerror = done;
      timer = window.setTimeout(() => {
        if (!started) onStart?.();
        done();
      }, fallbackMs(text));
      s.speak(u);
    } catch {
      onStart?.();
      done();
    }
  });
}

/**
 * Queue a phrase. Resolves when it has been spoken (or skipped). Never rejects.
 */
export function say(text: string, opts: SayOptions = {}): Promise<void> {
  // Interrupting also cancels silent sequences (voice off) of the previous step.
  if (opts.interrupt) stopSpeaking();
  if (!(store.settings.voice || opts.force) || !synth()) {
    opts.onStart?.();
    return Promise.resolve();
  }
  const gen = generation;
  const p = queue.then(() => (gen === generation ? speakNow(text, gen, opts.onStart) : undefined));
  queue = p.catch(() => undefined);
  return p;
}

/**
 * Speak several phrases in order, running `onStep(i)` as each one starts —
 * used to reveal the jumps of the number line in sync with the voice. Without
 * voice the steps advance on a timer.
 */
export async function saySequence(phrases: string[], onStep: (i: number) => void, opts: { interrupt?: boolean; silentDelayMs?: number } = {}): Promise<void> {
  const silent = !voiceEnabled();
  if (opts.interrupt) stopSpeaking();
  const gen = generation;
  for (let i = 0; i < phrases.length; i++) {
    if (gen !== generation) return;
    if (silent) {
      if (opts.silentDelayMs) await new Promise((r) => setTimeout(r, opts.silentDelayMs));
      if (gen !== generation) return;
      onStep(i);
    } else {
      await say(phrases[i]!, { onStart: () => gen === generation && onStep(i) });
    }
  }
}

/** Cut the current phrase and drop everything queued. */
export function stopSpeaking(): void {
  generation++;
  queue = Promise.resolve();
  try {
    const s = synth();
    if (s && (s.speaking || s.pending)) {
      s.cancel();
      lastCancel = Date.now();
    }
  } catch {
    /* ignore */
  }
}
