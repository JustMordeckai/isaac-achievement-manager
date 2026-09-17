import { describe, expect, it } from 'vitest';
import type { HowKind, UnlockKind } from '../../shared/types.ts';
import { describeHow, HOW_LABELS, UNLOCK_LABELS } from '../../web/src/labels.ts';

describe('describeHow', () => {
  it('résume chaque méthode d’obtention en français, avec les noms du jeu', () => {
    expect(describeHow({ kind: 'mark', character: 'azazel', ending: 'bossRush', hard: false })).toBe('Battre Boss Rush avec Azazel');
    expect(describeHow({ kind: 'mark', character: 'isaac', ending: 'momsHeart', hard: true })).toBe(
      "Battre Mom's Heart avec Isaac en mode difficile",
    );
    expect(
      describeHow({ kind: 'multi-mark', character: 'taintedIsaac', endings: ['isaac', 'blueBaby', 'satan', 'lamb'], hard: false }),
    ).toBe('Battre Isaac, ???, Satan, The Lamb avec Tainted Isaac');
    expect(describeHow({ kind: 'hard-all', character: 'theLost' })).toBe(
      'Obtenir toutes les marques en mode difficile avec The Lost',
    );
    expect(describeHow({ kind: 'closet', character: 'blueBaby' })).toBe('Ouvrir le placard caché de Home avec ???');
    expect(describeHow({ kind: 'challenge', number: 13 })).toBe('Réussir le défi n° 13');
    expect(describeHow({ kind: 'boss', bosses: ['Satan'] })).toBe("Battre Satan, avec n'importe quel personnage");
    expect(describeHow({ kind: 'counter', total: 30 })).toBe('Objectif cumulé sur plusieurs parties (30)');
    expect(describeHow({ kind: 'misc' })).toBeNull();
  });

  it('a un libellé pour chaque type de condition et de déblocage', () => {
    const hows: HowKind[] = ['mark', 'multi-mark', 'hard-all', 'closet', 'challenge', 'boss', 'counter', 'misc'];
    const unlocks: UnlockKind[] = ['character', 'item', 'trinket', 'card', 'pill', 'baby', 'starting-item', 'floor', 'challenge', 'mode', 'other'];
    expect(Object.keys(HOW_LABELS)).toEqual(hows);
    expect(Object.keys(UNLOCK_LABELS)).toEqual(unlocks);
  });
});
