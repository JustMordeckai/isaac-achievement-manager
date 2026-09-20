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

describe('findTemplates and templateParams', () => {
  it('finds a template with nested braces, ignoring case and underscores', () => {
    const text = 'before {{Infobox_Achievement\n | name = A {{c|Cain}}\n | id = 2\n}} after {{infobox achievement|id=3}}';
    const found = findTemplates(text, 'infobox achievement');
    expect(found.map((t) => t.raw)).toEqual([
      '{{Infobox_Achievement\n | name = A {{c|Cain}}\n | id = 2\n}}',
      '{{infobox achievement|id=3}}',
    ]);
  });

  it('skips a template that is never closed and finds the complete one that follows', () => {
    const text = 'before {{infobox achievement|name=Never closed then more {{infobox achievement|id=5}} after';
    const found = findTemplates(text, 'infobox achievement');
    expect(found.map((t) => t.raw)).toEqual(['{{infobox achievement|id=5}}']);
  });

  it('separates named and positional parameters, ignoring the pipes of links and templates', () => {
    expect(templateParams('{{a|Eden      |text}}')).toEqual({ name: 'a', params: { '1': 'Eden', '2': 'text' } });
    expect(templateParams('{{x| link = [[A|B]] | cond = {{i|Key|n}} and more }}')).toEqual({
      name: 'x',
      params: { link: '[[A|B]]', cond: '{{i|Key|n}} and more' },
    });
  });
});

describe('stripNoise', () => {
  it('removes comments, notes, galleries, nested tables and magic words', () => {
    const text = [
      'a <!-- hidden --> b<ref name="x"/> c<ref>note</ref>',
      '__FORCETOC__',
      '<gallery>\nFile:x.png|caption\n</gallery>',
      '{| class="wikitable"',
      '| cell',
      '{|',
      '| nested',
      '|}',
      '|}',
      'end',
    ].join('\n');
    expect(stripNoise(text)).toBe('a  b c\n\n\nend');
  });
});

describe('selectCurrentVariants', () => {
  it('keeps the current variant of the segments split by <br>', () => {
    expect(selectCurrentVariants('{{dlc|na+}} Old<br>{{dlc|a+}} New')).toBe('{{dlc|a+}} New');
  });

  it('drops the lines meant for consoles, unless they name the PC too', () => {
    expect(selectCurrentVariants('Reset 7 times<br>{{plat|Switch}}{{plat|PS4}} Streak')).toBe('Reset 7 times');
    expect(selectCurrentVariants('{{plat|PC}}{{plat|PS4}} Everywhere')).toBe('{{plat|PC}}{{plat|PS4}} Everywhere');
  });

  it('drops the {{dlc+|removed code}} ranges and keeps the others', () => {
    expect(selectCurrentVariants('A {{dlc+|nr}}old{{dlc-}} B {{dlc+|r}}new{{dlc-|r}} C')).toBe('A  B new C');
  });

  it('removes an obsolete list item along with its sub items', () => {
    const text = ['* {{dlc|nr}} Old effect', '** old detail', '*** finer detail', '* {{dlc|r}} Current effect', '** current detail'].join('\n');
    expect(selectCurrentVariants(text)).toBe('* {{dlc|r}} Current effect\n** current detail');
  });

  it('recognizes a code holding a Cyrillic letter after the n', () => {
    expect(selectCurrentVariants('*{{dlc|nа}} Removed\n* Kept')).toBe('* Kept');
  });
});

describe('cleanInline', () => {
  it('renders the name templates and counts the unknown ones', () => {
    const unknown = new Map<string, number>();
    const result = cleanInline(
      'Use {{i|Red Key|n}} in {{s|Home}} as {{c|Tainted ???}}, {{r|Boss Rush}}, {{cu|blind}}, {{mode|hard}}, {{room|Devil}}, {{achievement|Pop!      |text}}{{mystery|x}}{{=}}',
      unknown,
    );
    expect(result.text).toBe(
      'Use Red Key in Home as Tainted ???, Boss Rush, Curse of the Blind, Hard mode, Devil Room, Pop!=',
    );
    expect(unknown).toEqual(new Map([['mystery', 1]]));
  });

  it('drops the included subpages and the baby galleries without counting them', () => {
    const unknown = new Map<string, number>();
    const result = cleanInline('Before {{/Additions}}{{Repentance Babies}}{{Afterbirth† Babies}}{{Infobox item|x}} after', unknown);
    expect(result.text).toBe('Before after');
    expect(unknown).toEqual(new Map());
  });

  it('renders the links and keeps the list of linked pages', () => {
    const result = cleanInline(
      "[[Mom's Heart]]s, [[??? (Boss)|???]], [[Isaac (Boss)|]], [[#Tips|tips]], [[wikipedia:Castlevania]], [[:category:Yes Mother? items|Yes Mother? items]] [[File:X.png|thumb|[[Cain]]]][[Category:Items]][[fr:Success]]",
    );
    expect(result.text).toBe("Mom's Hearts, ???, Isaac, tips, Castlevania, Yes Mother? items");
    expect(result.links).toEqual(["Mom's Heart", '??? (Boss)', 'Isaac (Boss)', 'Cain']);
  });

  it('removes bold, italics, tags and entities, and tightens the parentheses', () => {
    expect(cleanInline("'''Bold''' and ''italics''<br/>line&nbsp;2 <small>small</small> ( {{dlc|r}} except Plum )").text).toBe(
      'Bold and italics\nline 2 small (except Plum)',
    );
  });
});

describe('toBlocks', () => {
  it('produces paragraphs, list items and definition terms', () => {
    const text = ['First line', 'rest of the paragraph', '', '* Item', '** Sub item', '; Term: definition', ': indent', '----', 'End'].join('\n');
    expect(toBlocks(text)).toEqual([
      { kind: 'paragraph', level: 0, text: 'First line rest of the paragraph' },
      { kind: 'item', level: 1, text: 'Item' },
      { kind: 'item', level: 2, text: 'Sub item' },
      { kind: 'item', level: 1, text: 'Term: definition' },
      { kind: 'paragraph', level: 0, text: 'indent' },
      { kind: 'paragraph', level: 0, text: 'End' },
    ]);
  });

  it('keeps only the current effects of The Nail', () => {
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
  it('separates the intro from the sections, and marks the obsolete headings', () => {
    const text = 'intro\n== A ==\nbody A\n=== A1 ===\nbody A1\n=== {{dlc|nr}} Old ===\nold text\n== [[B]] ==\nbody B';
    const { lead, sections } = splitSections(text);
    expect(lead).toBe('intro');
    expect(sections.map((s) => [s.title, s.level, s.obsolete])).toEqual([
      ['A', 2, false],
      ['A1', 3, false],
      ['Old', 3, true],
      ['B', 2, false],
    ]);
    expect(sections[0].body).toBe('body A\n');
    expect(sectionEnd(sections, 0)).toBe(3);
    expect(sectionEnd(sections, 3)).toBe(4);
  });
});
