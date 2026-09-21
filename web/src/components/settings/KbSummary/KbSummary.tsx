import type { KbStatus } from '@shared/types.ts';
import { useLocale, useT } from '@/i18n.tsx';
import { formatDate } from '@/lib/labels.ts';

export interface KbSummaryProps {
  kb: KbStatus | null;
}

/** State of the wiki base in one or two lines: synced when, or why it cannot be used. */
export function KbSummary({ kb }: KbSummaryProps) {
  const locale = useLocale();
  const t = useT();
  if (!kb) return <p className="placeholder">{t('settings.kbLoading')}</p>;
  if (kb.state === 'ok') {
    return (
      <>
        <p>{t('settings.kbSyncedOn', { date: kb.syncedAt ? formatDate(locale, kb.syncedAt) : t('settings.kbUnknownDate') })}</p>
        {kb.message && <p className="banner banner--warn">{kb.message}</p>}
      </>
    );
  }
  if (kb.state === 'absent') {
    return (
      <>
        <p>{t('settings.kbAbsent')}</p>
        {kb.message && <p className="banner banner--warn">{kb.message}</p>}
      </>
    );
  }
  return <p className="banner banner--error">{kb.message ?? t('settings.kbUnusable')}</p>;
}
