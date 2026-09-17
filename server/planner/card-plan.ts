import { ENDINGS } from '../../shared/endings.ts';
import type { AchievementState, CardPlan, RoutePlan } from '../../shared/types.ts';
import type { KnowledgeBase } from '../wiki/kb-types.ts';
import { requirementGroups, toRequirements } from './requirements.ts';

/** Prérequis d'un succès et runs du plan qui l'obtiennent ou le préparent. */
export function cardPlan(kb: KnowledgeBase, plan: RoutePlan, achievements: AchievementState[], id: number): CardPlan {
  const names = new Map(achievements.map((a) => [a.id, a.name]));
  const unlocked = new Set(achievements.filter((a) => a.unlocked).map((a) => a.id));
  const how = kb.achievements.find((a) => a.id === id)?.how;
  let groups: number[][] = [];
  if (how?.kind === 'mark') groups = requirementGroups(how.character, [how.ending]);
  else if (how?.kind === 'multi-mark') groups = requirementGroups(how.character, how.endings);
  else if (how?.kind === 'hard-all') {
    // Toutes les marques en difficile : il faut pouvoir atteindre chaque fin (spec 7.6).
    groups = requirementGroups(how.character, ENDINGS.map((e) => e.id));
  } else if (how?.kind === 'closet') groups = requirementGroups(how.character, ['beast']);
  else if (how?.kind === 'challenge') {
    const requirement = plan.offRoute.challenges.find((c) => c.id === id)?.requirement;
    groups = requirement ? [requirement.anyOf.map((a) => a.id)] : [];
  }
  const has = (list: Array<{ id: number }>) => list.some((a) => a.id === id);
  return {
    requirements: toRequirements(groups, names, unlocked),
    runs: plan.runs
      .filter((run) => has(run.achievements) || has(run.prepares))
      .map(({ id: runId, character, mode, endings, minutes, missing, prepares }) => ({
        id: runId,
        character,
        mode,
        endings,
        minutes,
        blocked: missing.length > 0,
        preparation: has(prepares),
      })),
  };
}
