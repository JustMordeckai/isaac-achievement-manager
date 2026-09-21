import type { PlannedRun } from '@shared/types.ts';

export interface AchievementChipsProps {
  label: string;
  list: PlannedRun['achievements'];
  onOpen(id: number): void;
}

/** Achievements of a run, as buttons that open their card. */
export function AchievementChips({ label, list, onOpen }: AchievementChipsProps) {
  return (
    <ul className="chips run__achievements" aria-label={label}>
      {list.map((a) => (
        <li key={a.id}>
          <button type="button" className="chip chip--link" onClick={() => onOpen(a.id)}>
            <span lang="en">{a.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
