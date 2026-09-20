import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { DEFAULT_LOCALE, plural, t, type Locale, type MessageKey } from '../../shared/i18n/index.ts';

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
