import { characterById } from '../../shared/characters.ts';
import { endingById, type EndingId } from '../../shared/endings.ts';
import type { MarkId } from '../../shared/marks.ts';
import type {
  DesyncKind,
  Dlc,
  How,
  HowKind,
  KbState,
  MarksSource,
  Requirement,
  RunMode,
  SourceKey,
  SourceState,
  UnlockKind,
} from '../../shared/types.ts';

export const DLC_LABELS: Record<Dlc, string> = {
  rebirth: 'Rebirth',
  afterbirth: 'Afterbirth',
  afterbirthPlus: 'Afterbirth+',
  repentance: 'Repentance',
  repentancePlus: 'Repentance+',
};

export const SOURCE_LABELS: Record<SourceKey, string> = {
  steamCache: 'Cache Steam',
  saveFile: 'Sauvegarde',
  profile: 'Profil en ligne',
};

export const STATE_LABELS: Record<SourceState, string> = {
  ok: 'OK',
  absent: 'absent',
  stale: 'obsolète',
  error: 'erreur',
};

export const KB_STATE_LABELS: Record<KbState, string> = {
  ok: 'OK',
  absent: 'absente',
  error: 'erreur',
};

export const DESYNC_LABELS: Record<DesyncKind, string> = {
  saveOnly: 'Débloqués dans la sauvegarde, absents de Steam',
  steamOnly: 'Débloqués sur Steam, absents de la sauvegarde',
  profileAhead: 'Sur le profil en ligne, pas encore dans le cache local',
  cacheAhead: 'Dans le cache local, pas encore sur le profil en ligne',
};

/** Types de condition, dans l'ordre du filtre. */
export const HOW_LABELS: Record<HowKind, string> = {
  mark: 'Marque de complétion',
  'multi-mark': 'Plusieurs marques',
  'hard-all': 'Toutes les marques en difficile',
  closet: 'Placard de Home',
  challenge: 'Défi',
  boss: 'Boss',
  counter: 'Cumul sur plusieurs parties',
  misc: 'Autre condition',
};

export const UNLOCK_LABELS: Record<UnlockKind, string> = {
  character: 'Personnage',
  item: 'Objet',
  trinket: 'Bibelot',
  card: 'Carte ou rune',
  pill: 'Pilule',
  baby: 'Bébé co-op',
  'starting-item': 'Objet de départ',
  floor: 'Étage',
  challenge: 'Défi',
  mode: 'Mode',
  other: 'Autre',
};

function hardSuffix(hard: boolean): string {
  return hard ? ' en mode difficile' : '';
}

/** Méthode d'obtention en une phrase ; null quand le wiki ne permet pas de la résumer. */
export function describeHow(how: How): string | null {
  switch (how.kind) {
    case 'mark':
      return `Battre ${endingById(how.ending).name} avec ${characterById(how.character).name}${hardSuffix(how.hard)}`;
    case 'multi-mark': {
      const endings = how.endings.map((id) => endingById(id).name).join(', ');
      return `Battre ${endings} avec ${characterById(how.character).name}${hardSuffix(how.hard)}`;
    }
    case 'hard-all':
      return `Obtenir toutes les marques en mode difficile avec ${characterById(how.character).name}`;
    case 'closet':
      return `Ouvrir le placard caché de Home avec ${characterById(how.character).name}`;
    case 'challenge':
      return `Réussir le défi n° ${how.number}`;
    case 'boss':
      return `Battre ${how.bosses.join(', ')}, avec n'importe quel personnage`;
    case 'counter':
      return `Objectif cumulé sur plusieurs parties (${how.total})`;
    case 'misc':
      return null;
  }
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function percent(value: number, total: number): string {
  const ratio = total === 0 ? 0 : (value / total) * 100;
  return `${ratio.toFixed(1).replace('.', ',')} %`;
}

/** Marques de complétion : nom complet (noms du jeu) et en-tête court de la grille. */
export const MARK_LABELS: Record<MarkId, { name: string; short: string }> = {
  momsHeart: { name: "Mom's Heart", short: 'Heart' },
  isaac: { name: 'Isaac', short: 'Isaac' },
  satan: { name: 'Satan', short: 'Satan' },
  bossRush: { name: 'Boss Rush', short: 'Rush' },
  blueBaby: { name: '???', short: '???' },
  lamb: { name: 'The Lamb', short: 'Lamb' },
  megaSatan: { name: 'Mega Satan', short: 'Mega' },
  greed: { name: 'Greed et Greedier', short: 'Greed' },
  hush: { name: 'Hush', short: 'Hush' },
  delirium: { name: 'Delirium', short: 'Deli' },
  mother: { name: 'Mother', short: 'Mother' },
  beast: { name: 'The Beast', short: 'Beast' },
};

export const RUN_MODE_LABELS: Record<RunMode, string> = {
  normal: 'Normal',
  hard: 'Difficile',
  greed: 'Greed',
  greedier: 'Greedier',
};

export const MARKS_SOURCE_LABELS: Record<MarksSource, string> = {
  save: 'Marques lues dans la sauvegarde.',
  inferred: 'Marques déduites des succès : sans sauvegarde, certaines restent inconnues.',
};

/** Fins d'une run, dans l'ordre (« battre Mom » seule quand la liste est vide). */
export function endingList(endings: EndingId[]): string {
  return endings.length === 0 ? 'Mom' : endings.map((id) => endingById(id).name).join(', ');
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${String(rest).padStart(2, '0')}`;
}

export function requirementText(requirement: Requirement): string {
  return requirement.anyOf.map((a) => a.name).join(' ou ');
}

export function characterName(id: Parameters<typeof characterById>[0]): string {
  return characterById(id).name;
}