import { useCallback, useState } from 'react';
import { AppShell } from './AppShell.tsx';
import { LocaleProvider } from '@/i18n.tsx';
import { useLocaleSetting } from '@/hooks/useLocaleSetting.ts';
import { useSettings } from '@/hooks/useSettings.ts';

/**
 * The language sits above everything else: the settings it comes from are read here, and the whole
 * interface is rendered inside the provider so every screen speaks the language the reader picked.
 */
export function App() {
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  const settings = useSettings();
  const { locale, choose } = useLocaleSetting(settings);

  // The interface switches at once, but the plan, the cards and the source messages are written by
  // the server: they are read again as soon as the server has taken the new language.
  return (
    <LocaleProvider locale={locale} onLocaleChange={choose} onLocaleSaved={reload}>
      <AppShell settings={settings} reloadKey={reloadKey} onReload={reload} />
    </LocaleProvider>
  );
}
