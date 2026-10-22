import { getLang } from '../i18n';
import { store } from '../state/store';

/**
 * Optional read-aloud with the Web Speech API. Degrades silently when the
 * browser has no synthesis or no voice for the language.
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
    const exact = voices.find((v) => v.lang.toLowerCase() === pref.toLowerCase());
    if (exact) return exact;
    const prefix = voices.find((v) => v.lang.toLowerCase().startsWith(pref.toLowerCase()));
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

export function say(text: string, opts: { force?: boolean; interrupt?: boolean } = {}): void {
  if (!store.settings.voice && !opts.force) return;
  const s = synth();
  if (!s) return;
  try {
    if (opts.interrupt !== false) s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const lang = getLang();
    const voice = findVoice(lang);
    u.lang = voice?.lang ?? LANG_PREFS[lang]?.[0] ?? 'es-ES';
    if (voice) u.voice = voice;
    u.rate = 0.92;
    u.pitch = 1.05;
    s.speak(u);
  } catch {
    /* no voice: ignore */
  }
}

export function stopSpeaking(): void {
  try {
    synth()?.cancel();
  } catch {
    /* ignore */
  }
}
