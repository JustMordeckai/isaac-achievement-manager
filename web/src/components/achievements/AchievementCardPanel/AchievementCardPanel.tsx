import { useEffect, useRef } from 'react';
import { achievementQuestion } from '@/lib/advisor-question.ts';
import type { ProfileQuery } from '@/lib/api.ts';
import { AchievementCardSummary } from '@/components/achievements/AchievementCardSummary/AchievementCardSummary.tsx';
import { AchievementCardWiki } from '@/components/achievements/AchievementCardWiki/AchievementCardWiki.tsx';
import { SettingsBanner } from '@/components/common/SettingsBanner/SettingsBanner.tsx';
import { useLocale, useT } from '@/i18n.tsx';
import { useAchievementCard } from './useAchievementCard.ts';

export interface AchievementCardPanelProps {
  id: number;
  query: ProfileQuery;
  /** Changes after a refresh or a sync: the card is read again. */
  reloadKey: number;
  onClose(): void;
  onOpenSettings(): void;
  onOpenRoutes(): void;
  /** Opens the advisor with a question about this achievement. */
  onAsk(question: string): void;
}

/** Detailed card of an achievement, shown next to the list. */
export function AchievementCardPanel({
  id,
  query,
  reloadKey,
  onClose,
  onOpenSettings,
  onOpenRoutes,
  onAsk,
}: AchievementCardPanelProps) {
  const locale = useLocale();
  const t = useT();
  const state = useAchievementCard(id, query, reloadKey);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const achievement = state.status === 'ready' ? state.card.achievement : null;

  return (
    <aside
      className="card ach-card"
      aria-labelledby="ach-card-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="ach-card__head">
        <h2 id="ach-card-title" ref={heading} tabIndex={-1} lang={achievement ? 'en' : undefined}>
          {achievement ? achievement.name : t('card.title', { id })}
        </h2>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          {t('card.close')}
        </button>
      </div>

      {state.status === 'loading' && <p className="placeholder">{t('card.loading')}</p>}
      {state.status === 'error' && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && achievement && (
        <>
          <AchievementCardSummary achievement={achievement} />
          {state.card.wiki ? (
            <AchievementCardWiki
              wiki={state.card.wiki}
              syncedAt={state.card.kb.syncedAt}
              plan={achievement.unlocked ? null : state.card.plan}
              onOpenRoutes={onOpenRoutes}
              onAsk={() => onAsk(achievementQuestion(locale, achievement))}
            />
          ) : state.card.kb.state === 'ok' ? (
            <p className="muted">{t('card.notOnWiki')}</p>
          ) : (
            <SettingsBanner
              text={state.card.kb.state === 'absent' ? t('card.kbNotDownloaded') : (state.card.kb.message ?? t('card.kbUnusable'))}
              onOpenSettings={onOpenSettings}
            />
          )}
        </>
      )}
    </aside>
  );
}
