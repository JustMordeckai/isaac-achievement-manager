import { describe, expect, it } from 'vitest';
import { characterOf, classifyHow, classifyUnlock } from '../../server/planner/classify.ts';
import { parseAchievementsPage } from '../../server/wiki/parse-achievements.ts';
import { linkedPages, wikiText } from './helpers/wiki.ts';

const rows = parseAchievementsPage(wikiText('Achievements.wiki'));
const linked = linkedPages();
const byId = new Map(rows.map((r) => [r.id, r]));
const how = (id: number) => classifyHow(byId.get(id)?.condition ?? '');
const unlock = (id: number) => {
  const row = byId.get(id);
  if (!row) throw new Error(`fiche #${id} absente`);
  return classifyUnlock(row.displayName, row.description, linked[row.link] ?? null);
};

describe('classifyHow', () => {
  it('reconnaît les marques de complétion, y compris en mode difficile', () => {
    expect(how(9)).toEqual({ kind: 'mark', character: 'azazel', ending: 'bossRush', hard: false });
    expect(how(43)).toEqual({ kind: 'mark', character: 'isaac', ending: 'satan', hard: false });
    expect(how(167)).toEqual({ kind: 'mark', character: 'isaac', ending: 'momsHeart', hard: true });
    expect(how(318)).toEqual({ kind: 'mark', character: 'apollyon', ending: 'momsHeart', hard: true });
    expect(how(491)).toEqual({ kind: 'mark', character: 'taintedIsaac', ending: 'beast', hard: false });
    expect(how(495)).toEqual({ kind: 'mark', character: 'taintedBlueBaby', ending: 'beast', hard: false });
    expect(how(433)).toEqual({ kind: 'mark', character: 'jacobAndEsau', ending: 'bossRush', hard: false });
  });

  it('reconnaît les marques multiples des personnages corrompus', () => {
    expect(how(548)).toEqual({
      kind: 'multi-mark',
      character: 'taintedIsaac',
      endings: ['isaac', 'blueBaby', 'satan', 'lamb'],
      hard: false,
    });
    expect(how(618)).toEqual({ kind: 'multi-mark', character: 'taintedIsaac', endings: ['hush', 'bossRush'], hard: false });
  });

  it('reconnaît toutes les marques en difficile, les placards et les défis', () => {
    expect(how(252)).toEqual({ kind: 'hard-all', character: 'blueBaby' });
    expect(how(156)).toEqual({ kind: 'hard-all', character: 'theLost' });
    expect(how(474)).toEqual({ kind: 'closet', character: 'isaac' });
    expect(how(478)).toEqual({ kind: 'closet', character: 'blueBaby' });
    expect(how(60)).toEqual({ kind: 'challenge', number: 13 });
    expect(how(120)).toEqual({ kind: 'challenge', number: 7 });
  });

  it('reconnaît les cumuls et les boss sans personnage imposé', () => {
    expect(how(8)).toEqual({ kind: 'counter', total: 3 });
    expect(how(17)).toEqual({ kind: 'counter', total: 30 });
    expect(how(59)).toEqual({ kind: 'counter', total: 900 });
    expect(how(349)).toEqual({ kind: 'counter', total: 20 });
    expect(how(3)).toEqual({ kind: 'boss', bosses: ['Satan'] });
    expect(how(41)).toEqual({ kind: 'boss', bosses: ['???', 'The Lamb'] });
  });

  it('découpe une liste de boss comme une liste de fins', () => {
    expect(classifyHow('Defeat Hush/Delirium')).toEqual({ kind: 'boss', bosses: ['Hush', 'Delirium'] });
    expect(classifyHow('Defeat Mom, Mom’s Heart and Satan')).toEqual({ kind: 'boss', bosses: ['Mom', 'Mom’s Heart', 'Satan'] });
  });

  it('range le reste en misc', () => {
    for (const id of [1, 27, 77, 157, 164, 328, 404, 547, 636]) expect(how(id), `#${id}`).toEqual({ kind: 'misc' });
  });

  it('donne le personnage concerné', () => {
    expect(characterOf(how(9))).toBe('azazel');
    expect(characterOf(how(3))).toBeNull();
  });
});

describe('classifyUnlock', () => {
  it('déduit personnage, objet, étage, pilule, carte et défi', () => {
    expect(unlock(3)).toEqual({ kind: 'character', name: 'Judas' });
    expect(unlock(32)).toEqual({ kind: 'character', name: '???' });
    expect(unlock(6)).toEqual({ kind: 'item', name: 'Cube of Meat' });
    expect(unlock(9)).toEqual({ kind: 'item', name: 'The Nail' });
    expect(unlock(4)).toEqual({ kind: 'floor', name: 'Womb' });
    expect(unlock(234)).toEqual({ kind: 'floor', name: '???' });
    expect(unlock(227)).toEqual({ kind: 'pill', name: 'Percs!' });
    expect(unlock(228)).toEqual({ kind: 'pill', name: 'Re-Lax' });
    expect(unlock(97)).toEqual({ kind: 'card', name: 'Chaos Card' });
    expect(unlock(160)).toEqual({ kind: 'challenge', name: 'Suicide King' });
  });

  it('reconnaît bébés, objets de départ et modes par la description', () => {
    expect(unlock(167)).toEqual({ kind: 'baby', name: 'Lost Baby' });
    expect(unlock(416)).toEqual({ kind: 'baby', name: 'Wisp Baby' });
    expect(unlock(245)).toEqual({ kind: 'starting-item', name: 'Cain holds Paperclip' });
    expect(unlock(33)).toEqual({ kind: 'mode', name: 'Everything Is Terrible!!!' });
  });

  it('ignore les redirections vers la page Achievements', () => {
    expect(unlock(41)).toEqual({ kind: 'other', name: 'Golden God!' });
    expect(classifyUnlock('X', 'Unlocked a new item.', null)).toEqual({ kind: 'other', name: 'X' });
  });
});

describe('classification des 640 fiches du wiki', () => {
  const results = rows.map((row) => ({
    id: row.id,
    how: classifyHow(row.condition),
    unlock: classifyUnlock(row.displayName, row.description, linked[row.link] ?? null),
  }));
  const count = (values: string[]) =>
    values.reduce<Record<string, number>>((acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }), {});

  it('répartit les types de condition', () => {
    expect(count(results.map((r) => r.how.kind))).toEqual({
      mark: 305,
      'multi-mark': 34,
      'hard-all': 17,
      closet: 17,
      challenge: 45,
      counter: 85,
      boss: 29,
      misc: 108,
    });
  });

  it('répartit les types de déblocage', () => {
    expect(count(results.map((r) => r.unlock.kind))).toEqual({
      character: 34,
      item: 270,
      trinket: 95,
      card: 63,
      pill: 8,
      baby: 50,
      'starting-item': 8,
      floor: 14,
      challenge: 34,
      mode: 3,
      other: 61,
    });
  });

  it('fige la liste des conditions non classées', () => {
    expect(results.filter((r) => r.how.kind === 'misc').map((r) => r.id)).toEqual([
      1, 2, 13, 14, 19, 22, 27, 31, 35, 37, 38, 39, 40, 42, 58, 65, 67, 69, 77, 79, 80, 81, 82, 83, 84, 86, 87, 88, 144,
      146, 155, 157, 158, 160, 161, 163, 164, 165, 178, 235, 258, 267, 268, 270, 273, 276, 277, 280, 321, 322, 323, 324,
      326, 327, 328, 329, 330, 336, 339, 346, 347, 351, 352, 355, 357, 359, 361, 363, 365, 366, 367, 368, 369, 370, 372,
      374, 378, 379, 381, 384, 386, 387, 388, 389, 390, 391, 404, 406, 408, 410, 411, 415, 508, 509, 512, 513, 514, 515,
      516, 546, 547, 582, 583, 636, 637, 638, 639, 640,
    ]);
  });

  it('fige la liste des déblocages de type other', () => {
    expect(results.filter((r) => r.unlock.kind === 'other').map((r) => r.id)).toEqual([
      5, 16, 17, 18, 34, 37, 38, 39, 40, 41, 66, 68, 69, 83, 84, 142, 151, 152, 153, 154, 155, 178, 224, 226, 233, 235,
      240, 242, 243, 247, 275, 323, 328, 333, 337, 339, 346, 347, 348, 391, 406, 411, 593, 601, 604, 605, 607, 608, 609,
      611, 612, 613, 614, 615, 616, 617, 635, 637, 638, 639, 640,
    ]);
  });
});
