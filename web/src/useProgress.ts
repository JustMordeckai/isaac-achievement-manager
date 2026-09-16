import { useEffect, useRef, useState } from 'react';
import type { AchievementState, ProgressSummary } from '../../shared/types.ts';
import { api, type ProfileQuery } from './api.ts';

export interface ProgressData {
  summary: ProgressSummary;
  achievements: AchievementState[];
}

export type ProgressState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ProgressData; refreshing: boolean };

export function useProgress(query: ProfileQuery, reloadKey: number): ProgressState {
  const [state, setState] = useState<ProgressState>({ status: 'loading' });
  const lastQuery = useRef<string | null>(null);
  const { profile, slot } = query;

  useEffect(() => {
    const key = `${profile}|${slot ?? ''}`;
    const sameQuery = lastQuery.current === key;
    lastQuery.current = key;
    setState((prev) => (sameQuery && prev.status === 'ready' ? { ...prev, refreshing: true } : { status: 'loading' }));

    const controller = new AbortController();
    const current = { profile, slot };
    Promise.all([api.progress(current, controller.signal), api.achievements(current, controller.signal)])
      .then(([summary, achievements]) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data: { summary, achievements }, refreshing: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => controller.abort();
  }, [profile, slot, reloadKey]);

  return state;
}
