import { ndjsonLines } from '../../shared/ndjson.ts';
import type {
  AchievementCard,
  AchievementEntry,
  AdvisorEvent,
  AdvisorRequest,
  AdvisorStatus,
  KbStatus,
  OllamaSettings,
  ProgressSummary,
  ResolvedProfile,
  RoutesResponse,
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

/** Transmet chaque ligne d'un flux NDJSON et renvoie la dernière (null si le flux est vide). */
async function readEvents<T>(
  res: Response,
  body: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void,
  unreadable: string,
): Promise<T | null> {
  let last: T | null = null;
  for await (const line of ndjsonLines(body)) {
    try {
      last = JSON.parse(line) as T;
    } catch {
      throw new ApiRequestError(res.status, unreadable);
    }
    onEvent(last);
  }
  return last;
}

/**
 * Lance la synchro du wiki et transmet chaque ligne du flux NDJSON.
 * Renvoie le dernier événement (`done` ou `error`) ; un refus du serveur (403, 409) lève une ApiRequestError.
 */
async function syncWiki(onEvent: (event: WikiSyncEvent) => void): Promise<WikiSyncEvent> {
  const res = await fetch('/api/wiki/sync', { method: 'POST', headers: { 'X-IAM-Action': 'wiki-sync' } });
  if (!res.ok) throw await errorOf(res);
  if (!res.body) throw new ApiRequestError(res.status, 'Réponse de synchro vide');
  const last = await readEvents(res, res.body, onEvent, 'Réponse de synchro illisible');
  if (!last || (last.step !== 'done' && last.step !== 'error')) {
    throw new ApiRequestError(res.status, 'Synchro interrompue sans résultat');
  }
  return last;
}

/**
 * Pose une question au conseiller et transmet chaque ligne du flux NDJSON. Renvoie le dernier événement
 * (`done` ou `error`) ; un refus avant le flux (Ollama injoignable, modèle absent) lève une ApiRequestError.
 */
async function askAdvisor(
  request: AdvisorRequest,
  onEvent: (event: AdvisorEvent) => void,
  signal?: AbortSignal,
): Promise<AdvisorEvent> {
  const res = await fetch('/api/advisor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-IAM-Action': 'advisor' },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok) throw await errorOf(res);
  if (!res.body) throw new ApiRequestError(res.status, 'Réponse du conseiller vide');
  const last = await readEvents(res, res.body, onEvent, 'Réponse du conseiller illisible');
  if (!last || (last.kind !== 'done' && last.kind !== 'error')) {
    throw new ApiRequestError(res.status, 'Réponse du conseiller interrompue');
  }
  return last;
}

export const api = {
  progress: (query: ProfileQuery, signal?: AbortSignal) =>
    request<ProgressSummary>(`/api/progress?${profileParams(query)}`, { signal }),
  achievements: (query: ProfileQuery, signal?: AbortSignal) =>
    request<AchievementEntry[]>(`/api/achievements?${profileParams(query)}`, { signal }),
  routes: (query: ProfileQuery, signal?: AbortSignal) =>
    request<RoutesResponse>(`/api/routes?${profileParams(query)}`, { signal }),
  achievement: (id: number, query: ProfileQuery, signal?: AbortSignal) =>
    request<AchievementCard>(`/api/achievement/${id}?${profileParams(query)}`, { signal }),
  wikiStatus: (signal?: AbortSignal) => request<KbStatus>('/api/wiki/status', { signal }),
  settings: (signal?: AbortSignal) => request<SettingsInfo>('/api/settings', { signal }),
  resolveProfile: (input: string) =>
    request<ResolvedProfile>(`/api/profile/resolve?${new URLSearchParams({ input })}`),
  syncWiki,
  advisorStatus: (signal?: AbortSignal) => request<AdvisorStatus>('/api/advisor/status', { signal }),
  saveAdvisorSettings: (settings: OllamaSettings) =>
    request<AdvisorStatus>('/api/advisor/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-IAM-Action': 'advisor-settings' },
      body: JSON.stringify(settings),
    }),
  askAdvisor,
  shutdown: async (): Promise<void> => {
    await request<{ ok: boolean }>('/api/shutdown', { method: 'POST', headers: { 'X-IAM-Action': 'shutdown' } });
  },
};

export function iconUrl(file: string): string {
  return `/api/icons/${file}`;
}
