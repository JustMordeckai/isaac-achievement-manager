import { ENDINGS } from '../../shared/endings.ts';
import { DEFAULT_LOCALE } from '../../shared/i18n/index.ts';
import type { AchievementState, CardPlan, RoutePlan } from '../../shared/types.ts';
import type { KnowledgeBase } from '../wiki/kb-types.ts';
import { requirementGroups, toRequirements } from './requirements.ts';

/**
 * Requirements of an achievement and the runs of the plan that get or prepare it. `plan` already
 * carries its own locale (run notes and steps were built with it); the only text this function
 * itself formats is `toRequirements`'s `#{id}` fallback for an unnamed achievement, which reads
 * the same in every served language, so it is always built in English.
 */
export function cardPlan(kb: KnowledgeBase, plan: RoutePlan, achievements: AchievementState[], id: number): CardPlan {
  const names = new Map(achievements.map((a) => [a.id, a.name]));
  const unlocked = new Set(achievements.filter((a) => a.unlocked).map((a) => a.id));
  const how = kb.achievements.find((a) => a.id === id)?.how;
  let groups: number[][] = [];
  if (how?.kind === 'mark') groups = requirementGroups(how.character, [how.ending]);
  else if (how?.kind === 'multi-mark') groups = requirementGroups(how.character, how.endings);
  else if (how?.kind === 'hard-all') {
    // All marks on hard: every ending must be reachable (spec section 7.6).
    groups = requirementGroups(how.character, ENDINGS.map((e) => e.id));
  } else if (how?.kind === 'closet') groups = requirementGroups(how.character, ['beast']);
  else if (how?.kind === 'challenge') {
    const requirement = plan.offRoute.challenges.find((c) => c.id === id)?.requirement;
    groups = requirement ? [requirement.anyOf.map((a) => a.id)] : [];
  }
  const has = (list: Array<{ id: number }>) => list.some((a) => a.id === id);
  return {
    requirements: toRequirements(groups, names, unlocked, DEFAULT_LOCALE),
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
