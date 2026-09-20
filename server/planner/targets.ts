import type { EndingId } from '../../shared/endings.ts';
import type { MessageKey } from '../../shared/i18n/index.ts';

export interface Target {
  /** Achievements to unlock before this ending is reachable. */
  requires: number[];
  /** Groups of which at least one achievement must be unlocked. */
  requiresAny: number[][];
  /** Catalogue key of this ending's own step (game names stay in English). */
  step: MessageKey;
  /** Wiki page these facts come from. */
  source: string;
}

/**
 * Run endings, read off the wiki on 2026-09-17 (boss pages, Completion Marks, Mom, A Strange Door, Home).
 * Isaac and Satan require It Lives! (#34) for guaranteed access; before that, an Angel Room or a Devil Room is needed.
 */
export const TARGETS: Record<EndingId, Target> = {
  momsHeart: {
    requires: [4],
    requiresAny: [],
    step: 'planner.step.momsHeart',
    source: "Mom's Heart",
  },
  isaac: {
    requires: [4, 34],
    requiresAny: [],
    step: 'planner.step.isaac',
    source: 'Isaac (Boss)',
  },
  satan: {
    requires: [4, 34],
    requiresAny: [],
    step: 'planner.step.satan',
    source: 'Satan',
  },
  blueBaby: {
    requires: [57],
    requiresAny: [],
    step: 'planner.step.blueBaby',
    source: '??? (Boss)',
  },
  lamb: {
    requires: [78],
    requiresAny: [],
    step: 'planner.step.lamb',
    source: 'The Lamb',
  },
  megaSatan: {
    requires: [155],
    requiresAny: [],
    step: 'planner.step.megaSatan',
    source: 'Mega Satan',
  },
  bossRush: {
    requires: [4],
    requiresAny: [],
    step: 'planner.step.bossRush',
    source: 'Boss Rush',
  },
  hush: {
    requires: [234],
    requiresAny: [],
    step: 'planner.step.hush',
    source: 'Hush',
  },
  delirium: {
    requires: [320],
    requiresAny: [],
    step: 'planner.step.delirium',
    source: 'Delirium',
  },
  mother: {
    requires: [407],
    requiresAny: [],
    step: 'planner.step.mother',
    source: 'Mother',
  },
  beast: {
    requires: [635],
    requiresAny: [[57, 78]],
    step: 'planner.step.beast',
    source: 'The Beast',
  },
  ultraGreed: {
    requires: [],
    requiresAny: [],
    step: 'planner.step.ultraGreed',
    source: 'Ultra Greed',
  },
  ultraGreedier: {
    requires: [341],
    requiresAny: [],
    step: 'planner.step.ultraGreedier',
    source: 'Ultra Greed',
  },
};
