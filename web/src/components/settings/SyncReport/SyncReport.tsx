import type { WikiSyncReport } from '@shared/types.ts';
import { useT } from '@/i18n.tsx';

export interface SyncReportProps {
  report: WikiSyncReport;
}

/** What a finished sync brought back, and what it could not make sense of. */
export function SyncReport({ report }: SyncReportProps) {
  const t = useT();
  const unknown = Object.entries(report.unknownTemplates);
  return (
    <div className="sync-report">
      <p role="status">{t('settings.syncDone')}</p>
      <dl className="info-list">
        <dt>{t('settings.reportAchievements')}</dt>
        <dd>{report.achievements}</dd>
        <dt>{t('settings.reportPages')}</dt>
        <dd>{report.pages}</dd>
        <dt>{t('settings.reportCached')}</dt>
        <dd>
          {report.cachedPages === 0
            ? t('settings.reportCachedNone')
            : t('settings.reportCachedCount', { count: report.cachedPages })}
        </dd>
        <dt>{t('settings.reportUnclassified')}</dt>
        <dd>{t('settings.reportUnclassifiedCount', { conditions: report.miscCount, unlocks: report.otherUnlockCount })}</dd>
      </dl>
      {report.missingPages.length > 0 && (
        <details>
          <summary>{t('settings.reportMissingPages', { count: report.missingPages.length })}</summary>
          <p lang="en">{report.missingPages.join(', ')}</p>
        </details>
      )}
      {unknown.length > 0 && (
        <details>
          <summary>{t('settings.reportUnknownTemplates', { count: unknown.length })}</summary>
          <p lang="en">{unknown.map(([name, count]) => `${name} (${count})`).join(', ')}</p>
        </details>
      )}
    </div>
  );
}
