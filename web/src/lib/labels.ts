import { characterById } from '@shared/characters.ts';
import { endingById, type EndingId } from '@shared/endings.ts';
import { t, type Locale, type MessageKey } from '@shared/i18n/index.ts';
import type { MarkId } from '@shared/marks.ts';
import type {
  AdvisorState,
  DesyncKind,
  Dlc,
  How,
  HowKind,
  KbState,
  MarksSource,
  RunMode,
  SourceKey,
  SourceState,
  UnlockKind,
} from '@shared/types.ts';

/** Game content: the DLC names are the same in every language. */
export const DLC_LABELS: Record<Dlc, string> = {
  rebirth: 'Rebirth',
  afterbirth: 'Afterbirth',
  afterbirthPlus: 'Afterbirth+',
  repentance: 'Repentance',
  repentancePlus: 'Repentance+',
};

const SOURCE_KEYS: Record<SourceKey, MessageKey> = {
  steamCache: 'sources.steamCache',
  saveFile: 'sources.saveFile',
  profile: 'sources.profile',
};

export function sourceLabel(locale: Locale, key: SourceKey): string {
  return t(locale, SOURCE_KEYS[key]);
}

const SOURCE_STATE_KEYS: Record<SourceState, MessageKey> = {
  ok: 'sources.state.ok',
  absent: 'sources.state.absent',
  stale: 'sources.state.stale',
  error: 'sources.state.error',
};

export function sourceStateLabel(locale: Locale, state: SourceState): string {
  return t(locale, SOURCE_STATE_KEYS[state]);
}

const KB_STATE_KEYS: Record<KbState, MessageKey> = {
  ok: 'sources.kbState.ok',
  absent: 'sources.kbState.absent',
  error: 'sources.kbState.error',
};

export function kbStateLabel(locale: Locale, state: KbState): string {
  return t(locale, KB_STATE_KEYS[state]);
}

const ADVISOR_STATE_KEYS: Record<AdvisorState, MessageKey> = {
  ok: 'sources.advisorState.ok',
  absent: 'sources.advisorState.absent',
  error: 'sources.advisorState.error',
};

export function advisorStateLabel(locale: Locale, state: AdvisorState): string {
  return t(locale, ADVISOR_STATE_KEYS[state]);
}

const HOW_KEYS: Record<HowKind, MessageKey> = {
  mark: 'labels.how.mark',
  'multi-mark': 'labels.how.multiMark',
  'hard-all': 'labels.how.hardAll',
  closet: 'labels.how.closet',
  challenge: 'labels.how.challenge',
  boss: 'labels.how.boss',
  counter: 'labels.how.counter',
  misc: 'labels.how.misc',
};

/** Kinds of condition, in the order of the filter. */
export const HOW_ORDER = Object.keys(HOW_KEYS) as HowKind[];

export function howLabel(locale: Locale, kind: HowKind): string {
  return t(locale, HOW_KEYS[kind]);
}

const UNLOCK_KEYS: Record<UnlockKind, MessageKey> = {
  character: 'labels.unlock.character',
  item: 'labels.unlock.item',
  trinket: 'labels.unlock.trinket',
  card: 'labels.unlock.card',
  pill: 'labels.unlock.pill',
  baby: 'labels.unlock.baby',
  'starting-item': 'labels.unlock.startingItem',
  floor: 'labels.unlock.floor',
  challenge: 'labels.unlock.challenge',
  mode: 'labels.unlock.mode',
  other: 'labels.unlock.other',
};

export function unlockLabel(locale: Locale, kind: UnlockKind): string {
  return t(locale, UNLOCK_KEYS[kind]);
}

function hardSuffix(locale: Locale, hard: boolean): string {
  return hard ? t(locale, 'labels.describeHow.hardSuffix') : '';
}

/** How an achievement is earned, in one sentence; null when the wiki does not allow a summary. */
export function describeHow(locale: Locale, how: How): string | null {
  switch (how.kind) {
    case 'mark':
      return t(locale, 'labels.describeHow.mark', {
        ending: endingById(how.ending).name,
        character: characterById(how.character).name,
        hard: hardSuffix(locale, how.hard),
      });
    case 'multi-mark':
      return t(locale, 'labels.describeHow.multiMark', {
        endings: how.endings.map((id) => endingById(id).name).join(', '),
        character: characterById(how.character).name,
        hard: hardSuffix(locale, how.hard),
      });
    case 'hard-all':
      return t(locale, 'labels.describeHow.hardAll', { character: characterById(how.character).name });
    case 'closet':
      return t(locale, 'labels.describeHow.closet', { character: characterById(how.character).name });
    case 'challenge':
      return t(locale, 'labels.describeHow.challenge', { number: how.number });
    case 'boss':
      return t(locale, 'labels.describeHow.boss', { bosses: how.bosses.join(', ') });
    case 'counter':
      return t(locale, 'labels.describeHow.counter', { total: how.total });
    case 'misc':
      return null;
  }
}

/**
 * Regional tag of a locale, for dates and numbers. English takes en-GB: day before month and a
 * 24 hour clock, so the interface keeps the same shape in both languages.
 */
const REGION: Record<Locale, string> = { en: 'en-GB', fr: 'fr-FR' };

const dateFormats = new Map<Locale, Intl.DateTimeFormat>();

export function formatDate(locale: Locale, iso: string): string {
  let format = dateFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(REGION[locale], { dateStyle: 'medium', timeStyle: 'short' });
    dateFormats.set(locale, format);
  }
  return format.format(new Date(iso));
}

const timeFormats = new Map<Locale, Intl.DateTimeFormat>();

/** Clock time alone, seconds included: it is read to tell one check of a server from the next. */
export function formatTime(locale: Locale, time: number): string {
  let format = timeFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(REGION[locale], { timeStyle: 'medium' });
    timeFormats.set(locale, format);
  }
  return format.format(new Date(time));
}

/** One decimal, with the separator of the locale (a rate of achievements per hour, for instance). */
export function formatDecimal(locale: Locale, value: number): string {
  return new Intl.NumberFormat(REGION[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

export function percent(locale: Locale, value: number, total: number): string {
  const ratio = total === 0 ? 0 : (value / total) * 100;
  const number = new Intl.NumberFormat(REGION[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ratio);
  return `${number} %`;
}

/** Completion marks: full name (the game's names) and the short header of the grid. */
export const MARK_LABELS: Record<MarkId, { name: string; short: string }> = {
  momsHeart: { name: "Mom's Heart", short: 'Heart' },
  isaac: { name: 'Isaac', short: 'Isaac' },
  satan: { name: 'Satan', short: 'Satan' },
  bossRush: { name: 'Boss Rush', short: 'Rush' },
  blueBaby: { name: '???', short: '???' },
  lamb: { name: 'The Lamb', short: 'Lamb' },
  megaSatan: { name: 'Mega Satan', short: 'Mega' },
  greed: { name: 'Greed / Greedier', short: 'Greed' },
  hush: { name: 'Hush', short: 'Hush' },
  delirium: { name: 'Delirium', short: 'Deli' },
  mother: { name: 'Mother', short: 'Mother' },
  beast: { name: 'The Beast', short: 'Beast' },
};

const RUN_MODE_KEYS: Record<RunMode, MessageKey> = {
  normal: 'labels.runMode.normal',
  hard: 'labels.runMode.hard',
  greed: 'labels.runMode.greed',
  greedier: 'labels.runMode.greedier',
};

export function runModeLabel(locale: Locale, mode: RunMode): string {
  return t(locale, RUN_MODE_KEYS[mode]);
}

const MARKS_SOURCE_KEYS: Record<MarksSource, MessageKey> = {
  save: 'labels.marksSource.save',
  inferred: 'labels.marksSource.inferred',
};

export function marksSourceLabel(locale: Locale, source: MarksSource): string {
  return t(locale, MARKS_SOURCE_KEYS[source]);
}

/** Endings of a run, in order ("beat Mom" alone when the list is empty). */
export function endingList(endings: EndingId[]): string {
  return endings.length === 0 ? 'Mom' : endings.map((id) => endingById(id).name).join(', ');
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${String(rest).padStart(2, '0')}`;
}

export function characterName(id: Parameters<typeof characterById>[0]): string {
  return characterById(id).name;
}
