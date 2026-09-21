import type { KbStatus } from '@shared/types.ts';
import { AdvisorCard } from '@/components/settings/AdvisorCard/AdvisorCard.tsx';
import { AppInfoCard } from '@/components/settings/AppInfoCard/AppInfoCard.tsx';
import { UpdateCard } from '@/components/settings/UpdateCard/UpdateCard.tsx';
import { WikiCard } from '@/components/settings/WikiCard/WikiCard.tsx';
import { LanguagePicker, useT } from '@/i18n.tsx';
import type { AdvisorStatusState } from '@/hooks/useAdvisorStatus.ts';
import type { UpdateHook } from '@/hooks/useUpdate.ts';
import type { SettingsState } from '@/hooks/useSettings.ts';
import type { WikiSyncState } from '@/hooks/useWikiSync.ts';

export interface SettingsProps {
  settings: SettingsState;
  kb: KbStatus | null;
  sync: WikiSyncState;
  onSync(): void;
  advisor: AdvisorStatusState;
  update: UpdateHook;
}

/** Settings screen: one card per thing the reader can change or check. */
export function Settings({ settings, kb, sync, onSync, advisor, update }: SettingsProps) {
  const t = useT();
  return (
    <div className="settings">
      <WikiCard kb={kb} sync={sync} onSync={onSync} />
      <AdvisorCard advisor={advisor} />
      <AppInfoCard settings={settings} />
      <UpdateCard update={update} />
      <section className="card" aria-labelledby="language-title">
        <h2 id="language-title">{t('app.language')}</h2>
        <LanguagePicker hint />
      </section>
    </div>
  );
}
