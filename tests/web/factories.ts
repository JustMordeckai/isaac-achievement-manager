import type { AchievementState, ProgressSummary } from '../../shared/types.ts';

export function makeAchievement(id: number, overrides: Partial<AchievementState> = {}): AchievementState {
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
