import { describe, expect, it } from 'vitest';
import { api, ApiRequestError, iconUrl } from '../../web/src/api.ts';
import { makeSummary } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

describe('api', () => {
  it('transmet le profil et le slot', async () => {
    const fetchMock = stubFetch({
      'GET /api/progress': (url) => {
        expect(url.searchParams.get('profile')).toBe('76561198000000001');
        expect(url.searchParams.get('slot')).toBe('2');
        return makeSummary();
      },
    });
    expect((await api.progress({ profile: '76561198000000001', slot: 2 })).unlocked).toBe(125);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('omet le slot quand il est nul', async () => {
    stubFetch({
      'GET /api/achievements': (url) => {
        expect(url.search).toBe('?profile=me');
        return [];
      },
    });
    expect(await api.achievements({ profile: 'me', slot: null })).toEqual([]);
  });

  it('remonte le message d’erreur du serveur', async () => {
    stubFetch({ 'GET /api/progress': () => jsonResponse({ error: 'Aucun compte' }, 404) });
    const error = await api.progress({ profile: 'me', slot: null }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 404, message: 'Aucun compte' });
  });

  it('gère une erreur sans corps JSON', async () => {
    stubFetch({ 'GET /api/progress': () => new Response('boom', { status: 500 }) });
    await expect(api.progress({ profile: 'me', slot: null })).rejects.toMatchObject({ status: 500, message: 'Erreur HTTP 500' });
  });

  it('encode l’entrée de résolution', async () => {
    stubFetch({
      'GET /api/profile/resolve': (url) => {
        expect(url.searchParams.get('input')).toBe('https://steamcommunity.com/id/Ami/');
        return { steamId64: '76561198000000001', name: 'Ami' };
      },
    });
    expect(await api.resolveProfile('https://steamcommunity.com/id/Ami/')).toEqual({ steamId64: '76561198000000001', name: 'Ami' });
  });

  it('envoie l’en-tête d’arrêt', async () => {
    stubFetch({
      'POST /api/shutdown': (_url, init) => {
        expect(new Headers(init?.headers).get('X-IAM-Action')).toBe('shutdown');
        return { ok: true };
      },
    });
    await expect(api.shutdown()).resolves.toBeUndefined();
  });

  it('signale un arrêt refusé', async () => {
    stubFetch({ 'POST /api/shutdown': () => jsonResponse({ error: 'non' }, 403) });
    await expect(api.shutdown()).rejects.toMatchObject({ status: 403 });
  });

  it('construit l’URL des icônes', () => {
    expect(iconUrl('abc.jpg')).toBe('/api/icons/abc.jpg');
  });
});
