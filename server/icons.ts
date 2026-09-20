import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { t, type Locale } from '../shared/i18n/index.ts';
import { writeFileAtomic } from './fs-atomic.ts';
import { HttpError } from './http-error.ts';
import { APP_ID } from './steam.ts';

export const ICON_FILE = /^[0-9a-f]{40}\.jpg$/;
const ICON_BASE_URL = `https://shared.fastly.steamstatic.com/community_assets/images/apps/${APP_ID}/`;

export interface IconCache {
  get(file: string, locale: Locale): Promise<Uint8Array>;
}

export function createIconCache(dir: string, doFetch: typeof fetch = fetch): IconCache {
  const pending = new Map<string, Promise<Uint8Array>>();

  async function load(file: string, locale: Locale): Promise<Uint8Array> {
    const target = path.join(dir, file);
    try {
      return new Uint8Array(await readFile(target));
    } catch {
      // Not cached yet: we download it.
    }
    let response: Response;
    try {
      response = await doFetch(ICON_BASE_URL + file, { signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw new HttpError(502, t(locale, 'errors.steamUnreachable', { message: error instanceof Error ? error.message : String(error) }));
    }
    if (!response.ok) throw new HttpError(502, t(locale, 'errors.iconUnavailable', { status: response.status }));
    // An error page served as 200 must not be kept for 7 days as an icon.
    if (!(response.headers.get('content-type') ?? '').startsWith('image/')) {
      throw new HttpError(502, t(locale, 'errors.unexpectedSteamResponse'));
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Atomic write: an interruption during the download does not leave a truncated icon.
    await writeFileAtomic(target, bytes);
    return bytes;
  }

  return {
    get(file, locale) {
      // The name is used as a disk path: strict validation before any access.
      if (!ICON_FILE.test(file)) return Promise.reject(new HttpError(400, t(locale, 'errors.iconNameInvalid')));
      const existing = pending.get(file);
      if (existing) return existing;
      const promise = load(file, locale).finally(() => pending.delete(file));
      pending.set(file, promise);
      return promise;
    },
  };
}
