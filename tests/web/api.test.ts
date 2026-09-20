import { describe, expect, it } from 'vitest';
import type { AdvisorEvent, WikiSyncEvent } from '../../shared/types.ts';
import { api, ApiRequestError, iconUrl } from '../../web/src/api.ts';
import { ADVISOR_OK, KB_OK, makeCard, makeSummary, ROUTES_OK, SETTINGS } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

describe('api', () => {
  it('passes the profile and the slot', async () => {
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

  it('leaves the slot out when it is null', async () => {
    stubFetch({
      'GET /api/achievements': (url) => {
        expect(url.search).toBe('?profile=me');
        return [];
      },
    });
    expect(await api.achievements({ profile: 'me', slot: null })).toEqual([]);
  });

  it('passes on the error message from the server', async () => {
    stubFetch({ 'GET /api/progress': () => jsonResponse({ error: 'No account' }, 404) });
    const error = await api.progress({ profile: 'me', slot: null }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 404, message: 'No account' });
  });

  it('handles an error with no JSON body', async () => {
    stubFetch({ 'GET /api/progress': () => new Response('boom', { status: 500 }) });
    await expect(api.progress({ profile: 'me', slot: null })).rejects.toMatchObject({ status: 500, message: 'HTTP 500' });
  });

  it('encodes the input of the profile lookup', async () => {
    stubFetch({
      'GET /api/profile/resolve': (url) => {
        expect(url.searchParams.get('input')).toBe('https://steamcommunity.com/id/Friend/');
        return { steamId64: '76561198000000001', name: 'Friend' };
      },
    });
    expect(await api.resolveProfile('https://steamcommunity.com/id/Friend/')).toEqual({ steamId64: '76561198000000001', name: 'Friend' });
  });

  it('sends the shutdown header', async () => {
    stubFetch({
      'POST /api/shutdown': (_url, init) => {
        expect(new Headers(init?.headers).get('X-IAM-Action')).toBe('shutdown');
        return { ok: true };
      },
    });
    await expect(api.shutdown()).resolves.toBeUndefined();
  });

  it('reports a refused shutdown', async () => {
    stubFetch({ 'POST /api/shutdown': () => jsonResponse({ error: 'no' }, 403) });
    await expect(api.shutdown()).rejects.toMatchObject({ status: 403 });
  });

  it('builds the icon URL', () => {
    expect(iconUrl('abc.jpg')).toBe('/api/icons/abc.jpg');
  });

  it('asks for the card of an achievement for the current profile', async () => {
    stubFetch({
      'GET /api/achievement/9': (url) => {
        expect(url.search).toBe('?profile=me&slot=2');
        return makeCard();
      },
    });
    expect((await api.achievement(9, { profile: 'me', slot: 2 })).wiki?.name).toBe('The Nail');
  });

  it('asks for the route plan of the current profile', async () => {
    stubFetch({
      'GET /api/routes': (url) => {
        expect(url.search).toBe('?profile=76561198000000001');
        return ROUTES_OK;
      },
    });
    expect(await api.routes({ profile: '76561198000000001', slot: null })).toEqual(ROUTES_OK);
  });

  it('reads the wiki state and the settings', async () => {
    stubFetch({ 'GET /api/wiki/status': () => KB_OK, 'GET /api/settings': () => SETTINGS });
    expect(await api.wikiStatus()).toEqual(KB_OK);
    expect(await api.settings()).toEqual(SETTINGS);
  });

  it('saves the locale with the dedicated header', async () => {
    const mock = stubFetch({
      'POST /api/settings': (_url, init) => {
        expect(new Headers(init?.headers).get('X-IAM-Action')).toBe('settings');
        return { ...SETTINGS, locale: 'fr' };
      },
    });
    expect(await api.saveLocale('fr')).toEqual({ ...SETTINGS, locale: 'fr' });
    expect(JSON.parse(String(mock.mock.calls[0][1]?.body))).toEqual({ locale: 'fr' });
  });
});

describe('api: advisor', () => {
  it('reads the advisor state and saves its settings with the dedicated header', async () => {
    const mock = stubFetch({
      'GET /api/advisor/status': () => ADVISOR_OK,
      'POST /api/advisor/settings': (_url, init) => {
        expect(new Headers(init?.headers).get('X-IAM-Action')).toBe('advisor-settings');
        expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
        return { ...ADVISOR_OK, model: 'qwen3.5:4b' };
      },
    });
    expect(await api.advisorStatus()).toEqual(ADVISOR_OK);
    expect(await api.saveAdvisorSettings({ url: ADVISOR_OK.url, model: 'qwen3.5:4b' })).toMatchObject({ model: 'qwen3.5:4b' });
    expect(JSON.parse(String(mock.mock.calls[1][1]?.body))).toEqual({ url: ADVISOR_OK.url, model: 'qwen3.5:4b' });
  });
});

describe('api.askAdvisor', () => {
  const REQUEST = { question: 'Which run should I do?', history: [], profile: 'me', slot: 1 };
  const EVENTS: AdvisorEvent[] = [
    { kind: 'context', sources: [{ id: 45, name: 'Guardian Angel' }] },
    { kind: 'delta', text: 'Start with ' },
    { kind: 'delta', text: 'Magdalene.' },
    { kind: 'done' },
  ];
  const body = (events: AdvisorEvent[]) => new Response(events.map((e) => `${JSON.stringify(e)}\n`).join(''));

  it('sends the question with the dedicated header and passes on every event', async () => {
    const mock = stubFetch({
      'POST /api/advisor': (_url, init) => {
        expect(new Headers(init?.headers).get('X-IAM-Action')).toBe('advisor');
        return body(EVENTS);
      },
    });
    const seen: AdvisorEvent[] = [];
    expect(await api.askAdvisor(REQUEST, 'en', (event: AdvisorEvent) => seen.push(event))).toEqual({ kind: 'done' });
    expect(seen).toEqual(EVENTS);
    expect(JSON.parse(String(mock.mock.calls[0][1]?.body))).toEqual(REQUEST);
  });

  it('returns the error sent in the stream', async () => {
    const error: AdvisorEvent = { kind: 'error', message: 'Ollama error: out of memory' };
    stubFetch({ 'POST /api/advisor': () => body([EVENTS[0], error]) });
    expect(await api.askAdvisor(REQUEST, 'en', () => {})).toEqual(error);
  });

  it('passes on a refusal before the stream, an interrupted stream or an unreadable one', async () => {
    stubFetch({ 'POST /api/advisor': () => jsonResponse({ error: 'Ollama unreachable at http://127.0.0.1:11434' }, 503) });
    await expect(api.askAdvisor(REQUEST, 'en', () => {})).rejects.toMatchObject({
      status: 503,
      message: 'Ollama unreachable at http://127.0.0.1:11434',
    });
    stubFetch({ 'POST /api/advisor': () => body(EVENTS.slice(0, 2)) });
    await expect(api.askAdvisor(REQUEST, 'en', () => {})).rejects.toThrow('Answer from the advisor interrupted');
    stubFetch({ 'POST /api/advisor': () => new Response('not json\n') });
    await expect(api.askAdvisor(REQUEST, 'en', () => {})).rejects.toThrow('Unreadable answer from the advisor');
  });

  it('passes on the abort signal', async () => {
    const controller = new AbortController();
    const mock = stubFetch({ 'POST /api/advisor': () => body(EVENTS) });
    await api.askAdvisor(REQUEST, 'en', () => {}, controller.signal);
    expect(mock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});

describe('api.syncWiki', () => {
  const encoder = new TextEncoder();
  const EVENTS: WikiSyncEvent[] = [
    { step: 'core', done: 0, total: 1, message: 'Downloading the achievement list' },
    { step: 'pages', done: 1, total: 12, message: 'Batch 1 of 12' },
    { step: 'done', done: 1, total: 1, message: 'Sync complete' },
  ];

  /** NDJSON stream cut into arbitrary chunks, as it comes over the network. */
  function ndjson(chunks: string[]): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
  }

  it('sends the dedicated header and passes on every event, even one cut between two chunks', async () => {
    const text = EVENTS.map((e) => JSON.stringify(e)).join('\n');
    const cut = text.indexOf('Batch 1') + 2;
    stubFetch({
      'POST /api/wiki/sync': (_url, init) => {
        expect(new Headers(init?.headers).get('X-IAM-Action')).toBe('wiki-sync');
        return ndjson([text.slice(0, cut), text.slice(cut), '\n']);
      },
    });
    const seen: WikiSyncEvent[] = [];
    const last = await api.syncWiki('en', (event: WikiSyncEvent) => seen.push(event));
    expect(seen).toEqual(EVENTS);
    expect(last).toEqual(EVENTS[2]);
  });

  it('reads the last line with no trailing newline', async () => {
    stubFetch({ 'POST /api/wiki/sync': () => ndjson([`${JSON.stringify(EVENTS[0])}\n${JSON.stringify(EVENTS[2])}`]) });
    expect(await api.syncWiki('en', () => {})).toEqual(EVENTS[2]);
  });

  it('passes on a refusal from the server and an empty stream', async () => {
    stubFetch({ 'POST /api/wiki/sync': () => jsonResponse({ error: 'A wiki sync is already running' }, 409) });
    await expect(api.syncWiki('en', () => {})).rejects.toMatchObject({ status: 409, message: 'A wiki sync is already running' });
    stubFetch({ 'POST /api/wiki/sync': () => ndjson([]) });
    await expect(api.syncWiki('en', () => {})).rejects.toThrow('Sync interrupted with no result');
  });

  it('reports a stream that ends with no final event', async () => {
    stubFetch({ 'POST /api/wiki/sync': () => ndjson([`${JSON.stringify(EVENTS[0])}\n${JSON.stringify(EVENTS[1])}\n`]) });
    await expect(api.syncWiki('en', () => {})).rejects.toThrow('Sync interrupted with no result');
  });

  it('reports an unreadable line in the stream', async () => {
    stubFetch({ 'POST /api/wiki/sync': () => ndjson([`${JSON.stringify(EVENTS[0])}\nnot json\n`]) });
    await expect(api.syncWiki('en', () => {})).rejects.toThrow('Unreadable sync answer');
  });
});
