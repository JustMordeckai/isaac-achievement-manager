import { readFile, stat } from 'node:fs/promises';
import type { LocalAccount, ProgressSummary } from '../shared/types.ts';
import { chooseAccount, steamPaths, type SteamAccount, type SteamEnv } from './config.ts';
import { HttpError } from './http-error.ts';
import { mergeProgress, type MergedProgress, type SourceResult } from './sources/progress.ts';
import { listSaveSlots, parseSaveFile, pickDefaultSlot, type SaveFileData, type SaveSlot } from './sources/save-file.ts';
import { parseSchema, parseUserStats, type SchemaEntry, type UnlockMap } from './sources/steam-cache.ts';
import { ProfileError, type ProfileClient, type ProfileErrorKind, type ProfileStats } from './sources/steam-profile.ts';
import { isSteamId64 } from './steam.ts';

export interface ProgressService {
  /** `profile` vaut "me" ou un SteamID64 ; `slot` force un slot de sauvegarde (1 à 3). */
  get(profile: string, slot: number | null): Promise<MergedProgress>;
}

export interface ProgressServiceOptions {
  env: SteamEnv;
  forcedAccountId: number | null;
  profiles: ProfileClient;
}

const PROFILE_ERROR_STATUS: Record<ProfileErrorKind, number> = { notFound: 404, private: 403, invalid: 502, network: 502 };

export function profileErrorToHttp(error: ProfileError): HttpError {
  return new HttpError(PROFILE_ERROR_STATUS[error.kind], error.message);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

function absent<T>(message: string): SourceResult<T> {
  return { status: { state: 'absent', message }, data: null };
}

function failed<T>(error: unknown): SourceResult<T> {
  return { status: { state: 'error', message: messageOf(error) }, data: null };
}

export function createProgressService({ env, forcedAccountId, profiles }: ProgressServiceOptions): ProgressService {
  const paths = env.steamPath ? steamPaths(env.steamPath) : null;
  const accounts: LocalAccount[] = env.accounts
    .filter((a) => a.hasIsaacData)
    .map(({ accountId, steamId64, personaName }) => ({ accountId, steamId64, personaName }));
  let schemaCache: { updatedAt: string; entries: SchemaEntry[] } | null = null;

  async function loadSchema(): Promise<SourceResult<SchemaEntry[]>> {
    if (!paths) return absent('Steam introuvable sur ce PC');
    try {
      const updatedAt = (await stat(paths.schema)).mtime.toISOString();
      let cached = schemaCache;
      if (!cached || cached.updatedAt !== updatedAt) {
        cached = { updatedAt, entries: parseSchema(new Uint8Array(await readFile(paths.schema))) };
        schemaCache = cached;
      }
      return { status: { state: 'ok', updatedAt }, data: cached.entries };
    } catch (error) {
      return isMissingFile(error) ? absent('Schéma des succès introuvable (lance le jeu une fois via Steam)') : failed(error);
    }
  }

  async function loadSteamCache(account: SteamAccount, schema: SourceResult<SchemaEntry[]>): Promise<SourceResult<UnlockMap>> {
    if (!paths || !schema.data) return { status: schema.status, data: null };
    const file = paths.stats(account.accountId);
    try {
      const [bytes, info] = await Promise.all([readFile(file), stat(file)]);
      return { status: { state: 'ok', updatedAt: info.mtime.toISOString() }, data: parseUserStats(new Uint8Array(bytes), schema.data) };
    } catch (error) {
      return isMissingFile(error) ? absent('Aucune statistique Steam locale pour ce compte') : failed(error);
    }
  }

  async function loadSave(
    account: SteamAccount,
    slot: number | null,
  ): Promise<{ result: SourceResult<SaveFileData>; slots: ProgressSummary['save'] }> {
    if (!paths) return { result: absent('Steam introuvable sur ce PC'), slots: null };
    let available: SaveSlot[];
    try {
      available = await listSaveSlots(paths.remote(account.accountId));
    } catch (error) {
      return { result: failed(error), slots: null };
    }
    if (available.length === 0) return { result: absent('Aucune sauvegarde Repentance+ pour ce compte'), slots: null };
    const chosen = slot === null ? pickDefaultSlot(available) : available.find((s) => s.slot === slot);
    if (!chosen) throw new HttpError(400, `Slot ${slot} introuvable`);
    const slots = { slot: chosen.slot, slots: available.map((s) => s.slot) };
    try {
      const data = parseSaveFile(new Uint8Array(await readFile(chosen.path)));
      const updatedAt = new Date(chosen.mtimeMs).toISOString();
      return { result: { status: { state: 'ok', message: `Slot ${chosen.slot}`, updatedAt }, data }, slots };
    } catch (error) {
      return { result: failed(error), slots };
    }
  }

  async function loadOnline(steamId64: string, isLocal: boolean): Promise<SourceResult<ProfileStats>> {
    try {
      return { status: { state: 'ok' }, data: await profiles.getStats(steamId64) };
    } catch (error) {
      if (!isLocal) throw error instanceof ProfileError ? profileErrorToHttp(error) : error;
      return failed(error);
    }
  }

  async function resolveName(steamId64: string): Promise<string | null> {
    try {
      return (await profiles.resolve(steamId64)).name;
    } catch {
      return null;
    }
  }

  return {
    async get(profile, slot) {
      let account: SteamAccount | null;
      let steamId64: string;
      if (profile === 'me') {
        account = chooseAccount(env, forcedAccountId);
        if (!account) {
          throw new HttpError(404, 'Aucun compte Steam local avec des données Isaac : choisis un autre joueur');
        }
        steamId64 = account.steamId64;
      } else if (isSteamId64(profile)) {
        steamId64 = profile;
        account = env.accounts.find((a) => a.steamId64 === profile && a.hasIsaacData) ?? null;
      } else {
        throw new HttpError(400, 'Paramètre profile invalide : "me" ou un SteamID64 attendu');
      }

      const schema = await loadSchema();
      const defs = schema.data?.map((entry) => entry.def) ?? null;

      if (!account || !paths) {
        if (slot !== null) throw new HttpError(400, 'Le choix du slot est réservé aux comptes locaux');
        const [online, name] = await Promise.all([loadOnline(steamId64, false), resolveName(steamId64)]);
        const remote = absent<never>('Joueur distant : pas de fichiers locaux');
        return mergeProgress({
          profile: { steamId64, name, isLocal: false },
          defs,
          steamCache: remote,
          save: remote,
          saveSlots: null,
          online,
          accounts,
        });
      }

      const [steamCache, save, online] = await Promise.all([
        loadSteamCache(account, schema),
        loadSave(account, slot),
        loadOnline(steamId64, true),
      ]);
      return mergeProgress({
        profile: { steamId64, name: account.personaName, isLocal: true },
        defs,
        steamCache,
        save: save.result,
        saveSlots: save.slots,
        online,
        accounts,
      });
    },
  };
}
