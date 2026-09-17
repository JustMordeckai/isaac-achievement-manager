import type { EndingId } from '../../shared/endings.ts';
import { TARGETS } from './targets.ts';

export type RouteKind = 'mom' | 'main' | 'mother' | 'beast' | 'greed' | 'greedier';

export interface RouteOption {
  kind: RouteKind;
  /** Fins atteintes, dans l'ordre. */
  endings: EndingId[];
  /** Succès exigés par l'enchaînement lui-même, en plus de ceux des fins. */
  extraRequires: number[];
  minutes: number;
}

/**
 * Durées estimées à la main, en minutes (à ajuster) : run de base puis supplément par fin.
 * Aucune source : ce sont des ordres de grandeur pour comparer les runs entre elles.
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

/** Hush déjà battu une fois (New Area) : sans lui, la première victoire sur Hush termine la partie. */
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

/** Fins après lesquelles un portail vers The Void est garanti (Repentance+, The Void débloquée). */
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
          // Continuer après Hush suppose qu'il a déjà été battu lors d'une partie précédente.
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

/** Toutes les runs possibles, d'après les combinaisons vérifiées sur le wiki (Completion Marks, Hush, The Void, Mother, Home). */
export const ROUTE_OPTIONS: RouteOption[] = [
  // Première run d'un profil neuf : battre Mom ouvre la suite (The Womb).
  { kind: 'mom', endings: [], extraRequires: [], minutes: MINUTES.mom },
  ...mainOptions(),
  { kind: 'mother', endings: ['mother'], extraRequires: [], minutes: MINUTES.mother },
  { kind: 'mother', endings: ['bossRush', 'mother'], extraRequires: [], minutes: MINUTES.mother + MINUTES.bossRush },
  { kind: 'beast', endings: ['beast'], extraRequires: [], minutes: MINUTES.beast },
  { kind: 'beast', endings: ['bossRush', 'beast'], extraRequires: [], minutes: MINUTES.beast + MINUTES.bossRush },
  { kind: 'greed', endings: ['ultraGreed'], extraRequires: [], minutes: MINUTES.greed },
  { kind: 'greedier', endings: ['ultraGreedier'], extraRequires: [], minutes: MINUTES.greedier },
];

const MOTHER_PATH = [
  'Battre le boss de Basement I ou II, puis ouvrir avec une clé la porte vers Downpour.',
  'En Downpour II, toucher le White Fire Place pour devenir The Lost, traverser le miroir et prendre Knife Piece 1.',
  'Après le boss de Downpour II, ouvrir avec 2 bombes la porte condamnée vers les Mines.',
  'En Mines II, presser les 3 boutons, prendre le minecart et récupérer Knife Piece 2.',
  'Après le boss de Mines II, payer 2 cœurs pour entrer dans Mausoleum.',
];

const BEAST_PATH = [
  'Traverser Basement et Caves.',
  'En Depths II, battre Mom et prendre The Polaroid ou The Negative.',
];

/** Chemin de la run, étape par étape. */
export function routeSteps(option: RouteOption): string[] {
  const has = (ending: EndingId) => option.endings.includes(ending);
  const bossRush = has('bossRush') ? [TARGETS.bossRush.step] : [];
  switch (option.kind) {
    case 'mom':
      return ['Traverser Basement, Caves et Depths, puis battre Mom en Depths II.'];
    case 'greed':
      return [
        'Lancer une partie en mode Greed.',
        'Sur chaque étage, vaincre toutes les vagues (dont les 2 vagues de boss) pour ouvrir la sortie.',
        TARGETS.ultraGreed.step,
      ];
    case 'greedier':
      return [
        'Lancer une partie en mode Greedier.',
        'Sur chaque étage, vaincre toutes les vagues (dont les 2 vagues de boss) pour ouvrir la sortie.',
        TARGETS.ultraGreedier.step,
      ];
    case 'mother':
      return [
        ...MOTHER_PATH,
        'En Mausoleum II, battre Mom.',
        ...bossRush,
        "Lancer le couteau sur la porte de chair, battre Mom's Heart, puis descendre dans Corpse.",
        TARGETS.mother.step,
      ];
    case 'beast':
      return [
        ...BEAST_PATH,
        ...bossRush,
        "Sortir de la salle de Mom par téléportation (0 - The Fool du Marked Skull), puis donner l'objet à A Strange Door.",
        "En Mausoleum II, prendre Dad's Note et remonter l'Ascent jusqu'à Home.",
        "À Home, ouvrir le coffre de Mom (Red Key au premier passage) et le placard caché avec la Red Key.",
        TARGETS.beast.step,
      ];
    case 'main': {
      const steps: string[] = [];
      if (has('megaSatan')) steps.push("Pendant la run, faire exploser les statues des Angel Rooms pour battre Uriel et Gabriel (Key Piece 1 et 2).");
      steps.push('Traverser Basement, Caves et Depths, puis battre Mom en Depths II.');
      if (has('blueBaby')) steps.push('Après Mom, prendre The Polaroid (The Negative disparaît).');
      if (has('lamb')) steps.push('Après Mom, prendre The Negative (The Polaroid disparaît).');
      steps.push(...bossRush, TARGETS.momsHeart.step);
      if (has('hush')) steps.push(TARGETS.hush.step);
      for (const ending of ['isaac', 'satan', 'blueBaby', 'lamb', 'megaSatan', 'delirium'] as const) {
        if (has(ending)) steps.push(TARGETS[ending].step);
      }
      return steps;
    }
  }
}
