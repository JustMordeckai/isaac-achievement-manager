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
  names: Map<number, string>;
  /** Succès obtenus, plus ceux déjà promis par une run retenue. */
  claimed: Set<number>;
  unlocked: ReadonlySet<number>;
  counters: readonly number[] | null;
  /** Compteur de la sauvegarde et fin comptée, pour chaque succès « battre X n fois » reconnu. */
  killCounters: Map<number, { index: number; ending: EndingId }>;
  byCharacter: Map<CharacterId, KbAchievement[]>;
  others: KbAchievement[];
}

/** Situation dans laquelle on évalue une run. */
interface State {
  /** Marques du personnage. */
  marks: CharacterMarks;
  /** Fins déjà battues par au moins un personnage. */
  beaten: ReadonlySet<EndingId>;
}

/** Marque à élever jusqu'à un niveau pour un succès encore visé. */
interface Pair {
  mark: MarkId;
  level: MarkLevel;
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

function required(ending: EndingId, hard: boolean): Pair {
  const { mark, level } = markForEnding(ending);
  return { mark, level: hard ? 2 : level };
}

/** Succès « toutes les marques en difficile » du personnage, s'il en a un. */
function hardAllOf(byCharacter: Map<CharacterId, KbAchievement[]>, character: CharacterId): KbAchievement | undefined {
  return (byCharacter.get(character) ?? []).find((a) => a.how.kind === 'hard-all');
}

function gainsFor(ctx: Context, character: CharacterId, state: State, option: RouteOption, mode: RunMode): number[] {
  const { marks, beaten } = state;
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
  const inRun = (boss: string) => {
    if (boss === 'Mom') return normalRun;
    const ending = endingByName(boss);
    return ending !== null && option.endings.includes(ending.id);
  };
  const beatenBefore = (boss: string) => {
    const ending = endingByName(boss);
    return ending !== null && beaten.has(ending.id);
  };
  for (const achievement of ctx.others) {
    if (ctx.claimed.has(achievement.id)) continue;
    const how = achievement.how;
    if (how.kind === 'boss') {
      if (how.bosses.every((boss) => inRun(boss) || beatenBefore(boss)) && how.bosses.some(inRun)) {
        gains.push(achievement.id);
      }
    } else if (how.kind === 'counter' && ctx.counters) {
      const kill = ctx.killCounters.get(achievement.id);
      const value = kill ? ctx.counters[kill.index] : undefined;
      if (kill && value !== undefined && option.endings.includes(kill.ending) && value + 1 >= how.total) {
        gains.push(achievement.id);
      }
    }
  }
  return gains;
}

function requirementKey(requirement: Requirement): string {
  return requirement.anyOf.map((a) => a.id).join('|');
}

/** Ajoute à une liste de prérequis ceux qui n'y figurent pas encore. */
function mergeRequirements(list: Requirement[], extra: Requirement[]): Requirement[] {
  const seen = new Set(list.map(requirementKey));
  const merged = [...list];
  for (const requirement of extra) {
    const key = requirementKey(requirement);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(requirement);
  }
  return merged;
}

/**
 * Prérequis manquants d'une run. Si un de ses gains n'existe que grâce aux runs déjà retenues (il
 * n'apparaît pas face à l'état réel), elle hérite des prérequis manquants des runs bloquées du personnage.
 */
function missingFor(
  ctx: Context,
  character: CharacterId,
  option: RouteOption,
  mode: RunMode,
  gains: number[],
  real: State,
  blocked: Requirement[],
): Requirement[] {
  const missing = toRequirements(
    requirementGroups(character, option.endings, option.extraRequires),
    ctx.names,
    ctx.unlocked,
  ).filter((r) => !r.met);
  if (blocked.length === 0 || gains.length === 0) return missing;
  const realGains = new Set(gainsFor(ctx, character, real, option, mode));
  return gains.every((id) => realGains.has(id)) ? missing : mergeRequirements(missing, blocked);
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
  /** Succès visés dont la run élève au moins une marque (run de préparation). */
  prepares: number[];
  /** Nombre de marques distinctes élevées vers un succès visé (run de préparation). */
  raised: number;
  missing: Requirement[];
}

function better(a: Candidate, b: Candidate, value: (c: Candidate) => number): boolean {
  const playableA = a.missing.length === 0;
  const playableB = b.missing.length === 0;
  if (playableA !== playableB) return playableA;
  // Le plus de succès par run (spec §7.4), ou de marques élevées, puis la run la plus courte.
  if (value(a) !== value(b)) return value(a) > value(b);
  return a.option.minutes < b.option.minutes;
}

interface Search {
  ctx: Context;
  character: CharacterId;
  /** Marques du personnage après les runs déjà retenues, et fins battues par les runs jouables. */
  state: State;
  /** État réel, avant toute run planifiée. */
  real: State;
  hard: boolean;
  /** Prérequis manquants des runs bloquées déjà retenues pour ce personnage. */
  blocked: Requirement[];
}

/** Run qui rapporte le plus de succès tout de suite. */
function bestRun({ ctx, character, state, real, hard, blocked }: Search): Candidate | null {
  let best: Candidate | null = null;
  for (const option of ROUTE_OPTIONS) {
    const mode = modeFor(option, hard);
    const gains = gainsFor(ctx, character, state, option, mode);
    if (gains.length === 0) continue;
    const missing = missingFor(ctx, character, option, mode, gains, real, blocked);
    const candidate: Candidate = { option, mode, gains, prepares: [], raised: 0, missing };
    if (!best || better(candidate, best, (c) => c.gains.length)) best = candidate;
  }
  return best;
}

/** Marques encore à élever pour chaque succès `hard-all` ou `multi-mark` visé par le personnage. */
function pendingTargets(ctx: Context, character: CharacterId, marks: CharacterMarks) {
  const targets: Array<{ id: number; pairs: Pair[] }> = [];
  for (const achievement of ctx.byCharacter.get(character) ?? []) {
    if (ctx.claimed.has(achievement.id)) continue;
    const how = achievement.how;
    let pairs: Pair[] = [];
    if (how.kind === 'hard-all') {
      pairs = MARK_IDS.filter((mark) => marks[mark] < 2).map((mark) => ({ mark, level: 2 }));
    } else if (how.kind === 'multi-mark') {
      pairs = how.endings.map((e) => required(e, how.hard)).filter((need) => marks[need.mark] < need.level);
    }
    if (pairs.length > 0) targets.push({ id: achievement.id, pairs });
  }
  return targets;
}

/**
 * Run de préparation, quand aucune run ne rapporte de succès : celle qui élève le plus de marques
 * encore exigées par un succès visé (note complète en plusieurs runs, fins d'un `multi-mark` qui ne
 * tiennent pas dans une seule run).
 */
function bestPreparation({ ctx, character, state, real, hard, blocked }: Search): Candidate | null {
  const targets = pendingTargets(ctx, character, state.marks);
  if (targets.length === 0) return null;
  let best: Candidate | null = null;
  for (const option of ROUTE_OPTIONS) {
    const mode = modeFor(option, hard);
    const provided = providedMarks(option.endings, mode);
    const raised = new Set<string>();
    const prepares: number[] = [];
    for (const { id, pairs } of targets) {
      const hit = pairs.filter((pair) => (provided.get(pair.mark) ?? 0) >= pair.level);
      if (hit.length === 0) continue;
      prepares.push(id);
      for (const pair of hit) raised.add(`${pair.mark}:${pair.level}`);
    }
    if (raised.size === 0) continue;
    const missing = missingFor(ctx, character, option, mode, [], real, blocked);
    const candidate: Candidate = { option, mode, gains: [], prepares, raised: raised.size, missing };
    if (!best || better(candidate, best, (c) => c.raised)) best = candidate;
  }
  return best;
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
  const killCounters = new Map<number, { index: number; ending: EndingId }>();
  for (const achievement of kb.achievements) {
    const how = achievement.how;
    if (how.kind === 'mark' || how.kind === 'multi-mark' || how.kind === 'hard-all' || how.kind === 'closet') {
      const list = byCharacter.get(how.character) ?? [];
      list.push(achievement);
      byCharacter.set(how.character, list);
    } else if (how.kind === 'boss' || how.kind === 'counter') {
      others.push(achievement);
    }
    if (how.kind === 'counter') {
      const index = counterIndex(achievement.condition);
      const ending = index === null ? undefined : KILL_COUNTERS.get(index);
      if (index !== null && ending) killCounters.set(achievement.id, { index, ending });
    }
  }
  const ctx: Context = {
    names,
    claimed: new Set(unlocked),
    unlocked,
    counters: save?.counters ?? null,
    killCounters,
    byCharacter,
    others,
  };
  const current = save?.marks ?? inferMarks(kb, unlocked);
  const realBeaten = beatenEndings(current);
  // Fins battues en vrai, plus celles des runs jouables déjà retenues.
  const beaten = new Set(realBeaten);
  const shown = displayMarks(kb, current, save?.marks != null);

  const runs: PlannedRun[] = [];
  for (const { id: character } of CHARACTERS) {
    const marks = { ...current[character] };
    const hardAll = hardAllOf(byCharacter, character);
    const search: Search = {
      ctx,
      character,
      state: { marks, beaten },
      real: { marks: current[character], beaten: realBeaten },
      hard: hardAll !== undefined && !unlocked.has(hardAll.id),
      blocked: [],
    };
    const coefficient = CHARACTER_INFO[character].coefficient;
    for (let n = 1; n <= MAX_RUNS; n++) {
      const best = bestRun(search) ?? bestPreparation(search);
      if (!best) break;
      for (const id of best.gains) ctx.claimed.add(id);
      if (best.missing.length === 0) {
        for (const ending of best.option.endings) beaten.add(ending);
      } else {
        search.blocked = mergeRequirements(search.blocked, best.missing);
      }
      applyRun(marks, best.option.endings, best.mode);
      const named = (id: number) => ({ id, name: names.get(id) ?? `#${id}` });
      runs.push({
        id: `${character}-${n}`,
        character,
        mode: best.mode,
        endings: best.option.endings,
        steps: routeSteps(best.option),
        achievements: best.gains.map(named),
        prepares: best.prepares.map(named),
        minutes: best.option.minutes,
        // Succès par heure de jeu, pondérés par la facilité du personnage (0 pour une run de préparation).
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
      const hardAll = hardAllOf(byCharacter, id);
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
