import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProfileQuery } from '../../web/src/api.ts';
import { useRoutes } from '../../web/src/useRoutes.ts';
import { KB_ABSENT, ROUTES_OK } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

const ME: ProfileQuery = { profile: 'me', slot: null };

describe('useRoutes', () => {
  it('charge le plan puis le garde affiché pendant une actualisation', async () => {
    let release: () => void = () => {};
    const mock = stubFetch({
      'GET /api/routes': (url) => {
        expect(url.search).toBe('?profile=me');
        return new Promise((resolve) => (release = () => resolve(ROUTES_OK)));
      },
    });
    const { result, rerender } = renderHook(({ key }) => useRoutes(ME, key), { initialProps: { key: 0 } });
    expect(result.current).toEqual({ status: 'loading' });
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    release();
    await vi.waitFor(() => expect(result.current).toEqual({ status: 'ready', data: ROUTES_OK, refreshing: false }));
    rerender({ key: 1 });
    expect(result.current).toEqual({ status: 'ready', data: ROUTES_OK, refreshing: true });
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
    release();
    await vi.waitFor(() => expect(result.current).toEqual({ status: 'ready', data: ROUTES_OK, refreshing: false }));
  });

  it('repart de zéro quand le profil change', async () => {
    const mock = stubFetch({
      'GET /api/routes': (url) => (url.searchParams.get('slot') === '2' ? { kb: KB_ABSENT, plan: null } : ROUTES_OK),
    });
    const { result, rerender } = renderHook(({ query }) => useRoutes(query, 0), { initialProps: { query: ME } });
    await vi.waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ query: { profile: 'me', slot: 2 } });
    expect(result.current).toEqual({ status: 'loading' });
    await vi.waitFor(() =>
      expect(result.current).toEqual({ status: 'ready', data: { kb: KB_ABSENT, plan: null }, refreshing: false }),
    );
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('signale l’erreur du serveur', async () => {
    stubFetch({ 'GET /api/routes': () => jsonResponse({ error: 'Aucun compte Steam local' }, 404) });
    const { result } = renderHook(() => useRoutes(ME, 0));
    await vi.waitFor(() => expect(result.current).toEqual({ status: 'error', message: 'Aucun compte Steam local' }));
  });
});
