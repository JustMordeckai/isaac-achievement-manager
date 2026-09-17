import type { PlannedRun, RunMode } from '../../shared/types.ts';
import { characterName, endingList } from './labels.ts';

const MODES: Record<RunMode, string> = {
  normal: 'en mode normal',
  hard: 'en mode difficile',
  greed: 'en mode Greed',
  greedier: 'en mode Greedier',
};

function cite(achievement: { id: number; name: string }): string {
  return `${achievement.name} (#${achievement.id})`;
}

/** « a, b et c ». */
function joinWithAnd(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/** Question pré-remplie par le bouton « Demander au conseiller » d'une run. */
export function runQuestion(run: PlannedRun): string {
  const goal =
    run.achievements.length > 0
      ? `Elle doit donner ${joinWithAnd(run.achievements.map(cite))}.`
      : `C'est une run de préparation pour ${joinWithAnd(run.prepares.map(cite))}.`;
  return `Comment réussir cette run avec ${characterName(run.character)} ${MODES[run.mode]} (battre ${endingList(run.endings)}) ? ${goal}`;
}

/** Question pré-remplie depuis la fiche d'un succès manquant. */
export function achievementQuestion(achievement: { id: number; name: string }): string {
  return `Comment obtenir ${cite(achievement)} ?`;
}
