import { CHARACTERS } from '../../shared/characters.ts';
import { vi } from 'vitest';
import type {
  AchievementCard,
  AchievementEntry,
  AdvisorStatus,
  CharacterProgress,
  KbStatus,
  KnownMarks,
  PlannedRun,
  ProgressSummary,
  RoutePlan,
  RoutesResponse,
  SettingsInfo,
} from '../../shared/types.ts';
import type { AdvisorStatusState } from '../../web/src/useAdvisor.ts';

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
  locale: 'en',
};

export const ADVISOR_OK: AdvisorStatus = {
  state: 'ok',
  url: 'http://127.0.0.1:11434',
  model: 'qwen3.5:9b',
  models: ['qwen3.5:4b', 'qwen3.5:9b'],
};

export const ADVISOR_OFFLINE: AdvisorStatus = {
  state: 'absent',
  url: 'http://127.0.0.1:11434',
  model: 'qwen3.5:9b',
  models: [],
  message: 'Ollama unreachable at http://127.0.0.1:11434 (ECONNREFUSED)',
};

/** Advisor state, the way useAdvisorStatus gives it. */
export function makeAdvisorState(status: AdvisorStatus | null = ADVISOR_OK, checking = false): AdvisorStatusState {
  return { status, checking, recheck: vi.fn(), replace: vi.fn() };
}

/** Card of The Nail (#9), the way /api/achievement/9 returns it. */
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

/** Magdalene run, the way /api/routes returns it. */
export function makeRun(overrides: Partial<PlannedRun> = {}): PlannedRun {
  return {
    id: 'magdalene-1',
    character: 'magdalene',
    mode: 'hard',
    endings: ['bossRush', 'momsHeart', 'satan', 'lamb'],
    steps: [
      'Traverser Basement, Caves et Depths, puis battre Mom en Depths II.',
      "Traverser Womb I et II et battre Mom's Heart (ou It Lives).",
    ],
    achievements: [
      { id: 45, name: 'Guardian Angel' },
      { id: 71, name: "Maggy's Faith" },
    ],
    prepares: [],
    minutes: 74,
    score: 1.622,
    missing: [],
    note: null,
    ...overrides,
  };
}

const NO_MARKS: KnownMarks = {
  momsHeart: 0,
  isaac: 0,
  satan: 0,
  bossRush: 0,
  blueBaby: 0,
  lamb: 0,
  megaSatan: 0,
  greed: 0,
  hush: 0,
  delirium: 0,
  mother: 0,
  beast: 0,
};

/** Isaac and Magdalene unlocked; Isaac has Mom's Heart on hard, Satan and Greed on normal. */
export function makeCharacters(): CharacterProgress[] {
  return CHARACTERS.map((c) => ({
    id: c.id,
    unlocked: c.id === 'isaac' || c.id === 'magdalene',
    marks: c.id === 'isaac' ? { ...NO_MARKS, momsHeart: 2, satan: 1, greed: 1 } : { ...NO_MARKS },
    hardAll: c.tainted ? null : false,
  }));
}

export function makePlan(overrides: Partial<RoutePlan> = {}): RoutePlan {
  return {
    marksSource: 'save',
    characters: makeCharacters(),
    runs: [
      makeRun(),
      makeRun({
        id: 'isaac-1',
        character: 'isaac',
        mode: 'greed',
        endings: ['ultraGreed'],
        steps: ['Start a run in Greed mode.'],
        achievements: [{ id: 193, name: 'Censer' }],
        minutes: 35,
        score: 1.714,
      }),
      makeRun({
        id: 'isaac-2',
        character: 'isaac',
        endings: ['mother'],
        achievements: [{ id: 405, name: 'Jacob and Esau' }],
        minutes: 55,
        score: 1.091,
        missing: [{ anyOf: [{ id: 407, name: 'A Secret Exit' }], met: false }],
      }),
    ],
    offRoute: {
      challenges: [
        {
          id: 94,
          name: 'Rune of Perthro',
          number: 6,
          title: 'Solar System',
          character: 'Isaac',
          goal: "Mom's Heart",
          curse: null,
          startingItems: ['Distant Admiration'],
          requirement: { anyOf: [{ id: 159, name: 'Solar System' }], met: false },
        },
      ],
      counters: [
        { id: 344, name: 'Dank Depths', condition: 'Defeat It Lives! 21 times', total: 21, value: 16 },
        { id: 349, name: 'Black Hole', condition: 'Defeat 20 Portals', total: 20, value: null },
      ],
      closets: [{ id: 474, name: 'The Broken', character: 'isaac' }],
      redKey: false,
      misc: [{ id: 23, name: 'Little Gish', condition: 'Defeat Gish', dlc: 'rebirth' }],
    },
    ...overrides,
  };
}

export const ROUTES_OK: RoutesResponse = { kb: KB_OK, plan: makePlan() };
