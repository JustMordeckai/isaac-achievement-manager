import { useMemo } from 'react';
import type { ProgressSummary } from '@shared/types.ts';

const NONE: ReadonlySet<number> = new Set();

/** Achievements the save file and Steam disagree on, as a set the list can test in one step. */
export function useDesyncIds(summary: ProgressSummary | null): ReadonlySet<number> {
  return useMemo(
    () =>
      summary
        ? new Set(summary.desyncs.filter((d) => d.kind === 'saveOnly' || d.kind === 'steamOnly').map((d) => d.id))
        : NONE,
    [summary],
  );
}
