import type { KbStatus } from '@shared/types.ts';
import { KbSummary } from '@/components/settings/KbSummary/KbSummary.tsx';
import { SyncProgress } from '@/components/settings/SyncProgress/SyncProgress.tsx';
import { useT } from '@/i18n.tsx';
import type { WikiSyncState } from '@/hooks/useWikiSync.ts';

export interface WikiCardProps {
  kb: KbStatus | null;
  sync: WikiSyncState;
  onSync(): void;
}

/** The wiki base: what it holds today, and the one button that downloads it again. */
export function WikiCard({ kb, sync, onSync }: WikiCardProps) {
  const t = useT();
  const running = sync.kind === 'running' || kb?.running === true;
  return (
    <section className="card" aria-labelledby="kb-title">
      <h2 id="kb-title">{t('settings.wikiTitle')}</h2>
      <KbSummary kb={kb} />
      <p className="hint">{t('settings.syncHint')}</p>
      <button type="button" className="btn btn--primary" onClick={onSync} disabled={running}>
        {running ? t('settings.syncing') : t('settings.sync')}
      </button>
      <SyncProgress sync={sync} />
    </section>
  );
}
