import { describe, expect, it } from 'vitest';
import { mergeProgress, type MergeInput } from '../../server/sources/progress.ts';
import { parseSaveFile } from '../../server/sources/save-file.ts';
import type { ProfileStats } from '../../server/sources/steam-profile.ts';
import { fixture, OTHER_ID64 } from './helpers/fixtures.ts';
import { fixtureMergeInput } from './helpers/merge-input.ts';

function onlineStats(input: MergeInput): ProfileStats {
  if (!input.online.data) throw new Error('fixture without an online profile');
  return input.online.data;
}

describe('mergeProgress', () => {
  it("merges Player's local sources", () => {
    const { summary, achievements, save } = mergeProgress(fixtureMergeInput());
    expect(summary.total).toBe(641);
    expect(summary.unlocked).toBe(125);
    expect(summary.sources).toEqual({
      steamCache: { state: 'ok' },
      saveFile: { state: 'ok', message: 'Slot 1' },
      profile: { state: 'ok' },
    });
    expect(summary.desyncs).toEqual([{ id: 638, name: 'Play Online', kind: 'saveOnly' }]);
    expect(summary.recent).toHaveLength(10);
    expect(summary.recent[0]).toEqual({
      id: 343,
      name: 'Flooded Caves',
      icon: expect.stringMatching(/^[0-9a-f]{40}\.jpg$/),
      unlockedAt: '2026-09-16T14:30:51.000Z',
    });
    expect(Object.values(summary.byDlc).reduce((n, d) => n + d.total, 0)).toBe(641);
    expect(Object.values(summary.byDlc).reduce((n, d) => n + d.unlocked, 0)).toBe(125);
    expect(summary.byDlc.repentancePlus).toEqual({ total: 1, unlocked: 1 });
    expect(summary.save).toEqual({ slot: 1, slots: [1, 2] });
    expect(summary.profile).toEqual({ steamId64: '76561198083722517', name: 'Player', isLocal: true });
    expect(achievements.find((a) => a.id === 638)).toMatchObject({ unlocked: false, inSave: true, unlockedAt: null, dlc: 'repentance' });
    expect(achievements.find((a) => a.id === 1)).toMatchObject({ unlocked: true, inSave: true, unlockedAt: '2023-02-20T20:15:25.000Z' });
    expect(save?.counters[1]).toBe(16);
    expect(save?.marks?.isaac).toMatchObject({ momsHeart: 2, lamb: 2, greed: 1, bossRush: 0 });
  });

  it('reports a local cache behind the online profile, in the reader\'s language', () => {
    const base = fixtureMergeInput();
    const cache = new Map(base.steamCache.data);
    cache.delete(343);
    const input = { ...base, steamCache: { status: { state: 'ok' as const }, data: cache } };

    const { summary, achievements } = mergeProgress(input, 'en');
    expect(summary.sources.steamCache).toEqual({
      state: 'stale',
      message: 'The online profile holds 1 achievement the local cache does not.',
    });
    expect(summary.unlocked).toBe(125);
    expect(summary.desyncs).toContainEqual({ id: 343, name: 'Flooded Caves', kind: 'profileAhead' });
    expect(achievements.find((a) => a.id === 343)?.unlockedAt).toBe('2026-09-16T14:30:52.000Z');

    const fr = mergeProgress(input, 'fr');
    expect(fr.summary.sources.steamCache).toEqual({
      state: 'stale',
      message: 'Le profil en ligne compte 1 succès de plus que le cache local',
    });
  });

  it('pluralizes the note for more than one achievement ahead, in both languages', () => {
    const base = fixtureMergeInput();
    const cache = new Map(base.steamCache.data);
    const ahead = onlineStats(base)
      .achievements.filter((a) => a.unlocked && cache.has(a.id))
      .slice(0, 2);
    expect(ahead).toHaveLength(2);
    for (const a of ahead) cache.delete(a.id);
    const input = { ...base, steamCache: { status: { state: 'ok' as const }, data: cache } };

    const { summary } = mergeProgress(input, 'en');
    expect(summary.sources.steamCache).toEqual({
      state: 'stale',
      message: 'The online profile holds 2 achievements the local cache does not.',
    });

    const fr = mergeProgress(input, 'fr');
    expect(fr.summary.sources.steamCache).toEqual({
      state: 'stale',
      message: 'Le profil en ligne compte 2 succès de plus que le cache local',
    });
  });

  it('reports an online profile behind the cache', () => {
    const base = fixtureMergeInput();
    const stats = onlineStats(base);
    const online: ProfileStats = {
      ...stats,
      achievements: stats.achievements.map((a) => (a.id === 343 ? { ...a, unlocked: false, unlockedAt: null } : a)),
    };
    const { summary } = mergeProgress({ ...base, online: { status: { state: 'ok' }, data: online } });
    expect(summary.sources.steamCache.state).toBe('ok');
    expect(summary.unlocked).toBe(125);
    expect(summary.desyncs).toContainEqual({ id: 343, name: 'Flooded Caves', kind: 'cacheAhead' });
  });

  it('uses the online profile when the local cache is missing', () => {
    const base = fixtureMergeInput();
    const { summary } = mergeProgress({ ...base, steamCache: { status: { state: 'absent', message: 'x' }, data: null } });
    expect(summary.unlocked).toBe(125);
    expect(summary.sources.steamCache).toEqual({ state: 'absent', message: 'x' });
    expect(summary.desyncs).toEqual([{ id: 638, name: 'Play Online', kind: 'saveOnly' }]);
  });

  it('displays a remote player with only the online profile', () => {
    const base = fixtureMergeInput();
    const remote = { status: { state: 'absent' as const, message: 'Remote player' }, data: null };
    const { summary, achievements } = mergeProgress({
      ...base,
      profile: { steamId64: OTHER_ID64, name: 'Friend', isLocal: false },
      defs: null,
      steamCache: remote,
      save: remote,
      saveSlots: null,
    });
    expect(summary.total).toBe(641);
    expect(summary.unlocked).toBe(125);
    expect(summary.desyncs).toEqual([]);
    expect(summary.save).toBeNull();
    expect(achievements.every((a) => a.inSave === null && a.hidden === false)).toBe(true);
    expect(achievements[0]).toMatchObject({ id: 1, name: 'Magdalene', icon: 'a36d7e92df7e991758907a75dfa55d36b52548c4.jpg', dlc: 'rebirth' });
  });

  it('ignores the save for a remote player', () => {
    const base = fixtureMergeInput();
    const { summary, achievements, save } = mergeProgress({ ...base, profile: { steamId64: OTHER_ID64, name: null, isLocal: false } });
    expect(summary.desyncs).toEqual([]);
    expect(achievements.every((a) => a.inSave === null)).toBe(true);
    expect(save).toBeNull();
  });

  it('computes no save desync without a Steam source', () => {
    const base = fixtureMergeInput();
    const { summary, achievements } = mergeProgress({
      ...base,
      steamCache: { status: { state: 'absent' }, data: null },
      online: { status: { state: 'error', message: 'Steam unreachable' }, data: null },
    });
    expect(summary.total).toBe(641);
    expect(summary.unlocked).toBe(0);
    expect(summary.desyncs).toEqual([]);
    expect(summary.recent).toEqual([]);
    expect(achievements.find((a) => a.id === 638)?.inSave).toBe(true);
  });

  it('lists the Steam achievements missing from an empty save', () => {
    const base = fixtureMergeInput();
    const empty = parseSaveFile(fixture('rep+persistentgamedata2.dat'));
    const { summary } = mergeProgress({ ...base, save: { status: { state: 'ok', message: 'Slot 2' }, data: empty } });
    expect(summary.desyncs).toHaveLength(125);
    expect(summary.desyncs.every((d) => d.kind === 'steamOnly')).toBe(true);
    expect(summary.desyncs[0]).toEqual({ id: 1, name: 'Magdalene', kind: 'steamOnly' });
  });

  it('returns an empty progress without any definition', () => {
    const empty = { status: { state: 'absent' as const }, data: null };
    const { summary, achievements } = mergeProgress({
      profile: { steamId64: OTHER_ID64, name: null, isLocal: false },
      defs: null,
      steamCache: empty,
      save: empty,
      saveSlots: null,
      online: { status: { state: 'error', message: 'x' }, data: null },
      accounts: [],
    });
    expect(achievements).toEqual([]);
    expect(summary.total).toBe(0);
    expect(summary.byDlc.rebirth).toEqual({ total: 0, unlocked: 0 });
  });
});
