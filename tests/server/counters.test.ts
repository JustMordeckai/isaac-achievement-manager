import { describe, expect, it } from 'vitest';
import { COUNTER_RULES, counterIndex } from '../../server/planner/counters.ts';
import { parseSaveFile } from '../../server/sources/save-file.ts';
import { fixture } from './helpers/fixtures.ts';
import { testKnowledgeBase } from './helpers/kb.ts';

describe('counterIndex', () => {
  it('recognizes the common cumulative conditions', () => {
    expect(counterIndex("Defeat Mom's Heart 11 times")).toBe(1);
    expect(counterIndex('Defeat It Lives! 16 times')).toBe(1);
    expect(counterIndex('Donate 999 Coins to the Donation Machine')).toBe(20);
    expect(counterIndex('Donate 900 coins to the Donation Machine')).toBe(20);
    expect(counterIndex('Donate 1000 Coins to the Greed Donation Machine')).toBe(115);
    expect(counterIndex('Take 25 Deals with the Devil')).toBe(16);
    expect(counterIndex('Sleep in 10 beds')).toBe(202);
    expect(counterIndex('Beat Basement 40 times')).toBeNull();
  });

  it('ties 77 of the 85 cumulative achievements of the wiki to a counter', async () => {
    const kb = await testKnowledgeBase();
    const counted = kb.achievements.filter((a) => a.how.kind === 'counter');
    const missing = counted.filter((a) => counterIndex(a.condition) === null).map((a) => a.id);
    expect(counted).toHaveLength(85);
    expect(missing).toEqual([16, 17, 18, 337, 349, 356, 360, 373]);
  });

  it('points at counters that agree with the reference save', () => {
    const counters = parseSaveFile(fixture('rep+persistentgamedata1.dat')).counters;
    const value = (name: string) => counters[COUNTER_RULES.find((rule) => rule.name === name)?.index ?? -1];
    // Flooded Caves (It Lives 16 times) unlocked on 2026-09-16; The Negative (Satan 5 times) on 2026-09-15.
    expect(value('MOM_KILLS')).toBe(16);
    expect(value('SATAN_KILLS')).toBe(6);
    expect(value('HUSH_KILLS')).toBe(1);
    expect(value('DEATHS')).toBe(230);
  });
});
