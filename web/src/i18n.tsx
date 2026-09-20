import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { DEFAULT_LOCALE, plural, t, toLocale, type Locale, type MessageKey } from '../../shared/i18n/index.ts';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export interface LocaleProviderProps {
  locale: Locale;
  children: ReactNode;
}

/** Publishes the interface language to the component tree and keeps `<html lang>` in sync with it. */
export function LocaleProvider({ locale, children }: LocaleProviderProps) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Current interface language; DEFAULT_LOCALE outside a LocaleProvider (isolated component tests). */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Reads a catalogue key in the current interface language. */
export function useT() {
  const locale = useLocale();
  return (key: MessageKey, params?: Record<string, string | number>) => t(locale, key, params);
}

/** Reads a pluralised catalogue key in the current interface language. */
export function useTPlural() {
  const locale = useLocale();
  return (key: string, count: number, params?: Record<string, string | number>) => plural(locale, key, count, params);
}

/** Guesses the interface language from the browser's preferred languages, French first, English otherwise. */
export function guessLocale(languages: readonly string[]): Locale {
  return languages[0]?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const LOCALE_STORAGE_KEY = 'iam-locale';

/** Locale remembered from a previous visit, or guessed from the browser the very first time. */
export function loadLocale(): Locale {
  try {
    const stored = toLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Storage unavailable: fall through to a browser guess.
  }
  return guessLocale(navigator.languages);
}

/** Remembers the locale for the next visit, so the first paint already uses it. */
export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage unavailable: the locale stays valid for this page only.
  }
}
