import type { CardPlan } from '@shared/types.ts';
import { RequirementNames } from '@/components/common/RequirementNames/RequirementNames.tsx';
import { useLocale, useT, useTPlural } from '@/i18n.tsx';
import { characterName, endingList, formatMinutes, runModeLabel } from '@/lib/labels.ts';

export interface AchievementCardPlanProps {
  plan: CardPlan;
  onOpenRoutes(): void;
  onAsk(): void;
}

/** Prerequisites and planned runs of an achievement still missing, and the way to the advisor. */
export function AchievementCardPlan({ plan, onOpenRoutes, onAsk }: AchievementCardPlanProps) {
  const locale = useLocale();
  const t = useT();
  const tp = useTPlural();
  return (
    <section aria-labelledby="ach-card-plan">
      <h3 id="ach-card-plan">{t('card.howToGetIt')}</h3>
      {plan.requirements.length === 0 && plan.runs.length === 0 && <p className="muted">{t('card.noPlan')}</p>}
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
