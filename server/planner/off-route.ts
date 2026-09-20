import { endingByName } from '../../shared/endings.ts';
import type { AchievementState, ChallengeTodo, MiscTodo, OffRoute } from '../../shared/types.ts';
import type { KnowledgeBase } from '../wiki/kb-types.ts';
import { counterIndex } from './counters.ts';

export interface OffRouteInput {
  kb: KnowledgeBase;
  achievements: AchievementState[];
  unlocked: ReadonlySet<number>;
  counters: readonly number[] | null;
}

const RED_KEY = 415;

/** A "beat X" achievement whose bosses are all run endings is already offered by the routes. */
function coveredByRuns(bosses: string[]): boolean {
  return bosses.every((boss) => boss === 'Mom' || endingByName(boss) !== null);
}

/** Challenges, counters, Home closets and miscellaneous achievements still to unlock. */
export function buildOffRoute({ kb, achievements, unlocked, counters }: OffRouteInput): OffRoute {
  const states = new Map(achievements.map((a) => [a.id, a]));
  const byWikiName = new Map(kb.achievements.map((a) => [a.wikiName.toLowerCase(), a.id]));
  const todo = kb.achievements.filter((a) => states.has(a.id) && !unlocked.has(a.id));
  const name = (id: number) => states.get(id)?.name ?? `#${id}`;

  const challenges: ChallengeTodo[] = [];
  const counterList: OffRoute['counters'] = [];
  const closets: OffRoute['closets'] = [];
  const misc: MiscTodo[] = [];
  for (const achievement of todo) {
    const how = achievement.how;
    const state = states.get(achievement.id);
    if (!state) continue;
    if (how.kind === 'challenge') {
      const challenge = kb.challenges.find((c) => c.number === how.number);
      const requiredId = challenge?.unlockedBy ? byWikiName.get(challenge.unlockedBy.toLowerCase()) : undefined;
      challenges.push({
        id: achievement.id,
        name: state.name,
        number: how.number,
        title: challenge?.title ?? null,
        character: challenge?.character ?? null,
        goal: challenge?.goal ?? null,
        curse: challenge?.curse ?? null,
        startingItems: challenge?.startingItems ?? [],
        requirement:
          requiredId === undefined
            ? null
            : { anyOf: [{ id: requiredId, name: name(requiredId) }], met: unlocked.has(requiredId) },
      });
    } else if (how.kind === 'counter') {
      const index = counterIndex(achievement.condition);
      counterList.push({
        id: achievement.id,
        name: state.name,
        condition: achievement.condition,
        total: how.total,
        value: index !== null && counters ? (counters[index] ?? null) : null,
      });
    } else if (how.kind === 'closet') {
      closets.push({ id: achievement.id, name: state.name, character: how.character });
    } else if (how.kind === 'misc' || (how.kind === 'boss' && !coveredByRuns(how.bosses))) {
      misc.push({ id: achievement.id, name: state.name, condition: achievement.condition, dlc: state.dlc });
    }
  }
  challenges.sort((a, b) => a.number - b.number);
  // The counters closest to their total first, the unknown ones last.
  const ratio = (c: OffRoute['counters'][number]) => (c.value === null ? -1 : Math.min(1, c.value / c.total));
  counterList.sort((a, b) => ratio(b) - ratio(a) || a.id - b.id);
  return { challenges, counters: counterList, closets, redKey: unlocked.has(RED_KEY), misc };
}
