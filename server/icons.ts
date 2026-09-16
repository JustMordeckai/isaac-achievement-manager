import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http-error.ts';
import { APP_ID } from './steam.ts';

export const ICON_FILE = /^[0-9a-f]{40}\.jpg$/;
const ICON_BASE_URL = `https://shared.fastly.steamstatic.com/community_assets/images/apps/${APP_ID}/`;

export interface IconCache {
  get(file: string): Promise<Uint8Array>;
}

export function createIconCache(dir: string, doFetch: typeof fetch = fetch): IconCache {
  const pending = new Map<string, Promise<Uint8Array>>();

  async function load(file: string): Promise<Uint8Array> {
    const target = path.join(dir, file);
    try {
      return new Uint8Array(await readFile(target));
    } catch {
      // Pas encore en cache : on télécharge.
    }
    let response: Response;
    try {
      response = await doFetch(ICON_BASE_URL + file, { signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw new HttpError(502, `Steam injoignable : ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) throw new HttpError(502, `Icône indisponible chez Steam (HTTP ${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await mkdir(dir, { recursive: true });
    await writeFile(target, bytes);
    return bytes;
  }

  return {
    get(file) {
      // Le nom sert de chemin sur le disque : validation stricte avant tout accès.
      if (!ICON_FILE.test(file)) return Promise.reject(new HttpError(400, "Nom d'icône invalide"));
      const existing = pending.get(file);
      if (existing) return existing;
      const promise = load(file).finally(() => pending.delete(file));
      pending.set(file, promise);
      return promise;
    },
  };
}
