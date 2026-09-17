import type { AchievementCard, AchievementEntry, KbStatus, ProgressSummary, SettingsInfo } from '../../shared/types.ts';

export function makeAchievement(id: number, overrides: Partial<AchievementEntry> = {}): AchievementEntry {
  return {
    id,
    name: `Achievement ${id}`,
    description: `Description ${id}`,
    hidden: false,
    icon: `${String(id).padStart(40, '0')}.jpg`,
    iconGray: `${'f'.repeat(40)}.jpg`,
    dlc: 'rebirth',
    unlocked: false,
    unlockedAt: null,
    inSave: false,
    how: null,
    character: null,
    ...overrides,
  };
}

export function makeSummary(overrides: Partial<ProgressSummary> = {}): ProgressSummary {
  return {
    profile: { steamId64: '76561198083722517', name: 'Player', isLocal: true },
    total: 641,
    unlocked: 125,
    byDlc: {
      rebirth: { total: 178, unlocked: 90 },
      afterbirth: { total: 98, unlocked: 20 },
      afterbirthPlus: { total: 127, unlocked: 5 },
      repentance: { total: 237, unlocked: 9 },
      repentancePlus: { total: 1, unlocked: 1 },
    },
    sources: {
      steamCache: { state: 'ok' },
      saveFile: { state: 'ok', message: 'Slot 1' },
      profile: { state: 'ok' },
    },
    desyncs: [{ id: 638, name: 'Play Online', kind: 'saveOnly' }],
    recent: [{ id: 343, name: 'Flooded Caves', icon: `${'a'.repeat(40)}.jpg`, unlockedAt: '2026-09-16T14:30:51.000Z' }],
    save: { slot: 1, slots: [1, 2, 3] },
    accounts: [{ accountId: 123456789, steamId64: '76561198083722517', personaName: 'Player' }],
    ...overrides,
  };
}

export const KB_OK: KbStatus = { state: 'ok', syncedAt: '2026-09-17T08:00:00.000Z', running: false };
export const KB_ABSENT: KbStatus = { state: 'absent', syncedAt: null, running: false };

export const SETTINGS: SettingsInfo = {
  port: 5250,
  dataDir: 'C:\\isaac\\data',
  steamPath: 'c:\\program files (x86)\\steam',
  account: { accountId: 123456789, steamId64: '76561198083722517', personaName: 'Player' },
  forcedAccountId: null,
};

/** Fiche de The Nail (#9) telle que la renvoie /api/achievement/9. */
export function makeCard(overrides: Partial<AchievementCard> = {}): AchievementCard {
  return {
    achievement: makeAchievement(9, { name: 'The Nail', description: 'Unlocked a new item.', how: 'mark', character: 'azazel' }),
    wiki: {
      name: 'The Nail',
      condition: 'Defeat Boss Rush as Azazel',
      how: { kind: 'mark', character: 'azazel', ending: 'bossRush', hard: false },
      unlocks: { kind: 'item', name: 'The Nail' },
      unlockPage: {
        title: 'The Nail',
        url: 'https://bindingofisaacrebirth.fandom.com/wiki/The_Nail',
        intro: [{ kind: 'paragraph', level: 0, text: 'The Nail is an active item.' }],
        effect: 'Grants a soul heart and more damage.',
        quality: '2',
      },
      tips: [
        {
          page: 'Boss Rush',
          url: 'https://bindingofisaacrebirth.fandom.com/wiki/Boss_Rush',
          sections: [
            {
              title: 'Tips',
              blocks: [
                { kind: 'item', level: 1, text: 'Reach the Boss Rush door before 20 minutes.' },
                { kind: 'item', level: 2, text: 'Use the Stop Watch.' },
              ],
              truncated: true,
            },
          ],
        },
      ],
      sourceUrl: 'https://bindingofisaacrebirth.fandom.com/wiki/Achievements',
    },
    kb: KB_OK,
    plan: null,
    ...overrides,
  };
}
