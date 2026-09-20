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
import { testKnowledgeBase } from './helpers/kb.ts';
import { fixtureMergeInput } from './helpers/merge-input.ts';

const progress = mergeProgress(fixtureMergeInput());

async function context(question: string, input: Partial<Parameters<typeof buildAdvisorContext>[0]> = {}) {
  const kb = await testKnowledgeBase();
  // The advisor prompt itself is still French until task 6: keep the plan French too, so this
  // file's existing French assertions on the plan's run text stay valid.
  return buildAdvisorContext({ question, progress, kb, plan: buildPlan({ kb, ...progress, locale: 'fr' }), ...input });
}

const ids = (sources: Array<{ id: number }>) => sources.map((s) => s.id);

describe('buildAdvisorContext : résumé', () => {
  it('donne les règles, le joueur, les marques et les runs conseillées', async () => {
    const { system, sources } = await context('Quelle run faire ?');
    const lines = system.split('\n');
    expect(lines[0]).toMatch(/^Tu es le conseiller d'Isaac Achievement Manager/);
    expect(system).toContain('- Réponds en français, en texte simple : pas de Markdown');
    expect(system).toContain('- Réponds directement au joueur : ne parle pas de ces règles');
    expect(system).toContain("- Appuie-toi uniquement sur les données ci-dessous. N'invente ni boss");
    expect(system).toContain(
      "- Ces données sont celles du joueur, à jour : elles font foi. Ne lui demande jamais de vérifier lui-même ce qu'elles disent",
    );
    expect(system).toContain('- Une fiche dit « obtenu » ou « manquant » : reprends cet état tel quel');
    expect(lines).toContain('Profil : Player, sauvegarde du slot 1.');
    expect(lines).toContain('Succès : 125 obtenus sur 641, 516 manquants.');
    expect(lines).toContain(
      'Par extension : Rebirth 79 sur 178, Afterbirth 13 sur 98, Afterbirth+ 29 sur 127, Repentance 3 sur 237, Repentance+ 1 sur 1.',
    );
    expect(lines).toContain(
      "- Isaac : en difficile Mom's Heart, Isaac, Satan, The Lamb, Hush ; en normal Greed ; absentes Boss Rush, ???, Mega Satan, Delirium, Mother, The Beast",
    );
    expect(lines.find((l) => l.startsWith('Personnages sans aucune marque :'))).toMatch(/^Personnages sans aucune marque : Magdalene, Cain,/);
    expect(lines.find((l) => l.startsWith('Personnages débloqués :'))).toMatch(/^Personnages débloqués : Isaac, Magdalene, Cain,/);
    expect(lines.find((l) => l.startsWith('Personnages verrouillés :'))).toMatch(/^Personnages verrouillés : Lilith, Keeper,/);
    expect(lines).toContain(
      "Runs conseillées par l'application (les 10 premières sur 190, dont 31 jouables tout de suite, triées par succès obtenus par heure) :",
    );
    const runs = lines.filter((l) => /^\d+\. /.test(l));
    expect(runs).toHaveLength(TOP_RUNS);
    expect(runs[0]).toBe(
      "1. Magdalene, mode difficile, environ 97 min : battre Boss Rush, Mom's Heart, Hush, Satan, The Lamb, Mega Satan, Delirium.",
    );
    expect(lines[lines.indexOf(runs[0]) + 1]).toBe(
      "   Succès obtenus : Guardian Angel (#45), Maggy's Faith (#71), Maggy's Bow (#109), Cute Baby (#168), Purity (#180), Red Baby (#206), Eucharist (#283).",
    );
    expect(lines[lines.indexOf(runs[0]) + 2]).toMatch(/^ {3}Chemin : Pendant la run, faire exploser les statues/);
    expect(lines.find((l) => l.startsWith('Hors routes :'))).toMatch(/^Hors routes : \d+ défis, \d+ succès à compteur, \d+ placards de Home, \d+ succès divers\.$/);
    expect(system.endsWith('Aucune fiche de succès ne correspond aux noms cités dans la question.')).toBe(true);
    expect(sources).toEqual([]);
  });

  it('signale des marques déduites et inconnues sans sauvegarde', async () => {
    const kb = await testKnowledgeBase();
    const remote = { ...progress, save: null, summary: { ...progress.summary, save: null } };
    const { system } = buildAdvisorContext({ question: 'Isaac', progress: remote, kb, plan: buildPlan({ kb, ...remote, locale: 'fr' }) });
    const lines = system.split('\n');
    expect(lines).toContain('Profil : Player, sans sauvegarde (succès Steam seulement).');
    expect(system).toContain('Marques de complétion (déduites des succès, certaines inconnues ;');
    expect(lines).toContain(
      '- Magdalene : absentes Isaac, Satan, Boss Rush, ???, The Lamb, Mega Satan, Greed, Hush, Delirium, Mother, The Beast ; inconnues Mom\'s Heart',
    );
  });

  it('se contente de la progression sans base wiki', async () => {
    const { system, sources } = await context('Comment obtenir The Nail ?', { kb: null, plan: null });
    expect(system).toContain(
      "Base wiki absente : pas de routes ni de conditions détaillées. Propose de lancer la synchro du wiki depuis l'onglet Paramètres.",
    );
    expect(system).not.toContain('Runs conseillées');
    expect(system).toContain('#9 The Nail : manquant\nDescription Steam : Unlocked a new item.');
    expect(sources).toEqual([{ id: 9, name: 'The Nail' }]);
  });
});

describe('buildAdvisorContext : fiches', () => {
  it('joint la fiche d’un succès cité par son nom ou par son numéro', async () => {
    expect((await context('Comment obtenir The Nail ?')).sources).toEqual([{ id: 9, name: 'The Nail' }]);
    expect(ids((await context('Et le #70 ?')).sources)).toEqual([70]);
    expect(ids((await context('comment obtenir the nail'.toUpperCase())).sources)).toEqual([9]);
  });

  it('joint la fiche d’un succès nommé sans son article', async () => {
    expect(ids((await context("bah non je l'ai polaroid non ? comment je l'obtiens alors ?")).sources)).toContain(57);
    expect(ids((await context('comment obtenir nail ?')).sources)).toContain(9);
    // Le nom complet reste prioritaire : « lost baby » ne parle pas du personnage The Lost.
    expect(ids((await context('Lost Baby')).sources)).toEqual([167]);
  });

  it('décrit la condition, le déblocage, les prérequis, la run et les astuces', async () => {
    const { system } = await context('The Nail');
    const card = system.slice(system.indexOf('#9 The Nail'));
    const lines = card.split('\n');
    expect(lines.slice(0, 5)).toEqual([
      '#9 The Nail : manquant',
      'Condition : Complete the Boss Rush as Azazel',
      expect.stringMatching(/^Débloque \(item\) : The Nail\./),
      'Prérequis : Azazel (#79) : obtenu ; The Womb (#4) : obtenu',
      'Run du plan : la run conseillée n° 5 ci-dessus.',
    ]);
    expect(lines[5]).toMatch(/^Astuces du wiki : /);
    expect(lines[5].length).toBeLessThanOrEqual('Astuces du wiki : '.length + TIPS_PER_CARD + 1);
  });

  it('retire le chemin des runs conseillées quand la question vise un succès précis', async () => {
    const asked = await context('Comment obtenir The Nail ?');
    expect(asked.system).not.toContain('   Chemin : ');
    expect(asked.system).toContain('5. Azazel, mode difficile');
    const general = await context('Quelle run faire en premier ?');
    expect(general.system).toContain('   Chemin : ');
  });

  it('raccourcit les astuces des fiches jointes pour le seul contexte', async () => {
    const { system, sources } = await context('une run avec Isaac ?');
    expect(sources.length).toBeGreaterThanOrEqual(5);
    const tips = system
      .split('\n')
      .filter((line) => line.startsWith('Astuces du wiki : '))
      .map((line) => line.length - 'Astuces du wiki : '.length);
    expect(tips.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...tips)).toBeLessThanOrEqual(TIPS_CONTEXT + 1);
    expect(system.length).toBeLessThan(25_000);
  });

  it('recopie une run qui ne fait pas partie des runs conseillées', async () => {
    const { system } = await context('Lilith (#199)');
    const card = system.slice(system.indexOf('#199 Lilith'));
    expect(card.split('\n').slice(0, 6)).toEqual([
      '#199 Lilith : manquant',
      'Condition : Defeat Ultra Greed as Azazel',
      'Débloque (character) : Lilith.',
      'Prérequis : Azazel (#79) : obtenu',
      'Run du plan :',
      '- Azazel, mode Greed, environ 35 min : battre Ultra Greed.',
    ]);
  });

  it('résume un succès obtenu sans prérequis ni run', async () => {
    const { system } = await context('Magdalene (#1)');
    expect(system).toContain(
      '#1 Magdalene : obtenu le 2023-02-20\nCondition : Have 7 or more Red Heart Containers at one time\nDébloque (character) : Magdalene.',
    );
  });

  it('laisse un nom long masquer les noms plus courts qu’il contient', async () => {
    // « Mega Satan » ne doit pas joindre le succès #276 « Mega ».
    const { sources } = await context('Comment battre Mega Satan ?');
    expect(ids(sources)).not.toContain(276);
    expect(ids(sources)).toContain(205);
    expect(ids((await context('Comment débloquer Mega ?')).sources)).toEqual([276]);
  });

  it('combine personnage et fin, puis place les manquants d’abord', async () => {
    const { sources } = await context('Azazel et Mega Satan');
    // #79 débloque Azazel ; #212 (Black Baby) demande Mega Satan avec Azazel.
    expect(ids(sources).slice(0, 3)).toEqual([79, 212, 9]);
    expect(sources).toHaveLength(MAX_CARDS);
  });

  it('distingue un personnage corrompu de sa version de base', async () => {
    const { sources } = await context('Tainted Isaac');
    expect(ids(sources)[0]).toBe(474);
    expect(ids(sources)).not.toContain(70);
  });

  it('borne le nombre de fiches et la taille de la consigne', async () => {
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

describe('normalize', () => {
  it('compare sans casse, accents ni ponctuation', () => {
    expect(normalize("  Mom's  HEART, Ève ! ")).toBe(' mom s heart eve ');
    expect(normalize('???')).toBe('  ');
  });
});
