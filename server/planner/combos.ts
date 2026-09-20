import type { EndingId } from '../../shared/endings.ts';
import { t, type Locale, type MessageKey } from '../../shared/i18n/index.ts';
import { TARGETS } from './targets.ts';

export type RouteKind = 'mom' | 'main' | 'mother' | 'beast' | 'greed' | 'greedier';

export interface RouteOption {
  kind: RouteKind;
  /** Endings reached, in order. */
  endings: EndingId[];
  /** Achievements required by the sequence itself, on top of the endings'. */
  extraRequires: number[];
  minutes: number;
}

/**
 * Hand-estimated durations, in minutes (to adjust): base run plus a supplement per ending.
 * No source: these are orders of magnitude to compare runs against each other.
 */
export const MINUTES = {
  mom: 20,
  main: 30,
  mother: 55,
  beast: 60,
  greed: 35,
  greedier: 45,
  bossRush: 8,
  hush: 12,
  cathedralOrSheol: 12,
  chestOrDarkRoom: 12,
  megaSatan: 8,
  delirium: 15,
};

/** Hush already beaten once (New Area): without it, the first win over Hush ends the run. */
const HUSH_DEFEATED = 320;

const BRANCHES: EndingId[][] = [
  [],
  ['isaac'],
  ['satan'],
  ['isaac', 'blueBaby'],
  ['satan', 'lamb'],
  ['isaac', 'blueBaby', 'megaSatan'],
  ['satan', 'lamb', 'megaSatan'],
];

/** Endings after which a portal to The Void is guaranteed (Repentance+, The Void unlocked). */
const VOID_AFTER: EndingId[] = ['hush', 'blueBaby', 'lamb', 'megaSatan'];

function mainOptions(): RouteOption[] {
  const options: RouteOption[] = [];
  for (const bossRush of [false, true]) {
    for (const hush of [false, true]) {
      for (const branch of BRANCHES) {
        const before: EndingId[] = [...(bossRush ? ['bossRush' as const] : []), 'momsHeart', ...(hush ? ['hush' as const] : [])];
        const last = [...before, ...branch].at(-1) as EndingId;
        for (const delirium of VOID_AFTER.includes(last) ? [false, true] : [false]) {
          const endings = [...before, ...branch, ...(delirium ? ['delirium' as const] : [])];
          // Continuing after Hush assumes it was already beaten in a previous run.
          const extraRequires = hush && endings.at(-1) !== 'hush' ? [HUSH_DEFEATED] : [];
          const minutes =
            MINUTES.main +
            (bossRush ? MINUTES.bossRush : 0) +
            (hush ? MINUTES.hush : 0) +
            (branch.length > 0 ? MINUTES.cathedralOrSheol : 0) +
            (branch.length > 1 ? MINUTES.chestOrDarkRoom : 0) +
            (branch.length > 2 ? MINUTES.megaSatan : 0) +
            (delirium ? MINUTES.delirium : 0);
          options.push({ kind: 'main', endings, extraRequires, minutes });
        }
      }
    }
  }
  return options;
}

/** Every possible run, from the combinations checked on the wiki (Completion Marks, Hush, The Void, Mother, Home). */
export const ROUTE_OPTIONS: RouteOption[] = [
  // First run of a fresh profile: beating Mom opens up the rest (The Womb).
  { kind: 'mom', endings: [], extraRequires: [], minutes: MINUTES.mom },
  ...mainOptions(),
  { kind: 'mother', endings: ['mother'], extraRequires: [], minutes: MINUTES.mother },
  { kind: 'mother', endings: ['bossRush', 'mother'], extraRequires: [], minutes: MINUTES.mother + MINUTES.bossRush },
  { kind: 'beast', endings: ['beast'], extraRequires: [], minutes: MINUTES.beast },
  { kind: 'beast', endings: ['bossRush', 'beast'], extraRequires: [], minutes: MINUTES.beast + MINUTES.bossRush },
  { kind: 'greed', endings: ['ultraGreed'], extraRequires: [], minutes: MINUTES.greed },
  { kind: 'greedier', endings: ['ultraGreedier'], extraRequires: [], minutes: MINUTES.greedier },
];

const MOTHER_PATH: MessageKey[] = [
  'planner.step.motherBasementDoor',
  'planner.step.motherDownpourMirror',
  'planner.step.motherMinesDoor',
  'planner.step.motherMinecart',
  'planner.step.motherMausoleumEntry',
];

const BEAST_PATH: MessageKey[] = ['planner.step.beastBasementCaves', 'planner.step.beastDepthsMom'];

/** Run's path, step by step. */
export function routeSteps(option: RouteOption, locale: Locale): string[] {
  const has = (ending: EndingId) => option.endings.includes(ending);
  const bossRush = has('bossRush') ? [t(locale, TARGETS.bossRush.step)] : [];
  switch (option.kind) {
    case 'mom':
      return [t(locale, 'planner.step.momRun')];
    case 'greed':
      return [t(locale, 'planner.step.startGreed'), t(locale, 'planner.step.clearGreedWaves'), t(locale, TARGETS.ultraGreed.step)];
    case 'greedier':
      return [
        t(locale, 'planner.step.startGreedier'),
        t(locale, 'planner.step.clearGreedWaves'),
        t(locale, TARGETS.ultraGreedier.step),
      ];
    case 'mother':
      return [
        ...MOTHER_PATH.map((key) => t(locale, key)),
        t(locale, 'planner.step.motherBattleMom'),
        ...bossRush,
        t(locale, 'planner.step.motherKnifeDoor'),
        t(locale, TARGETS.mother.step),
      ];
    case 'beast':
      return [
        ...BEAST_PATH.map((key) => t(locale, key)),
        ...bossRush,
        t(locale, 'planner.step.beastTeleport'),
        t(locale, 'planner.step.beastDadsNote'),
        t(locale, 'planner.step.beastHomeChest'),
        t(locale, TARGETS.beast.step),
      ];
    case 'main': {
      const steps: string[] = [];
      if (has('megaSatan')) steps.push(t(locale, 'planner.step.mainAngelStatues'));
      steps.push(t(locale, 'planner.step.momRun'));
      if (has('blueBaby')) steps.push(t(locale, 'planner.step.mainTakePolaroid'));
      if (has('lamb')) steps.push(t(locale, 'planner.step.mainTakeNegative'));
      steps.push(...bossRush, t(locale, TARGETS.momsHeart.step));
      if (has('hush')) steps.push(t(locale, TARGETS.hush.step));
      for (const ending of ['isaac', 'satan', 'blueBaby', 'lamb', 'megaSatan', 'delirium'] as const) {
        if (has(ending)) steps.push(t(locale, TARGETS[ending].step));
      }
      return steps;
    }
  }
}
