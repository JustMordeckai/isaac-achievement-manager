import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WikiSyncEvent } from '@shared/types.ts';
import { useWikiSync } from '@/hooks/useWikiSync.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

const DONE: WikiSyncEvent = {
  step: 'done',
  done: 1,
  total: 1,
  message: 'Sync complete',
  report: { achievements: 641, pages: 518, missingPages: [], unknownTemplates: {}, miscCount: 108, otherUnlockCount: 61, cachedPages: 0 },
};

const ndjson = (events: WikiSyncEvent[]) => new Response(events.map((e) => `${JSON.stringify(e)}\n`).join(''));

describe('useWikiSync', () => {
  it('follows the sync to its report then warns the application', async () => {
    let finish: (response: Response) => void = () => {};
    const mock = stubFetch({ 'POST /api/wiki/sync': () => new Promise<Response>((resolve) => (finish = resolve)) });
    const onFinished = vi.fn();
    const { result } = renderHook(() => useWikiSync(onFinished));
    expect(result.current[0]).toEqual({ kind: 'idle' });
    act(() => result.current[1]());
    expect(result.current[0]).toEqual({ kind: 'running', event: null });
    act(() => result.current[1]());
    expect(mock).toHaveBeenCalledTimes(1);
    await act(async () => finish(ndjson([{ step: 'core', done: 0, total: 1, message: 'Downloading' }, DONE])));
    await vi.waitFor(() => expect(result.current[0]).toEqual({ kind: 'done', report: DONE.report }));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('reports a failed stream or a refusal from the server, and allows a retry', async () => {
    const onFinished = vi.fn();
    stubFetch({
      'POST /api/wiki/sync': () => ndjson([{ step: 'error', done: 0, total: 1, message: 'Page « Achievements » indisponible' }]),
    });
    const { result } = renderHook(() => useWikiSync(onFinished));
    act(() => result.current[1]());
    await vi.waitFor(() => expect(result.current[0]).toEqual({ kind: 'failed', message: 'Page « Achievements » indisponible' }));
    stubFetch({ 'POST /api/wiki/sync': () => jsonResponse({ error: 'A wiki sync is already running' }, 409) });
    act(() => result.current[1]());
    await vi.waitFor(() =>
      expect(result.current[0]).toEqual({ kind: 'failed', message: 'A wiki sync is already running' }),
    );
    expect(onFinished).toHaveBeenCalledTimes(2);
  });
});
