import { describe, expect, it } from 'vitest';
import { CHARACTERS, characterById, characterByName, characterNames } from '../../shared/characters.ts';
import { ENDINGS, endingById, endingByName } from '../../shared/endings.ts';

describe('characters', () => {
  it('lists the 34 characters with unique identifiers', () => {
    expect(CHARACTERS).toHaveLength(34);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(34);
    expect(CHARACTERS.filter((c) => c.tainted)).toHaveLength(17);
  });

  it('finds a character by its name or an alias, ignoring case', () => {
    expect(characterByName('Blue Baby')?.id).toBe('blueBaby');
    expect(characterByName(' maggy ')?.id).toBe('magdalene');
    expect(characterByName('Jacob & Esau')?.id).toBe('jacobAndEsau');
    expect(characterByName('Tainted The Lost')?.id).toBe('taintedLost');
    expect(characterByName('Tainted Jacob and Esau')?.id).toBe('taintedJacob');
    expect(characterByName('Mom')).toBeNull();
  });

  it('gives the name and the wiki page of an identifier', () => {
    expect(characterById('taintedBlueBaby')).toMatchObject({ name: 'Tainted ???', page: 'Tainted ???', tainted: true });
    expect(characterById('blueBaby')).toMatchObject({ name: '???', page: '??? (Character)' });
  });

  it('sorts the spellings from the longest to the shortest', () => {
    const names = characterNames();
    expect(names[0]).toBe('tainted jacob and esau');
    expect(names.indexOf('tainted isaac')).toBeLessThan(names.indexOf('isaac'));
    expect(names.every((name, i) => i === 0 || names[i - 1].length >= name.length)).toBe(true);
  });
});

describe('endings', () => {
  it('lists the 13 endings that give a completion mark', () => {
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

  it('finds an ending by its name or an alias', () => {
    expect(endingByName('It Lives!')?.id).toBe('momsHeart');
    expect(endingByName('the Boss Rush')?.id).toBe('bossRush');
    expect(endingByName('Blue Baby')?.id).toBe('blueBaby');
    expect(endingByName('Mom')).toBeNull();
    expect(endingById('ultraGreedier')).toMatchObject({ page: 'Ultra Greed', fragment: 'Ultra Greedier' });
  });
});
