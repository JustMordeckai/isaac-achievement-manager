import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WikiSyncEvent } from '../../shared/types.ts';
import { useKbStatus, useSettings, useWikiSync } from '../../web/src/useWiki.ts';
import { KB_ABSENT, KB_OK, SETTINGS } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

const DONE: WikiSyncEvent = {
  step: 'done',
  done: 1,
  total: 1,
  message: 'Synchro terminée',
  report: { achievements: 641, pages: 518, missingPages: [], unknownTemplates: {}, miscCount: 108, otherUnlockCount: 61, cachedPages: 0 },
};

const ndjson = (events: WikiSyncEvent[]) => new Response(events.map((e) => `${JSON.stringify(e)}\n`).join(''));

describe('useKbStatus', () => {
  it('relit l’état à chaque changement de clé', async () => {
    let status = KB_ABSENT;
    const mock = stubFetch({ 'GET /api/wiki/status': () => status });
    const { result, rerender } = renderHook(({ key }) => useKbStatus(key), { initialProps: { key: 0 } });
    expect(result.current).toBeNull();
    await vi.waitFor(() => expect(result.current).toEqual(KB_ABSENT));
    status = KB_OK;
    rerender({ key: 1 });
    await vi.waitFor(() => expect(result.current).toEqual(KB_OK));
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('turns a read error into an "error" state', async () => {
    stubFetch({ 'GET /api/wiki/status': () => jsonResponse({ error: 'boom' }, 500) });
    const { result } = renderHook(() => useKbStatus(0));
    await vi.waitFor(() =>
      expect(result.current).toEqual({ state: 'error', syncedAt: null, running: false, message: 'Wiki state unavailable: boom' }),
    );
  });
});

describe('useSettings', () => {
  it('lit les réglages une fois, ou signale l’erreur', async () => {
    stubFetch({ 'GET /api/settings': () => SETTINGS });
    const ok = renderHook(() => useSettings());
    expect(ok.result.current).toEqual({ status: 'loading' });
    await vi.waitFor(() => expect(ok.result.current).toEqual({ status: 'ready', info: SETTINGS }));
    stubFetch({ 'GET /api/settings': () => jsonResponse({ error: 'Erreur interne' }, 500) });
    const failed = renderHook(() => useSettings());
    await vi.waitFor(() => expect(failed.result.current).toEqual({ status: 'error', message: 'Erreur interne' }));
  });
});

describe('useWikiSync', () => {
  it('suit la synchro jusqu’au rapport puis prévient l’application', async () => {
    let finish: (response: Response) => void = () => {};
    const mock = stubFetch({ 'POST /api/wiki/sync': () => new Promise<Response>((resolve) => (finish = resolve)) });
    const onFinished = vi.fn();
    const { result } = renderHook(() => useWikiSync(onFinished));
    expect(result.current[0]).toEqual({ kind: 'idle' });
    act(() => result.current[1]());
    expect(result.current[0]).toEqual({ kind: 'running', event: null });
    act(() => result.current[1]());
    expect(mock).toHaveBeenCalledTimes(1);
    await act(async () => finish(ndjson([{ step: 'core', done: 0, total: 1, message: 'Téléchargement' }, DONE])));
    await vi.waitFor(() => expect(result.current[0]).toEqual({ kind: 'done', report: DONE.report }));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('signale un échec du flux ou un refus du serveur, et permet de relancer', async () => {
    const onFinished = vi.fn();
    stubFetch({
      'POST /api/wiki/sync': () => ndjson([{ step: 'error', done: 0, total: 1, message: 'Page « Achievements » indisponible' }]),
    });
    const { result } = renderHook(() => useWikiSync(onFinished));
    act(() => result.current[1]());
    await vi.waitFor(() => expect(result.current[0]).toEqual({ kind: 'failed', message: 'Page « Achievements » indisponible' }));
    stubFetch({ 'POST /api/wiki/sync': () => jsonResponse({ error: 'Une synchro du wiki est déjà en cours' }, 409) });
    act(() => result.current[1]());
    await vi.waitFor(() =>
      expect(result.current[0]).toEqual({ kind: 'failed', message: 'Une synchro du wiki est déjà en cours' }),
    );
    expect(onFinished).toHaveBeenCalledTimes(2);
  });
});
