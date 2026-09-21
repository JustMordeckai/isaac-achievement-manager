import { CharacterGrid } from '@/components/dashboard/CharacterGrid/CharacterGrid.tsx';
import { RunCard } from '@/components/routes/RunCard/RunCard.tsx';
import { useT } from '@/i18n.tsx';
import type { RoutesState } from '@/hooks/useRoutes.ts';

export interface BestRunsProps {
  routes: RoutesState;
  onShowRoutes(): void;
  onOpenAchievement(id: number): void;
  onAsk(question: string): void;
}

const BEST_RUNS = 3;

/** Best playable runs and the note of the characters; nothing without a wiki base (the banner already says so). */
export function BestRuns({ routes, onShowRoutes, onOpenAchievement, onAsk }: BestRunsProps) {
  const t = useT();
  if (routes.status === 'loading') {
    return (
      <section className="card wide" aria-labelledby="best-runs-title">
        <h2 id="best-runs-title">{t('dashboard.bestRuns')}</h2>
        <p className="placeholder">{t('dashboard.computingRoutes')}</p>
      </section>
    );
  }
  if (routes.status === 'error') {
    return (
      <p className="banner banner--error wide" role="alert">
        {t('dashboard.routesFailed', { message: routes.message })}
      </p>
    );
  }
  const plan = routes.data.plan;
  if (!plan) return null;
  const best = plan.runs.filter((r) => r.missing.length === 0).slice(0, BEST_RUNS);
  return (
    <>
      <section className="card wide" aria-labelledby="best-runs-title">
        <h2 id="best-runs-title">{t('dashboard.bestRuns')}</h2>
        {best.length === 0 ? (
          <p className="muted">{plan.runs.length === 0 ? t('dashboard.noRun') : t('dashboard.noPlayableRun')}</p>
        ) : (
          <div className="run-list run-list--compact">
            {best.map((run) => (
              <RunCard key={run.id} run={run} onOpenAchievement={onOpenAchievement} onAsk={onAsk} />
            ))}
          </div>
        )}
        <button type="button" className="btn" onClick={onShowRoutes}>
          {t('dashboard.seeAllRoutes')}
        </button>
      </section>
      <section className="card wide" aria-labelledby="marks-title">
        <h2 id="marks-title">{t('dashboard.marksTitle')}</h2>
        <CharacterGrid characters={plan.characters} source={plan.marksSource} />
      </section>
    </>
  );
}
