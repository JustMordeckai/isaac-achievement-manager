import { describe, expect, it } from 'vitest';
import { mergeProgress } from '../../server/sources/progress.ts';
import { buildAchievementWiki, enrichAchievements, wikiUrl } from '../../server/wiki/card.ts';
import { testKnowledgeBase } from './helpers/kb.ts';
import { fixtureMergeInput } from './helpers/merge-input.ts';

describe('wikiUrl', () => {
  it('encode les titres et les ancres comme le wiki', () => {
    expect(wikiUrl('??? (Boss)')).toBe('https://bindingofisaacrebirth.fandom.com/wiki/%3F%3F%3F_(Boss)');
    expect(wikiUrl('Jacob & Esau')).toBe('https://bindingofisaacrebirth.fandom.com/wiki/Jacob_%26_Esau');
    expect(wikiUrl('Template:Nav challenge')).toBe('https://bindingofisaacrebirth.fandom.com/wiki/Template:Nav_challenge');
    expect(wikiUrl('Pills', 'Re-Lax')).toBe('https://bindingofisaacrebirth.fandom.com/wiki/Pills#Re-Lax');
    expect(wikiUrl('Hearts', 'Scared Heart')).toBe('https://bindingofisaacrebirth.fandom.com/wiki/Hearts#Scared_Heart');
  });
});

describe('enrichAchievements', () => {
  const { achievements } = mergeProgress(fixtureMergeInput());

  it('ajoute le type de condition et le personnage', async () => {
    const entries = enrichAchievements(achievements, await testKnowledgeBase());
    expect(entries[8]).toMatchObject({ id: 9, how: 'mark', character: 'azazel' });
    expect(entries[2]).toMatchObject({ id: 3, how: 'boss', character: null });
    expect(entries[640]).toMatchObject({ id: 641, how: 'misc', character: null });
  });

  it('laisse les champs à null sans base wiki', () => {
    expect(enrichAchievements(achievements, null)[8]).toMatchObject({ id: 9, how: null, character: null });
  });
});

describe('buildAchievementWiki', () => {
  it('assemble condition, déblocage et astuces d’une marque de complétion', async () => {
    const kb = await testKnowledgeBase();
    const wiki = buildAchievementWiki(kb, 70);
    expect(wiki).toMatchObject({
      name: "Isaac's Head",
      condition: 'Complete the Boss Rush as Isaac',
      how: { kind: 'mark', character: 'isaac', ending: 'bossRush', hard: false },
      unlocks: { kind: 'trinket', name: "Isaac's Head" },
      sourceUrl: 'https://bindingofisaacrebirth.fandom.com/wiki/Achievements',
    });
    expect(wiki?.unlockPage).toMatchObject({ title: "Isaac's Head", url: 'https://bindingofisaacrebirth.fandom.com/wiki/Isaac\'s_Head' });
    expect(wiki?.tips.map((t) => [t.page, t.sections.map((s) => s.title)])).toEqual([['Boss Rush', ['Tips']]]);
  });

  it('ajoute la page du personnage, celle de Home pour un placard, et la page du défi', async () => {
    const kb = await testKnowledgeBase();
    expect(buildAchievementWiki(kb, 474)?.tips.map((t) => t.page)).toEqual(['Tainted Isaac', 'Home']);
    expect(buildAchievementWiki(kb, 46)?.tips.map((t) => t.page)).toEqual(['Cain']);
    expect(buildAchievementWiki(kb, 110)?.tips.map((t) => t.page)).toEqual(['Boss Rush', 'Cain']);
    expect(buildAchievementWiki(kb, 60)?.tips.map((t) => t.page)).toEqual([]);
    expect(buildAchievementWiki(kb, 89)?.tips.map((t) => t.page)).toEqual(['Pitch Black']);
  });

  it('ajoute les astuces générales rattachées et l’extrait de la section visée', async () => {
    const kb = await testKnowledgeBase();
    const noDamage = buildAchievementWiki(kb, 37);
    expect(noDamage?.tips.at(-1)).toMatchObject({
      page: 'Achievement Tips',
      url: 'https://bindingofisaacrebirth.fandom.com/wiki/Achievement_Tips',
    });
    expect(noDamage?.tips.at(-1)?.sections.map((s) => s.title)).toEqual(['No Damage Achievements']);
    const bossRushTip = buildAchievementWiki(kb, 9);
    expect(bossRushTip?.unlockPage?.intro).toEqual(kb.pages['The Nail']?.intro ?? []);
  });

  it('renvoie null pour un succès absent du wiki ou inconnu', async () => {
    const kb = await testKnowledgeBase();
    expect(buildAchievementWiki(kb, 641)).toBeNull();
    expect(buildAchievementWiki(kb, 9999)).toBeNull();
  });
});
