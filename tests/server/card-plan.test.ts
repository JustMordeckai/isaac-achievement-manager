import { describe, expect, it } from 'vitest';
import { cardPlan } from '../../server/planner/card-plan.ts';
import { buildPlan } from '../../server/planner/plan.ts';
import { mergeProgress } from '../../server/sources/progress.ts';
import { type CharacterMarks, MARK_IDS } from '../../shared/marks.ts';
import { fixtureMergeInput } from './helpers/merge-input.ts';
import { testKnowledgeBase } from './helpers/kb.ts';

const merged = mergeProgress(fixtureMergeInput());

async function card(id: number) {
  const kb = await testKnowledgeBase();
  return cardPlan(kb, buildPlan({ kb, ...merged }), merged.achievements, id);
}

const requirement = (id: number, name: string, met: boolean) => ({ anyOf: [{ id, name }], met });

describe('cardPlan', () => {
  it('donne le prérequis d’un défi', async () => {
    // #94 : défi n°6 (Solar System), débloqué par le succès du même nom.
    expect(await card(94)).toEqual({ requirements: [{ anyOf: [{ id: 159, name: 'Solar System' }], met: true }], runs: [] });
  });

  it('rattache un placard de Home à la route de The Beast', async () => {
    expect(await card(474)).toEqual({
      requirements: [
        { anyOf: [{ id: 635, name: 'A Strange Door' }], met: false },
        { anyOf: [{ id: 57, name: 'The Polaroid' }, { id: 78, name: 'The Negative' }], met: true },
      ],
      runs: [
        {
          id: 'isaac-4',
          character: 'isaac',
          mode: 'hard',
          endings: ['beast'],
          minutes: 60,
          blocked: true,
          preparation: false,
        },
      ],
    });
  });

  it('indique la run qui complète toutes les marques en difficile et les prérequis de toutes les fins', async () => {
    expect(await card(253)).toEqual({
      requirements: [
        requirement(4, 'The Womb', true),
        requirement(34, 'It Lives!', true),
        requirement(57, 'The Polaroid', false),
        requirement(78, 'The Negative', true),
        requirement(155, 'Angels', true),
        requirement(234, 'Blue Womb', true),
        requirement(320, 'New Area', true),
        requirement(407, 'A Secret Exit', false),
        requirement(635, 'A Strange Door', false),
        { anyOf: [{ id: 57, name: 'The Polaroid' }, { id: 78, name: 'The Negative' }], met: true },
        requirement(341, 'Greedier!', false),
      ],
      runs: [
        {
          id: 'isaac-5',
          character: 'isaac',
          mode: 'greedier',
          endings: ['ultraGreedier'],
          minutes: 45,
          blocked: true,
          preparation: false,
        },
      ],
    });
  });

  it('signale les runs de préparation d’un succès', async () => {
    // Isaac : tout en difficile sauf Mother et The Beast ; seul Buddy Baby (#253) manque.
    const kb = await testKnowledgeBase();
    const achievements = merged.achievements.map((a) => ({ ...a, unlocked: a.id !== 253 }));
    const marks = merged.save?.marks;
    if (!merged.save || !marks) throw new Error('La sauvegarde de la fixture doit contenir les marques.');
    const hard = Object.fromEntries(MARK_IDS.map((mark) => [mark, 2])) as CharacterMarks;
    const save = { ...merged.save, marks: { ...marks, isaac: { ...hard, mother: 1 as const, beast: 1 as const } } };
    const plan = buildPlan({ kb, achievements, save });
    expect(cardPlan(kb, plan, achievements, 253).runs).toEqual([
      { id: 'isaac-2', character: 'isaac', mode: 'hard', endings: ['beast'], minutes: 60, blocked: false, preparation: false },
      { id: 'isaac-1', character: 'isaac', mode: 'hard', endings: ['mother'], minutes: 55, blocked: false, preparation: true },
    ]);
  });

  it('ne donne rien pour un succès sans méthode planifiable', async () => {
    // #638 : Play Online.
    expect(await card(638)).toEqual({ requirements: [], runs: [] });
  });
});
