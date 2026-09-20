import { describe, expect, it } from 'vitest';
import { parseAchievementsPage, type WikiAchievementRow } from '../../server/wiki/parse-achievements.ts';
import { wikiText } from './helpers/wiki.ts';

const unknown = new Map<string, number>();
const rows = parseAchievementsPage(wikiText('Achievements.wiki'), unknown);
const row = (id: number): WikiAchievementRow => {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`entry #${id} missing`);
  return found;
};

describe('parseAchievementsPage', () => {
  it('reads the 640 entries, ids 1 to 640 with no duplicate and no unknown template', () => {
    expect(rows).toHaveLength(640);
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 640 }, (_, i) => i + 1));
    expect(unknown.size).toBe(0);
  });

  it('pulls the fields out of a simple entry', () => {
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

  it('tells the wiki name from the name on screen', () => {
    expect(row(160)).toMatchObject({
      wikiName: 'Suicide King 2',
      displayName: 'Suicide King',
      link: 'Suicide King (Challenge)',
      condition: "Defeat Mom's Heart 11 times and unlock Lazarus",
    });
  });

  it('separates the anchor from the link and takes the name on screen when there is no link', () => {
    expect(row(347)).toMatchObject({ link: 'The Binding of Isaac: Afterbirth †', linkFragment: 'Bosses' });
    expect(row(328)).toMatchObject({ link: 'Hearts', linkFragment: 'Scared_Heart' });
    expect(row(41)).toMatchObject({ link: 'Golden God!', linkFragment: null });
  });

  it('reads the PC id when the field also holds the PS4 id', () => {
    expect(row(349)).toMatchObject({ wikiName: 'Black Hole', condition: 'Defeat 20 Portals', conditionLinks: ['Portal'] });
  });

  it('keeps only the conditions that apply on PC and in the current version', () => {
    expect(row(328).condition).toBe('Reset 7 times in a row');
    expect(row(235).condition).toBe(
      'Unlock all secrets and endings, and collect every item in the game\nUnlock as many of the previously mentioned things as there were in Afterbirth (Ex: Unlocking items that were not in Afterbirth, like Red Key, count towards this achievement, meaning you do not need to unlock items like Mega Blast to gain this achievement)',
    );
  });

  it('removes the HTML comments and keeps the category links that are shown', () => {
    expect(row(324).condition).toBe(
      "Collect every entry in the Bestiary (bugged v190 - Mobs that don't exist in the bestiary are being counted. This allows Sin Collector to be unlocked without a complete bestiary)",
    );
    expect(row(35).condition).toBe('Obtain three Yes Mother? items in one run');
  });

  it('keeps the pages the condition links to', () => {
    expect(row(27)).toMatchObject({
      condition: "Defeat Mom, Mom's Heart, or It Lives! using The Bible",
      conditionLinks: ['Mom', "Mom's Heart", 'It Lives!'],
    });
    expect(row(41).conditionLinks).toEqual(['??? (Boss)', 'The Lamb']);
  });
});
