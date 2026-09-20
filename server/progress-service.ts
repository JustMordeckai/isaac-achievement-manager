import { readFile, stat } from 'node:fs/promises';
import { DEFAULT_LOCALE, t, type Locale } from '../shared/i18n/index.ts';
import type { AchievementDef, LocalAccount, ProgressSummary } from '../shared/types.ts';
import { chooseAccount, steamPaths, type SteamAccount, type SteamEnv } from './config.ts';
import { HttpError } from './http-error.ts';
import { mergeProgress, type MergedProgress, type SourceResult } from './sources/progress.ts';
import { listSaveSlots, parseSaveFile, pickDefaultSlot, type SaveFileData, type SaveSlot } from './sources/save-file.ts';
import { parseSchema, parseUserStats, type SchemaEntry, type UnlockMap } from './sources/steam-cache.ts';
import { ProfileError, type ProfileClient, type ProfileErrorKind, type ProfileStats } from './sources/steam-profile.ts';
import { isSteamId64 } from './steam.ts';

export interface ProgressService {
  /**
   * `profile` is "me" or a SteamID64; `slot` forces a save slot (1 to 3); `locale` is the
   * reader's language for any error message. Two simultaneous calls with the same profile
   * and slot share the same load.
   */
  get(profile: string, slot: number | null, locale: Locale): Promise<MergedProgress>;
  /** Local Steam schema definitions, null when unavailable. */
  definitions(): Promise<AchievementDef[] | null>;
}

export interface ProgressServiceOptions {
  env: SteamEnv;
  forcedAccountId: number | null;
  profiles: ProfileClient;
}

const PROFILE_ERROR_STATUS: Record<ProfileErrorKind, number> = {
  input: 400,
  notFound: 404,
  private: 403,
  invalid: 502,
  network: 502,
};

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

  async function loadSchema(locale: Locale): Promise<SourceResult<SchemaEntry[]>> {
    if (!paths) return absent(t(locale, 'errors.steamNotFound'));
    try {
      const updatedAt = (await stat(paths.schema)).mtime.toISOString();
      let cached = schemaCache;
      if (!cached || cached.updatedAt !== updatedAt) {
        cached = { updatedAt, entries: parseSchema(new Uint8Array(await readFile(paths.schema))) };
        schemaCache = cached;
      }
      return { status: { state: 'ok', updatedAt }, data: cached.entries };
    } catch (error) {
      return isMissingFile(error) ? absent(t(locale, 'errors.schemaNotFound')) : failed(error);
    }
  }

  async function loadSteamCache(
    account: SteamAccount,
    schema: SourceResult<SchemaEntry[]>,
    locale: Locale,
  ): Promise<SourceResult<UnlockMap>> {
    if (!paths || !schema.data) return { status: schema.status, data: null };
    const file = paths.stats(account.accountId);
    try {
      const [bytes, info] = await Promise.all([readFile(file), stat(file)]);
      return { status: { state: 'ok', updatedAt: info.mtime.toISOString() }, data: parseUserStats(new Uint8Array(bytes), schema.data) };
    } catch (error) {
      return isMissingFile(error) ? absent(t(locale, 'errors.noLocalSteamStats')) : failed(error);
    }
  }

  async function loadSave(
    account: SteamAccount,
    slot: number | null,
    locale: Locale,
  ): Promise<{ result: SourceResult<SaveFileData>; slots: ProgressSummary['save'] }> {
    if (!paths) return { result: absent(t(locale, 'errors.steamNotFound')), slots: null };
    let available: SaveSlot[];
    try {
      available = await listSaveSlots(paths.remote(account.accountId));
    } catch (error) {
      return { result: failed(error), slots: null };
    }
    if (available.length === 0) return { result: absent(t(locale, 'errors.noSaveFile')), slots: null };
    const chosen = slot === null ? pickDefaultSlot(available) : available.find((s) => s.slot === slot);
    // slot is never null here: with slot === null, pickDefaultSlot always returns an entry for a non-empty list.
    if (!chosen) throw new HttpError(400, t(locale, 'errors.slotNotFound', { slot: slot as number }));
    const slots = { slot: chosen.slot, slots: available.map((s) => s.slot) };
    try {
      const data = parseSaveFile(new Uint8Array(await readFile(chosen.path)), locale);
      const updatedAt = new Date(chosen.mtimeMs).toISOString();
      return { result: { status: { state: 'ok', message: t(locale, 'errors.slotLabel', { slot: chosen.slot }), updatedAt }, data }, slots };
    } catch (error) {
      return { result: failed(error), slots };
    }
  }

  async function loadOnline(steamId64: string, isLocal: boolean, locale: Locale): Promise<SourceResult<ProfileStats>> {
    try {
      return { status: { state: 'ok' }, data: await profiles.getStats(steamId64, locale) };
    } catch (error) {
      if (!isLocal) throw error instanceof ProfileError ? profileErrorToHttp(error) : error;
      return failed(error);
    }
  }

  async function resolveName(steamId64: string, locale: Locale): Promise<string | null> {
    try {
      return (await profiles.resolve(steamId64, locale)).name;
    } catch {
      return null;
    }
  }

  async function load(profile: string, slot: number | null, locale: Locale): Promise<MergedProgress> {
    let account: SteamAccount | null;
    let steamId64: string;
    if (profile === 'me') {
      account = chooseAccount(env, forcedAccountId);
      if (!account) {
        throw new HttpError(404, t(locale, 'errors.noLocalAccount'));
      }
      steamId64 = account.steamId64;
    } else if (isSteamId64(profile)) {
      steamId64 = profile;
      account = env.accounts.find((a) => a.steamId64 === profile && a.hasIsaacData) ?? null;
    } else {
      throw new HttpError(400, t(locale, 'errors.profileParamInvalid'));
    }

    const schema = await loadSchema(locale);
    const defs = schema.data?.map((entry) => entry.def) ?? null;

    if (!account || !paths) {
      if (slot !== null) throw new HttpError(400, t(locale, 'errors.slotLocalOnly'));
      const [online, name] = await Promise.all([loadOnline(steamId64, false, locale), resolveName(steamId64, locale)]);
      const remote = absent<never>(t(locale, 'errors.remotePlayerNoLocalFiles'));
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
      loadSteamCache(account, schema, locale),
      loadSave(account, slot, locale),
      loadOnline(steamId64, true, locale),
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
  }

  const inFlight = new Map<string, Promise<MergedProgress>>();

  return {
    get(profile, slot, locale) {
      const key = `${profile}|${slot ?? ''}`;
      const pending = inFlight.get(key);
      if (pending) return pending;
      const promise = load(profile, slot, locale).finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      return promise;
    },
    async definitions() {
      return (await loadSchema(DEFAULT_LOCALE)).data?.map((entry) => entry.def) ?? null;
    },
  };
}
