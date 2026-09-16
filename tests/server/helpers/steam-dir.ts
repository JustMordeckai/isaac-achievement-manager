import { cpSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RegistryReader } from '../../../server/win-registry.ts';
import { FIXTURES, ME_ACCOUNT } from './fixtures.ts';

export function makeSteamDir(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'iam-steam-'));
  const stats = path.join(root, 'appcache', 'stats');
  const remote = path.join(root, 'userdata', String(ME_ACCOUNT), '250900', 'remote');
  mkdirSync(stats, { recursive: true });
  mkdirSync(remote, { recursive: true });
  mkdirSync(path.join(root, 'config'));
  const copy = (name: string, target: string) => cpSync(path.join(FIXTURES, name), target);
  copy('UserGameStatsSchema_250900.bin', path.join(stats, 'UserGameStatsSchema_250900.bin'));
  copy(`UserGameStats_${ME_ACCOUNT}_250900.bin`, path.join(stats, `UserGameStats_${ME_ACCOUNT}_250900.bin`));
  copy('loginusers.vdf', path.join(root, 'config', 'loginusers.vdf'));
  for (const [slot, iso] of [[1, '2026-09-16T15:08:26Z'], [2, '2026-09-16T15:08:22Z']] as const) {
    const file = path.join(remote, `rep+persistentgamedata${slot}.dat`);
    copy(`rep+persistentgamedata${slot}.dat`, file);
    utimesSync(file, new Date(iso), new Date(iso));
  }
  return root;
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function fakeRegistry(steamPath: string | null, activeUser: number | null): RegistryReader {
  return (_key, name) => {
    if (name === 'SteamPath') return steamPath;
    if (name === 'ActiveUser') return activeUser;
    return null;
  };
}
