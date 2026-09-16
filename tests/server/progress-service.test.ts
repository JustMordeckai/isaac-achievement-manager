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
    resolve: vi.fn(async (input: string) => ({ steamId64: input, name: 'Ami' })),
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

  it('assemble la progression locale de Player', async () => {
    const profiles = fakeProfiles();
    const { summary } = await service(profiles).get('me', null);
    expect(summary.profile).toEqual({ steamId64: ME_ID64, name: 'Player', isLocal: true });
    expect(summary.unlocked).toBe(125);
    expect(summary.sources.steamCache.state).toBe('ok');
    expect(summary.sources.saveFile).toMatchObject({ state: 'ok', message: 'Slot 1' });
    expect(summary.sources.profile.state).toBe('ok');
    expect(summary.save).toEqual({ slot: 1, slots: [1, 2] });
    expect(summary.desyncs).toEqual([{ id: 638, name: 'Play Online', kind: 'saveOnly' }]);
    expect(summary.accounts).toEqual([{ accountId: ME_ACCOUNT, steamId64: ME_ID64, personaName: 'Player' }]);
    expect(profiles.getStats).toHaveBeenCalledWith(ME_ID64);
  });

  it('accepte le SteamID64 d\'un compte local', async () => {
    const { summary } = await service().get(ME_ID64, null);
    expect(summary.profile.isLocal).toBe(true);
    expect(summary.sources.saveFile.state).toBe('ok');
  });

  it('lit le slot demandé', async () => {
    const { summary } = await service().get('me', 2);
    expect(summary.save).toEqual({ slot: 2, slots: [1, 2] });
    expect(summary.desyncs).toHaveLength(125);
    expect(summary.desyncs.every((d) => d.kind === 'steamOnly')).toBe(true);
  });

  it('refuse un slot introuvable', async () => {
    await expect(service().get('me', 3)).rejects.toMatchObject({ status: 400, message: 'Slot 3 introuvable' });
  });

  it('continue sans profil en ligne', async () => {
    const profiles = fakeProfiles({
      getStats: vi.fn(async () => {
        throw new ProfileError('network', 'Steam injoignable : boom');
      }),
    });
    const { summary } = await service(profiles).get('me', null);
    expect(summary.sources.profile).toEqual({ state: 'error', message: 'Steam injoignable : boom' });
    expect(summary.unlocked).toBe(125);
  });

  it('signale une sauvegarde illisible sans bloquer le reste', async () => {
    writeFileSync(slotFile(1), 'garbage');
    const { summary } = await service().get('me', 1);
    expect(summary.sources.saveFile.state).toBe('error');
    expect(summary.sources.saveFile.message).toMatch(/En-tête/);
    expect(summary.save).toEqual({ slot: 1, slots: [1, 2] });
    expect(summary.desyncs).toEqual([]);
    expect(summary.unlocked).toBe(125);
  });

  it('bascule sur le profil en ligne sans stats locales', async () => {
    rmSync(path.join(steam, 'appcache', 'stats', `UserGameStats_${ME_ACCOUNT}_250900.bin`));
    const { summary } = await service().get('me', null);
    expect(summary.sources.steamCache).toEqual({ state: 'absent', message: 'Aucune statistique Steam locale pour ce compte' });
    expect(summary.unlocked).toBe(125);
  });

  it('signale un schéma absent', async () => {
    rmSync(path.join(steam, 'appcache', 'stats', 'UserGameStatsSchema_250900.bin'));
    const { summary, achievements } = await service().get('me', null);
    expect(summary.sources.steamCache.state).toBe('absent');
    expect(summary.sources.steamCache.message).toMatch(/Schéma/);
    expect(achievements).toHaveLength(641);
    expect(achievements.every((a) => a.hidden === false)).toBe(true);
  });

  it('affiche un joueur distant', async () => {
    const profiles = fakeProfiles();
    const { summary, achievements } = await service(profiles).get(OTHER_ID64, null);
    expect(summary.profile).toEqual({ steamId64: OTHER_ID64, name: 'Ami', isLocal: false });
    expect(summary.sources.steamCache).toEqual({ state: 'absent', message: 'Joueur distant : pas de fichiers locaux' });
    expect(summary.sources.saveFile.state).toBe('absent');
    expect(summary.save).toBeNull();
    expect(achievements[0].inSave).toBeNull();
    expect(achievements.filter((a) => a.hidden)).toHaveLength(319);
    expect(profiles.getStats).toHaveBeenCalledWith(OTHER_ID64);
  });

  it('garde un nom vide si la résolution du joueur distant échoue', async () => {
    const profiles = fakeProfiles({
      resolve: vi.fn(async () => {
        throw new ProfileError('network', 'x');
      }),
    });
    const { summary } = await service(profiles).get(OTHER_ID64, null);
    expect(summary.profile.name).toBeNull();
  });

  it('transforme les erreurs du profil distant en erreurs HTTP', async () => {
    const privateProfiles = fakeProfiles({
      getStats: vi.fn(async () => {
        throw new ProfileError('private', 'Les détails de jeu de ce profil ne sont pas publics');
      }),
    });
    await expect(service(privateProfiles).get(OTHER_ID64, null)).rejects.toMatchObject({ status: 403 });
    const missing = fakeProfiles({
      getStats: vi.fn(async () => {
        throw new ProfileError('notFound', 'Profil Steam introuvable');
      }),
    });
    await expect(service(missing).get(OTHER_ID64, null)).rejects.toMatchObject({ status: 404 });
  });

  it('refuse un slot pour un joueur distant et un profil invalide', async () => {
    await expect(service().get(OTHER_ID64, 1)).rejects.toMatchObject({ status: 400 });
    await expect(service().get('abc', null)).rejects.toMatchObject({ status: 400 });
  });

  it('utilise le compte forcé', async () => {
    const { summary } = await service(fakeProfiles(), 234567890).get('me', null);
    expect(summary.profile).toEqual({ steamId64: '76561198194833618', name: 'Second Player', isLocal: true });
    expect(summary.sources.saveFile.state).toBe('absent');
    expect(summary.sources.steamCache.state).toBe('absent');
  });

  it('répond 404 pour "me" sans Steam, mais sert un joueur distant', async () => {
    const noSteam = createProgressService({
      env: { steamPath: null, activeAccountId: null, accounts: [] },
      forcedAccountId: null,
      profiles: fakeProfiles(),
    });
    await expect(noSteam.get('me', null)).rejects.toMatchObject({ status: 404 });
    const { summary } = await noSteam.get(OTHER_ID64, null);
    expect(summary.unlocked).toBe(125);
    expect(summary.accounts).toEqual([]);
  });
});
