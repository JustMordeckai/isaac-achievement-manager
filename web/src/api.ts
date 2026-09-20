import { t, type Locale } from '../../shared/i18n/index.ts';
import { ndjsonLines } from '../../shared/ndjson.ts';
import type {
  AchievementCard,
  AchievementEntry,
  AdvisorEvent,
  AdvisorRequest,
  AdvisorSetupEvent,
  AdvisorSetupState,
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
  /** "me" or a SteamID64. */
  profile: string;
  slot: number | null;
}

async function errorOf(res: Response): Promise<ApiRequestError> {
  const body: unknown = await res.json().catch(() => null);
  const message =
    typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `HTTP ${res.status}`;
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

/** Passes on every line of an NDJSON stream and returns the last one (null when the stream is empty). */
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
 * Starts the wiki sync and passes on every line of the NDJSON stream.
 * Returns the last event (`done` or `error`); a refusal from the server (403, 409) throws an ApiRequestError.
 */
async function syncWiki(locale: Locale, onEvent: (event: WikiSyncEvent) => void): Promise<WikiSyncEvent> {
  const res = await fetch('/api/wiki/sync', { method: 'POST', headers: { 'X-IAM-Action': 'wiki-sync' } });
  if (!res.ok) throw await errorOf(res);
  if (!res.body) throw new ApiRequestError(res.status, t(locale, 'wiki.syncEmptyReply'));
  const last = await readEvents(res, res.body, onEvent, t(locale, 'wiki.syncUnreadableReply'));
  if (!last || (last.step !== 'done' && last.step !== 'error')) {
    throw new ApiRequestError(res.status, t(locale, 'wiki.syncNoResult'));
  }
  return last;
}

/** Runs one setup job (install or download) and passes on every line of its NDJSON stream. */
async function runSetup(
  url: string,
  action: string,
  body: string | undefined,
  locale: Locale,
  onEvent: (event: AdvisorSetupEvent) => void,
): Promise<AdvisorSetupEvent> {
  const headers: Record<string, string> = { 'X-IAM-Action': action };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method: 'POST', headers, body });
  if (!res.ok) throw await errorOf(res);
  if (!res.body) throw new ApiRequestError(res.status, t(locale, 'wiki.syncEmptyReply'));
  const last = await readEvents(res, res.body, onEvent, t(locale, 'wiki.syncUnreadableReply'));
  if (!last || (last.step !== 'done' && last.step !== 'error')) {
    throw new ApiRequestError(res.status, t(locale, 'wiki.syncNoResult'));
  }
  return last;
}

/**
 * Asks the advisor a question and passes on every line of the NDJSON stream. Returns the last event
 * (`done` or `error`); a refusal before the stream (Ollama unreachable, model missing) throws an ApiRequestError.
 */
async function askAdvisor(
  request: AdvisorRequest,
  locale: Locale,
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
  if (!res.body) throw new ApiRequestError(res.status, t(locale, 'advisor.emptyReply'));
  const last = await readEvents(res, res.body, onEvent, t(locale, 'advisor.unreadableReply'));
  if (!last || (last.kind !== 'done' && last.kind !== 'error')) {
    throw new ApiRequestError(res.status, t(locale, 'advisor.interruptedReply'));
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
  saveLocale: (locale: Locale) =>
    request<SettingsInfo>('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-IAM-Action': 'settings' },
      body: JSON.stringify({ locale }),
    }),
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
  advisorSetup: (signal?: AbortSignal) => request<AdvisorSetupState>('/api/advisor/setup', { signal }),
  installOllama: (locale: Locale, onEvent: (event: AdvisorSetupEvent) => void) =>
    runSetup('/api/advisor/install', 'advisor-install', undefined, locale, onEvent),
  pullModel: (model: string, locale: Locale, onEvent: (event: AdvisorSetupEvent) => void) =>
    runSetup('/api/advisor/pull', 'advisor-pull', JSON.stringify({ model }), locale, onEvent),
  shutdown: async (): Promise<void> => {
    await request<{ ok: boolean }>('/api/shutdown', { method: 'POST', headers: { 'X-IAM-Action': 'shutdown' } });
  },
};

export function iconUrl(file: string): string {
  return `/api/icons/${file}`;
}
