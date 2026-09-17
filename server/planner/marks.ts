import { CHARACTERS, type CharacterId } from '../../shared/characters.ts';
import {
  type CharacterMarks,
  type CompletionMarks,
  emptyMarks,
  MARK_IDS,
  markForEnding,
  type MarkId,
  type MarkLevel,
} from '../../shared/marks.ts';
import type { KnownMarks } from '../../shared/types.ts';
import type { KnowledgeBase } from '../wiki/kb-types.ts';

function raise(marks: CharacterMarks, mark: MarkId, level: MarkLevel): void {
  if (level > marks[mark]) marks[mark] = level;
}

/**
 * Marques déduites des succès obtenus, pour un profil sans sauvegarde : un succès de marque obtenu
 * prouve la marque (difficile s'il l'exige), « toutes les marques en difficile » les prouve toutes.
 */
export function inferMarks(kb: KnowledgeBase, unlocked: ReadonlySet<number>): CompletionMarks {
  const marks = Object.fromEntries(CHARACTERS.map((c) => [c.id, emptyMarks()])) as CompletionMarks;
  for (const achievement of kb.achievements) {
    if (!unlocked.has(achievement.id)) continue;
    const how = achievement.how;
    if (how.kind === 'mark' || how.kind === 'multi-mark') {
      const endings = how.kind === 'mark' ? [how.ending] : how.endings;
      for (const ending of endings) {
        const { mark, level } = markForEnding(ending);
        raise(marks[how.character], mark, how.hard ? 2 : level);
      }
    } else if (how.kind === 'hard-all') {
      for (const mark of MARK_IDS) raise(marks[how.character], mark, 2);
    }
  }
  return marks;
}

/**
 * Marques à afficher. Avec la sauvegarde, elles sont exactes. Déduites, une marque absente reste
 * inconnue (null) sauf si un succès `mark` en mode normal l'aurait prouvée (ex. Mom's Heart des
 * personnages de base, qui n'a de succès qu'en difficile, reste inconnue). Un succès à plusieurs
 * marques ou de Greedier manquant ne dit rien d'une marque normale seule.
 */
export function displayMarks(
  kb: KnowledgeBase,
  marks: CompletionMarks,
  fromSave: boolean,
): Record<CharacterId, KnownMarks> {
  const provable = new Set<string>();
  for (const achievement of kb.achievements) {
    const how = achievement.how;
    if (how.kind === 'mark' && !how.hard && markForEnding(how.ending).level === 1) {
      provable.add(`${how.character}:${markForEnding(how.ending).mark}`);
    }
  }
  const result = {} as Record<CharacterId, KnownMarks>;
  for (const { id } of CHARACTERS) {
    result[id] = Object.fromEntries(
      MARK_IDS.map((mark) => {
        const level = marks[id][mark];
        const unknown = !fromSave && level === 0 && !provable.has(`${id}:${mark}`);
        return [mark, unknown ? null : level];
      }),
    ) as KnownMarks;
  }
  return result;
}
