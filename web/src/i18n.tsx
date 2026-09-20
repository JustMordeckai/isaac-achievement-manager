import { createContext, useContext, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_NAMES,
  LOCALES,
  plural,
  t,
  toLocale,
  type Locale,
  type MessageKey,
} from '../../shared/i18n/index.ts';
import { api } from './api.ts';

interface LocaleContextValue {
  locale: Locale;
  onLocaleChange(locale: Locale): void;
  onLocaleSaved(locale: Locale): void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  onLocaleChange: () => {},
  onLocaleSaved: () => {},
});

export interface LocaleProviderProps {
  locale: Locale;
  /** Called when the reader picks a language through a LanguagePicker; a no-op when left out. */
  onLocaleChange?(locale: Locale): void;
  /**
   * Called once the server has taken the new language, so that whatever it renders (the plan, the
   * cards, the source messages) can be read again. Not called when the save fails: the server then
   * still answers in the language the loaded data is already written in.
   */
  onLocaleSaved?(locale: Locale): void;
  children: ReactNode;
}

/** Publishes the interface language to the component tree and keeps `<html lang>` in sync with it. */
export function LocaleProvider({ locale, onLocaleChange, onLocaleSaved, children }: LocaleProviderProps) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      onLocaleChange: onLocaleChange ?? (() => {}),
      onLocaleSaved: onLocaleSaved ?? (() => {}),
    }),
    [locale, onLocaleChange, onLocaleSaved],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Current interface language; DEFAULT_LOCALE outside a LocaleProvider (isolated component tests). */
export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
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

export interface LanguagePickerProps {
  /** Shows the explanatory hint below the select; used in Settings, left out in the compact header. */
  hint?: boolean;
}

/**
 * The one language switcher in the interface: a labelled select built from LOCALES, the call that
 * applies the pick immediately, the save to the server, and the failure line if that save does not
 * go through. Header.tsx and Settings.tsx both render this instead of duplicating the interaction.
 */
export function LanguagePicker({ hint }: LanguagePickerProps) {
  const { locale, onLocaleChange, onLocaleSaved } = useContext(LocaleContext);
  const [saveFailed, setSaveFailed] = useState(false);

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = toLocale(event.target.value) ?? DEFAULT_LOCALE;
    setSaveFailed(false);
    onLocaleChange(next);
    void api.saveLocale(next).then(
      () => onLocaleSaved(next),
      () => setSaveFailed(true),
    );
  }

  return (
    <>
      <label className="field">
        <span className="visually-hidden">{t(locale, 'app.language')}</span>
        <select value={locale} onChange={handleChange}>
          {LOCALES.map((code) => (
            <option key={code} value={code} lang={code}>
              {LOCALE_NAMES[code]}
            </option>
          ))}
        </select>
      </label>
      {saveFailed && <p role="alert">{t(locale, 'settings.language.saveFailed')}</p>}
      {hint && <p className="hint">{t(locale, 'settings.language.hint')}</p>}
    </>
  );
}
