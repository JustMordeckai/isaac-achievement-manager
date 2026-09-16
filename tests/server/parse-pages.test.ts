import { describe, expect, it } from 'vitest';
import { parseAchievementsPage } from '../../server/wiki/parse-achievements.ts';
import {
  MAX_SECTION_CHARS,
  parseAchievementTips,
  parseChallenge,
  parseChallengeNav,
  parsePage,
  sectionBlocks,
} from '../../server/wiki/parse-pages.ts';
import { samplePages, wikiText } from './helpers/wiki.ts';

const pages = samplePages();
const page = (title: string) => {
  const text = pages[title];
  if (text === undefined) throw new Error(`page ${title} absente de l'échantillon`);
  return parsePage(title, text);
};
const sectionTitles = (title: string) => page(title).sections.map((s) => s.title);

describe('parsePage', () => {
  it('lit le type d’infobox, l’effet actuel et la qualité d’un objet', () => {
    expect(page('The Nail')).toEqual({
      title: 'The Nail',
      infobox: 'activated collectible',
      effect: 'Gives half a Black Heart. For the current room; +2 damage, -0.18 speed, Isaac breaks rocks and deals contact damage.',
      quality: '2',
      intro: [],
      sections: [],
    });
    expect(page('Lucky Rock').infobox).toBe('trinket');
    expect(page('Credit Card').infobox).toBe('pickup');
    expect(page('Bomb Bag').infobox).toBe('passive collectible');
    expect(page('Pills').infobox).toBeNull();
  });

  it('garde l’introduction et la section Strategy d’un personnage', () => {
    const cain = page('Cain');
    expect(cain.infobox).toBe('character');
    expect(cain.intro).toEqual([
      { kind: 'paragraph', level: 0, text: 'Cain is a character unlocked by obtaining 55 or more coins at once in a run.' },
      { kind: 'paragraph', level: 0, text: 'Cain starts with two Red Heart containers, one Key, and Lucky Foot.' },
      {
        kind: 'paragraph',
        level: 0,
        text: 'Cain also starts with a Paper Clip trinket after 68 coins have been donated to the Greed Donation Machine.',
      },
    ]);
    expect(cain.sections.map((s) => s.title)).toEqual(['Strategy']);
    expect(cain.sections[0].blocks[0].text).toMatch(/^Cain starts with slightly higher damage and speed/);
  });

  it('choisit les sections d’astuces selon le type de page', () => {
    expect(sectionTitles('Cursed!')).toEqual(['Difficulty', 'Notes', 'Strategy']);
    expect(sectionTitles('Mother')).toEqual(['Strategies']);
    expect(sectionTitles('Boss Rush')).toEqual(['Tips']);
    expect(sectionTitles('Home')).toEqual(['Hidden closet']);
    expect(sectionTitles('The Lost')).toEqual(['General Strategies', 'Unlocking The Lost in Afterbirth']);
    expect(sectionTitles('Satan')).toEqual([]);
    expect(sectionTitles('Cain')).not.toContain('Notes');
  });

  it('coupe une section trop longue et le signale', () => {
    const strategy = page('Suicide King (Challenge)').sections.find((s) => s.title === 'Strategy');
    expect(strategy?.truncated).toBe(true);
    const length = strategy?.blocks.reduce((total, block) => total + block.text.length, 0) ?? 0;
    expect(length).toBeLessThanOrEqual(MAX_SECTION_CHARS);
  });
});

describe('sectionBlocks', () => {
  it('renvoie les blocs de la section visée par une ancre, ou null', () => {
    expect(sectionBlocks(pages['Boss Rush'], 'Tips')?.length).toBeGreaterThan(0);
    expect(sectionBlocks(pages.Pills, 'Re-Lax')).toBeNull();
  });

  it('renvoie null pour une section sans texte (galerie seule)', () => {
    expect(sectionBlocks(pages['Co-op'], 'Repentance babies')).toBeNull();
  });
});

describe('défis', () => {
  const refs = parseChallengeNav(wikiText('Template_Nav_challenge.wiki'));

  it('liste les 45 défis numérotés', () => {
    expect(refs.map((r) => r.number)).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
    expect(refs[6]).toEqual({ number: 7, title: 'Suicide King (Challenge)', name: 'Suicide King' });
    expect(refs[44]).toEqual({ number: 45, title: 'DELETE THIS', name: 'DELETE THIS' });
  });

  const challenge = (title: string) => {
    const ref = refs.find((r) => r.title === title);
    if (!ref) throw new Error(`défi ${title} absent`);
    return parseChallenge(ref, pages[title]);
  };

  it('applique les valeurs par défaut du modèle (Isaac, Mom)', () => {
    expect(challenge('Pitch Black')).toEqual({
      number: 1,
      title: 'Pitch Black',
      name: 'Pitch Black',
      character: 'Isaac',
      goal: 'Mom',
      blindfolded: false,
      startingItems: [],
      curse: 'Curse of the Darkness, Curse of the Unknown',
      reward: 'Rune of Hagalaz',
      unlockedBy: null,
    });
  });

  it('lit personnage, objets, objectif, objectif spécial et bandeau', () => {
    expect(challenge('Cursed!')).toMatchObject({
      character: 'Magdalene',
      goal: 'Mom',
      startingItems: ['Blue Map', 'The Compass', 'Raw Liver', 'Treasure Map', 'Yum Heart', "Child's Heart"],
      curse: 'Curse of the Cursed',
      reward: 'Credit Card',
      unlockedBy: 'Cursed!',
    });
    expect(challenge('Solar System')).toMatchObject({ goal: "Mom's Heart", blindfolded: true });
    expect(challenge('Backasswards').goal).toBe('Basement/Cellar/Burning Basement I');
    expect(challenge('Suicide King (Challenge)')).toMatchObject({ character: 'Lazarus', goal: 'Isaac', unlockedBy: 'Suicide King 2' });
  });
});

describe('parseAchievementTips', () => {
  const rows = parseAchievementsPage(wikiText('Achievements.wiki'));
  const tips = parseAchievementTips(wikiText('Achievement_Tips.wiki'), rows);

  it('rattache les sections par titre, par liste de définitions et par modèle {{a}}', () => {
    expect(tips.map((t) => [t.ids, t.section.title])).toEqual([
      [[144], 'Super Meat Boy & Super Bandage Girl'],
      [[378], 'Lachryphagy'],
      [[323], "5 Nights at Mom's"],
      [[326], 'ZIP!'],
      [[327], "It's the Key"],
      [[37, 38, 39, 40, 83, 351, 365, 368, 374], 'No Damage Achievements'],
    ]);
  });

  it('garde le texte de chaque entrée et les sous-sections d’un groupe', () => {
    expect(tips[2].section.blocks[0]).toEqual({
      kind: 'paragraph',
      level: 0,
      text: 'Get a 5-win streak, using a different character for each win.',
    });
    const noDamage = tips[5].section;
    expect(noDamage.blocks.some((b) => b.kind === 'heading' && b.text === 'What Counts as Taking Damage')).toBe(true);
    expect(noDamage.truncated).toBe(true);
  });
});
