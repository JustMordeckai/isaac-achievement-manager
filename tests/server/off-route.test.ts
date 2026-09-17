import { describe, expect, it } from 'vitest';
import { displayMarks, inferMarks } from '../../server/planner/marks.ts';
import { buildOffRoute } from '../../server/planner/off-route.ts';
import { mergeProgress } from '../../server/sources/progress.ts';
import { emptyMarks } from '../../shared/marks.ts';
import { fixtureMergeInput } from './helpers/merge-input.ts';
import { testKnowledgeBase } from './helpers/kb.ts';

const merged = mergeProgress(fixtureMergeInput());
const unlocked = new Set(merged.achievements.filter((a) => a.unlocked).map((a) => a.id));

describe('buildOffRoute', () => {
  it('liste défis, compteurs, placards et divers encore à faire', async () => {
    const kb = await testKnowledgeBase();
    const off = buildOffRoute({ kb, achievements: merged.achievements, unlocked, counters: merged.save?.counters ?? null });
    expect([off.challenges.length, off.counters.length, off.closets.length, off.misc.length]).toEqual([43, 31, 17, 68]);
    expect(off.redKey).toBe(false);
    expect(off.challenges.find((c) => c.number === 6)).toEqual({
      id: 94,
      name: 'Rune of Perthro',
      number: 6,
      title: 'Solar System',
      character: 'Isaac',
      goal: "Mom's Heart",
      curse: null,
      startingItems: ['Distant Admiration', 'Forever Alone', 'Halo of Flies', 'Transcendence'],
      requirement: { anyOf: [{ id: 159, name: 'Solar System' }], met: true },
    });
    expect(off.counters.find((c) => c.id === 344)).toEqual({
      id: 344,
      name: 'Dank Depths',
      condition: 'Defeat It Lives! 21 times',
      total: 21,
      value: 16,
    });
    // Victory Laps, portails et Little Horn : aucun compteur identifié.
    expect(off.counters.filter((c) => c.value === null).map((c) => c.id)).toEqual([337, 349, 356, 360]);
    expect(off.closets[0]).toEqual({ id: 474, name: 'The Broken', character: 'isaac' });
    expect(off.misc[0]).toEqual({ id: 23, name: 'Little Gish', condition: 'Defeat Gish', dlc: 'rebirth' });
    // Un succès « battre Mom » est proposé par les runs, pas dans les divers.
    expect(off.misc.some((m) => m.id === 166)).toBe(false);
  });

  it('garde un défi sans page dans la base', async () => {
    const kb = await testKnowledgeBase();
    const missing = off(kb).challenges.find((c) => c.title === null);
    expect(missing).toMatchObject({ character: null, goal: null, startingItems: [], requirement: null });
  });

  it('laisse les valeurs de compteur inconnues sans sauvegarde', async () => {
    const kb = await testKnowledgeBase();
    const list = buildOffRoute({ kb, achievements: merged.achievements, unlocked, counters: null }).counters;
    expect(list.every((c) => c.value === null)).toBe(true);
  });
});

function off(kb: Awaited<ReturnType<typeof testKnowledgeBase>>) {
  return buildOffRoute({ kb, achievements: merged.achievements, unlocked, counters: null });
}

describe('inferMarks et displayMarks', () => {
  it('déduit les marques prouvées par les succès', async () => {
    const kb = await testKnowledgeBase();
    const marks = inferMarks(kb, new Set([167, 548, 262]));
    // #167 : Mom's Heart en difficile avec Isaac.
    expect(marks.isaac.momsHeart).toBe(2);
    // #548 : Isaac, ???, Satan et The Lamb avec Tainted Isaac.
    expect(marks.taintedIsaac).toMatchObject({ isaac: 1, blueBaby: 1, satan: 1, lamb: 1, momsHeart: 0 });
    // #262 : toutes les marques en difficile avec Samson.
    expect(Object.values(marks.samson).every((level) => level === 2)).toBe(true);
    expect(marks.cain).toEqual(emptyMarks());
  });

  it('montre comme inconnues les marques qu’aucun succès ne prouve', async () => {
    const kb = await testKnowledgeBase();
    const marks = inferMarks(kb, new Set());
    const shown = displayMarks(kb, marks, false);
    expect(shown.isaac.momsHeart).toBeNull();
    expect(shown.isaac.satan).toBe(0);
    expect(shown.taintedIsaac.momsHeart).toBeNull();
    expect(displayMarks(kb, marks, true).isaac.momsHeart).toBe(0);
  });
});
