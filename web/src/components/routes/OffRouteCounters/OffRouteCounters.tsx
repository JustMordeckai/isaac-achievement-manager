import type { CounterTodo } from '@shared/types.ts';
import { ProgressBar } from '@/components/common/ProgressBar/ProgressBar.tsx';
import { AchievementLink } from '@/components/routes/AchievementLink/AchievementLink.tsx';
import { useT } from '@/i18n.tsx';

export interface OffRouteCountersProps {
  counters: CounterTodo[];
  onOpen(id: number): void;
}

/** Achievements counted over several runs, with where the save stands on each. */
export function OffRouteCounters({ counters, onOpen }: OffRouteCountersProps) {
  const t = useT();
  return (
    <details className="card">
      <summary>{t('routes.counters', { count: counters.length })}</summary>
      <ul className="todo-list">
        {counters.map((c) => (
          <li key={c.id} className="todo-list__counter">
            <span>
              <AchievementLink id={c.id} name={c.name} onOpen={onOpen} />
              {t('routes.colonSpace')}
              <span lang="en">{c.condition}</span>
            </span>
            {c.value !== null && (
              <>
                <span className="todo-list__value">
                  {Math.min(c.value, c.total)} / {c.total}
                </span>
                <ProgressBar value={Math.min(c.value, c.total)} max={c.total} />
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
