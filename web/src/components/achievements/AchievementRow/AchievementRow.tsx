import type { AchievementEntry } from '@shared/types.ts';
import { AchievementIcon } from '@/components/achievements/AchievementIcon/AchievementIcon.tsx';
import { useLocale, useT } from '@/i18n.tsx';
import { DLC_LABELS, formatDate, howLabel } from '@/lib/labels.ts';

export interface AchievementRowProps {
  achievement: AchievementEntry;
  selected: boolean;
  onOpen(): void;
}

/** One line of the list; its name is the button that opens the card. */
export function AchievementRow({ achievement: a, selected, onOpen }: AchievementRowProps) {
  const locale = useLocale();
  const t = useT();
  return (
    <li className={`ach ${a.unlocked ? 'ach--unlocked' : 'ach--locked'}${selected ? ' ach--selected' : ''}`}>
      <AchievementIcon file={a.icon} alt="" />
      <div className="ach__body">
        <p className="ach__title">
          <span className="ach__id">#{a.id}</span>{' '}
          <button
            type="button"
            id={`ach-${a.id}`}
            className="ach__name"
            lang="en"
            aria-current={selected ? 'true' : undefined}
            onClick={onOpen}
          >
            {a.name}
          </button>
          {a.hidden && <span className="tag">{t('achievements.secret')}</span>}
        </p>
        <p className="ach__desc" lang="en">
          {a.description}
        </p>
      </div>
      <div className="ach__meta">
        <span className="tag tag--dlc">{DLC_LABELS[a.dlc]}</span>
        {a.how && a.how !== 'misc' && <span className="tag">{howLabel(locale, a.how)}</span>}
        {a.unlocked ? (
          a.unlockedAt ? (
            <span className="ach__state">
              {t('achievements.unlockedOn')} <time dateTime={a.unlockedAt}>{formatDate(locale, a.unlockedAt)}</time>
            </span>
          ) : (
            <span className="ach__state">{t('achievements.unlocked')}</span>
          )
        ) : (
          <span className="ach__state ach__state--missing">{t('achievements.missing')}</span>
        )}
        {a.inSave === true && !a.unlocked && <span className="tag tag--warn">{t('achievements.inSave')}</span>}
        {a.inSave === false && a.unlocked && <span className="tag tag--warn">{t('achievements.notInSave')}</span>}
      </div>
    </li>
  );
}
