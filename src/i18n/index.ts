import type { L10n } from '../core/types';
import es from './es.json';
import va from './va.json';

export type UiLang = 'es' | 'va';
/** Spanish is the primary language: `es.json` is the master dictionary. */
export type Key = keyof typeof es;

/**
 * Dictionaries. To add a language (e.g. English) create `en.json` with the
 * same keys as `es.json`, add it here and to `LANGS`.
 */
const DICTS: Record<UiLang, Record<Key, string>> = { es, va: va as Record<Key, string> };

export const LANGS: { id: UiLang; label: string; bcp47: string }[] = [
  { id: 'es', label: 'Castellano', bcp47: 'es-ES' },
  { id: 'va', label: 'Valencià', bcp47: 'ca-ES-valencia' },
];

let current: UiLang = 'es';

export function setLang(lang: UiLang): void {
  current = lang;
  document.documentElement.lang = LANGS.find((l) => l.id === lang)?.bcp47 ?? 'es';
}

export function getLang(): UiLang {
  return current;
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  let text = DICTS[current][key] ?? DICTS.es[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  }
  return text;
}

/** Who explains the cashier strategy: chosen at random to avoid gender stereotypes. */
export type Cashier = 'f' | 'm';

export function randomCashier(): Cashier {
  return Math.random() < 0.5 ? 'f' : 'm';
}

/** Translate a sentence that mentions the cashier (`key` feminine, `key.m` masculine). */
export function tc(key: Key, cashier: Cashier, vars?: Record<string, string | number>): string {
  const variant = `${key}.m` as Key;
  return t(cashier === 'm' && variant in DICTS.es ? variant : key, vars);
}

/** Pick the current language from a bilingual data object. */
export function L(text: L10n | undefined): string {
  if (!text) return '';
  return text[current] ?? text.es;
}
