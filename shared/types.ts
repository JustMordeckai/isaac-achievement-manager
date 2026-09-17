import type { CharacterId } from './characters.ts';
import type { EndingId } from './endings.ts';
import type { MarkId, MarkLevel } from './marks.ts';

export type Dlc = 'rebirth' | 'afterbirth' | 'afterbirthPlus' | 'repentance' | 'repentancePlus';

export type SourceKey = 'steamCache' | 'saveFile' | 'profile';

export type SourceState = 'ok' | 'absent' | 'stale' | 'error';

export interface SourceStatus {
  state: SourceState;
  message?: string;
  /** Date ISO 8601 de la donnée lue, si connue. */
  updatedAt?: string;
}

export interface AchievementDef {
  id: number;
  name: string;
  description: string;
  hidden: boolean;
  /** Nom de fichier de l'icône Steam, ex. "a36d7e92df7e991758907a75dfa55d36b52548c4.jpg". */
  icon: string;
  iconGray: string;
  dlc: Dlc;
}

export interface AchievementState extends AchievementDef {
  unlocked: boolean;
  /** Date ISO 8601, null si inconnue ou non débloqué. */
  unlockedAt: string | null;
  /** Présent dans la sauvegarde ; null quand la sauvegarde n'a pas été lue. */
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
  /** Dix derniers déblocages datés, du plus récent au plus ancien. */
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

/** Comment obtenir un succès, déduit de sa condition sur le wiki. */
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

/** Ce que débloque un succès. */
export interface Unlock {
  kind: UnlockKind;
  name: string;
}

/** Bloc de texte issu du wikitext nettoyé. `level` vaut la profondeur de liste, ou de titre pour `heading`. */
export interface TextBlock {
  kind: 'paragraph' | 'item' | 'heading';
  level: number;
  text: string;
}

export interface TipSection {
  title: string;
  blocks: TextBlock[];
  /** Vrai si la section a été coupée (suite sur le wiki). */
  truncated: boolean;
}

/** Succès de la liste, enrichi par la base wiki quand elle existe. */
export interface AchievementEntry extends AchievementState {
  how: HowKind | null;
  character: CharacterId | null;
}

export type KbState = 'ok' | 'absent' | 'error';

export interface KbStatus {
  state: KbState;
  /** Date ISO 8601 de la dernière synchro réussie. */
  syncedAt: string | null;
  message?: string;
  /** Une synchro est en cours. */
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
  /** Page source des données de la fiche (licence CC BY-SA). */
  sourceUrl: string;
}

export interface AchievementCard {
  achievement: AchievementEntry;
  /** null si la base wiki est absente ou si le succès n'y figure pas. */
  wiki: AchievementWiki | null;
  kb: KbStatus;
}

export interface WikiSyncReport {
  achievements: number;
  pages: number;
  missingPages: string[];
  unknownTemplates: Record<string, number>;
  miscCount: number;
  otherUnlockCount: number;
  /** Pages reprises du cache après un échec réseau. */
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

/** Réponse de GET /api/settings : chemins et réglages détectés, en lecture seule. */
export interface SettingsInfo {
  port: number;
  dataDir: string;
  steamPath: string | null;
  account: { accountId: number; steamId64: string; personaName: string | null } | null;
  forcedAccountId: number | null;
}

/** Origine des marques de complétion : lues dans la sauvegarde ou déduites des succès. */
export type MarksSource = 'save' | 'inferred';

/** Marques d'un personnage ; null quand aucune source ne permet de savoir (marques déduites). */
export type KnownMarks = Record<MarkId, MarkLevel | null>;

export interface CharacterProgress {
  id: CharacterId;
  unlocked: boolean;
  marks: KnownMarks;
  /** Succès « toutes les marques en difficile » : obtenu ou non, null si le personnage n'en a pas. */
  hardAll: boolean | null;
}

/** Succès à débloquer avant une run ; un seul des succès de `anyOf` suffit. */
export interface Requirement {
  anyOf: Array<{ id: number; name: string }>;
  met: boolean;
}

export type RunMode = 'normal' | 'hard' | 'greed' | 'greedier';

export interface PlannedRun {
  id: string;
  character: CharacterId;
  mode: RunMode;
  /** Fins de run, dans l'ordre où on les atteint. */
  endings: EndingId[];
  /** Chemin en étapes, en français. */
  steps: string[];
  /** Succès obtenus par cette run. */
  achievements: Array<{ id: number; name: string }>;
  minutes: number;
  score: number;
  /** Prérequis encore manquants (vide si la run est jouable). */
  missing: Requirement[];
  /** Rappel propre au personnage (ex. Eden Tokens), null sinon. */
  note: string | null;
}

export interface ChallengeTodo {
  id: number;
  name: string;
  number: number;
  /** Titre de la page du défi, null s'il manque dans la base. */
  title: string | null;
  character: string | null;
  goal: string | null;
  curse: string | null;
  startingItems: string[];
  /** Succès qui rend le défi disponible, null s'il l'est d'emblée. */
  requirement: Requirement | null;
}

export interface CounterTodo {
  id: number;
  name: string;
  condition: string;
  total: number;
  /** Valeur du compteur dans la sauvegarde, null si inconnue. */
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

/** Succès qui ne passent pas par une run planifiée. */
export interface OffRoute {
  challenges: ChallengeTodo[];
  counters: CounterTodo[];
  closets: ClosetTodo[];
  /** Red Key débloquée (sinon le premier passage à Home la donne). */
  redKey: boolean;
  misc: MiscTodo[];
}

export interface RoutePlan {
  marksSource: MarksSource;
  characters: CharacterProgress[];
  runs: PlannedRun[];
  offRoute: OffRoute;
}

/** Réponse de GET /api/routes ; `plan` vaut null sans base wiki. */
export interface RoutesResponse {
  kb: KbStatus;
  plan: RoutePlan | null;
}

/** Partie planificateur de la fiche d'un succès. */
export interface CardPlan {
  requirements: Requirement[];
  runs: Array<Pick<PlannedRun, 'id' | 'character' | 'mode' | 'endings' | 'minutes'>>;
}
