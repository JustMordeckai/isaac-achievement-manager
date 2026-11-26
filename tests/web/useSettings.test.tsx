import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSettings } from '@/hooks/useSettings.ts';
import { SETTINGS } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

describe('useSettings', () => {
  it('reads the settings once, or reports the error', async () => {
    stubFetch({ 'GET /api/settings': () => SETTINGS });
    const ok = renderHook(() => useSettings());
    expect(ok.result.current).toEqual({ status: 'loading' });
    await vi.waitFor(() => expect(ok.result.current).toEqual({ status: 'ready', info: SETTINGS }));
    stubFetch({ 'GET /api/settings': () => jsonResponse({ error: 'Internal error' }, 500) });
    const failed = renderHook(() => useSettings());
    await vi.waitFor(() => expect(failed.result.current).toEqual({ status: 'error', message: 'Internal error' }));
  });
});
