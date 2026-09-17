import { describe, expect, it } from 'vitest';
import { CHARACTER_INFO, isCharacterUnlocked } from '../../server/planner/characters.ts';
import { MINUTES, ROUTE_OPTIONS, routeSteps } from '../../server/planner/combos.ts';
import { requirementGroups } from '../../server/planner/requirements.ts';
import { TARGETS } from '../../server/planner/targets.ts';
import { CHARACTERS } from '../../shared/characters.ts';
import { ENDINGS } from '../../shared/endings.ts';
import { testKnowledgeBase } from './helpers/kb.ts';

describe('TARGETS', () => {
  it('décrit les 13 fins avec des prérequis existants', async () => {
    const kb = await testKnowledgeBase();
    const names = new Map(kb.achievements.map((a) => [a.id, a.name]));
    expect(Object.keys(TARGETS).sort()).toEqual(ENDINGS.map((e) => e.id).sort());
    const ids = new Set(Object.values(TARGETS).flatMap((t) => [...t.requires, ...t.requiresAny.flat()]));
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

  it('liste les runs possibles', () => {
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

  it('respecte les combinaisons du wiki', () => {
    for (const option of main) {
      const e = option.endings;
      expect(new Set(e).size).toBe(e.length);
      expect(e).toContain('momsHeart');
      // Cathedral et Sheol s'excluent.
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

  it('estime la durée par fin ajoutée', () => {
    const longest = main.find((o) => o.endings.join() === 'bossRush,momsHeart,hush,isaac,blueBaby,megaSatan,delirium');
    expect(longest?.minutes).toBe(
      MINUTES.main + MINUTES.bossRush + MINUTES.hush + MINUTES.cathedralOrSheol + MINUTES.chestOrDarkRoom + MINUTES.megaSatan + MINUTES.delirium,
    );
    expect(main.find((o) => o.endings.join() === 'momsHeart')?.minutes).toBe(MINUTES.main);
  });
});

describe('routeSteps', () => {
  it('décrit une run Chest avec Mega Satan', () => {
    const option = ROUTE_OPTIONS.find((o) => o.endings.join() === 'momsHeart,isaac,blueBaby,megaSatan');
    if (!option) throw new Error('route absente');
    expect(routeSteps(option)).toEqual([
      'Pendant la run, faire exploser les statues des Angel Rooms pour battre Uriel et Gabriel (Key Piece 1 et 2).',
      'Traverser Basement, Caves et Depths, puis battre Mom en Depths II.',
      'Après Mom, prendre The Polaroid (The Negative disparaît).',
      "Traverser Womb I et II et battre Mom's Heart (ou It Lives).",
      'Prendre le rayon de lumière vers Cathedral et battre Isaac.',
      "Toucher le coffre d'Isaac en tenant The Polaroid pour entrer dans Chest, puis battre ???.",
      'Sans entrer dans le coffre, revenir à la salle de départ, ouvrir la Golden Gate avec Key Piece 1 et 2, puis battre Mega Satan.',
    ]);
  });

  it('place le Boss Rush au bon moment des routes Mother et The Beast', () => {
    const mother = routeSteps({ kind: 'mother', endings: ['bossRush', 'mother'], extraRequires: [], minutes: 63 });
    expect(mother).toHaveLength(9);
    expect(mother[5]).toBe('En Mausoleum II, battre Mom.');
    expect(mother[6]).toBe(TARGETS.bossRush.step);
    expect(mother.at(-1)).toBe(TARGETS.mother.step);
    const beast = routeSteps({ kind: 'beast', endings: ['beast'], extraRequires: [], minutes: 60 });
    expect(beast).not.toContain(TARGETS.bossRush.step);
    expect(beast.at(-1)).toBe(TARGETS.beast.step);
    expect(routeSteps({ kind: 'greedier', endings: ['ultraGreedier'], extraRequires: [], minutes: 45 })[0]).toBe(
      'Lancer une partie en mode Greedier.',
    );
  });
});

describe('CHARACTER_INFO', () => {
  it('relie chaque personnage à son succès de déblocage', async () => {
    const kb = await testKnowledgeBase();
    const characterUnlocks = kb.achievements.filter((a) => a.unlocks.kind === 'character').map((a) => a.id);
    const table = CHARACTERS.flatMap((c) => (CHARACTER_INFO[c.id].unlockedBy === null ? [] : [CHARACTER_INFO[c.id].unlockedBy]));
    expect(Object.keys(CHARACTER_INFO)).toEqual(CHARACTERS.map((c) => c.id));
    expect(table).toHaveLength(33);
    // Seule divergence avec la base : #191 est un objet de départ de Keeper, pas son déblocage.
    expect(characterUnlocks.filter((id) => !table.includes(id))).toEqual([191]);
    expect(table.filter((id) => !characterUnlocks.includes(id as number))).toEqual([]);
  });

  it('sait si un personnage est jouable', () => {
    expect(isCharacterUnlocked('isaac', new Set())).toBe(true);
    expect(isCharacterUnlocked('keeper', new Set([191]))).toBe(false);
    expect(isCharacterUnlocked('keeper', new Set([251]))).toBe(true);
    expect(isCharacterUnlocked('taintedIsaac', new Set([474]))).toBe(true);
  });
});

describe('requirementGroups', () => {
  it('réunit déblocage du personnage, fins et exigences de la route sans doublon', () => {
    expect(requirementGroups('taintedIsaac', ['isaac', 'blueBaby'])).toEqual([[474], [4], [34], [57]]);
    expect(requirementGroups(null, ['beast', 'bossRush'], [320])).toEqual([[635], [57, 78], [4], [320]]);
    expect(requirementGroups('isaac', [])).toEqual([]);
  });

  it('retire un groupe déjà couvert par un succès exigé seul', () => {
    // The Beast demande The Polaroid ou The Negative ; ??? exige déjà The Polaroid.
    expect(requirementGroups(null, ['blueBaby', 'beast'])).toEqual([[57], [635]]);
    expect(requirementGroups(null, ['lamb', 'blueBaby', 'beast'])).toEqual([[78], [57], [635]]);
  });
});
