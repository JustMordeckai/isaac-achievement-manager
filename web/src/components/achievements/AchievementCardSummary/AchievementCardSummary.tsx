import type { AchievementCard } from '@shared/types.ts';
import { AchievementIcon } from '@/components/achievements/AchievementIcon/AchievementIcon.tsx';
import { useLocale, useT } from '@/i18n.tsx';
import { DLC_LABELS, formatDate } from '@/lib/labels.ts';

export interface AchievementCardSummaryProps {
  achievement: AchievementCard['achievement'];
}

/** Head of the card: icon, DLC, whether it is earned and since when. */
export function AchievementCardSummary({ achievement }: AchievementCardSummaryProps) {
  const locale = useLocale();
  const t = useT();
  return (
    <>
      <div className="ach-card__summary">
        <AchievementIcon file={achievement.icon} alt="" />
        <div>
          <p className="ach-card__meta">
            <span className="ach__id">#{achievement.id}</span>
            <span className="tag">{DLC_LABELS[achievement.dlc]}</span>
            {achievement.hidden && <span className="tag">{t('achievements.secret')}</span>}
          </p>
          <p className="ach-card__state">
            {achievement.unlocked ? (
              achievement.unlockedAt ? (
                <>
                  {t('achievements.unlockedOn')}{' '}
                  <time dateTime={achievement.unlockedAt}>{formatDate(locale, achievement.unlockedAt)}</time>
                </>
              ) : (
                t('achievements.unlocked')
              )
            ) : (
              <span className="ach__state--missing">{t('achievements.missing')}</span>
            )}
          </p>
        </div>
      </div>
      <p lang="en">{achievement.description}</p>
    </>
  );
}
