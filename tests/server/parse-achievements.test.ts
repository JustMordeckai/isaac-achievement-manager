import { describe, expect, it } from 'vitest';
import { parseAchievementsPage, type WikiAchievementRow } from '../../server/wiki/parse-achievements.ts';
import { wikiText } from './helpers/wiki.ts';

const unknown = new Map<string, number>();
const rows = parseAchievementsPage(wikiText('Achievements.wiki'), unknown);
const row = (id: number): WikiAchievementRow => {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`fiche #${id} absente`);
  return found;
};

describe('parseAchievementsPage', () => {
  it('lit les 640 fiches, ids 1 a 640 sans doublon, sans modele inconnu', () => {
    expect(rows).toHaveLength(640);
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 640 }, (_, i) => i + 1));
    expect(unknown.size).toBe(0);
  });

  it('extrait les champs d une fiche simple', () => {
    expect(row(3)).toEqual({
      id: 3,
      wikiName: 'Judas',
      displayName: 'Judas',
      link: 'Judas',
      linkFragment: null,
      description: 'Unlocked a new character.',
      condition: 'Defeat Satan',
      conditionLinks: [],
    });
  });

  it('distingue le nom wiki du nom affiche', () => {
    expect(row(160)).toMatchObject({
      wikiName: 'Suicide King 2',
      displayName: 'Suicide King',
      link: 'Suicide King (Challenge)',
      condition: "Defeat Mom's Heart 11 times and unlock Lazarus",
    });
  });

  it('separe l ancre du lien et prend le nom affiche quand il n y a pas de lien', () => {
    expect(row(347)).toMatchObject({ link: 'The Binding of Isaac: Afterbirth †', linkFragment: 'Bosses' });
    expect(row(328)).toMatchObject({ link: 'Hearts', linkFragment: 'Scared_Heart' });
    expect(row(41)).toMatchObject({ link: 'Golden God!', linkFragment: null });
  });

  it('lit l id PC quand le champ contient aussi l id PS4', () => {
    expect(row(349)).toMatchObject({ wikiName: 'Black Hole', condition: 'Defeat 20 Portals', conditionLinks: ['Portal'] });
  });

  it('ne garde que les conditions valables sur PC et dans la version actuelle', () => {
    expect(row(328).condition).toBe('Reset 7 times in a row');
    expect(row(235).condition).toBe(
      'Unlock all secrets and endings, and collect every item in the game\nUnlock as many of the previously mentioned things as there were in Afterbirth (Ex: Unlocking items that were not in Afterbirth, like Red Key, count towards this achievement, meaning you do not need to unlock items like Mega Blast to gain this achievement)',
    );
  });

  it('retire les commentaires HTML et garde les liens de categorie affiches', () => {
    expect(row(324).condition).toBe(
      "Collect every entry in the Bestiary (bugged v190 - Mobs that don't exist in the bestiary are being counted. This allows Sin Collector to be unlocked without a complete bestiary)",
    );
    expect(row(35).condition).toBe('Obtain three Yes Mother? items in one run');
  });

  it('conserve les pages liees de la condition', () => {
    expect(row(27)).toMatchObject({
      condition: "Defeat Mom, Mom's Heart, or It Lives! using The Bible",
      conditionLinks: ['Mom', "Mom's Heart", 'It Lives!'],
    });
    expect(row(41).conditionLinks).toEqual(['??? (Boss)', 'The Lamb']);
  });
});
