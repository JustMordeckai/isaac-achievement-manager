import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../server/planner/plan.ts';
import { mergeProgress } from '../../server/sources/progress.ts';
import { fixtureMergeInput } from './helpers/merge-input.ts';
import { testKnowledgeBase } from './helpers/kb.ts';

const merged = mergeProgress(fixtureMergeInput());

async function planFor(unlock: (id: number) => boolean | null, withSave: boolean) {
  const kb = await testKnowledgeBase();
  const achievements = merged.achievements.map((a) => ({ ...a, unlocked: unlock(a.id) ?? a.unlocked }));
  return buildPlan({ kb, achievements, save: withSave ? merged.save : null });
}

describe('buildPlan', () => {
  it('planifie les runs de Player à partir de sa sauvegarde', async () => {
    const plan = await planFor(() => null, true);
    expect(plan.marksSource).toBe('save');
    expect(plan.runs).toHaveLength(190);
    expect(plan.runs.filter((r) => r.missing.length === 0)).toHaveLength(31);
    const isaac = plan.runs.filter((r) => r.character === 'isaac');
    expect(isaac.map((r) => [r.id, r.mode, r.endings.join('+'), r.achievements.map((a) => a.id)])).toEqual([
      ['isaac-1', 'hard', 'bossRush+momsHeart+satan+lamb+megaSatan+delirium', [70, 205, 282, 338, 340]],
      ['isaac-2', 'hard', 'mother', [440, 405, 510, 511, 635]],
      ['isaac-5', 'greedier', 'ultraGreedier', [253, 296]],
      ['isaac-3', 'hard', 'momsHeart+isaac+blueBaby', [49, 41]],
      ['isaac-4', 'hard', 'beast', [441, 474]],
    ]);
    expect(isaac[0]).toMatchObject({ minutes: 85, score: 3.529, missing: [] });
    expect(isaac[1].missing).toEqual([{ anyOf: [{ id: 407, name: 'A Secret Exit' }], met: false }]);
  });

  it('range les runs jouables avant les autres, par score décroissant', async () => {
    const { runs } = await planFor(() => null, true);
    const playable = runs.filter((r) => r.missing.length === 0);
    expect(runs.slice(0, playable.length)).toEqual(playable);
    for (let i = 1; i < playable.length; i++) expect(playable[i - 1].score).toBeGreaterThanOrEqual(playable[i].score);
    expect(runs[0]).toMatchObject({ id: 'magdalene-1', score: 4.33 });
    expect(runs[0].steps).toHaveLength(10);
  });

  it('ne promet jamais deux fois le même succès et couvre tous les succès manquants', async () => {
    const plan = await planFor(() => null, true);
    const inRuns = plan.runs.flatMap((r) => r.achievements.map((a) => a.id));
    expect(new Set(inRuns).size).toBe(inRuns.length);
    const off = [...plan.offRoute.challenges, ...plan.offRoute.counters, ...plan.offRoute.closets, ...plan.offRoute.misc];
    const covered = new Set([...inRuns, ...off.map((x) => x.id)]);
    const locked = merged.achievements.filter((a) => !a.unlocked).map((a) => a.id);
    expect(locked.filter((id) => !covered.has(id))).toEqual([]);
  });

  it('attribue un succès à plusieurs boss à la seconde run qui les complète', async () => {
    const plan = await planFor(() => null, true);
    // Golden God! : battre ??? et The Lamb, qui ne se font pas dans la même run.
    const run = plan.runs.find((r) => r.achievements.some((a) => a.id === 41));
    expect(run?.endings).toEqual(['momsHeart', 'isaac', 'blueBaby']);
  });

  it('propose de battre Mom à un profil neuf', async () => {
    const plan = await planFor(() => false, false);
    expect(plan.marksSource).toBe('inferred');
    const playable = plan.runs.filter((r) => r.missing.length === 0);
    expect(playable.map((r) => [r.character, r.endings])).toEqual([
      ['isaac', []],
      ['isaac', ['ultraGreed']],
    ]);
    expect(playable[0].achievements.map((a) => a.id)).toEqual([4, 5, 6, 166, 265, 266, 269, 272, 274, 278]);
    expect(playable[0].steps).toEqual(['Traverser Basement, Caves et Depths, puis battre Mom en Depths II.']);
    const magdalene = plan.runs.find((r) => r.character === 'magdalene');
    expect(magdalene?.missing[0]).toEqual({ anyOf: [{ id: 1, name: 'Magdalene' }], met: false });
  });

  it("ne propose rien quand tout est débloqué", async () => {
    const plan = await planFor(() => true, false);
    expect(plan.runs).toEqual([]);
    expect(plan.offRoute).toEqual({ challenges: [], counters: [], closets: [], redKey: true, misc: [] });
    expect(plan.characters.every((c) => c.unlocked && c.hardAll !== false)).toBe(true);
  });

  it('déduit les marques des succès sans sauvegarde', async () => {
    const plan = await planFor(() => null, false);
    expect(plan.marksSource).toBe('inferred');
    expect(plan.characters[0]).toEqual({
      id: 'isaac',
      unlocked: true,
      marks: {
        momsHeart: 2,
        isaac: 1,
        satan: 1,
        bossRush: 0,
        blueBaby: 0,
        lamb: 1,
        megaSatan: 0,
        greed: 1,
        hush: 1,
        delirium: 0,
        mother: 0,
        beast: 0,
      },
      hardAll: false,
    });
    expect(plan.characters.find((c) => c.id === 'taintedIsaac')?.marks.momsHeart).toBeNull();
    expect(plan.characters.find((c) => c.id === 'taintedIsaac')?.hardAll).toBeNull();
  });

  it('ne crédite une victoire comptée que si elle suffit', async () => {
    const plan = await planFor(() => null, true);
    // Mom's Heart battu 16 fois : les paliers 21 et 30 ne tombent pas en une run.
    const counted = plan.runs.flatMap((r) => r.achievements.map((a) => a.id)).filter((id) => [344, 345].includes(id));
    expect(counted).toEqual([]);
    const oneMore = mergeProgress(fixtureMergeInput());
    const save = oneMore.save ? { ...oneMore.save, counters: oneMore.save.counters.map((v, i) => (i === 1 ? 20 : v)) } : null;
    const kb = await testKnowledgeBase();
    const next = buildPlan({ kb, achievements: oneMore.achievements, save });
    expect(next.runs.find((r) => r.achievements.some((a) => a.id === 344))?.endings).toContain('momsHeart');
  });
});
