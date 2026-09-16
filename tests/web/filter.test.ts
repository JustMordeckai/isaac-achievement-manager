import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTER, filterAchievements, normalizeText, type AchievementFilter } from '../../web/src/lib/filter.ts';
import { makeAchievement } from './factories.ts';

const LIST = [
  makeAchievement(343, { name: 'Flooded Caves', dlc: 'afterbirthPlus', unlocked: true, unlockedAt: '2026-09-16T14:30:51.000Z', inSave: true }),
  makeAchievement(1, { name: 'Magdalene', unlocked: true, unlockedAt: '2023-02-20T20:15:25.000Z', inSave: true }),
  makeAchievement(9, { name: 'The Nail', description: 'Unlocked a new item.' }),
  makeAchievement(638, { name: 'Play Online', dlc: 'repentance', inSave: true, hidden: true }),
];

const ids = (filter: Partial<AchievementFilter>) => filterAchievements(LIST, { ...DEFAULT_FILTER, ...filter }).map((a) => a.id);

describe('filterAchievements', () => {
  it('garde les manquants par défaut, triés par numéro', () => {
    expect(ids({})).toEqual([9, 638]);
  });

  it('filtre par état', () => {
    expect(ids({ status: 'unlocked' })).toEqual([1, 343]);
    expect(ids({ status: 'all' })).toEqual([1, 9, 343, 638]);
  });

  it('filtre par extension', () => {
    expect(ids({ status: 'all', dlc: 'afterbirthPlus' })).toEqual([343]);
  });

  it('cherche sans tenir compte de la casse ni des accents', () => {
    expect(normalizeText('CAVÉS Été')).toBe('caves ete');
    expect(ids({ status: 'all', search: '  CAVÉS ' })).toEqual([343]);
  });

  it('cherche dans la description', () => {
    expect(ids({ status: 'all', search: 'new item' })).toEqual([9]);
  });

  it('cherche par numéro', () => {
    expect(ids({ status: 'all', search: '#638' })).toEqual([638]);
    expect(ids({ status: 'all', search: '343' })).toEqual([343]);
  });

  it('isole les écarts entre sauvegarde et Steam', () => {
    const list = [...LIST, makeAchievement(50, { unlocked: true, unlockedAt: null, inSave: false }), makeAchievement(60, { inSave: null })];
    const result = filterAchievements(list, { ...DEFAULT_FILTER, status: 'all', onlyDesync: true });
    expect(result.map((a) => a.id)).toEqual([50, 638]);
  });

  it('filtre les secrets', () => {
    expect(ids({ status: 'all', secret: 'only' })).toEqual([638]);
    expect(ids({ status: 'all', secret: 'exclude' })).toEqual([1, 9, 343]);
  });

  it('trie par nom et par déblocage récent', () => {
    expect(filterAchievements(LIST, { ...DEFAULT_FILTER, status: 'all', sort: 'name' }).map((a) => a.name)).toEqual([
      'Flooded Caves',
      'Magdalene',
      'Play Online',
      'The Nail',
    ]);
    expect(ids({ status: 'all', sort: 'recent' })).toEqual([343, 1, 9, 638]);
  });

  it('ne modifie pas la liste reçue', () => {
    const before = LIST.map((a) => a.id);
    filterAchievements(LIST, { ...DEFAULT_FILTER, status: 'all' });
    expect(LIST.map((a) => a.id)).toEqual(before);
  });
});
