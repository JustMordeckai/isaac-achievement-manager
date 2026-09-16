import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIconCache } from '../../server/icons.ts';
import { removeDir } from './helpers/steam-dir.ts';

const FILE = 'a36d7e92df7e991758907a75dfa55d36b52548c4.jpg';
const jpeg = (bytes: number[]) => new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/jpeg' } });

describe('createIconCache', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'iam-icons-'));
  });
  afterEach(() => removeDir(dir));

  it('télécharge une icône une seule fois puis la sert depuis le disque', async () => {
    const calls: string[] = [];
    const cache = createIconCache(path.join(dir, 'icons'), (async (url: string | URL | Request) => {
      calls.push(String(url));
      return jpeg([1, 2, 3]);
    }) as typeof fetch);
    expect(await cache.get(FILE)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await cache.get(FILE)).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls).toEqual([`https://shared.fastly.steamstatic.com/community_assets/images/apps/250900/${FILE}`]);
    expect(new Uint8Array(readFileSync(path.join(dir, 'icons', FILE)))).toEqual(new Uint8Array([1, 2, 3]));
    expect(readdirSync(path.join(dir, 'icons'))).toEqual([FILE]);
  });

  it('refuse une réponse qui n’est pas une image sans rien écrire', async () => {
    const cache = createIconCache(path.join(dir, 'icons'), (async () =>
      new Response('<html>maintenance</html>', { headers: { 'Content-Type': 'text/html' } })) as typeof fetch);
    await expect(cache.get(FILE)).rejects.toMatchObject({
      status: 502,
      message: 'Réponse inattendue de Steam : ce n’est pas une image',
    });
    expect(readdirSync(dir)).toEqual([]);
  });

  it.each(['../secret.jpg', 'A36D7E92DF7E991758907A75DFA55D36B52548C4.jpg', `${'a'.repeat(40)}.png`, `${'a'.repeat(39)}.jpg`])(
    'refuse le nom %s sans rien télécharger',
    async (name) => {
      const cache = createIconCache(dir, (async () => {
        throw new Error('ne doit pas être appelé');
      }) as typeof fetch);
      await expect(cache.get(name)).rejects.toMatchObject({ status: 400 });
    },
  );

  it('signale une icône indisponible', async () => {
    const cache = createIconCache(dir, (async () => new Response('nope', { status: 404 })) as typeof fetch);
    await expect(cache.get(FILE)).rejects.toMatchObject({ status: 502, message: 'Icône indisponible chez Steam (HTTP 404)' });
  });

  it('signale un réseau injoignable', async () => {
    const cache = createIconCache(dir, (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch);
    await expect(cache.get(FILE)).rejects.toMatchObject({ status: 502, message: 'Steam injoignable : fetch failed' });
  });
});
