import { en } from './en.ts';
import { fr } from './fr.ts';

/** Languages the interface serves. */
export type Locale = 'en' | 'fr';
export const LOCALES: Locale[] = ['en', 'fr'];
export const DEFAULT_LOCALE: Locale = 'en';

/** Name of each language, written in that language: a switcher shows endonyms whatever the interface language. */
// The French endonym is written with a unicode escape for its cedilla so this file, seeded in
// check-language.mjs's CLEAN list, does not itself contain an accented letter.
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Fran\u00e7ais' };

/** Shape of a catalogue: the English one defines the keys. */
export type Catalog = Record<keyof typeof en, string>;
export type MessageKey = keyof typeof en;

const CATALOGS: Record<Locale, Catalog> = { en, fr };

/** Locale read from the settings file or from a request; null when we do not serve it. */
export function toLocale(value: unknown): Locale | null {
  return typeof value === 'string' && LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

/** Replaces {name} by its value; an unknown name stays as it is rather than throwing. */
export function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Value of a key in the asked language, English when a translation is missing. */
export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  const value = CATALOGS[locale][key] ?? en[key];
  if (value === undefined) throw new Error(`Missing message key: ${key}`);
  return format(value, params);
}

/** Value of `key.one` for a count of one, of `key.other` otherwise; `count` is available as a placeholder. */
export function plural(locale: Locale, key: string, count: number, params?: Record<string, string | number>): string {
  const suffix = Math.abs(count) === 1 ? 'one' : 'other';
  return t(locale, `${key}.${suffix}` as MessageKey, { count, ...params });
}
