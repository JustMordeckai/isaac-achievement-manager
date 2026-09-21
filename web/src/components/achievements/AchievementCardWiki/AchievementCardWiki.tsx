import type { AchievementWiki, CardPlan } from '@shared/types.ts';
import { AchievementCardPlan } from '@/components/achievements/AchievementCardPlan/AchievementCardPlan.tsx';
import { AchievementCardTips } from '@/components/achievements/AchievementCardTips/AchievementCardTips.tsx';
import { TextBlocks } from '@/components/common/TextBlocks/TextBlocks.tsx';
import { useLocale, useT } from '@/i18n.tsx';
import { describeHow, formatDate, unlockLabel } from '@/lib/labels.ts';

export interface AchievementCardWikiProps {
  wiki: AchievementWiki;
  syncedAt: string | null;
  /** Plan of an achievement still missing; null once it is earned. */
  plan: CardPlan | null;
  onOpenRoutes(): void;
  onAsk(): void;
}

/** Everything the wiki base holds on the achievement: condition, plan, unlock and tips. */
export function AchievementCardWiki({ wiki, syncedAt, plan, onOpenRoutes, onAsk }: AchievementCardWikiProps) {
  const locale = useLocale();
  const t = useT();
  const how = describeHow(locale, wiki.how);
  const page = wiki.unlockPage;
  return (
    <>
      <section aria-labelledby="ach-card-condition">
        <h3 id="ach-card-condition">{t('card.condition')}</h3>
        <p lang="en">{wiki.condition}</p>
        {how && <p className="muted">{how}</p>}
      </section>

      {plan && <AchievementCardPlan plan={plan} onOpenRoutes={onOpenRoutes} onAsk={onAsk} />}

      <section aria-labelledby="ach-card-unlocks">
        <h3 id="ach-card-unlocks">{t('card.unlocks')}</h3>
        <p>
          {t('card.unlockPrefix', { kind: unlockLabel(locale, wiki.unlocks.kind) })}
          <span lang="en">{wiki.unlocks.name}</span>
        </p>
        {page && (
          <>
            {page.effect && (
              <p lang="en" className="ach-card__effect">
                {page.effect}
              </p>
            )}
            {page.quality && <p className="muted">{t('card.quality', { quality: page.quality })}</p>}
            <TextBlocks blocks={page.intro} headingLevel={4} />
            <p>
              <a href={page.url} target="_blank" rel="noreferrer">
                {t('card.wikiPagePrefix')}
                <span lang="en">{page.title}</span>
                {t('card.wikiPageSuffix')}
              </a>
            </p>
          </>
        )}
      </section>

      <AchievementCardTips tips={wiki.tips} />

      <p className="ach-card__source">
        {t('card.sourcePrefix')}
        <a href={wiki.sourceUrl} target="_blank" rel="noreferrer">
          {t('card.sourceWiki')}
        </a>{' '}
        {t('card.sourceLicence')}
        {syncedAt && t('card.syncedOn', { date: formatDate(locale, syncedAt) })}.
      </p>
    </>
  );
}
