import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKbStatus } from '@/hooks/useKbStatus.ts';
import { KB_ABSENT, KB_OK } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

describe('useKbStatus', () => {
  it('reads the state again on every key change', async () => {
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
