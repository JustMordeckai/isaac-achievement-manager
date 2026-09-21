import { useEffect, useRef, useState } from 'react';
import type { ProfileQuery } from '@/lib/api.ts';
import { messageOf } from '@/lib/errors.ts';

export type ResourceState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T; refreshing: boolean };

/**
 * Anything the server computes for one profile. A refresh of the same profile keeps what is on
 * screen and only raises `refreshing`; a change of profile or of slot starts from an empty screen,
 * because the old numbers would belong to somebody else.
 */
export function useProfileResource<T>(
  query: ProfileQuery,
  reloadKey: number,
  read: (query: ProfileQuery, signal: AbortSignal) => Promise<T>,
): ResourceState<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' });
  const lastQuery = useRef<string | null>(null);
  // The reader is called from an effect that must not restart when the caller passes a new closure.
  const latestRead = useRef(read);
  useEffect(() => {
    latestRead.current = read;
  });
  const { profile, slot } = query;

  useEffect(() => {
    const key = `${profile}|${slot ?? ''}`;
    const sameQuery = lastQuery.current === key;
    lastQuery.current = key;
    setState((prev) => (sameQuery && prev.status === 'ready' ? { ...prev, refreshing: true } : { status: 'loading' }));

    const controller = new AbortController();
    latestRead.current({ profile, slot }, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data, refreshing: false });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: messageOf(error) });
      },
    );
    return () => controller.abort();
  }, [profile, slot, reloadKey]);

  return state;
}
