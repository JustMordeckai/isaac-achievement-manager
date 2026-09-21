import type { AchievementEntry, ProgressSummary } from '@shared/types.ts';
import { api, type ProfileQuery } from '@/lib/api.ts';
import { useProfileResource, type ResourceState } from '@/hooks/useProfileResource.ts';

export interface ProgressData {
  summary: ProgressSummary;
  achievements: AchievementEntry[];
}

export type ProgressState = ResourceState<ProgressData>;

async function readProgress(query: ProfileQuery, signal: AbortSignal): Promise<ProgressData> {
  const [summary, achievements] = await Promise.all([api.progress(query, signal), api.achievements(query, signal)]);
  return { summary, achievements };
}

/** Summary and full list of the profile, read again when the profile, the slot or `reloadKey` change. */
export function useProgress(query: ProfileQuery, reloadKey: number): ProgressState {
  return useProfileResource(query, reloadKey, readProgress);
}
