import { describe, expect, it } from 'vitest';
import { CHARACTER_INFO, isCharacterUnlocked } from '../../server/planner/characters.ts';
import { MINUTES, ROUTE_OPTIONS, routeSteps } from '../../server/planner/combos.ts';
import { requirementGroups } from '../../server/planner/requirements.ts';
import { TARGETS } from '../../server/planner/targets.ts';
import { CHARACTERS } from '../../shared/characters.ts';
import { ENDINGS } from '../../shared/endings.ts';
import { type MessageKey, t } from '../../shared/i18n/index.ts';
import { testKnowledgeBase } from './helpers/kb.ts';

describe('TARGETS', () => {
  it('describes the 13 endings with existing requirements', async () => {
    const kb = await testKnowledgeBase();
    const names = new Map(kb.achievements.map((a) => [a.id, a.name]));
    expect(Object.keys(TARGETS).sort()).toEqual(ENDINGS.map((e) => e.id).sort());
    const ids = new Set(Object.values(TARGETS).flatMap((target) => [...target.requires, ...target.requiresAny.flat()]));
    expect(Object.fromEntries([...ids].sort((a, b) => a - b).map((id) => [id, names.get(id)]))).toEqual({
      4: 'The Womb',
      34: 'It Lives!',
      57: 'The Polaroid',
      78: 'The Negative',
      155: 'Angels',
      234: 'Blue Womb',
      320: 'New Area',
      341: 'Greedier!',
      407: 'A Secret Exit',
      635: 'A Strange Door',
    });
    expect(TARGETS.beast.requiresAny).toEqual([[57, 78]]);
  });
});

describe('ROUTE_OPTIONS', () => {
  const main = ROUTE_OPTIONS.filter((o) => o.kind === 'main');

  it('lists the possible runs', () => {
    expect(ROUTE_OPTIONS).toHaveLength(53);
    expect(main).toHaveLength(46);
    expect(ROUTE_OPTIONS.filter((o) => o.kind !== 'main').map((o) => o.endings)).toEqual([
      [],
      ['mother'],
      ['bossRush', 'mother'],
      ['beast'],
      ['bossRush', 'beast'],
      ['ultraGreed'],
      ['ultraGreedier'],
    ]);
  });

  it('follows the wiki combinations', () => {
    for (const option of main) {
      const e = option.endings;
      expect(new Set(e).size).toBe(e.length);
      expect(e).toContain('momsHeart');
      // Cathedral and Sheol are mutually exclusive.
      expect(e.includes('isaac') && e.includes('satan')).toBe(false);
      if (e.includes('blueBaby')) expect(e.indexOf('isaac')).toBe(e.indexOf('blueBaby') - 1);
      if (e.includes('lamb')) expect(e.indexOf('satan')).toBe(e.indexOf('lamb') - 1);
      if (e.includes('megaSatan')) expect(['blueBaby', 'lamb']).toContain(e[e.indexOf('megaSatan') - 1]);
      if (e.includes('delirium')) {
        expect(e.at(-1)).toBe('delirium');
        expect(['hush', 'blueBaby', 'lamb', 'megaSatan']).toContain(e.at(-2));
      }
      const continuesAfterHush = e.includes('hush') && e.at(-1) !== 'hush';
      expect(option.extraRequires).toEqual(continuesAfterHush ? [320] : []);
    }
  });

  it('estimates the duration per added ending', () => {
    const longest = main.find((o) => o.endings.join() === 'bossRush,momsHeart,hush,isaac,blueBaby,megaSatan,delirium');
    expect(longest?.minutes).toBe(
      MINUTES.main + MINUTES.bossRush + MINUTES.hush + MINUTES.cathedralOrSheol + MINUTES.chestOrDarkRoom + MINUTES.megaSatan + MINUTES.delirium,
    );
    expect(main.find((o) => o.endings.join() === 'momsHeart')?.minutes).toBe(MINUTES.main);
  });
});

describe('routeSteps', () => {
  it('describes a Chest run with Mega Satan', () => {
    const option = ROUTE_OPTIONS.find((o) => o.endings.join() === 'momsHeart,isaac,blueBaby,megaSatan');
    if (!option) throw new Error('missing route');
    expect(routeSteps(option, 'en')).toEqual([
      'During the run, blow up the Angel Room statues to beat Uriel and Gabriel (Key Piece 1 and 2).',
      'Go through Basement, Caves and Depths, then beat Mom in Depths II.',
      'After Mom, take The Polaroid (The Negative disappears).',
      "Go through Womb I and II and beat Mom's Heart (or It Lives).",
      'Take the beam of light to Cathedral and beat Isaac.',
      "Touch Isaac's chest while holding The Polaroid to enter Chest, then beat ???.",
      'Without entering the chest, go back to the starting room, open the Golden Gate with Key Piece 1 and 2, then beat Mega Satan.',
    ]);
    // Same route, in the reader's language: proves routeSteps picks the same keys and reads them from the catalogue.
    const keys: MessageKey[] = [
      'planner.step.mainAngelStatues',
      'planner.step.momRun',
      'planner.step.mainTakePolaroid',
      'planner.step.momsHeart',
      'planner.step.isaac',
      'planner.step.blueBaby',
      'planner.step.megaSatan',
    ];
    expect(routeSteps(option, 'fr')).toEqual(keys.map((key) => t('fr', key)));
  });

  it('places Boss Rush at the right point of the Mother and The Beast routes', () => {
    const mother = routeSteps({ kind: 'mother', endings: ['bossRush', 'mother'], extraRequires: [], minutes: 63 }, 'en');
    expect(mother).toHaveLength(9);
    expect(mother[5]).toBe('In Mausoleum II, beat Mom.');
    expect(mother[6]).toBe(t('en', TARGETS.bossRush.step));
    expect(mother.at(-1)).toBe(t('en', TARGETS.mother.step));
    const beast = routeSteps({ kind: 'beast', endings: ['beast'], extraRequires: [], minutes: 60 }, 'en');
    expect(beast).not.toContain(t('en', TARGETS.bossRush.step));
    expect(beast.at(-1)).toBe(t('en', TARGETS.beast.step));
    expect(routeSteps({ kind: 'greedier', endings: ['ultraGreedier'], extraRequires: [], minutes: 45 }, 'en')[0]).toBe(
      'Start a run in Greedier mode.',
    );
  });
});

describe('CHARACTER_INFO', () => {
  it('links each character to its unlock achievement', async () => {
    const kb = await testKnowledgeBase();
    const characterUnlocks = kb.achievements.filter((a) => a.unlocks.kind === 'character').map((a) => a.id);
    const table = CHARACTERS.flatMap((c) => (CHARACTER_INFO[c.id].unlockedBy === null ? [] : [CHARACTER_INFO[c.id].unlockedBy]));
    expect(Object.keys(CHARACTER_INFO)).toEqual(CHARACTERS.map((c) => c.id));
    expect(table).toHaveLength(33);
    // Only divergence from the database: #191 is a Keeper starting item, not its unlock.
    expect(characterUnlocks.filter((id) => !table.includes(id))).toEqual([191]);
    expect(table.filter((id) => !characterUnlocks.includes(id as number))).toEqual([]);
  });

  it('knows whether a character is playable', () => {
    expect(isCharacterUnlocked('isaac', new Set())).toBe(true);
    expect(isCharacterUnlocked('keeper', new Set([191]))).toBe(false);
    expect(isCharacterUnlocked('keeper', new Set([251]))).toBe(true);
    expect(isCharacterUnlocked('taintedIsaac', new Set([474]))).toBe(true);
  });
});

describe('requirementGroups', () => {
  it('combines character unlock, endings and route requirements without duplicates', () => {
    expect(requirementGroups('taintedIsaac', ['isaac', 'blueBaby'])).toEqual([[474], [4], [34], [57]]);
    expect(requirementGroups(null, ['beast', 'bossRush'], [320])).toEqual([[635], [57, 78], [4], [320]]);
    expect(requirementGroups('isaac', [])).toEqual([]);
  });

  it('drops a group already covered by an achievement required alone', () => {
    // The Beast requires The Polaroid or The Negative; ??? already requires The Polaroid.
    expect(requirementGroups(null, ['blueBaby', 'beast'])).toEqual([[57], [635]]);
    expect(requirementGroups(null, ['lamb', 'blueBaby', 'beast'])).toEqual([[78], [57], [635]]);
  });
});
