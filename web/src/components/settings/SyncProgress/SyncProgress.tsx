import { ProgressBar } from '@/components/common/ProgressBar/ProgressBar.tsx';
import { SyncReport } from '@/components/settings/SyncReport/SyncReport.tsx';
import { useT } from '@/i18n.tsx';
import type { WikiSyncState } from '@/hooks/useWikiSync.ts';

export interface SyncProgressProps {
  sync: WikiSyncState;
}

/** Where the wiki sync stands: nothing, a running step, the report, or the failure. */
export function SyncProgress({ sync }: SyncProgressProps) {
  const t = useT();
  if (sync.kind === 'running') {
    const event = sync.event;
    return (
      <div className="sync-progress">
        <p aria-live="polite">{event?.message ?? t('settings.connectingToWiki')}</p>
        {event?.step === 'pages' && event.total > 0 && (
          <ProgressBar value={event.done} max={event.total} label={t('settings.pagesDownloaded')} />
        )}
      </div>
    );
  }
  if (sync.kind === 'done') return <SyncReport report={sync.report} />;
  if (sync.kind === 'failed') {
    return (
      <p className="banner banner--error" role="alert">
        {t('settings.syncFailed', { message: sync.message })}
      </p>
    );
  }
  return null;
}
