import type { RoutesResponse } from '@shared/types.ts';
import { api, type ProfileQuery } from '@/lib/api.ts';
import { useProfileResource, type ResourceState } from '@/hooks/useProfileResource.ts';

export type RoutesState = ResourceState<RoutesResponse>;

function readRoutes(query: ProfileQuery, signal: AbortSignal): Promise<RoutesResponse> {
  return api.routes(query, signal);
}

/** Route plan of the profile, read again when the profile, the slot or `reloadKey` change. */
export function useRoutes(query: ProfileQuery, reloadKey: number): RoutesState {
  return useProfileResource(query, reloadKey, readRoutes);
}
