import { useEffect, useState } from 'react';
import type { AchievementCard } from '@shared/types.ts';
import { api, type ProfileQuery } from '@/lib/api.ts';
import { messageOf } from '@/lib/errors.ts';

export type AchievementCardState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; card: AchievementCard };

/**
 * Detailed card of one achievement. Reading the same card again (a refresh, a sync) keeps what is
 * on screen; moving to another achievement starts from an empty card.
 */
export function useAchievementCard(id: number, query: ProfileQuery, reloadKey: number): AchievementCardState {
  const [state, setState] = useState<AchievementCardState>({ status: 'loading' });
  const { profile, slot } = query;

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => (prev.status === 'ready' && prev.card.achievement.id === id ? prev : { status: 'loading' }));
    api.achievement(id, { profile, slot }, controller.signal).then(
      (card) => setState({ status: 'ready', card }),
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: messageOf(error) });
      },
    );
    return () => controller.abort();
  }, [id, profile, slot, reloadKey]);

  return state;
}
