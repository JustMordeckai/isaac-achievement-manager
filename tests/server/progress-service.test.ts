import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectSteamEnv } from '../../server/config.ts';
import { createProgressService } from '../../server/progress-service.ts';
import { ProfileError, parseProfileStatsXml, type ProfileClient } from '../../server/sources/steam-profile.ts';
import { fixtureText, ME_ACCOUNT, ME_ID64, OTHER_ID64 } from './helpers/fixtures.ts';
import { fakeRegistry, makeSteamDir, removeDir } from './helpers/steam-dir.ts';

const STATS = parseProfileStatsXml(fixtureText('profile-stats-me.xml'));

function fakeProfiles(overrides: Partial<ProfileClient> = {}): ProfileClient {
  return {
    getStats: vi.fn(async () => STATS),
    resolve: vi.fn(async (input: string) => ({ steamId64: input, name: 'Friend' })),
    ...overrides,
  };
}

describe('createProgressService', () => {
  let steam: string;
  beforeEach(() => {
    steam = makeSteamDir();
  });
  afterEach(() => removeDir(steam));

  const service = (profiles = fakeProfiles(), forcedAccountId: number | null = null) =>
    createProgressService({
      env: detectSteamEnv({ readRegistry: fakeRegistry(steam, ME_ACCOUNT), fallbackSteamPaths: [], extraAccountIds: forcedAccountId ? [forcedAccountId] : [] }),
      forcedAccountId,
      profiles,
    });
  const slotFile = (slot: number) => path.join(steam, 'userdata', String(ME_ACCOUNT), '250900', 'remote', `rep+persistentgamedata${slot}.dat`);

  it('assembles Player\'s local progress', async () => {
    const profiles = fakeProfiles();
    const { summary } = await service(profiles).get('me', null, 'en');
    expect(summary.profile).toEqual({ steamId64: ME_ID64, name: 'Player', isLocal: true });
    expect(summary.unlocked).toBe(125);
    expect(summary.sources.steamCache.state).toBe('ok');
    expect(summary.sources.saveFile).toMatchObject({ state: 'ok', message: 'Slot 1' });
    expect(summary.sources.profile.state).toBe('ok');
    expect(summary.save).toEqual({ slot: 1, slots: [1, 2] });
    expect(summary.desyncs).toEqual([{ id: 638, name: 'Play Online', kind: 'saveOnly' }]);
    expect(summary.accounts).toEqual([{ accountId: ME_ACCOUNT, steamId64: ME_ID64, personaName: 'Player' }]);
    expect(profiles.getStats).toHaveBeenCalledWith(ME_ID64, 'en');
  });

  it('accepts the SteamID64 of a local account', async () => {
    const { summary } = await service().get(ME_ID64, null, 'en');
    expect(summary.profile.isLocal).toBe(true);
    expect(summary.sources.saveFile.state).toBe('ok');
  });

  it('reads the requested slot', async () => {
    const { summary } = await service().get('me', 2, 'en');
    expect(summary.save).toEqual({ slot: 2, slots: [1, 2] });
    expect(summary.desyncs).toHaveLength(125);
    expect(summary.desyncs.every((d) => d.kind === 'steamOnly')).toBe(true);
  });

  it('refuses a slot that does not exist', async () => {
    await expect(service().get('me', 3, 'en')).rejects.toMatchObject({ status: 400, message: 'Slot 3 not found' });
  });

  it('continues without an online profile', async () => {
    const profiles = fakeProfiles({
      getStats: vi.fn(async () => {
        throw new ProfileError('network', 'Steam unreachable: boom');
      }),
    });
    const { summary } = await service(profiles).get('me', null, 'en');
    expect(summary.sources.profile).toEqual({ state: 'error', message: 'Steam unreachable: boom' });
    expect(summary.unlocked).toBe(125);
  });

  it('reports an unreadable save without blocking the rest', async () => {
    writeFileSync(slotFile(1), 'garbage');
    const { summary } = await service().get('me', 1, 'en');
    expect(summary.sources.saveFile.state).toBe('error');
    expect(summary.sources.saveFile.message).toMatch(/header/i);
    expect(summary.save).toEqual({ slot: 1, slots: [1, 2] });
    expect(summary.desyncs).toEqual([]);
    expect(summary.unlocked).toBe(125);
  });

  it('falls back to the online profile without local stats', async () => {
    rmSync(path.join(steam, 'appcache', 'stats', `UserGameStats_${ME_ACCOUNT}_250900.bin`));
    const { summary } = await service().get('me', null, 'en');
    expect(summary.sources.steamCache).toEqual({ state: 'absent', message: 'No local Steam stats for this account' });
    expect(summary.unlocked).toBe(125);
  });

  it('reports an absent schema', async () => {
    rmSync(path.join(steam, 'appcache', 'stats', 'UserGameStatsSchema_250900.bin'));
    const { summary, achievements } = await service().get('me', null, 'en');
    expect(summary.sources.steamCache.state).toBe('absent');
    expect(summary.sources.steamCache.message).toMatch(/schema/i);
    expect(achievements).toHaveLength(641);
    expect(achievements.every((a) => a.hidden === false)).toBe(true);
  });

  it('displays a remote player', async () => {
    const profiles = fakeProfiles();
    const { summary, achievements } = await service(profiles).get(OTHER_ID64, null, 'en');
    expect(summary.profile).toEqual({ steamId64: OTHER_ID64, name: 'Friend', isLocal: false });
    expect(summary.sources.steamCache).toEqual({ state: 'absent', message: 'Remote player: no local files' });
    expect(summary.sources.saveFile.state).toBe('absent');
    expect(summary.save).toBeNull();
    expect(achievements[0].inSave).toBeNull();
    expect(achievements.filter((a) => a.hidden)).toHaveLength(319);
    expect(profiles.getStats).toHaveBeenCalledWith(OTHER_ID64, 'en');
  });

  it('keeps an empty name when resolving the remote player fails', async () => {
    const profiles = fakeProfiles({
      resolve: vi.fn(async () => {
        throw new ProfileError('network', 'x');
      }),
    });
    const { summary } = await service(profiles).get(OTHER_ID64, null, 'en');
    expect(summary.profile.name).toBeNull();
  });

  it('turns remote profile errors into HTTP errors', async () => {
    const privateProfiles = fakeProfiles({
      getStats: vi.fn(async () => {
        throw new ProfileError('private', "This profile's game details are not public");
      }),
    });
    await expect(service(privateProfiles).get(OTHER_ID64, null, 'en')).rejects.toMatchObject({ status: 403 });
    const missing = fakeProfiles({
      getStats: vi.fn(async () => {
        throw new ProfileError('notFound', 'Steam profile not found');
      }),
    });
    await expect(service(missing).get(OTHER_ID64, null, 'en')).rejects.toMatchObject({ status: 404 });
  });

  it('refuses a slot for a remote player and an invalid profile', async () => {
    await expect(service().get(OTHER_ID64, 1, 'en')).rejects.toMatchObject({ status: 400 });
    await expect(service().get('abc', null, 'en')).rejects.toMatchObject({ status: 400 });
  });

  it('uses the forced account', async () => {
    const { summary } = await service(fakeProfiles(), 234567890).get('me', null, 'en');
    expect(summary.profile).toEqual({ steamId64: '76561198194833618', name: 'Second Player', isLocal: true });
    expect(summary.sources.saveFile.state).toBe('absent');
    expect(summary.sources.steamCache.state).toBe('absent');
  });

  it('shares an ongoing load between two identical calls', async () => {
    const profiles = fakeProfiles();
    const progress = service(profiles);
    const first = progress.get('me', null, 'en');
    const second = progress.get('me', null, 'en');
    expect(second).toBe(first);
    expect(progress.get('me', 2, 'en')).not.toBe(first);
    await Promise.all([first, second]);
    expect(profiles.getStats).toHaveBeenCalledTimes(2);
    await progress.get('me', null, 'en');
    expect(profiles.getStats).toHaveBeenCalledTimes(3);
  });

  it('frees a failed load for the next call', async () => {
    const getStats = vi.fn(async () => STATS);
    getStats.mockRejectedValueOnce(new ProfileError('network', 'Steam unreachable: boom'));
    const progress = service(fakeProfiles({ getStats }));
    await expect(progress.get(OTHER_ID64, null, 'en')).rejects.toMatchObject({ status: 502 });
    const { summary } = await progress.get(OTHER_ID64, null, 'en');
    expect(summary.unlocked).toBe(125);
  });

  it('exposes the local schema definitions', async () => {
    const defs = await service().definitions();
    expect(defs).toHaveLength(641);
    expect(defs?.[0]).toMatchObject({ id: 1, name: 'Magdalene' });
    rmSync(path.join(steam, 'appcache', 'stats', 'UserGameStatsSchema_250900.bin'));
    expect(await service().definitions()).toBeNull();
  });

  it('answers 404 for "me" without Steam, but serves a remote player', async () => {
    const noSteam = createProgressService({
      env: { steamPath: null, activeAccountId: null, accounts: [] },
      forcedAccountId: null,
      profiles: fakeProfiles(),
    });
    await expect(noSteam.get('me', null, 'en')).rejects.toMatchObject({ status: 404 });
    const { summary } = await noSteam.get(OTHER_ID64, null, 'en');
    expect(summary.unlocked).toBe(125);
    expect(summary.accounts).toEqual([]);
    expect(await noSteam.definitions()).toBeNull();
  });
});
