import { DLC_ORDER, dlcForId } from '../../shared/dlc.ts';
import { DEFAULT_LOCALE, plural, type Locale } from '../../shared/i18n/index.ts';
import type { CompletionMarks } from '../../shared/marks.ts';
import type {
  AchievementDef,
  AchievementState,
  Desync,
  DesyncKind,
  Dlc,
  LocalAccount,
  ProgressSummary,
  SourceStatus,
} from '../../shared/types.ts';
import type { SaveFileData } from './save-file.ts';
import { readCompletionMarks } from './save-marks.ts';
import type { UnlockMap } from './steam-cache.ts';
import type { ProfileStats } from './steam-profile.ts';

export interface SourceResult<T> {
  status: SourceStatus;
  data: T | null;
}

export interface MergeInput {
  profile: ProgressSummary['profile'];
  /** Local Steam schema definitions, null when unavailable. */
  defs: AchievementDef[] | null;
  steamCache: SourceResult<UnlockMap>;
  save: SourceResult<SaveFileData>;
  saveSlots: ProgressSummary['save'];
  online: SourceResult<ProfileStats>;
  accounts: LocalAccount[];
}

/** Save data useful to the planner (local profile only). */
export interface SaveProgress {
  counters: number[];
  /** null when the counters chunk does not hold the marks. */
  marks: CompletionMarks | null;
}

export interface MergedProgress {
  summary: ProgressSummary;
  achievements: AchievementState[];
  save: SaveProgress | null;
}

const RECENT_COUNT = 10;

function definitionsFrom(input: MergeInput): AchievementDef[] {
  if (input.defs) return input.defs;
  return (input.online.data?.achievements ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    hidden: false,
    icon: a.icon,
    iconGray: a.iconGray,
    dlc: dlcForId(a.id),
  }));
}

export function mergeProgress(input: MergeInput, locale: Locale = DEFAULT_LOCALE): MergedProgress {
  const defs = definitionsFrom(input);
  const names = new Map(defs.map((d) => [d.id, d.name]));
  const desyncs: Desync[] = [];
  const addDesync = (id: number, kind: DesyncKind) => {
    const name = names.get(id);
    if (name !== undefined) desyncs.push({ id, name, kind });
  };

  const online = input.online.data;
  const onlineMap: UnlockMap | null = online
    ? new Map(online.achievements.filter((a) => a.unlocked).map((a) => [a.id, a.unlockedAt]))
    : null;
  const cache = input.profile.isLocal ? input.steamCache.data : null;
  const steamCacheStatus: SourceStatus = { ...input.steamCache.status };

  let reference: UnlockMap;
  if (cache) {
    reference = new Map(cache);
    if (onlineMap) {
      let ahead = 0;
      for (const [id, at] of onlineMap) {
        if (cache.has(id)) continue;
        ahead++;
        reference.set(id, at);
        addDesync(id, 'profileAhead');
      }
      for (const id of cache.keys()) {
        if (!onlineMap.has(id)) addDesync(id, 'cacheAhead');
      }
      if (ahead > 0) {
        steamCacheStatus.state = 'stale';
        steamCacheStatus.message = plural(locale, 'sources.profileAhead', ahead);
      }
    }
  } else {
    reference = onlineMap ?? new Map();
  }

  const secrets = input.profile.isLocal ? (input.save.data?.secrets ?? null) : null;
  if (secrets && (cache || onlineMap)) {
    for (const id of secrets) {
      if (!reference.has(id)) addDesync(id, 'saveOnly');
    }
    for (const id of reference.keys()) {
      if (!secrets.has(id)) addDesync(id, 'steamOnly');
    }
  }
  desyncs.sort((a, b) => a.id - b.id);

  const achievements: AchievementState[] = defs.map((def) => {
    const at = reference.get(def.id);
    return {
      ...def,
      unlocked: reference.has(def.id),
      unlockedAt: at ? new Date(at * 1000).toISOString() : null,
      inSave: secrets ? secrets.has(def.id) : null,
    };
  });

  const byDlc = Object.fromEntries(DLC_ORDER.map((dlc) => [dlc, { total: 0, unlocked: 0 }])) as Record<
    Dlc,
    { total: number; unlocked: number }
  >;
  for (const a of achievements) {
    byDlc[a.dlc].total++;
    if (a.unlocked) byDlc[a.dlc].unlocked++;
  }

  const recent = achievements
    .flatMap((a) => (a.unlockedAt ? [{ id: a.id, name: a.name, icon: a.icon, unlockedAt: a.unlockedAt }] : []))
    .sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt))
    .slice(0, RECENT_COUNT);

  const saveData = input.profile.isLocal ? input.save.data : null;
  const save = saveData ? { counters: saveData.counters, marks: readCompletionMarks(saveData.counters) } : null;

  return {
    achievements,
    save,
    summary: {
      profile: input.profile,
      total: achievements.length,
      unlocked: achievements.filter((a) => a.unlocked).length,
      byDlc,
      sources: { steamCache: steamCacheStatus, saveFile: input.save.status, profile: input.online.status },
      desyncs,
      recent,
      save: input.saveSlots,
      accounts: input.accounts,
    },
  };
}
