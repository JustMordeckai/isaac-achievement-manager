import { useEffect, useRef, useState } from 'react';
import type { AchievementCard, AchievementWiki, CardPlan, KbStatus } from '../../../shared/types.ts';
import { achievementQuestion } from '../advisor-question.ts';
import { api, type ProfileQuery } from '../api.ts';
import { useLocale, useT, useTPlural } from '../i18n.tsx';
import {
  characterName,
  DLC_LABELS,
  describeHow,
  endingList,
  formatDate,
  formatMinutes,
  runModeLabel,
  unlockLabel,
} from '../labels.ts';
import { AchievementIcon } from './AchievementIcon.tsx';
import { RequirementNames } from './RequirementNames.tsx';
import { TextBlocks } from './TextBlocks.tsx';

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

type CardState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; card: AchievementCard };

interface PlanSectionProps {
  plan: CardPlan;
  onOpenRoutes(): void;
  onAsk(): void;
}

/** Prerequisites and planned runs of an achievement still missing, and the way to the advisor. */
function PlanSection({ plan, onOpenRoutes, onAsk }: PlanSectionProps) {
  const locale = useLocale();
  const t = useT();
  const tp = useTPlural();
  return (
    <section aria-labelledby="ach-card-plan">
      <h3 id="ach-card-plan">{t('card.howToGetIt')}</h3>
      {plan.requirements.length === 0 && plan.runs.length === 0 && (
        <p className="muted">{t('card.noPlan')}</p>
      )}
      {plan.requirements.length > 0 && (
        <>
          <h4>{t('card.prerequisites')}</h4>
          <ul className="requirement-list">
            {plan.requirements.map((requirement) => (
              <li
                key={requirement.anyOf.map((a) => a.id).join('-')}
                className={requirement.met ? 'requirement requirement--met' : 'requirement requirement--missing'}
              >
                <RequirementNames requirements={[requirement]} />
                {t('card.requirementSuffix', {
                  state: requirement.met ? t('card.requirementMet') : t('card.requirementMissing'),
                })}
              </li>
            ))}
          </ul>
        </>
      )}
      {plan.runs.length > 0 && (
        <>
          <h4>{tp('card.planRun', plan.runs.length)}</h4>
          <ul className="plan-runs">
            {plan.runs.map((run) => (
              <li key={run.id}>
                {t('card.planRunPrefix')}
                <span lang="en">{characterName(run.character)}</span>
                {t('card.planRunMode', { mode: runModeLabel(locale, run.mode) })}
                <span lang="en">{endingList(run.endings)}</span>
                {t('card.planRunMinutes', { minutes: formatMinutes(run.minutes) })}
                {run.preparation && t('card.planRunPreparation')}
                {run.blocked && t('card.planRunBlocked')}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="ach-card__actions">
        {plan.runs.length > 0 && (
          <button type="button" className="btn" onClick={onOpenRoutes}>
            {t('card.seeRoutes')}
          </button>
        )}
        <button type="button" className="btn" onClick={onAsk}>
          {t('card.askAdvisor')}
        </button>
      </div>
    </section>
  );
}

interface WikiSectionProps {
  wiki: AchievementWiki;
  syncedAt: string | null;
  plan: CardPlan | null;
  onOpenRoutes(): void;
  onAsk(): void;
}

function WikiSection({ wiki, syncedAt, plan, onOpenRoutes, onAsk }: WikiSectionProps) {
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

      {plan && <PlanSection plan={plan} onOpenRoutes={onOpenRoutes} onAsk={onAsk} />}

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

      <section aria-labelledby="ach-card-tips">
        <h3 id="ach-card-tips">{t('card.tips')}</h3>
        {wiki.tips.length === 0 ? (
          <p className="muted">{t('card.noTips')}</p>
        ) : (
          wiki.tips.map((source) => (
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

function MissingWiki({ kb, onOpenSettings }: { kb: KbStatus; onOpenSettings(): void }) {
  const t = useT();
  if (kb.state === 'ok') return <p className="muted">{t('card.notOnWiki')}</p>;
  return (
    <div className="banner banner--info">
      <p>{kb.state === 'absent' ? t('card.kbNotDownloaded') : (kb.message ?? t('card.kbUnusable'))}</p>
      <button type="button" className="btn" onClick={onOpenSettings}>
        {t('app.openSettings')}
      </button>
    </div>
  );
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
  const [state, setState] = useState<CardState>({ status: 'loading' });
  const heading = useRef<HTMLHeadingElement>(null);
  const { profile, slot } = query;

  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => (prev.status === 'ready' && prev.card.achievement.id === id ? prev : { status: 'loading' }));
    api.achievement(id, { profile, slot }, controller.signal).then(
      (card) => setState({ status: 'ready', card }),
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      },
    );
    return () => controller.abort();
  }, [id, profile, slot, reloadKey]);

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
          {state.card.wiki ? (
            <WikiSection
              wiki={state.card.wiki}
              syncedAt={state.card.kb.syncedAt}
              plan={achievement.unlocked ? null : state.card.plan}
              onOpenRoutes={onOpenRoutes}
              onAsk={() => onAsk(achievementQuestion(locale, achievement))}
            />
          ) : (
            <MissingWiki kb={state.card.kb} onOpenSettings={onOpenSettings} />
          )}
        </>
      )}
    </aside>
  );
}
