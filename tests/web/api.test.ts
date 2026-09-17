import { describe, expect, it } from 'vitest';
import type { WikiSyncEvent } from '../../shared/types.ts';
import { api, ApiRequestError, iconUrl } from '../../web/src/api.ts';
import { KB_OK, makeCard, makeSummary, ROUTES_OK, SETTINGS } from './factories.ts';
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

  it('demande la fiche d’un succès pour le profil courant', async () => {
    stubFetch({
      'GET /api/achievement/9': (url) => {
        expect(url.search).toBe('?profile=me&slot=2');
        return makeCard();
      },
    });
    expect((await api.achievement(9, { profile: 'me', slot: 2 })).wiki?.name).toBe('The Nail');
  });

  it('demande le plan de routes du profil courant', async () => {
    stubFetch({
      'GET /api/routes': (url) => {
        expect(url.search).toBe('?profile=76561198000000001');
        return ROUTES_OK;
      },
    });
    expect(await api.routes({ profile: '76561198000000001', slot: null })).toEqual(ROUTES_OK);
  });

  it('lit l’état du wiki et les réglages', async () => {
    stubFetch({ 'GET /api/wiki/status': () => KB_OK, 'GET /api/settings': () => SETTINGS });
    expect(await api.wikiStatus()).toEqual(KB_OK);
    expect(await api.settings()).toEqual(SETTINGS);
  });
});

describe('api.syncWiki', () => {
  const encoder = new TextEncoder();
  const EVENTS: WikiSyncEvent[] = [
    { step: 'core', done: 0, total: 1, message: 'Téléchargement de la liste des succès' },
    { step: 'pages', done: 1, total: 12, message: 'Lot 1 sur 12' },
    { step: 'done', done: 1, total: 1, message: 'Synchro terminée' },
  ];

  /** Flux NDJSON découpé en morceaux arbitraires, comme sur le réseau. */
  function ndjson(chunks: string[]): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
  }

  it('envoie l’en-tête dédié et transmet chaque événement, même coupé entre deux morceaux', async () => {
    const text = EVENTS.map((e) => JSON.stringify(e)).join('\n');
    const cut = text.indexOf('Lot 1') + 2;
    stubFetch({
      'POST /api/wiki/sync': (_url, init) => {
        expect(new Headers(init?.headers).get('X-IAM-Action')).toBe('wiki-sync');
        return ndjson([text.slice(0, cut), text.slice(cut), '\n']);
      },
    });
    const seen: WikiSyncEvent[] = [];
    const last = await api.syncWiki((event) => seen.push(event));
    expect(seen).toEqual(EVENTS);
    expect(last).toEqual(EVENTS[2]);
  });

  it('lit la dernière ligne sans saut de ligne final', async () => {
    stubFetch({ 'POST /api/wiki/sync': () => ndjson([`${JSON.stringify(EVENTS[0])}\n${JSON.stringify(EVENTS[2])}`]) });
    expect(await api.syncWiki(() => {})).toEqual(EVENTS[2]);
  });

  it('remonte un refus du serveur et un flux vide', async () => {
    stubFetch({ 'POST /api/wiki/sync': () => jsonResponse({ error: 'Une synchro du wiki est déjà en cours' }, 409) });
    await expect(api.syncWiki(() => {})).rejects.toMatchObject({ status: 409, message: 'Une synchro du wiki est déjà en cours' });
    stubFetch({ 'POST /api/wiki/sync': () => ndjson([]) });
    await expect(api.syncWiki(() => {})).rejects.toThrow('Synchro interrompue sans résultat');
  });

  it('signale un flux terminé sans événement final', async () => {
    stubFetch({ 'POST /api/wiki/sync': () => ndjson([`${JSON.stringify(EVENTS[0])}\n${JSON.stringify(EVENTS[1])}\n`]) });
    await expect(api.syncWiki(() => {})).rejects.toThrow('Synchro interrompue sans résultat');
  });

  it('signale une ligne du flux illisible', async () => {
    stubFetch({ 'POST /api/wiki/sync': () => ndjson([`${JSON.stringify(EVENTS[0])}\npas du json\n`]) });
    await expect(api.syncWiki(() => {})).rejects.toThrow('Réponse de synchro illisible');
  });
});
