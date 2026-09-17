import { CHARACTERS, type CharacterId } from '../../shared/characters.ts';
import { ENDINGS, endingByName, type EndingId } from '../../shared/endings.ts';
import {
  type CharacterMarks,
  type CompletionMarks,
  MARK_IDS,
  markForEnding,
  type MarkId,
  type MarkLevel,
} from '../../shared/marks.ts';
import type { AchievementState, PlannedRun, Requirement, RoutePlan, RunMode } from '../../shared/types.ts';
import type { SaveProgress } from '../sources/progress.ts';
import type { KbAchievement, KnowledgeBase } from '../wiki/kb-types.ts';
import { CHARACTER_INFO, isCharacterUnlocked } from './characters.ts';
import { ROUTE_OPTIONS, type RouteOption, routeSteps } from './combos.ts';
import { counterIndex } from './counters.ts';
import { displayMarks, inferMarks } from './marks.ts';
import { buildOffRoute } from './off-route.ts';
import { requirementGroups, toRequirements } from './requirements.ts';

export interface PlanInput {
  kb: KnowledgeBase;
  /** Liste fusionnée des succès (nom et état). */
  achievements: AchievementState[];
  save: SaveProgress | null;
}

/** Compteurs de victoires sur les fins, pour créditer « battre X n fois ». */
const KILL_COUNTERS = new Map<number, EndingId>([
  [1, 'momsHeart'],
  [11, 'isaac'],
  [13, 'satan'],
  [158, 'hush'],
]);

/** Nombre maximal de runs proposées par personnage. */
const MAX_RUNS = 12;

interface Context {
  kb: KnowledgeBase;
  names: Map<number, string>;
  /** Succès obtenus, plus ceux déjà promis par une run retenue. */
  claimed: Set<number>;
  unlocked: ReadonlySet<number>;
  counters: readonly number[] | null;
  byCharacter: Map<CharacterId, KbAchievement[]>;
  others: KbAchievement[];
  /** Fins déjà battues par au moins un personnage, ou promises par une run retenue. */
  beaten: Set<EndingId>;
}

function providedMarks(endings: EndingId[], mode: RunMode): Map<MarkId, MarkLevel> {
  const provided = new Map<MarkId, MarkLevel>();
  for (const ending of endings) {
    const { mark, level } = markForEnding(ending);
    const value: MarkLevel = mode === 'hard' ? 2 : level;
    if (value > (provided.get(mark) ?? 0)) provided.set(mark, value);
  }
  return provided;
}

function required(ending: EndingId, hard: boolean): { mark: MarkId; level: MarkLevel } {
  const { mark, level } = markForEnding(ending);
  return { mark, level: hard ? 2 : level };
}

function gainsFor(
  ctx: Context,
  character: CharacterId,
  marks: CharacterMarks,
  option: RouteOption,
  mode: RunMode,
): number[] {
  const provided = providedMarks(option.endings, mode);
  const reaches = (ending: EndingId, hard: boolean) => {
    const need = required(ending, hard);
    return (provided.get(need.mark) ?? 0) >= need.level;
  };
  const has = (ending: EndingId, hard: boolean) => {
    const need = required(ending, hard);
    return Math.max(marks[need.mark], provided.get(need.mark) ?? 0) >= need.level;
  };
  const gains: number[] = [];
  for (const achievement of ctx.byCharacter.get(character) ?? []) {
    if (ctx.claimed.has(achievement.id)) continue;
    const how = achievement.how;
    let gained = false;
    if (how.kind === 'mark') gained = reaches(how.ending, how.hard);
    else if (how.kind === 'multi-mark') {
      gained = how.endings.every((e) => has(e, how.hard)) && how.endings.some((e) => reaches(e, how.hard));
    } else if (how.kind === 'hard-all') {
      // Attribué à la run qui complète la note : toutes les marques en difficile après elle, pas avant.
      gained =
        MARK_IDS.every((mark) => Math.max(marks[mark], provided.get(mark) ?? 0) === 2) &&
        MARK_IDS.some((mark) => marks[mark] < 2);
    } else if (how.kind === 'closet') gained = option.endings.includes('beast');
    if (gained) gains.push(achievement.id);
  }
  const normalRun = option.kind !== 'greed' && option.kind !== 'greedier';
  for (const achievement of ctx.others) {
    if (ctx.claimed.has(achievement.id)) continue;
    const how = achievement.how;
    if (how.kind === 'boss') {
      const beaten = how.bosses.every((boss) => {
        if (boss === 'Mom') return normalRun;
        const ending = endingByName(boss);
        return ending !== null && (option.endings.includes(ending.id) || ctx.beaten.has(ending.id));
      });
      if (beaten && how.bosses.some((boss) => boss === 'Mom' || option.endings.includes(endingByName(boss)?.id as EndingId))) {
        gains.push(achievement.id);
      }
    } else if (how.kind === 'counter' && ctx.counters) {
      const index = counterIndex(achievement.condition);
      const ending = index === null ? undefined : KILL_COUNTERS.get(index);
      if (index !== null && ending && option.endings.includes(ending) && ctx.counters[index] + 1 >= how.total) {
        gains.push(achievement.id);
      }
    }
  }
  return gains;
}

function requirementsFor(ctx: Context, character: CharacterId, option: RouteOption): Requirement[] {
  return toRequirements(requirementGroups(character, option.endings, option.extraRequires), ctx.names, ctx.unlocked);
}

function modeFor(option: RouteOption, hard: boolean): RunMode {
  if (option.kind === 'greed' || option.kind === 'greedier') return option.kind;
  return hard ? 'hard' : 'normal';
}

function applyRun(marks: CharacterMarks, endings: EndingId[], mode: RunMode): void {
  for (const [mark, level] of providedMarks(endings, mode)) {
    if (level > marks[mark]) marks[mark] = level;
  }
}

interface Candidate {
  option: RouteOption;
  mode: RunMode;
  gains: number[];
  missing: Requirement[];
}

function better(a: Candidate, b: Candidate): boolean {
  const playableA = a.missing.length === 0;
  const playableB = b.missing.length === 0;
  if (playableA !== playableB) return playableA;
  // Le plus de succès par run (spec §7.4), puis la run la plus courte.
  if (a.gains.length !== b.gains.length) return a.gains.length > b.gains.length;
  return a.option.minutes < b.option.minutes;
}

/** Fins dont la marque est déjà obtenue par au moins un personnage. */
function beatenEndings(marks: CompletionMarks): Set<EndingId> {
  const beaten = new Set<EndingId>();
  for (const ending of ENDINGS) {
    const { mark, level } = markForEnding(ending.id);
    if (Object.values(marks).some((m) => m[mark] >= level)) beaten.add(ending.id);
  }
  return beaten;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Runs à faire pour chaque personnage, triées : jouables d'abord, puis par score. */
export function buildPlan({ kb, achievements, save }: PlanInput): RoutePlan {
  const unlocked = new Set(achievements.filter((a) => a.unlocked).map((a) => a.id));
  const names = new Map(achievements.map((a) => [a.id, a.name]));
  const byCharacter = new Map<CharacterId, KbAchievement[]>();
  const others: KbAchievement[] = [];
  for (const achievement of kb.achievements) {
    const how = achievement.how;
    if (how.kind === 'mark' || how.kind === 'multi-mark' || how.kind === 'hard-all' || how.kind === 'closet') {
      const list = byCharacter.get(how.character) ?? [];
      list.push(achievement);
      byCharacter.set(how.character, list);
    } else if (how.kind === 'boss' || how.kind === 'counter') {
      others.push(achievement);
    }
  }
  const ctx: Context = {
    kb,
    names,
    claimed: new Set(unlocked),
    unlocked,
    counters: save?.counters ?? null,
    byCharacter,
    others,
    beaten: new Set(),
  };
  const current = save?.marks ?? inferMarks(kb, unlocked);
  ctx.beaten = beatenEndings(current);
  const shown = displayMarks(kb, current, save?.marks != null);

  const runs: PlannedRun[] = [];
  for (const { id: character } of CHARACTERS) {
    const marks = { ...current[character] };
    const hardAll = (byCharacter.get(character) ?? []).find((a) => a.how.kind === 'hard-all');
    const hard = hardAll !== undefined && !unlocked.has(hardAll.id);
    const coefficient = CHARACTER_INFO[character].coefficient;
    for (let n = 1; n <= MAX_RUNS; n++) {
      let best: Candidate | null = null;
      for (const option of ROUTE_OPTIONS) {
        const mode = modeFor(option, hard);
        const gains = gainsFor(ctx, character, marks, option, mode);
        if (gains.length === 0) continue;
        const candidate: Candidate = {
          option,
          mode,
          gains,
          missing: requirementsFor(ctx, character, option).filter((r) => !r.met),
        };
        if (!best || better(candidate, best)) best = candidate;
      }
      if (!best) break;
      for (const id of best.gains) ctx.claimed.add(id);
      for (const ending of best.option.endings) ctx.beaten.add(ending);
      applyRun(marks, best.option.endings, best.mode);
      runs.push({
        id: `${character}-${n}`,
        character,
        mode: best.mode,
        endings: best.option.endings,
        steps: routeSteps(best.option),
        achievements: best.gains.map((id) => ({ id, name: names.get(id) ?? `#${id}` })),
        minutes: best.option.minutes,
        // Succès par heure de jeu, pondérés par la facilité du personnage.
        score: round((best.gains.length * coefficient * 60) / best.option.minutes),
        missing: best.missing,
        note: CHARACTER_INFO[character].note,
      });
    }
  }

  const order = new Map(CHARACTERS.map((c, i) => [c.id, i]));
  runs.sort(
    (a, b) =>
      Number(a.missing.length > 0) - Number(b.missing.length > 0) ||
      b.score - a.score ||
      (order.get(a.character) ?? 0) - (order.get(b.character) ?? 0),
  );

  return {
    marksSource: save?.marks ? 'save' : 'inferred',
    characters: CHARACTERS.map(({ id }) => {
      const hardAll = (byCharacter.get(id) ?? []).find((a) => a.how.kind === 'hard-all');
      return {
        id,
        unlocked: isCharacterUnlocked(id, unlocked),
        marks: shown[id],
        hardAll: hardAll ? unlocked.has(hardAll.id) : null,
      };
    }),
    runs,
    offRoute: buildOffRoute({ kb, achievements, unlocked, counters: ctx.counters }),
  };
}
