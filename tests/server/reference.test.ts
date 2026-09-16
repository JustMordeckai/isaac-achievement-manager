
import { describe, expect, it } from 'vitest';
import { CHARACTERS, characterById, characterByName, characterNames } from '../../shared/characters.ts';
import { ENDINGS, endingById, endingByName } from '../../shared/endings.ts';

describe('personnages', () => {
  it('liste les 34 personnages avec des identifiants uniques', () => {
    expect(CHARACTERS).toHaveLength(34);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(34);
    expect(CHARACTERS.filter((c) => c.tainted)).toHaveLength(17);
  });

  it('retrouve un personnage par son nom ou un alias, sans tenir compte de la casse', () => {
    expect(characterByName('Blue Baby')?.id).toBe('blueBaby');
    expect(characterByName(' maggy ')?.id).toBe('magdalene');
    expect(characterByName('Jacob & Esau')?.id).toBe('jacobAndEsau');
    expect(characterByName('Tainted The Lost')?.id).toBe('taintedLost');
    expect(characterByName('Tainted Jacob and Esau')?.id).toBe('taintedJacob');
    expect(characterByName('Mom')).toBeNull();
  });

  it('donne le nom et la page wiki d’un identifiant', () => {
    expect(characterById('taintedBlueBaby')).toMatchObject({ name: 'Tainted ???', page: 'Tainted ???', tainted: true });
    expect(characterById('blueBaby')).toMatchObject({ name: '???', page: '??? (Character)' });
  });

  it('trie les graphies de la plus longue à la plus courte', () => {
    const names = characterNames();
    expect(names[0]).toBe('tainted jacob and esau');
    expect(names.indexOf('tainted isaac')).toBeLessThan(names.indexOf('isaac'));
    expect(names.every((name, i) => i === 0 || names[i - 1].length >= name.length)).toBe(true);
  });
});

describe('fins', () => {
  it('liste les 13 fins qui donnent une marque de complétion', () => {
    expect(ENDINGS.map((e) => e.id)).toEqual([
      'momsHeart',
      'isaac',
      'satan',
      'blueBaby',
      'lamb',
      'megaSatan',
      'bossRush',
      'hush',
      'delirium',
      'mother',
      'beast',
      'ultraGreed',
      'ultraGreedier',
    ]);
  });

  it('retrouve une fin par son nom ou un alias', () => {
    expect(endingByName('It Lives!')?.id).toBe('momsHeart');
    expect(endingByName('the Boss Rush')?.id).toBe('bossRush');
    expect(endingByName('Blue Baby')?.id).toBe('blueBaby');
    expect(endingByName('Mom')).toBeNull();
    expect(endingById('ultraGreedier')).toMatchObject({ page: 'Ultra Greed', fragment: 'Ultra Greedier' });
  });
});
