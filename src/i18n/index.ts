// ============================================================
// i18n — tiny translation layer (no library, keeps the bundle small)
// ============================================================
//   t('key', { name: 'Leo' })     → translated text with {name} filled in
//   t('key', { n: 3 })            → plural keys pick the right form for the
//                                   language (Intl.PluralRules: one/few/many…)
//   useLang()                     → re-render when the language changes
//   getLocale() / isRtl()         → for Intl formatting and right-to-left
//
// Language = saved choice on this device → phone/browser language → English.
// ============================================================

import { useSyncExternalStore } from 'react';
import en, { type Messages, type PluralForms } from './en';
import de from './de';
import fr from './fr';
import es from './es';
import it from './it';
import nl from './nl';
import pt from './pt';
import tr from './tr';
import ar from './ar';

export type Lang = 'en' | 'de' | 'fr' | 'es' | 'it' | 'nl' | 'pt' | 'tr' | 'ar';
export type MessageKey = keyof Messages;

/** Every language, shown in its own name */
export const LANGUAGES: { code: Lang; name: string; locale: string; rtl?: boolean }[] = [
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
  { code: 'fr', name: 'Français', locale: 'fr-FR' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'it', name: 'Italiano', locale: 'it-IT' },
  { code: 'nl', name: 'Nederlands', locale: 'nl-NL' },
  { code: 'pt', name: 'Português', locale: 'pt-PT' },
  { code: 'tr', name: 'Türkçe', locale: 'tr-TR' },
  // Latin digits keep times like 14:30 easy to read
  { code: 'ar', name: 'العربية', locale: 'ar-u-nu-latn', rtl: true },
];

const DICTS: Record<Lang, Messages> = { en, de, fr, es, it, nl, pt, tr, ar };
const STORAGE_KEY = 'bf_lang';

function isLang(x: string): x is Lang {
  return x in DICTS;
}

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isLang(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  const wanted = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const l of wanted) {
    const base = (l || '').toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

let lang: Lang = detect();
const listeners = new Set<() => void>();

const meta = () => LANGUAGES.find((l) => l.code === lang)!;

export function getLang(): Lang {
  return lang;
}

/** BCP-47 locale for Intl (dates, numbers, plurals) */
export function getLocale(): string {
  return meta().locale;
}

export function isRtl(): boolean {
  return !!meta().rtl;
}

/** Put lang/dir on <html>; load an Arabic font only when Arabic is active */
function applyToDocument(): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.lang = lang;
  html.dir = isRtl() ? 'rtl' : 'ltr';
  if (lang === 'ar' && !document.getElementById('font-ar')) {
    const link = document.createElement('link');
    link.id = 'font-ar';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }
}
applyToDocument();

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage blocked — choice lasts for this visit */
  }
  applyToDocument();
  listeners.forEach((l) => l());
}

/** React hook: the active language (re-renders on change) */
export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => lang
  );
}

const pluralCache = new Map<string, Intl.PluralRules>();
function plural(language: Lang, n: number): Intl.LDMLPluralRule {
  let rules = pluralCache.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(LANGUAGES.find((l) => l.code === language)!.locale);
    pluralCache.set(language, rules);
  }
  return rules.select(n);
}

export type Vars = Record<string, string | number>;

/** Translate in a given language (used to store English copies in the database) */
export function tIn(language: Lang, key: MessageKey, vars?: Vars): string {
  const entry: string | PluralForms = DICTS[language][key] ?? en[key];
  let text: string;
  if (typeof entry === 'string') text = entry;
  else {
    const n = Number(vars?.n ?? 0);
    text = entry[plural(language, n)] ?? entry.other;
  }
  if (!vars) return text;
  // In right-to-left languages each inserted value is wrapped in Unicode isolates (FSI … PDI),
  // so a Latin name like "Kids Cut (under 12)" keeps its own reading order inside Arabic text.
  const isolate = LANGUAGES.find((l) => l.code === language)?.rtl;
  return text.replace(/\{(\w+)\}/g, (m, k: string) =>
    vars[k] != null ? (isolate ? `\u2068${vars[k]}\u2069` : String(vars[k])) : m
  );
}

/** Translate in the active language */
export function t(key: MessageKey, vars?: Vars): string {
  return tIn(lang, key, vars);
}
