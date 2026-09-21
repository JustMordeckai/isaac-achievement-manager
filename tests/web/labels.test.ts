import { describe, expect, it } from 'vitest';
import { t } from '@shared/i18n/index.ts';
import { MARK_IDS } from '@shared/marks.ts';
import type { HowKind, UnlockKind } from '@shared/types.ts';
import {
  describeHow,
  endingList,
  formatDate,
  formatMinutes,
  HOW_ORDER,
  howLabel,
  MARK_LABELS,
  percent,
  runModeLabel,
  unlockLabel,
} from '@/lib/labels.ts';

describe('describeHow', () => {
  it('sums up each way of earning an achievement, with the names of the game', () => {
    expect(describeHow('en', { kind: 'mark', character: 'azazel', ending: 'bossRush', hard: false })).toBe(
      'Beat Boss Rush with Azazel',
    );
    expect(describeHow('en', { kind: 'mark', character: 'isaac', ending: 'momsHeart', hard: true })).toBe(
      "Beat Mom's Heart with Isaac on hard mode",
    );
    expect(
      describeHow('en', { kind: 'multi-mark', character: 'taintedIsaac', endings: ['isaac', 'blueBaby', 'satan', 'lamb'], hard: false }),
    ).toBe('Beat Isaac, ???, Satan, The Lamb with Tainted Isaac');
    expect(describeHow('en', { kind: 'hard-all', character: 'theLost' })).toBe('Get every mark on hard mode with The Lost');
    expect(describeHow('en', { kind: 'closet', character: 'blueBaby' })).toBe('Open the hidden closet at Home with ???');
    expect(describeHow('en', { kind: 'challenge', number: 13 })).toBe('Clear challenge no. 13');
    expect(describeHow('en', { kind: 'boss', bosses: ['Satan'] })).toBe('Beat Satan, with any character');
    expect(describeHow('en', { kind: 'counter', total: 30 })).toBe('Total to reach across several runs (30)');
    expect(describeHow('en', { kind: 'misc' })).toBeNull();
  });

  it('sums it up in the locale it is given', () => {
    expect(describeHow('fr', { kind: 'mark', character: 'isaac', ending: 'momsHeart', hard: true })).toBe(
      t('fr', 'labels.describeHow.mark', {
        ending: "Mom's Heart",
        character: 'Isaac',
        hard: t('fr', 'labels.describeHow.hardSuffix'),
      }),
    );
  });

  it('has a label for every kind of condition and of unlock', () => {
    const hows: HowKind[] = ['mark', 'multi-mark', 'hard-all', 'closet', 'challenge', 'boss', 'counter', 'misc'];
    const unlocks: UnlockKind[] = ['character', 'item', 'trinket', 'card', 'pill', 'baby', 'starting-item', 'floor', 'challenge', 'mode', 'other'];
    expect(HOW_ORDER).toEqual(hows);
    for (const how of hows) expect(howLabel('fr', how)).not.toBe('');
    for (const unlock of unlocks) expect(unlockLabel('fr', unlock)).not.toBe('');
  });
});

describe('planner labels', () => {
  it('formats durations in minutes then in hours', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(97)).toBe('1 h 37');
    expect(formatMinutes(125)).toBe('2 h 05');
  });

  it('lists the endings with the names of the game, Mom alone otherwise', () => {
    expect(endingList(['bossRush', 'momsHeart', 'blueBaby'])).toBe("Boss Rush, Mom's Heart, ???");
    expect(endingList(['ultraGreedier'])).toBe('Ultra Greedier');
    expect(endingList([])).toBe('Mom');
  });

  it('has a label for every mark and every mode', () => {
    expect(Object.keys(MARK_LABELS)).toEqual([...MARK_IDS]);
    // No French word inside a name that is read as English.
    expect(MARK_LABELS.greed.name).toBe('Greed / Greedier');
    expect(runModeLabel('en', 'hard')).toBe('Hard');
    expect(runModeLabel('fr', 'hard')).toBe(t('fr', 'labels.runMode.hard'));
  });
});

describe('numbers and dates', () => {
  it('writes a percentage with the separator of the locale', () => {
    expect(percent('en', 125, 641)).toBe('19.5 %');
    expect(percent('fr', 125, 641)).toBe('19,5 %');
    expect(percent('en', 0, 0)).toBe('0.0 %');
  });

  it('writes a date in the region of the locale, day before month', () => {
    const iso = '2026-09-16T14:30:51.000Z';
    expect(formatDate('en', iso)).toMatch(/^16 Sept 2026/);
    expect(formatDate('fr', iso)).toMatch(/^16 sept\. 2026/);
  });
});
