import type { AchievementWiki } from '@shared/types.ts';
import { TextBlocks } from '@/components/common/TextBlocks/TextBlocks.tsx';
import { useT } from '@/i18n.tsx';

export interface AchievementCardTipsProps {
  tips: AchievementWiki['tips'];
}

/** What the wiki pages say about the achievement, one block per page it was taken from. */
export function AchievementCardTips({ tips }: AchievementCardTipsProps) {
  const t = useT();
  return (
    <section aria-labelledby="ach-card-tips">
      <h3 id="ach-card-tips">{t('card.tips')}</h3>
      {tips.length === 0 ? (
        <p className="muted">{t('card.noTips')}</p>
      ) : (
        tips.map((source) => (
          <section key={source.page} className="tip-source">
            <h4>
              <a href={source.url} target="_blank" rel="noreferrer" lang="en">
                {source.page}
              </a>
            </h4>
            {source.sections.map((section, index) => (
              <div key={index} className="tip-section">
                <h5 lang="en">{section.title}</h5>
                <TextBlocks blocks={section.blocks} headingLevel={6} />
                {section.truncated && (
                  <p>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {t('card.moreOnWiki')}
                    </a>
                  </p>
                )}
              </div>
            ))}
          </section>
        ))
      )}
    </section>
  );
}
