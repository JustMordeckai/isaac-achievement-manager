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
  it('lists the challenges, counters, closets and miscellaneous still to do', async () => {
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
    // Victory Laps, portals and Little Horn: no counter identified.
    expect(off.counters.filter((c) => c.value === null).map((c) => c.id)).toEqual([337, 349, 356, 360]);
    expect(off.closets[0]).toEqual({ id: 474, name: 'The Broken', character: 'isaac' });
    expect(off.misc[0]).toEqual({ id: 23, name: 'Little Gish', condition: 'Defeat Gish', dlc: 'rebirth' });
    // A "beat Mom" achievement is offered by the runs, not in the miscellaneous list.
    expect(off.misc.some((m) => m.id === 166)).toBe(false);
  });

  it('keeps a challenge with no page in the base', async () => {
    const kb = await testKnowledgeBase();
    const missing = off(kb).challenges.find((c) => c.title === null);
    expect(missing).toMatchObject({ character: null, goal: null, startingItems: [], requirement: null });
  });

  it('leaves the counter values unknown with no save', async () => {
    const kb = await testKnowledgeBase();
    const list = buildOffRoute({ kb, achievements: merged.achievements, unlocked, counters: null }).counters;
    expect(list.every((c) => c.value === null)).toBe(true);
  });

  it('leaves unknown the value of a counter that sits past the end of the chunk', async () => {
    const kb = await testKnowledgeBase();
    // Chunk cut down to the first two counters: only MOM_KILLS (index 1) can be read.
    const list = buildOffRoute({ kb, achievements: merged.achievements, unlocked, counters: [0, 16] }).counters;
    expect(list.find((c) => c.id === 344)?.value).toBe(16);
    expect(new Set(list.map((c) => c.value))).toEqual(new Set([16, null]));
  });
});

function off(kb: Awaited<ReturnType<typeof testKnowledgeBase>>) {
  return buildOffRoute({ kb, achievements: merged.achievements, unlocked, counters: null });
}

describe('inferMarks and displayMarks', () => {
  it('infers the marks the achievements prove', async () => {
    const kb = await testKnowledgeBase();
    const marks = inferMarks(kb, new Set([167, 548, 262]));
    // #167: Mom's Heart on hard with Isaac.
    expect(marks.isaac.momsHeart).toBe(2);
    // #548: Isaac, ???, Satan and The Lamb with Tainted Isaac.
    expect(marks.taintedIsaac).toMatchObject({ isaac: 1, blueBaby: 1, satan: 1, lamb: 1, momsHeart: 0 });
    // #262: every mark on hard with Samson.
    expect(Object.values(marks.samson).every((level) => level === 2)).toBe(true);
    expect(marks.cain).toEqual(emptyMarks());
  });

  it('shows as unknown the marks no achievement proves', async () => {
    const kb = await testKnowledgeBase();
    const marks = inferMarks(kb, new Set());
    const shown = displayMarks(kb, marks, false);
    expect(shown.isaac.momsHeart).toBeNull();
    expect(shown.isaac.satan).toBe(0);
    expect(shown.taintedIsaac.momsHeart).toBeNull();
    expect(displayMarks(kb, marks, true).isaac.momsHeart).toBe(0);
  });

  it('ignores the multi mark achievements and Greedier when telling a single mark', async () => {
    const kb = await testKnowledgeBase();
    const shown = displayMarks(kb, inferMarks(kb, new Set()), false);
    // Tainted Isaac : Mom's Lock (#548, Isaac, ???, Satan, The Lamb), #618 (Hush et Boss Rush) et
    // Ultra Greedier (#541) says nothing about a single mark; The Beast (#491) proves it.
    expect(shown.taintedIsaac).toMatchObject({ isaac: null, lamb: null, hush: null, bossRush: null, greed: null, beast: 0 });
    // Isaac: Ultra Greed (#192) proves the Greed mark.
    expect(shown.isaac.greed).toBe(0);
  });
});
