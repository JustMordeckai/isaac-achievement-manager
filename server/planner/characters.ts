import type { CharacterId } from '../../shared/characters.ts';
import type { MessageKey } from '../../shared/i18n/index.ts';

export interface CharacterInfo {
  /** Achievement that unlocks the character, null if it is available from the start. */
  unlockedBy: number | null;
  /**
   * Ease coefficient for the score (a manual scale to adjust): 1 easy, 0.7 medium,
   * 0.4 hard (The Lost, Tainted Lost, Keeper, Tainted Keeper).
   */
  coefficient: number;
  /** Catalogue key of the reminder shown with the character's runs, null if none. */
  note: MessageKey | null;
}

const EASY = 1;
const MEDIUM = 0.7;
const HARD = 0.4;

/**
 * Unlocks read off the character pages (Unlocking section and infobox), 2026-09-17.
 * The wiki database also lists #191 as Keeper's unlock: it is a starting item, Keeper comes from #251.
 */
export const CHARACTER_INFO: Record<CharacterId, CharacterInfo> = {
  isaac: { unlockedBy: null, coefficient: EASY, note: null },
  magdalene: { unlockedBy: 1, coefficient: EASY, note: null },
  cain: { unlockedBy: 2, coefficient: EASY, note: null },
  judas: { unlockedBy: 3, coefficient: MEDIUM, note: null },
  blueBaby: { unlockedBy: 32, coefficient: EASY, note: null },
  eve: { unlockedBy: 42, coefficient: MEDIUM, note: null },
  samson: { unlockedBy: 67, coefficient: EASY, note: null },
  azazel: { unlockedBy: 79, coefficient: EASY, note: null },
  lazarus: { unlockedBy: 80, coefficient: EASY, note: null },
  eden: { unlockedBy: 81, coefficient: MEDIUM, note: 'planner.note.eden' },
  theLost: { unlockedBy: 82, coefficient: HARD, note: null },
  lilith: { unlockedBy: 199, coefficient: MEDIUM, note: null },
  keeper: { unlockedBy: 251, coefficient: HARD, note: null },
  apollyon: { unlockedBy: 340, coefficient: EASY, note: null },
  theForgotten: {
    unlockedBy: 390,
    coefficient: MEDIUM,
    note: 'planner.note.theForgotten',
  },
  bethany: { unlockedBy: 404, coefficient: MEDIUM, note: null },
  jacobAndEsau: { unlockedBy: 405, coefficient: MEDIUM, note: null },
  taintedIsaac: { unlockedBy: 474, coefficient: MEDIUM, note: null },
  taintedMagdalene: { unlockedBy: 475, coefficient: MEDIUM, note: null },
  taintedCain: { unlockedBy: 476, coefficient: MEDIUM, note: null },
  taintedJudas: { unlockedBy: 477, coefficient: MEDIUM, note: null },
  taintedBlueBaby: { unlockedBy: 478, coefficient: MEDIUM, note: null },
  taintedEve: { unlockedBy: 479, coefficient: MEDIUM, note: null },
  taintedSamson: { unlockedBy: 480, coefficient: MEDIUM, note: null },
  taintedAzazel: { unlockedBy: 481, coefficient: MEDIUM, note: null },
  taintedLazarus: { unlockedBy: 482, coefficient: MEDIUM, note: null },
  taintedEden: { unlockedBy: 483, coefficient: MEDIUM, note: null },
  taintedLost: { unlockedBy: 484, coefficient: HARD, note: null },
  taintedLilith: { unlockedBy: 485, coefficient: MEDIUM, note: null },
  taintedKeeper: { unlockedBy: 486, coefficient: HARD, note: null },
  taintedApollyon: { unlockedBy: 487, coefficient: MEDIUM, note: null },
  taintedForgotten: { unlockedBy: 488, coefficient: MEDIUM, note: null },
  taintedBethany: { unlockedBy: 489, coefficient: MEDIUM, note: null },
  taintedJacob: { unlockedBy: 490, coefficient: MEDIUM, note: null },
};

export function isCharacterUnlocked(id: CharacterId, unlocked: ReadonlySet<number>): boolean {
  const by = CHARACTER_INFO[id].unlockedBy;
  return by === null || unlocked.has(by);
}
