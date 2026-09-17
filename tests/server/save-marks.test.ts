import { describe, expect, it } from 'vitest';
import { parseSaveFile } from '../../server/sources/save-file.ts';
import { MARK_COUNTERS, readCompletionMarks } from '../../server/sources/save-marks.ts';
import { CHARACTERS } from '../../shared/characters.ts';
import { emptyMarks, MARK_IDS, markForEnding, markLevel } from '../../shared/marks.ts';
import { fixture } from './helpers/fixtures.ts';

describe('MARK_COUNTERS', () => {
  it('donne un index distinct par personnage et par marque', () => {
    for (const mark of MARK_IDS) expect(MARK_COUNTERS[mark]).toHaveLength(CHARACTERS.length);
    const all = MARK_IDS.flatMap((mark) => MARK_COUNTERS[mark]);
    expect(new Set(all).size).toBe(408);
    expect(Math.min(...all)).toBe(27);
    expect(Math.max(...all)).toBe(490);
  });
});

describe('markLevel', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 1],
    [5, 1],
    [8, 2],
    [12, 2],
  ])('la valeur brute %i donne le niveau %i', (raw, level) => {
    expect(markLevel(raw)).toBe(level);
  });
});

describe('markForEnding', () => {
  it('range Greed et Greedier sous la même marque', () => {
    expect(markForEnding('ultraGreed')).toEqual({ mark: 'greed', level: 1 });
    expect(markForEnding('ultraGreedier')).toEqual({ mark: 'greed', level: 2 });
    expect(markForEnding('lamb')).toEqual({ mark: 'lamb', level: 1 });
  });
});

describe('readCompletionMarks', () => {
  it('lit les marques de la sauvegarde de Player', () => {
    const marks = readCompletionMarks(parseSaveFile(fixture('rep+persistentgamedata1.dat')).counters);
    expect(marks?.isaac).toEqual({
      momsHeart: 2,
      isaac: 2,
      satan: 2,
      bossRush: 0,
      blueBaby: 0,
      lamb: 2,
      megaSatan: 0,
      greed: 1,
      hush: 2,
      delirium: 0,
      mother: 0,
      beast: 0,
    });
    for (const character of CHARACTERS.filter((c) => c.id !== 'isaac')) {
      expect(marks?.[character.id]).toEqual(emptyMarks());
    }
  });

  it('place chaque personnage à son index', () => {
    const counters = new Array<number>(523).fill(0);
    counters[MARK_COUNTERS.beast[33]] = 2;
    counters[MARK_COUNTERS.greed[14]] = 1;
    const marks = readCompletionMarks(counters);
    expect(marks?.taintedJacob.beast).toBe(2);
    expect(marks?.theForgotten.greed).toBe(1);
    expect(marks?.theForgotten.beast).toBe(0);
  });

  it('renvoie null si le bloc des compteurs est trop court', () => {
    expect(readCompletionMarks(new Array<number>(490).fill(0))).toBeNull();
  });
});
