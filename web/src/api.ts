import type { AchievementState, ProgressSummary, ResolvedProfile } from '../../shared/types.ts';

export class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export interface ProfileQuery {
  /** "me" ou un SteamID64. */
  profile: string;
  slot: number | null;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Erreur HTTP ${res.status}`;
    throw new ApiRequestError(res.status, message);
  }
  return body as T;
}

function profileParams({ profile, slot }: ProfileQuery): string {
  const params = new URLSearchParams({ profile });
  if (slot !== null) params.set('slot', String(slot));
  return params.toString();
}

export const api = {
  progress: (query: ProfileQuery, signal?: AbortSignal) =>
    request<ProgressSummary>(`/api/progress?${profileParams(query)}`, { signal }),
  achievements: (query: ProfileQuery, signal?: AbortSignal) =>
    request<AchievementState[]>(`/api/achievements?${profileParams(query)}`, { signal }),
  resolveProfile: (input: string) =>
    request<ResolvedProfile>(`/api/profile/resolve?${new URLSearchParams({ input })}`),
  shutdown: async (): Promise<void> => {
    await request<{ ok: boolean }>('/api/shutdown', { method: 'POST', headers: { 'X-IAM-Action': 'shutdown' } });
  },
};

export function iconUrl(file: string): string {
  return `/api/icons/${file}`;
}
