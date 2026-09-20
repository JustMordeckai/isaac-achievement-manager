import type { CharacterId } from './characters.ts';
import type { EndingId } from './endings.ts';
import type { Locale } from './i18n/index.ts';
import type { MarkId, MarkLevel } from './marks.ts';

export type Dlc = 'rebirth' | 'afterbirth' | 'afterbirthPlus' | 'repentance' | 'repentancePlus';

export type SourceKey = 'steamCache' | 'saveFile' | 'profile';

export type SourceState = 'ok' | 'absent' | 'stale' | 'error';

export interface SourceStatus {
  state: SourceState;
  message?: string;
  /** ISO 8601 date of the data that was read, when it is known. */
  updatedAt?: string;
}

export interface AchievementDef {
  id: number;
  name: string;
  description: string;
  hidden: boolean;
  /** File name of the Steam icon, for instance "a36d7e92df7e991758907a75dfa55d36b52548c4.jpg". */
  icon: string;
  iconGray: string;
  dlc: Dlc;
}

export interface AchievementState extends AchievementDef {
  unlocked: boolean;
  /** ISO 8601 date, null when unknown or not unlocked. */
  unlockedAt: string | null;
  /** Present in the save; null when the save was not read. */
  inSave: boolean | null;
}

export type DesyncKind = 'saveOnly' | 'steamOnly' | 'profileAhead' | 'cacheAhead';

export interface Desync {
  id: number;
  name: string;
  kind: DesyncKind;
}

export interface LocalAccount {
  accountId: number;
  steamId64: string;
  personaName: string | null;
}

export interface ProgressSummary {
  profile: { steamId64: string; name: string | null; isLocal: boolean };
  total: number;
  unlocked: number;
  byDlc: Record<Dlc, { total: number; unlocked: number }>;
  sources: Record<SourceKey, SourceStatus>;
  desyncs: Desync[];
  /** Ten latest dated unlocks, from the most recent to the oldest. */
  recent: Array<{ id: number; name: string; icon: string; unlockedAt: string }>;
  save: { slot: number; slots: number[] } | null;
  accounts: LocalAccount[];
}

export interface ResolvedProfile {
  steamId64: string;
  name: string | null;
}

export interface StatusResponse {
  app: string;
  sources: Record<SourceKey, SourceStatus> | null;
  wiki: KbStatus;
}

export interface ApiError {
  error: string;
}

export type HowKind = 'mark' | 'multi-mark' | 'hard-all' | 'closet' | 'challenge' | 'boss' | 'counter' | 'misc';

/** How an achievement is earned, inferred from its condition on the wiki. */
export type How =
  | { kind: 'mark'; character: CharacterId; ending: EndingId; hard: boolean }
  | { kind: 'multi-mark'; character: CharacterId; endings: EndingId[]; hard: boolean }
  | { kind: 'hard-all'; character: CharacterId }
  | { kind: 'closet'; character: CharacterId }
  | { kind: 'challenge'; number: number }
  | { kind: 'boss'; bosses: string[] }
  | { kind: 'counter'; total: number }
  | { kind: 'misc' };

export type UnlockKind =
  | 'character'
  | 'item'
  | 'trinket'
  | 'card'
  | 'pill'
  | 'baby'
  | 'starting-item'
  | 'floor'
  | 'challenge'
  | 'mode'
  | 'other';

/** What an achievement unlocks. */
export interface Unlock {
  kind: UnlockKind;
  name: string;
}

/** Block of text from the cleaned wikitext. `level` is the list depth, or the heading depth for `heading`. */
export interface TextBlock {
  kind: 'paragraph' | 'item' | 'heading';
  level: number;
  text: string;
}

export interface TipSection {
  title: string;
  blocks: TextBlock[];
  /** True when the section was cut short (more on the wiki). */
  truncated: boolean;
}

/** Achievement of the list, enriched by the wiki base when it exists. */
export interface AchievementEntry extends AchievementState {
  how: HowKind | null;
  character: CharacterId | null;
}

export type KbState = 'ok' | 'absent' | 'error';

export interface KbStatus {
  state: KbState;
  /** ISO 8601 date of the last successful sync. */
  syncedAt: string | null;
  message?: string;
  /** A sync is running. */
  running: boolean;
}

export interface TipSource {
  page: string;
  url: string;
  sections: TipSection[];
}

export interface UnlockPage {
  title: string;
  url: string;
  intro: TextBlock[];
  effect: string | null;
  quality: string | null;
}

export interface AchievementWiki {
  name: string;
  condition: string;
  how: How;
  unlocks: Unlock;
  unlockPage: UnlockPage | null;
  tips: TipSource[];
  /** Source page of the data of the card (CC BY-SA licence). */
  sourceUrl: string;
}

export interface AchievementCard {
  achievement: AchievementEntry;
  /** null when the wiki base is missing or the achievement is not in it. */
  wiki: AchievementWiki | null;
  kb: KbStatus;
  /** Prerequisites and runs of the planner, null with no wiki base. */
  plan: CardPlan | null;
}

export interface WikiSyncReport {
  achievements: number;
  pages: number;
  missingPages: string[];
  unknownTemplates: Record<string, number>;
  miscCount: number;
  otherUnlockCount: number;
  /** Pages taken from the cache after a network failure. */
  cachedPages: number;
}

export type WikiSyncStep = 'core' | 'pages' | 'build' | 'write' | 'done' | 'error';

/** Ligne du flux NDJSON de POST /api/wiki/sync. */
export interface WikiSyncEvent {
  step: WikiSyncStep;
  done: number;
  total: number;
  message: string;
  report?: WikiSyncReport;
}

/** Answer of GET /api/settings: paths and settings that were detected, read only. */
export interface SettingsInfo {
  port: number;
  dataDir: string;
  steamPath: string | null;
  account: { accountId: number; steamId64: string; personaName: string | null } | null;
  forcedAccountId: number | null;
  locale: Locale;
}

/** Where the completion marks come from: read in the save or inferred from the achievements. */
export type MarksSource = 'save' | 'inferred';

/** Marks of a character; null when no source can tell (inferred marks). */
export type KnownMarks = Record<MarkId, MarkLevel | null>;

export interface CharacterProgress {
  id: CharacterId;
  unlocked: boolean;
  marks: KnownMarks;
  /** "Every mark on hard" achievement: earned or not, null when the character has none. */
  hardAll: boolean | null;
}

/** Achievement to unlock before a run; one of the achievements of `anyOf` is enough. */
export interface Requirement {
  anyOf: Array<{ id: number; name: string }>;
  met: boolean;
}

export type RunMode = 'normal' | 'hard' | 'greed' | 'greedier';

export interface PlannedRun {
  id: string;
  character: CharacterId;
  mode: RunMode;
  /** Run endings, in the order they are reached. */
  endings: EndingId[];
  /** Path as steps, in the language of the reader. */
  steps: string[];
  /** Achievements this run earns. */
  achievements: Array<{ id: number; name: string }>;
  /** Achievements this run brings closer without earning them (prep run), empty otherwise. */
  prepares: Array<{ id: number; name: string }>;
  minutes: number;
  score: number;
  /** Prerequisites still missing (empty when the run is playable). */
  missing: Requirement[];
  /** Reminder that belongs to the character (Eden Tokens for instance), null otherwise. */
  note: string | null;
}

export interface ChallengeTodo {
  id: number;
  name: string;
  number: number;
  /** Title of the challenge page, null when the base does not have it. */
  title: string | null;
  character: string | null;
  goal: string | null;
  curse: string | null;
  startingItems: string[];
  /** Achievement that makes the challenge available, null when it already is. */
  requirement: Requirement | null;
}

export interface CounterTodo {
  id: number;
  name: string;
  condition: string;
  total: number;
  /** Value of the counter in the save, null when unknown. */
  value: number | null;
}

export interface ClosetTodo {
  id: number;
  name: string;
  character: CharacterId;
}

export interface MiscTodo {
  id: number;
  name: string;
  condition: string;
  dlc: Dlc;
}

/** Achievements that do not go through a planned run. */
export interface OffRoute {
  challenges: ChallengeTodo[];
  counters: CounterTodo[];
  closets: ClosetTodo[];
  /** Red Key unlocked (otherwise the first visit to Home gives it). */
  redKey: boolean;
  misc: MiscTodo[];
}

export interface RoutePlan {
  marksSource: MarksSource;
  characters: CharacterProgress[];
  runs: PlannedRun[];
  offRoute: OffRoute;
}

/** Answer of GET /api/routes; `plan` is null with no wiki base. */
export interface RoutesResponse {
  kb: KbStatus;
  plan: RoutePlan | null;
}

/** Planner part of the card of an achievement. */
export interface CardPlan {
  requirements: Requirement[];
  /** Runs of the plan that earn the achievement or prepare it. */
  runs: Array<
    Pick<PlannedRun, 'id' | 'character' | 'mode' | 'endings' | 'minutes'> & {
      /** The run has missing prerequisites. */
      blocked: boolean;
      /** Prep run: it brings the achievement closer without earning it. */
      preparation: boolean;
    }
  >;
}

/** Ollama server the advisor uses (`ollama` field of data/settings.json). */
export interface OllamaSettings {
  url: string;
  model: string;
}

export type AdvisorState = 'ok' | 'absent' | 'error';

/** Answer of GET /api/advisor/status: current settings and state of the Ollama server. */
export interface AdvisorStatus extends OllamaSettings {
  /** `absent`: server unreachable; `error`: unexpected answer or missing model. */
  state: AdvisorState;
  message?: string;
  /** Models installed on the server (empty when it is unreachable). */
  models: string[];
}

/** What the advisor setup needs to know before it offers anything. */
export interface AdvisorSetupState {
  /** The ollama command answers on this machine. */
  installed: boolean;
  /** winget is there, so the app can install Ollama itself. */
  canInstall: boolean;
  /** Video memory in gigabytes, null when nothing readable answered. */
  vramGb: number | null;
  /** Model this machine should run, from the two the app knows. */
  recommended: string;
}

/** One line of an install or of a model download, streamed as NDJSON. */
export type AdvisorSetupEvent =
  | { step: 'progress'; message: string; done?: number; total?: number }
  | { step: 'done'; message: string }
  | { step: 'error'; message: string };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Corps de POST /api/advisor. */
export interface AdvisorRequest {
  question: string;
  /** Previous exchanges, from the oldest to the most recent. */
  history: ChatMessage[];
  profile: string;
  slot: number | null;
}

/** Ligne du flux NDJSON de POST /api/advisor. */
export type AdvisorEvent =
  | { kind: 'context'; sources: Array<{ id: number; name: string }> }
  | { kind: 'delta'; text: string }
  | { kind: 'done' }
  | { kind: 'error'; message: string };
