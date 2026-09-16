import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { LocalAccount } from '../shared/types.ts';
import { parseTextVdf, type VdfTextObject } from './sources/vdf-text.ts';
import { APP_ID, accountIdToSteamId64, isSteamId64, steamId64ToAccountId } from './steam.ts';
import { readRegistry, type RegistryReader } from './win-registry.ts';

export interface SteamAccount extends LocalAccount {
  hasIsaacData: boolean;
  /** Champ Timestamp de loginusers.vdf (secondes), 0 si inconnu. */
  lastLogin: number;
}

export interface SteamEnv {
  steamPath: string | null;
  activeAccountId: number | null;
  /** Triés par dernière connexion, la plus récente en premier. */
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
  /** Comptes à inclure même s'ils ne figurent pas dans loginusers.vdf (compte forcé). */
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
  /** Compte Steam imposé (id de compte), sinon choix automatique. */
  accountId: number | null;
}

export const DEFAULT_SETTINGS: Settings = { port: 5250, accountId: null };

export function loadSettings(dataDir: string): Settings {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
  const { port, accountId } = raw as Record<string, unknown>;
  return {
    port: Number.isInteger(port) && (port as number) > 0 && (port as number) < 65536 ? (port as number) : DEFAULT_SETTINGS.port,
    accountId: Number.isInteger(accountId) && (accountId as number) > 0 ? (accountId as number) : null,
  };
}
