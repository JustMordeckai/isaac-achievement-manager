import { useState } from 'react';
import type { CharacterId } from '@shared/characters.ts';
import type { PlannedRun, RoutePlan } from '@shared/types.ts';

/** Runs added to the list on every "show more". */
export const RUNS_PAGE_SIZE = 20;

export interface RunFilter {
  /** Characters the plan has at least one run for. */
  present: ReadonlySet<CharacterId>;
  character: CharacterId | 'all';
  setCharacter(character: CharacterId | 'all'): void;
  withLocked: boolean;
  setWithLocked(withLocked: boolean): void;
  /** Runs left once the filter is applied. */
  runs: PlannedRun[];
  /** Runs playable right now, whatever the filter says. */
  playable: number;
  shown: number;
  showMore(): void;
}

/** Which runs of the plan are on screen: character, locked ones, and how far down the list. */
export function useRunFilter(plan: RoutePlan): RunFilter {
  const [character, selectCharacter] = useState<CharacterId | 'all'>('all');
  const [withLocked, showLocked] = useState(false);
  const [shown, setShown] = useState(RUNS_PAGE_SIZE);

  const present = new Set(plan.runs.map((r) => r.character));
  // After a refresh, a character no longer in the plan filters nothing: back to "All".
  const selected = character !== 'all' && present.has(character) ? character : 'all';

  return {
    present,
    character: selected,
    setCharacter: (next) => {
      selectCharacter(next);
      setShown(RUNS_PAGE_SIZE);
    },
    withLocked,
    setWithLocked: (next) => {
      showLocked(next);
      setShown(RUNS_PAGE_SIZE);
    },
    runs: plan.runs.filter(
      (r) => (selected === 'all' || r.character === selected) && (withLocked || r.missing.length === 0),
    ),
    playable: plan.runs.filter((r) => r.missing.length === 0).length,
    shown,
    showMore: () => setShown((n) => n + RUNS_PAGE_SIZE),
  };
}
