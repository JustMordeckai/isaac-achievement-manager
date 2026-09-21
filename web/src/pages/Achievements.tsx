import { useMemo, type ReactNode } from 'react';
import type { AchievementEntry } from '@shared/types.ts';
import { AchievementFilters } from '@/components/achievements/AchievementFilters/AchievementFilters.tsx';
import { AchievementList } from '@/components/achievements/AchievementList/AchievementList.tsx';
import { filterAchievements, type AchievementFilter } from '@/lib/filter.ts';

export interface AchievementsProps {
  achievements: AchievementEntry[];
  filter: AchievementFilter;
  onFilterChange(filter: AchievementFilter): void;
  /** Achievements that differ between the save and Steam. */
  desyncIds: ReadonlySet<number>;
  /** Achievement whose card is open. */
  selectedId: number | null;
  onOpen(id: number): void;
  /** Card shown next to the list. */
  panel: ReactNode;
}

/** Achievements screen: the filters, the list they leave, and the open card beside it. */
export function Achievements({
  achievements,
  filter,
  onFilterChange,
  desyncIds,
  selectedId,
  onOpen,
  panel,
}: AchievementsProps) {
  const visible = useMemo(() => filterAchievements(achievements, filter, desyncIds), [achievements, filter, desyncIds]);
  return (
    <div className={panel ? 'achievements achievements--with-card' : 'achievements'}>
      <div className="achievements__list">
        <AchievementFilters achievements={achievements} filter={filter} onFilterChange={onFilterChange} />
        <AchievementList visible={visible} resetKey={filter} selectedId={selectedId} onOpen={onOpen} />
      </div>
      {panel}
    </div>
  );
}
