import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTER, filterAchievements, normalizeText, type AchievementFilter } from '../../web/src/lib/filter.ts';
import { makeAchievement } from './factories.ts';

const LIST = [
  makeAchievement(343, { name: 'Flooded Caves', dlc: 'afterbirthPlus', unlocked: true, unlockedAt: '2026-09-16T14:30:51.000Z', inSave: true }),
  makeAchievement(1, { name: 'Magdalene', unlocked: true, unlockedAt: '2023-02-20T20:15:25.000Z', inSave: true, how: 'counter' }),
  makeAchievement(9, { name: 'The Nail', description: 'Unlocked a new item.', how: 'mark', character: 'azazel' }),
  makeAchievement(638, { name: 'Play Online', dlc: 'repentance', inSave: true, hidden: true, how: 'misc' }),
];

const NONE: ReadonlySet<number> = new Set();
const ids = (filter: Partial<AchievementFilter>, desyncIds = NONE) =>
  filterAchievements(LIST, { ...DEFAULT_FILTER, ...filter }, desyncIds).map((a) => a.id);

describe('filterAchievements', () => {
  it('keeps the missing ones by default, sorted by number', () => {
    expect(ids({})).toEqual([9, 638]);
  });

  it('filters by state', () => {
    expect(ids({ status: 'unlocked' })).toEqual([1, 343]);
    expect(ids({ status: 'all' })).toEqual([1, 9, 343, 638]);
  });

  it('filters by DLC', () => {
    expect(ids({ status: 'all', dlc: 'afterbirthPlus' })).toEqual([343]);
  });

  it('filters by way to earn it and by character', () => {
    expect(ids({ status: 'all', how: 'mark' })).toEqual([9]);
    expect(ids({ status: 'all', how: 'misc' })).toEqual([638]);
    expect(ids({ status: 'all', character: 'azazel' })).toEqual([9]);
    expect(ids({ status: 'all', how: 'counter', character: 'azazel' })).toEqual([]);
  });

  it('searches without case or accents', () => {
    expect(normalizeText('CAV\u00c9S \u00c9t\u00e9')).toBe('caves ete');
    expect(ids({ status: 'all', search: '  CAV\u00c9S ' })).toEqual([343]);
  });

  it('searches in the description', () => {
    expect(ids({ status: 'all', search: 'new item' })).toEqual([9]);
  });

  it('searches by number', () => {
    expect(ids({ status: 'all', search: '#638' })).toEqual([638]);
    expect(ids({ status: 'all', search: '343' })).toEqual([343]);
  });

  it('isolates the differences from the list the summary gives', () => {
    expect(ids({ status: 'all', onlyDesync: true }, new Set([638, 1]))).toEqual([1, 638]);
    expect(ids({ status: 'all', onlyDesync: true })).toEqual([]);
  });

  it('filters the secrets', () => {
    expect(ids({ status: 'all', secret: 'only' })).toEqual([638]);
    expect(ids({ status: 'all', secret: 'exclude' })).toEqual([1, 9, 343]);
  });

  it('sorts by name and by recent unlock', () => {
    expect(filterAchievements(LIST, { ...DEFAULT_FILTER, status: 'all', sort: 'name' }, NONE).map((a) => a.name)).toEqual([
      'Flooded Caves',
      'Magdalene',
      'Play Online',
      'The Nail',
    ]);
    expect(ids({ status: 'all', sort: 'recent' })).toEqual([343, 1, 9, 638]);
  });

  it('leaves the list it is given alone', () => {
    const before = LIST.map((a) => a.id);
    filterAchievements(LIST, { ...DEFAULT_FILTER, status: 'all' }, NONE);
    expect(LIST.map((a) => a.id)).toEqual(before);
  });
});
