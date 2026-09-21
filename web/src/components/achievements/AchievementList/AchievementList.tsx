import { useEffect, useState } from 'react';
import type { AchievementEntry } from '@shared/types.ts';
import { AchievementRow } from '@/components/achievements/AchievementRow/AchievementRow.tsx';
import { useT, useTPlural } from '@/i18n.tsx';
import { useReturnFocus } from './useReturnFocus.ts';

export interface AchievementListProps {
  /** Achievements left by the filter, already sorted. */
  visible: AchievementEntry[];
  /** Bumped by the caller when the filter changes, so the list starts from the top again. */
  resetKey: unknown;
  /** Achievement whose card is open. */
  selectedId: number | null;
  onOpen(id: number): void;
}

const PAGE_SIZE = 100;

/** How many achievements the filter left, and the rows themselves, a page at a time. */
export function AchievementList({ visible, resetKey, selectedId, onOpen }: AchievementListProps) {
  const t = useT();
  const tp = useTPlural();
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [resetKey]);
  useReturnFocus(selectedId);

  return (
    <>
      <p className="result-count" aria-live="polite">
        {tp('achievements.count', visible.length)}
      </p>

      {visible.length === 0 ? (
        <p className="placeholder">{t('achievements.noMatch')}</p>
      ) : (
        <ul className="ach-list" aria-label={t('achievements.listLabel')}>
          {visible.slice(0, limit).map((a) => (
            <AchievementRow key={a.id} achievement={a} selected={a.id === selectedId} onOpen={() => onOpen(a.id)} />
          ))}
        </ul>
      )}

      {visible.length > limit && (
        <button type="button" className="btn load-more" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
          {tp('achievements.loadMore', visible.length - limit)}
        </button>
      )}
    </>
  );
}
