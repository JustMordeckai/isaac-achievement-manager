import { CHARACTERS, type CharacterId } from '@shared/characters.ts';
import type { RoutePlan } from '@shared/types.ts';
import { RunCard } from '@/components/routes/RunCard/RunCard.tsx';
import { useT, useTPlural } from '@/i18n.tsx';
import { RUNS_PAGE_SIZE, useRunFilter } from './useRunFilter.ts';

export interface RunListProps {
  plan: RoutePlan;
  onOpen(id: number): void;
  onAsk(question: string): void;
}

/** The suggested runs, filtered by character and by whether their prerequisites are met. */
export function RunList({ plan, onOpen, onAsk }: RunListProps) {
  const t = useT();
  const tp = useTPlural();
  const filter = useRunFilter(plan);
  const { runs, shown } = filter;
  const more = Math.min(RUNS_PAGE_SIZE, runs.length - shown);

  return (
    <section aria-labelledby="runs-title">
      <div className="card routes-head">
        <h2 id="runs-title">{t('routes.title')}</h2>
        <p className="muted">{tp('routes.playable', filter.playable, { total: plan.runs.length })}</p>
        <form className="filters" onSubmit={(e) => e.preventDefault()}>
          <label className="field">
            <span>{t('routes.character')}</span>
            <select value={filter.character} onChange={(e) => filter.setCharacter(e.target.value as CharacterId | 'all')}>
              <option value="all">{t('routes.allCharacters')}</option>
              {CHARACTERS.filter((c) => filter.present.has(c.id)).map((c) => (
                <option key={c.id} value={c.id} lang="en">
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={filter.withLocked} onChange={(e) => filter.setWithLocked(e.target.checked)} />
            {t('routes.withLocked')}
          </label>
        </form>
      </div>
      {runs.length === 0 ? (
        <p className="placeholder">{plan.runs.length === 0 ? t('routes.noRunAtAll') : t('routes.noRunForChoice')}</p>
      ) : (
        <div className="run-list">
          {runs.slice(0, shown).map((run) => (
            <RunCard key={run.id} run={run} onOpenAchievement={onOpen} onAsk={onAsk} />
          ))}
        </div>
      )}
      {runs.length > shown && (
        <button type="button" className="btn load-more" onClick={filter.showMore}>
          {tp('routes.moreRuns', more)}
        </button>
      )}
    </section>
  );
}
