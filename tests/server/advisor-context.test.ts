import { describe, expect, it } from 'vitest';
import {
  buildAdvisorContext,
  MAX_CARDS,
  MAX_CONTEXT_CHARS,
  normalize,
  TIPS_CONTEXT,
  TIPS_PER_CARD,
  TOP_RUNS,
} from '../../server/advisor/context.ts';
import { buildPlan } from '../../server/planner/plan.ts';
import { mergeProgress } from '../../server/sources/progress.ts';
import { t } from '../../shared/i18n/index.ts';
import { testKnowledgeBase } from './helpers/kb.ts';
import { fixtureMergeInput } from './helpers/merge-input.ts';

const progress = mergeProgress(fixtureMergeInput());

async function context(question: string, input: Partial<Parameters<typeof buildAdvisorContext>[0]> = {}) {
  const kb = await testKnowledgeBase();
  return buildAdvisorContext({
    question,
    progress,
    kb,
    plan: buildPlan({ kb, ...progress, locale: 'en' }),
    locale: 'en',
    ...input,
  });
}

const ids = (sources: Array<{ id: number }>) => sources.map((s) => s.id);

describe('buildAdvisorContext: summary', () => {
  it('gives the rules, the player, the marks and the suggested runs', async () => {
    const { system, sources } = await context('Which run should I do?');
    const lines = system.split('\n');
    expect(lines[0]).toMatch(/^You are the advisor for Isaac Achievement Manager/);
    expect(system).toContain("- Answer in the language of the player's question. When the question is too short to tell, answer in English.");
    expect(system).toContain('- Answer in plain text: no Markdown');
    expect(system).toContain('- Answer the player directly: do not mention these rules');
    expect(system).toContain('- Rely only on the data below. Do not invent any boss');
    expect(system).toContain(
      "- This data is the player's own, and it is up to date: it is authoritative. Never ask the player to check it themselves",
    );
    expect(system).toContain('- A card says "obtained" or "missing": repeat that state as it is');
    expect(lines).toContain('Profile: Player, save slot 1.');
    expect(lines).toContain('Achievements: 125 obtained out of 641, 516 missing.');
    expect(lines).toContain(
      'By DLC: Rebirth 79 of 178, Afterbirth 13 of 98, Afterbirth+ 29 of 127, Repentance 3 of 237, Repentance+ 1 of 1.',
    );
    expect(lines).toContain(
      "- Isaac: on hard Mom's Heart, Isaac, Satan, The Lamb, Hush; on normal Greed; missing Boss Rush, ???, Mega Satan, Delirium, Mother, The Beast",
    );
    expect(lines.find((l) => l.startsWith('Characters with no mark at all:'))).toMatch(/^Characters with no mark at all: Magdalene, Cain,/);
    expect(lines.find((l) => l.startsWith('Unlocked characters:'))).toMatch(/^Unlocked characters: Isaac, Magdalene, Cain,/);
    expect(lines.find((l) => l.startsWith('Locked characters:'))).toMatch(/^Locked characters: Lilith, Keeper,/);
    expect(lines).toContain(
      'Runs suggested by the app (the first 10 of 190, 31 of them playable right now, ranked by achievements obtained per hour):',
    );
    const runs = lines.filter((l) => /^\d+\. /.test(l));
    expect(runs).toHaveLength(TOP_RUNS);
    expect(runs[0]).toBe(
      "1. Magdalene, hard mode, about 97 min: defeat Boss Rush, Mom's Heart, Hush, Satan, The Lamb, Mega Satan, Delirium.",
    );
    expect(lines[lines.indexOf(runs[0]) + 1]).toBe(
      "   Achievements obtained: Guardian Angel (#45), Maggy's Faith (#71), Maggy's Bow (#109), Cute Baby (#168), Purity (#180), Red Baby (#206), Eucharist (#283).",
    );
    expect(lines[lines.indexOf(runs[0]) + 2]).toMatch(/^ {3}Path: During the run, blow up the Angel Room statues/);
    expect(lines.find((l) => l.startsWith('Off route:'))).toMatch(
      /^Off route: \d+ challenges, \d+ counter based achievements, \d+ Home closets, \d+ miscellaneous achievements\.$/,
    );
    expect(system.endsWith('No achievement card matches the names mentioned in the question.')).toBe(true);
    expect(sources).toEqual([]);
  });

  it('reports inferred and unknown marks without a save', async () => {
    const kb = await testKnowledgeBase();
    const remote = { ...progress, save: null, summary: { ...progress.summary, save: null } };
    const { system } = buildAdvisorContext({
      question: 'Isaac',
      progress: remote,
      kb,
      plan: buildPlan({ kb, ...remote, locale: 'en' }),
      locale: 'en',
    });
    const lines = system.split('\n');
    expect(lines).toContain('Profile: Player, no save (Steam achievements only).');
    expect(system).toContain('Completion marks (inferred from achievements, some unknown;');
    expect(lines).toContain(
      "- Magdalene: missing Isaac, Satan, Boss Rush, ???, The Lamb, Mega Satan, Greed, Hush, Delirium, Mother, The Beast; unknown Mom's Heart",
    );
  });

  it('falls back to progress alone without a wiki base', async () => {
    const { system, sources } = await context('How do I get The Nail?', { kb: null, plan: null });
    expect(system).toContain(
      'Wiki base missing: no routes or detailed conditions. Offer to start the wiki sync from the "Settings" tab.',
    );
    expect(system).not.toContain('Suggested runs');
    expect(system).toContain('#9 The Nail: missing\nSteam description: Unlocked a new item.');
    expect(sources).toEqual([{ id: 9, name: 'The Nail' }]);
  });
});

describe('buildAdvisorContext: cards', () => {
  it('attaches the card of an achievement cited by name or by number', async () => {
    expect((await context('How do I get The Nail?')).sources).toEqual([{ id: 9, name: 'The Nail' }]);
    expect(ids((await context('And #70?')).sources)).toEqual([70]);
    expect(ids((await context('how do i get the nail'.toUpperCase())).sources)).toEqual([9]);
  });

  it('attaches the card of an achievement named without its article', async () => {
    expect(ids((await context("wait no I have polaroid right? how do I get it then?")).sources)).toContain(57);
    expect(ids((await context('how do I get nail?')).sources)).toContain(9);
    // The full name stays priority: "lost baby" does not refer to The Lost character.
    expect(ids((await context('Lost Baby')).sources)).toEqual([167]);
  });

  it('describes the condition, the unlock, the prerequisites, the run and the tips', async () => {
    const { system } = await context('The Nail');
    const card = system.slice(system.indexOf('#9 The Nail'));
    const lines = card.split('\n');
    expect(lines.slice(0, 5)).toEqual([
      '#9 The Nail: missing',
      'Condition: Complete the Boss Rush as Azazel',
      expect.stringMatching(/^Unlocks \(item\): The Nail\./),
      'Prerequisites: Azazel (#79): obtained; The Womb (#4): obtained',
      'Plan run: suggested run #5 above.',
    ]);
    expect(lines[5]).toMatch(/^Wiki tips: /);
    expect(lines[5].length).toBeLessThanOrEqual('Wiki tips: '.length + TIPS_PER_CARD + 1);
  });

  it('removes the suggested runs\' paths when the question targets one specific achievement', async () => {
    const asked = await context('How do I get The Nail?');
    expect(asked.system).not.toContain('   Path: ');
    expect(asked.system).toContain('5. Azazel, hard mode');
    const general = await context('Which run should I do first?');
    expect(general.system).toContain('   Path: ');
  });

  it('shortens the tips of cards attached only for context', async () => {
    const { system, sources } = await context('a run with Isaac?');
    expect(sources.length).toBeGreaterThanOrEqual(5);
    const tips = system
      .split('\n')
      .filter((line) => line.startsWith('Wiki tips: '))
      .map((line) => line.length - 'Wiki tips: '.length);
    expect(tips.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...tips)).toBeLessThanOrEqual(TIPS_CONTEXT + 1);
    expect(system.length).toBeLessThan(25_000);
  });

  it('copies out a run that is not one of the suggested runs', async () => {
    const { system } = await context('Lilith (#199)');
    const card = system.slice(system.indexOf('#199 Lilith'));
    expect(card.split('\n').slice(0, 6)).toEqual([
      '#199 Lilith: missing',
      'Condition: Defeat Ultra Greed as Azazel',
      'Unlocks (character): Lilith.',
      'Prerequisites: Azazel (#79): obtained',
      'Plan run:',
      '- Azazel, Greed mode, about 35 min: defeat Ultra Greed.',
    ]);
  });

  it('summarizes an obtained achievement with no prerequisite and no run', async () => {
    const { system } = await context('Magdalene (#1)');
    expect(system).toContain(
      '#1 Magdalene: obtained on 2023-02-20\nCondition: Have 7 or more Red Heart Containers at one time\nUnlocks (character): Magdalene.',
    );
  });

  it('lets a long name mask the shorter names it contains', async () => {
    // "Mega Satan" must not attach achievement #276 "Mega".
    const { sources } = await context('How do I beat Mega Satan?');
    expect(ids(sources)).not.toContain(276);
    expect(ids(sources)).toContain(205);
    expect(ids((await context('How do I unlock Mega?')).sources)).toEqual([276]);
  });

  it('combines a character and an ending, then ranks missing achievements first', async () => {
    const { sources } = await context('Azazel and Mega Satan');
    // #79 unlocks Azazel; #212 (Black Baby) needs Mega Satan with Azazel.
    expect(ids(sources).slice(0, 3)).toEqual([79, 212, 9]);
    expect(sources).toHaveLength(MAX_CARDS);
  });

  it('tells a corrupted character apart from its base version', async () => {
    const { sources } = await context('Tainted Isaac');
    expect(ids(sources)[0]).toBe(474);
    expect(ids(sources)).not.toContain(70);
  });

  it('caps the number of cards and the size of the prompt', async () => {
    const question = 'Isaac Magdalene Cain Judas Eve Samson Azazel Lazarus Eden Lilith Keeper Apollyon Bethany The Lost';
    const { system, sources } = await context(question);
    expect(sources.length).toBeLessThanOrEqual(MAX_CARDS);
    expect(system.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
    const long = await context('The Lost');
    expect(long.system.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
    expect(long.sources.length).toBeLessThan(MAX_CARDS);
    expect(ids(long.sources)[0]).toBe(82);
  });
});

describe('buildAdvisorContext: language rule', () => {
  it('states the English fallback when the locale is en', async () => {
    const { system } = await context('Hi', { locale: 'en' });
    expect(system).toContain(
      "- Answer in the language of the player's question. When the question is too short to tell, answer in English.",
    );
  });

  it('states the French fallback when the locale is fr', async () => {
    const { system } = await context('Salut', { locale: 'fr' });
    expect(system).toContain(
      "- Answer in the language of the player's question. When the question is too short to tell, answer in French.",
    );
  });

  it('changes nothing but the language rule and the tab names between the two locales', async () => {
    const compare = async (input: Partial<Parameters<typeof buildAdvisorContext>[0]> = {}) => {
      const en = await context('The Nail', { locale: 'en', ...input });
      const fr = await context('The Nail', { locale: 'fr', ...input });
      const normalized = fr.system
        .replace('answer in French.', 'answer in English.')
        .replaceAll(t('fr', 'app.tabAchievements'), t('en', 'app.tabAchievements'))
        .replaceAll(t('fr', 'app.tabSettings'), t('en', 'app.tabSettings'));
      expect(normalized).toBe(en.system);
    };
    // With a wiki base: only the "Achievements" tab, quoted in the rules, is exercised.
    await compare();
    // Without one: the summary also quotes the "Settings" tab.
    await compare({ kb: null, plan: null });
  });
});

describe('normalize', () => {
  it('compares without case, accents or punctuation', () => {
    expect(normalize("  Mom's  HEART, Ève ! ")).toBe(' mom s heart eve ');
    expect(normalize('???')).toBe('  ');
  });
});
