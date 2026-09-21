import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@shared/i18n/index.ts';
import { loadLocale, storeLocale } from '@/i18n.tsx';
import type { SettingsState } from '@/hooks/useSettings.ts';

export interface LocaleSetting {
  locale: Locale;
  /** A language picked by the reader; from then on it wins over the one the server serves. */
  choose(locale: Locale): void;
}

/**
 * The first paint already uses the remembered (or browser-guessed) locale, exactly like the theme;
 * once the server answers, its value takes over and is remembered for the next visit, unless the
 * reader already picked a language this session, in which case that pick always wins.
 */
export function useLocaleSetting(settings: SettingsState): LocaleSetting {
  const [locale, setLocale] = useState<Locale>(loadLocale);
  const chosen = useRef(false);

  useEffect(() => {
    if (settings.status !== 'ready' || chosen.current) return;
    setLocale(settings.info.locale);
    storeLocale(settings.info.locale);
  }, [settings.status]);

  const choose = useCallback((next: Locale) => {
    chosen.current = true;
    setLocale(next);
    storeLocale(next);
  }, []);

  return { locale, choose };
}
