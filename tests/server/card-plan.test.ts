import { describe, expect, it } from 'vitest';
import { cardPlan } from '../../server/planner/card-plan.ts';
import { buildPlan } from '../../server/planner/plan.ts';
import { mergeProgress } from '../../server/sources/progress.ts';
import { fixtureMergeInput } from './helpers/merge-input.ts';
import { testKnowledgeBase } from './helpers/kb.ts';

const merged = mergeProgress(fixtureMergeInput());

async function card(id: number) {
  const kb = await testKnowledgeBase();
  return cardPlan(kb, buildPlan({ kb, ...merged }), merged.achievements, id);
}

describe('cardPlan', () => {
  it('donne le prérequis d\'un défi', async () => {
    // #94 : défi n°6 (Solar System), débloqué par le succès du même nom.
    expect(await card(94)).toEqual({ requirements: [{ anyOf: [{ id: 159, name: 'Solar System' }], met: true }], runs: [] });
  });

  it('rattache un placard de Home à la route de The Beast', async () => {
    expect(await card(474)).toEqual({
      requirements: [
        { anyOf: [{ id: 635, name: 'A Strange Door' }], met: false },
        { anyOf: [{ id: 57, name: 'The Polaroid' }, { id: 78, name: 'The Negative' }], met: true },
      ],
      runs: [{ id: 'isaac-4', character: 'isaac', mode: 'hard', endings: ['beast'], minutes: 60 }],
    });
  });

  it('indique la run qui complète toutes les marques en difficile', async () => {
    expect(await card(253)).toEqual({
      requirements: [],
      runs: [{ id: 'isaac-5', character: 'isaac', mode: 'greedier', endings: ['ultraGreedier'], minutes: 45 }],
    });
  });

  it('ne donne rien pour un succès sans méthode planifiable', async () => {
    // #638 : Play Online.
    expect(await card(638)).toEqual({ requirements: [], runs: [] });
  });
});
