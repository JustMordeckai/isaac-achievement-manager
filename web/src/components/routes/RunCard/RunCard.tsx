import type { PlannedRun } from '@shared/types.ts';
import { runQuestion } from '@/lib/advisor-question.ts';
import { RequirementNames } from '@/components/common/RequirementNames/RequirementNames.tsx';
import { AchievementChips } from '@/components/routes/AchievementChips/AchievementChips.tsx';
import { useLocale, useT, useTPlural } from '@/i18n.tsx';
import { characterName, endingList, formatDecimal, formatMinutes, runModeLabel } from '@/lib/labels.ts';

export interface RunCardProps {
  run: PlannedRun;
  onOpenAchievement(id: number): void;
  /** Opens the advisor with a question about this run. */
  onAsk(question: string): void;
}

/** One planned run: character, endings, achievements earned, prerequisites and the path to unfold. */
export function RunCard({ run, onOpenAchievement, onAsk }: RunCardProps) {
  const locale = useLocale();
  const t = useT();
  const tp = useTPlural();
  const titleId = `run-${run.id}`;
  const count = run.achievements.length;
  const preparation = count === 0 && run.prepares.length > 0;
  return (
    <article className="card run" aria-labelledby={titleId}>
      <header className="run__head">
        <h3 id={titleId}>
          <span lang="en">{characterName(run.character)}</span>
        </h3>
        <span className={`badge run__mode${run.mode === 'normal' ? '' : ' run__mode--strong'}`}>
          {runModeLabel(locale, run.mode)}
        </span>
        <span className="run__time">{t('run.about', { minutes: formatMinutes(run.minutes) })}</span>
      </header>
      <p className="run__endings">
        {t('run.beatPrefix')}
        <span lang="en">{endingList(run.endings)}</span>
      </p>
      {preparation ? (
        <>
          <p className="muted">{t('run.prepRun')}</p>
          <AchievementChips label={t('run.preparedLabel')} list={run.prepares} onOpen={onOpenAchievement} />
        </>
      ) : (
        <>
          <p className="muted">{tp('run.perHour', count, { rate: formatDecimal(locale, run.score) })}</p>
          <AchievementChips label={t('run.earnedLabel')} list={run.achievements} onOpen={onOpenAchievement} />
        </>
      )}
      {run.missing.length > 0 && (
        <p className="run__missing">
          {t('run.unlockFirst')}
          <RequirementNames requirements={run.missing} />
        </p>
      )}
      {run.note && <p className="hint">{run.note}</p>}
      <details className="run__path">
        <summary>{tp('run.path', run.steps.length)}</summary>
        <ol>
          {run.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
      <button
        type="button"
        className="btn btn--ghost run__ask"
        aria-describedby={titleId}
        onClick={() => onAsk(runQuestion(locale, run))}
      >
        {t('run.ask')}
      </button>
    </article>
  );
}
