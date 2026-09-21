import type { ProgressSummary } from '@shared/types.ts';
import { ProgressBar } from '@/components/common/ProgressBar/ProgressBar.tsx';
import { useLocale, useT, useTPlural } from '@/i18n.tsx';
import { percent } from '@/lib/labels.ts';
import type { FilterPatch } from '@/lib/filter.ts';

export interface ProgressHeroProps {
  summary: ProgressSummary;
  onShowAchievements(patch: FilterPatch): void;
}

/** Where the profile stands overall, and the one click to the achievements still missing. */
export function ProgressHero({ summary, onShowAchievements }: ProgressHeroProps) {
  const locale = useLocale();
  const t = useT();
  const tp = useTPlural();
  const missing = summary.total - summary.unlocked;
  return (
    <section className="card hero" aria-labelledby="progress-title">
      <h2 id="progress-title">{t('dashboard.progress')}</h2>
      <p className="hero__count">
        <strong>{summary.unlocked}</strong> / {summary.total} {t('dashboard.achievements')}
      </p>
      <ProgressBar value={summary.unlocked} max={summary.total} label={t('dashboard.progressBarLabel')} />
      <p className="hero__meta">
        {tp('dashboard.percentMissing', missing, { percent: percent(locale, summary.unlocked, summary.total) })}
      </p>
      {missing > 0 && (
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onShowAchievements({ status: 'missing', dlc: 'all', onlyDesync: false })}
        >
          {tp('dashboard.seeMissing', missing)}
        </button>
      )}
    </section>
  );
}
