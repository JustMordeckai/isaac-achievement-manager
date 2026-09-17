import type {
  AchievementCard,
  AchievementEntry,
  KbStatus,
  ProgressSummary,
  ResolvedProfile,
  SettingsInfo,
  WikiSyncEvent,
} from '../../shared/types.ts';

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

async function errorOf(res: Response): Promise<ApiRequestError> {
  const body: unknown = await res.json().catch(() => null);
  const message =
    typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `Erreur HTTP ${res.status}`;
  return new ApiRequestError(res.status, message);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw await errorOf(res);
  return (await res.json()) as T;
}

function profileParams({ profile, slot }: ProfileQuery): string {
  const params = new URLSearchParams({ profile });
  if (slot !== null) params.set('slot', String(slot));
  return params.toString();
}

/**
 * Lance la synchro du wiki et transmet chaque ligne du flux NDJSON.
 * Renvoie le dernier événement (`done` ou `error`) ; un refus du serveur (403, 409) lève une ApiRequestError.
 */
async function syncWiki(onEvent: (event: WikiSyncEvent) => void): Promise<WikiSyncEvent> {
  const res = await fetch('/api/wiki/sync', { method: 'POST', headers: { 'X-IAM-Action': 'wiki-sync' } });
  if (!res.ok) throw await errorOf(res);
  if (!res.body) throw new ApiRequestError(res.status, 'Réponse de synchro vide');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let last: WikiSyncEvent | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    // Une ligne peut arriver en plusieurs morceaux : on garde la fin incomplète pour la lecture suivante.
    buffer = done ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      if (line.trim() === '') continue;
      try {
        last = JSON.parse(line) as WikiSyncEvent;
      } catch {
        throw new ApiRequestError(res.status, 'Réponse de synchro illisible');
      }
      onEvent(last);
    }
    if (done) break;
  }
  if (!last || (last.step !== 'done' && last.step !== 'error')) {
    throw new ApiRequestError(res.status, 'Synchro interrompue sans résultat');
  }
  return last;
}

export const api = {
  progress: (query: ProfileQuery, signal?: AbortSignal) =>
    request<ProgressSummary>(`/api/progress?${profileParams(query)}`, { signal }),
  achievements: (query: ProfileQuery, signal?: AbortSignal) =>
    request<AchievementEntry[]>(`/api/achievements?${profileParams(query)}`, { signal }),
  achievement: (id: number, query: ProfileQuery, signal?: AbortSignal) =>
    request<AchievementCard>(`/api/achievement/${id}?${profileParams(query)}`, { signal }),
  wikiStatus: (signal?: AbortSignal) => request<KbStatus>('/api/wiki/status', { signal }),
  settings: (signal?: AbortSignal) => request<SettingsInfo>('/api/settings', { signal }),
  resolveProfile: (input: string) =>
    request<ResolvedProfile>(`/api/profile/resolve?${new URLSearchParams({ input })}`),
  syncWiki,
  shutdown: async (): Promise<void> => {
    await request<{ ok: boolean }>('/api/shutdown', { method: 'POST', headers: { 'X-IAM-Action': 'shutdown' } });
  },
};

export function iconUrl(file: string): string {
  return `/api/icons/${file}`;
}
