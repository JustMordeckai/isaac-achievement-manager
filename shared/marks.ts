import type { CharacterId } from './characters.ts';
import type { EndingId } from './endings.ts';

/** Les 12 marques de complétion, dans l'ordre de la note du jeu (Greed et Greedier partagent une marque). */
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

/** 0 absente, 1 normal (Greed pour la marque greed), 2 difficile (Greedier). */
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

/** Marque et niveau minimal qu'apporte une fin de run. */
export function markForEnding(ending: EndingId): { mark: MarkId; level: 1 | 2 } {
  if (ending === 'ultraGreed') return { mark: 'greed', level: 1 };
  if (ending === 'ultraGreedier') return { mark: 'greed', level: 2 };
  return { mark: ending, level: 1 };
}

/**
 * Niveau d'une valeur brute de la sauvegarde. Bits : 1 normal, 2 difficile, 4 et 8 les mêmes
 * marques obtenues en ligne (Repentance+). Une marque difficile vaut aussi la marque normale.
 */
export function markLevel(raw: number): MarkLevel {
  if (raw & 0b1010) return 2;
  if (raw & 0b0101) return 1;
  return 0;
}

export function emptyMarks(): CharacterMarks {
  return Object.fromEntries(MARK_IDS.map((mark) => [mark, 0])) as CharacterMarks;
}
