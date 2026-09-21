import { DLC_ORDER } from '@shared/dlc.ts';
import type { MiscTodo } from '@shared/types.ts';
import { AchievementLink } from '@/components/routes/AchievementLink/AchievementLink.tsx';
import { useT } from '@/i18n.tsx';
import { DLC_LABELS } from '@/lib/labels.ts';

export interface OffRouteMiscProps {
  misc: MiscTodo[];
  onOpen(id: number): void;
}

/** Everything the plan could not sort anywhere else, grouped by DLC. */
export function OffRouteMisc({ misc, onOpen }: OffRouteMiscProps) {
  const t = useT();
  return (
    <details className="card">
      <summary>{t('routes.misc', { count: misc.length })}</summary>
      {DLC_ORDER.map((dlc) => {
        const items = misc.filter((m) => m.dlc === dlc);
        if (items.length === 0) return null;
        return (
          <div key={dlc}>
            <h3>{DLC_LABELS[dlc]}</h3>
            <ul className="todo-list">
              {items.map((m) => (
                <li key={m.id}>
                  <AchievementLink id={m.id} name={m.name} onOpen={onOpen} />
                  {m.condition && (
                    <>
                      {t('routes.colonSpace')}
                      <span lang="en">{m.condition}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </details>
  );
}
