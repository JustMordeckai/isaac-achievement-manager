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
}

export interface ApiError {
  error: string;
}
