import type { EndingId } from '../../shared/endings.ts';

export interface Target {
  /** Succès à débloquer avant de pouvoir atteindre cette fin. */
  requires: number[];
  /** Groupes dont au moins un succès doit être débloqué. */
  requiresAny: number[][];
  /** Étape propre à cette fin, en français (noms du jeu en anglais). */
  step: string;
  /** Page du wiki d'où viennent ces faits. */
  source: string;
}

/**
 * Fins de run, relevées sur le wiki le 2026-09-17 (pages des boss, Completion Marks, Mom, A Strange Door, Home).
 * Isaac et Satan exigent It Lives! (#34) pour un accès garanti ; avant, il faut une Angel Room ou une Devil Room.
 */
export const TARGETS: Record<EndingId, Target> = {
  momsHeart: {
    requires: [4],
    requiresAny: [],
    step: "Traverser Womb I et II et battre Mom's Heart (ou It Lives).",
    source: "Mom's Heart",
  },
  isaac: {
    requires: [4, 34],
    requiresAny: [],
    step: 'Prendre le rayon de lumière vers Cathedral et battre Isaac.',
    source: 'Isaac (Boss)',
  },
  satan: {
    requires: [4, 34],
    requiresAny: [],
    step: 'Prendre la trappe vers Sheol et battre Satan.',
    source: 'Satan',
  },
  blueBaby: {
    requires: [57],
    requiresAny: [],
    step: "Toucher le coffre d'Isaac en tenant The Polaroid pour entrer dans Chest, puis battre ???.",
    source: '??? (Boss)',
  },
  lamb: {
    requires: [78],
    requiresAny: [],
    step: 'Toucher le coffre de Satan en tenant The Negative pour entrer dans Dark Room, puis battre The Lamb.',
    source: 'The Lamb',
  },
  megaSatan: {
    requires: [155],
    requiresAny: [],
    step: 'Sans entrer dans le coffre, revenir à la salle de départ, ouvrir la Golden Gate avec Key Piece 1 et 2, puis battre Mega Satan.',
    source: 'Mega Satan',
  },
  bossRush: {
    requires: [4],
    requiresAny: [],
    step: 'Battre Mom avant 20:00 (25:00 en Mausoleum), entrer dans le Boss Rush et vaincre les 15 vagues.',
    source: 'Boss Rush',
  },
  hush: {
    requires: [234],
    requiresAny: [],
    step: "Battre Mom's Heart avant 30:00, prendre l'entrée vers ??? (Blue Womb) et battre Hush.",
    source: 'Hush',
  },
  delirium: {
    requires: [320],
    requiresAny: [],
    step: 'Prendre le portail vers The Void, trouver la grande salle de boss et battre Delirium.',
    source: 'Delirium',
  },
  mother: {
    requires: [407],
    requiresAny: [],
    step: 'En Corpse II, sauter dans le trou de la salle du boss et battre Mother.',
    source: 'Mother',
  },
  beast: {
    requires: [635],
    requiresAny: [[57, 78]],
    step: 'À Home, dormir dans le lit de Mom, puis battre Dogma et The Beast.',
    source: 'The Beast',
  },
  ultraGreed: {
    requires: [],
    requiresAny: [],
    step: 'Au 7e étage, battre Ultra Greed puis entrer dans le coffre de fin.',
    source: 'Ultra Greed',
  },
  ultraGreedier: {
    requires: [341],
    requiresAny: [],
    step: 'Au 7e étage, battre Ultra Greed puis sa seconde phase, Ultra Greedier.',
    source: 'Ultra Greed',
  },
};
