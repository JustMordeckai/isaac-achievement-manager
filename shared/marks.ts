import type { CharacterId } from './characters.ts';
import type { EndingId } from './endings.ts';

/** The 12 completion marks, in the order of the note of the game (Greed and Greedier share one mark). */
export type MarkId =
  | 'momsHeart'
  | 'isaac'
  | 'satan'
  | 'bossRush'
  | 'blueBaby'
  | 'lamb'
  | 'megaSatan'
  | 'greed'
  | 'hush'
  | 'delirium'
  | 'mother'
  | 'beast';

/** 0 missing, 1 normal (Greed for the greed mark), 2 hard (Greedier). */
export type MarkLevel = 0 | 1 | 2;

export type CharacterMarks = Record<MarkId, MarkLevel>;

export type CompletionMarks = Record<CharacterId, CharacterMarks>;

export const MARK_IDS: MarkId[] = [
  'momsHeart',
  'isaac',
  'satan',
  'bossRush',
  'blueBaby',
  'lamb',
  'megaSatan',
  'greed',
  'hush',
  'delirium',
  'mother',
  'beast',
];

/** Mark and lowest level a run ending brings. */
export function markForEnding(ending: EndingId): { mark: MarkId; level: 1 | 2 } {
  if (ending === 'ultraGreed') return { mark: 'greed', level: 1 };
  if (ending === 'ultraGreedier') return { mark: 'greed', level: 2 };
  return { mark: ending, level: 1 };
}

/**
 * Level of a raw value of the save. Bits: 1 normal, 2 hard, 4 and 8 the same marks earned
 * online (Repentance+). A hard mark also counts as the normal one.
 */
export function markLevel(raw: number): MarkLevel {
  if (raw & 0b1010) return 2;
  if (raw & 0b0101) return 1;
  return 0;
}

export function emptyMarks(): CharacterMarks {
  return Object.fromEntries(MARK_IDS.map((mark) => [mark, 0])) as CharacterMarks;
}
