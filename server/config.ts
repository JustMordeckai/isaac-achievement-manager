import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_LOCALE, t, type Locale, toLocale } from '../shared/i18n/index.ts';
import type { LocalAccount, OllamaSettings } from '../shared/types.ts';
import { writeFileAtomic } from './fs-atomic.ts';
import { HttpError } from './http-error.ts';
import { parseTextVdf, type VdfTextObject } from './sources/vdf-text.ts';
import { APP_ID, accountIdToSteamId64, isSteamId64, steamId64ToAccountId } from './steam.ts';
import { readRegistry, type RegistryReader } from './win-registry.ts';

export interface SteamAccount extends LocalAccount {
  hasIsaacData: boolean;
  /** Timestamp field of loginusers.vdf (seconds), 0 when unknown. */
  lastLogin: number;
}

export interface SteamEnv {
  steamPath: string | null;
  activeAccountId: number | null;
  /** Sorted by last login, most recent first. */
  accounts: SteamAccount[];
}

export interface SteamPaths {
  schema: string;
  stats(accountId: number): string;
  remote(accountId: number): string;
}

export function steamPaths(steamPath: string): SteamPaths {
  const statsDir = path.join(steamPath, 'appcache', 'stats');
  return {
    schema: path.join(statsDir, `UserGameStatsSchema_${APP_ID}.bin`),
    stats: (accountId) => path.join(statsDir, `UserGameStats_${accountId}_${APP_ID}.bin`),
    remote: (accountId) => path.join(steamPath, 'userdata', String(accountId), APP_ID, 'remote'),
  };
}

export const DEFAULT_STEAM_PATHS = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];

export interface DetectOptions {
  readRegistry?: RegistryReader;
  fallbackSteamPaths?: string[];
  /** Accounts to include even when absent from loginusers.vdf (forced account). */
  extraAccountIds?: number[];
}

function readLoginUsers(steamPath: string): VdfTextObject {
  try {
    const users = parseTextVdf(readFileSync(path.join(steamPath, 'config', 'loginusers.vdf'), 'utf8')).users;
    return typeof users === 'object' ? users : {};
  } catch {
    return {};
  }
}

export function detectSteamEnv(options: DetectOptions = {}): SteamEnv {
  const reader = options.readRegistry ?? readRegistry;
  const registryPath = reader('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  const candidates = [typeof registryPath === 'string' ? registryPath : null, ...(options.fallbackSteamPaths ?? DEFAULT_STEAM_PATHS)];
  const found = candidates.find((candidate): candidate is string => candidate !== null && existsSync(candidate));
  const steamPath = found ? path.normalize(found) : null;
  const active = reader('HKCU\\Software\\Valve\\Steam\\ActiveProcess', 'ActiveUser');
  const activeAccountId = typeof active === 'number' && active > 0 ? active : null;
  if (!steamPath) return { steamPath: null, activeAccountId, accounts: [] };

  const paths = steamPaths(steamPath);
  const users = readLoginUsers(steamPath);
  const ids = new Set(Object.keys(users).filter(isSteamId64).map(steamId64ToAccountId));
  if (activeAccountId !== null) ids.add(activeAccountId);
  for (const id of options.extraAccountIds ?? []) ids.add(id);

  const accounts = [...ids].map((accountId): SteamAccount => {
    const steamId64 = accountIdToSteamId64(accountId);
    const entry = users[steamId64];
    const user = typeof entry === 'object' ? entry : undefined;
    return {
      accountId,
      steamId64,
      personaName: typeof user?.PersonaName === 'string' ? user.PersonaName : null,
      hasIsaacData: existsSync(paths.stats(accountId)) || existsSync(path.dirname(paths.remote(accountId))),
      lastLogin: Number(user?.Timestamp) || 0,
    };
  });
  accounts.sort((a, b) => b.lastLogin - a.lastLogin);
  return { steamPath, activeAccountId, accounts };
}

export function chooseAccount(env: SteamEnv, forcedAccountId: number | null): SteamAccount | null {
  if (forcedAccountId !== null) {
    return env.accounts.find((a) => a.accountId === forcedAccountId) ?? null;
  }
  const withData = env.accounts.filter((a) => a.hasIsaacData);
  const active = withData.find((a) => a.accountId === env.activeAccountId);
  if (active) return active;
  return [...withData].sort((a, b) => b.lastLogin - a.lastLogin)[0] ?? null;
}

export interface Settings {
  port: number;
  /** Forced Steam account (account id), otherwise chosen automatically. */
  accountId: number | null;
  ollama: OllamaSettings;
  locale: Locale;
}

export const DEFAULT_OLLAMA: OllamaSettings = { url: 'http://127.0.0.1:11434', model: 'qwen3.5:9b' };

export const DEFAULT_SETTINGS: Settings = { port: 5250, accountId: null, ollama: DEFAULT_OLLAMA, locale: DEFAULT_LOCALE };

const MODEL_NAME = /^[\w.:/-]{1,200}$/;

/** http(s) address of an Ollama server, without a trailing slash; null when the value does not fit. */
export function ollamaUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 200) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return url.toString().replace(/\/+$/, '');
}

/** Ollama model name (e.g. qwen3.5:9b); null when the value does not fit. */
export function ollamaModel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const model = value.trim();
  return MODEL_NAME.test(model) ? model : null;
}

export function loadSettings(dataDir: string): Settings {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
  const { port, accountId, ollama, locale } = raw as Record<string, unknown>;
  const server = typeof ollama === 'object' && ollama !== null ? (ollama as Record<string, unknown>) : {};
  return {
    port: Number.isInteger(port) && (port as number) > 0 && (port as number) < 65536 ? (port as number) : DEFAULT_SETTINGS.port,
    // A Steam account id fits in 32 bits: beyond that, the computed SteamID64 would be wrong.
    accountId:
      Number.isInteger(accountId) && (accountId as number) > 0 && (accountId as number) <= 0xffffffff
        ? (accountId as number)
        : null,
    ollama: {
      url: ollamaUrl(server.url) ?? DEFAULT_OLLAMA.url,
      model: ollamaModel(server.model) ?? DEFAULT_OLLAMA.model,
    },
    locale: toLocale(locale) ?? DEFAULT_SETTINGS.locale,
  };
}

/** Writes a patch into data/settings.json, keeping the other fields already in the file. */
export async function saveSettings(dataDir: string, patch: Record<string, unknown>, locale: Locale): Promise<void> {
  const file = path.join(dataDir, 'settings.json');
  let current: Record<string, unknown> = {};
  let text: string | null = null;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (text !== null) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Handled just below: we do not overwrite a file the user might currently be editing.
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new HttpError(409, t(locale, 'errors.settingsFileUnreadable'));
    }
    current = parsed as Record<string, unknown>;
  }
  await writeFileAtomic(file, `${JSON.stringify({ ...current, ...patch }, null, 2)}\n`);
}
