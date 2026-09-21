import type { ProgressSummary } from '@shared/types.ts';
import { AchievementIcon } from '@/components/achievements/AchievementIcon/AchievementIcon.tsx';
import { useLocale, useT } from '@/i18n.tsx';
import { formatDate } from '@/lib/labels.ts';

export interface RecentUnlocksProps {
  recent: ProgressSummary['recent'];
}

/** The last achievements earned, newest first; empty when no source carries a date. */
export function RecentUnlocks({ recent }: RecentUnlocksProps) {
  const locale = useLocale();
  const t = useT();
  return (
    <section className="card" aria-labelledby="recent-title">
      <h2 id="recent-title">{t('dashboard.recent')}</h2>
      {recent.length === 0 ? (
        <p className="muted">{t('dashboard.noUnlockDate')}</p>
      ) : (
        <ol className="recent-list">
          {recent.map((item) => (
            <li key={item.id}>
              <AchievementIcon file={item.icon} alt="" />
              <span className="recent-list__name">{item.name}</span>
              <time dateTime={item.unlockedAt}>{formatDate(locale, item.unlockedAt)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
