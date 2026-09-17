import { describe, expect, it } from 'vitest';
import {
  cleanInline,
  findTemplates,
  sectionEnd,
  selectCurrentVariants,
  splitSections,
  stripNoise,
  templateParams,
  toBlocks,
} from '../../server/wiki/wikitext.ts';
import { samplePages } from './helpers/wiki.ts';

describe('findTemplates et templateParams', () => {
  it('trouve un modèle à accolades imbriquées sans tenir compte de la casse ni des soulignés', () => {
    const text = 'avant {{Infobox_Achievement\n | name = A {{c|Cain}}\n | id = 2\n}} après {{infobox achievement|id=3}}';
    const found = findTemplates(text, 'infobox achievement');
    expect(found.map((t) => t.raw)).toEqual([
      '{{Infobox_Achievement\n | name = A {{c|Cain}}\n | id = 2\n}}',
      '{{infobox achievement|id=3}}',
    ]);
  });

  it('ignore un modèle jamais fermé et retrouve le modèle complet qui suit', () => {
    const text = 'avant {{infobox achievement|name=Jamais refermé puis suite {{infobox achievement|id=5}} après';
    const found = findTemplates(text, 'infobox achievement');
    expect(found.map((t) => t.raw)).toEqual(['{{infobox achievement|id=5}}']);
  });

  it('sépare les paramètres nommés et positionnels en ignorant les barres des liens et modèles', () => {
    expect(templateParams('{{a|Eden      |text}}')).toEqual({ name: 'a', params: { '1': 'Eden', '2': 'text' } });
    expect(templateParams('{{x| link = [[A|B]] | cond = {{i|Key|n}} and more }}')).toEqual({
      name: 'x',
      params: { link: '[[A|B]]', cond: '{{i|Key|n}} and more' },
    });
  });
});

describe('stripNoise', () => {
  it('retire commentaires, notes, galeries, tableaux imbriqués et mots magiques', () => {
    const text = [
      'a <!-- caché --> b<ref name="x"/> c<ref>note</ref>',
      '__FORCETOC__',
      '<gallery>\nFile:x.png|légende\n</gallery>',
      '{| class="wikitable"',
      '| cellule',
      '{|',
      '| imbriqué',
      '|}',
      '|}',
      'fin',
    ].join('\n');
    expect(stripNoise(text)).toBe('a  b c\n\n\nfin');
  });
});

describe('selectCurrentVariants', () => {
  it('garde la variante actuelle des segments séparés par <br>', () => {
    expect(selectCurrentVariants('{{dlc|na+}} Ancienne<br>{{dlc|a+}} Nouvelle')).toBe('{{dlc|a+}} Nouvelle');
  });

  it('écarte les lignes réservées aux consoles, sauf si elles citent aussi le PC', () => {
    expect(selectCurrentVariants('Reset 7 times<br>{{plat|Switch}}{{plat|PS4}} Streak')).toBe('Reset 7 times');
    expect(selectCurrentVariants('{{plat|PC}}{{plat|PS4}} Partout')).toBe('{{plat|PC}}{{plat|PS4}} Partout');
  });

  it('supprime les plages {{dlc+|code retiré}} et garde les autres', () => {
    expect(selectCurrentVariants('A {{dlc+|nr}}vieux{{dlc-}} B {{dlc+|r}}neuf{{dlc-|r}} C')).toBe('A  B neuf C');
  });

  it('retire un élément de liste obsolète avec ses sous-éléments', () => {
    const text = ['* {{dlc|nr}} Ancien effet', '** détail ancien', '*** détail plus fin', '* {{dlc|r}} Effet actuel', '** détail actuel'].join('\n');
    expect(selectCurrentVariants(text)).toBe('* {{dlc|r}} Effet actuel\n** détail actuel');
  });

  it('reconnaît un code contenant une lettre cyrillique après le n', () => {
    expect(selectCurrentVariants('*{{dlc|nа}} Retiré\n* Gardé')).toBe('* Gardé');
  });
});

describe('cleanInline', () => {
  it('rend les modèles de noms et compte les modèles inconnus', () => {
    const unknown = new Map<string, number>();
    const result = cleanInline(
      'Use {{i|Red Key|n}} in {{s|Home}} as {{c|Tainted ???}}, {{r|Boss Rush}}, {{cu|blind}}, {{mode|hard}}, {{room|Devil}}, {{achievement|Pop!      |text}}{{mystère|x}}{{=}}',
      unknown,
    );
    expect(result.text).toBe(
      'Use Red Key in Home as Tainted ???, Boss Rush, Curse of the Blind, Hard mode, Devil Room, Pop!=',
    );
    expect(unknown).toEqual(new Map([['mystère', 1]]));
  });

  it('supprime sans les compter les sous-pages incluses et les galeries de bébés', () => {
    const unknown = new Map<string, number>();
    const result = cleanInline('Avant {{/Additions}}{{Repentance Babies}}{{Afterbirth† Babies}}{{Infobox item|x}} après', unknown);
    expect(result.text).toBe('Avant après');
    expect(unknown).toEqual(new Map());
  });

  it('rend les liens et garde la liste des pages liées', () => {
    const result = cleanInline(
      "[[Mom's Heart]]s, [[??? (Boss)|???]], [[Isaac (Boss)|]], [[#Tips|astuces]], [[wikipedia:Castlevania]], [[:category:Yes Mother? items|Yes Mother? items]] [[File:X.png|thumb|[[Cain]]]][[Category:Items]][[fr:Succès]]",
    );
    expect(result.text).toBe("Mom's Hearts, ???, Isaac, astuces, Castlevania, Yes Mother? items");
    expect(result.links).toEqual(["Mom's Heart", '??? (Boss)', 'Isaac (Boss)', 'Cain']);
  });

  it('retire gras, italique, balises et entités, et resserre les parenthèses', () => {
    expect(cleanInline("'''Gras''' et ''italique''<br/>ligne&nbsp;2 <small>petit</small> ( {{dlc|r}} sauf Plum )").text).toBe(
      'Gras et italique\nligne 2 petit (sauf Plum)',
    );
  });
});

describe('toBlocks', () => {
  it('produit paragraphes, éléments de liste et termes de définition', () => {
    const text = ['Première ligne', 'suite du paragraphe', '', '* Élément', '** Sous-élément', '; Terme: définition', ': retrait', '----', 'Fin'].join('\n');
    expect(toBlocks(text)).toEqual([
      { kind: 'paragraph', level: 0, text: 'Première ligne suite du paragraphe' },
      { kind: 'item', level: 1, text: 'Élément' },
      { kind: 'item', level: 2, text: 'Sous-élément' },
      { kind: 'item', level: 1, text: 'Terme: définition' },
      { kind: 'paragraph', level: 0, text: 'retrait' },
      { kind: 'paragraph', level: 0, text: 'Fin' },
    ]);
  });

  it('ne garde que les effets actuels de The Nail', () => {
    const { sections } = splitSections(samplePages()['The Nail']);
    const effects = sections.find((s) => s.title === 'Effects');
    expect(toBlocks(effects?.body ?? '')).toEqual([
      {
        kind: 'item',
        level: 1,
        text: 'Gives half a Black Heart, +2 damage, -0.18 speed and the ability to destroy obstacles for the current room.',
      },
      {
        kind: 'item',
        level: 2,
        text: 'If used multiple times in one room, the speed penalty only applies once, but the damage buff can stack.',
      },
      {
        kind: 'item',
        level: 2,
        text: 'Isaac deals 20 contact damage to enemies, twice per second. Does not prevent Isaac from taking contact damage.',
      },
      { kind: 'item', level: 3, text: 'If an enemy is at 40 HP or less, the contact damage is increased to 40 for that enemy.' },
      { kind: 'item', level: 1, text: "Isaac's tears become red for the current room." },
    ]);
  });
});

describe('splitSections', () => {
  it('sépare introduction et sections, et marque les titres obsolètes', () => {
    const text = 'intro\n== A ==\ncorps A\n=== A1 ===\ncorps A1\n=== {{dlc|nr}} Ancien ===\nvieux\n== [[B]] ==\ncorps B';
    const { lead, sections } = splitSections(text);
    expect(lead).toBe('intro');
    expect(sections.map((s) => [s.title, s.level, s.obsolete])).toEqual([
      ['A', 2, false],
      ['A1', 3, false],
      ['Ancien', 3, true],
      ['B', 2, false],
    ]);
    expect(sections[0].body).toBe('corps A\n');
    expect(sectionEnd(sections, 0)).toBe(3);
    expect(sectionEnd(sections, 3)).toBe(4);
  });
});
