import { useEffect, useRef, useState } from 'react';
import type { RoutesResponse } from '../../shared/types.ts';
import { api, type ProfileQuery } from './api.ts';

export type RoutesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: RoutesResponse; refreshing: boolean };

/** Route plan of the profile, read again when the profile, the slot or `reloadKey` change. */
export function useRoutes(query: ProfileQuery, reloadKey: number): RoutesState {
  const [state, setState] = useState<RoutesState>({ status: 'loading' });
  const lastQuery = useRef<string | null>(null);
  const { profile, slot } = query;

  useEffect(() => {
    const key = `${profile}|${slot ?? ''}`;
    const sameQuery = lastQuery.current === key;
    lastQuery.current = key;
    setState((prev) => (sameQuery && prev.status === 'ready' ? { ...prev, refreshing: true } : { status: 'loading' }));
    const controller = new AbortController();
    api.routes({ profile, slot }, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data, refreshing: false });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      },
    );
    return () => controller.abort();
  }, [profile, slot, reloadKey]);

  return state;
}
