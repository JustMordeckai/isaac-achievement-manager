import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdvisorStatus } from '@shared/types.ts';
import { useAdvisorStatus } from '@/hooks/useAdvisorStatus.ts';
import { ADVISOR_OFFLINE, ADVISOR_OK } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

describe('useAdvisorStatus', () => {
  it('reads the state, reads it again on request and on every key change', async () => {
    let status = ADVISOR_OFFLINE;
    const mock = stubFetch({ 'GET /api/advisor/status': () => status });
    const { result, rerender } = renderHook(({ key }) => useAdvisorStatus(key), { initialProps: { key: 0 } });
    expect(result.current.status).toBeNull();
    expect(result.current.checking).toBe(true);
    await vi.waitFor(() => expect(result.current.status).toEqual(ADVISOR_OFFLINE));
    expect(result.current.checking).toBe(false);
    status = ADVISOR_OK;
    act(() => result.current.recheck());
    await vi.waitFor(() => expect(result.current.status).toEqual(ADVISOR_OK));
    rerender({ key: 1 });
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(3));
  });

  it('keeps the known settings when the read fails, and accepts a new state', async () => {
    let fail = false;
    stubFetch({ 'GET /api/advisor/status': () => (fail ? jsonResponse({ error: 'boom' }, 500) : ADVISOR_OK) });
    const { result } = renderHook(() => useAdvisorStatus(0));
    await vi.waitFor(() => expect(result.current.status).toEqual(ADVISOR_OK));
    fail = true;
    act(() => result.current.recheck());
    await vi.waitFor(() =>
      expect(result.current.status).toEqual({
        ...ADVISOR_OK,
        state: 'error',
        message: 'Advisor state unavailable: boom',
      }),
    );
    act(() => result.current.replace(ADVISOR_OFFLINE));
    expect(result.current.status).toEqual(ADVISOR_OFFLINE);
  });

  it('ignores the result of a check that was given up on', async () => {
    let late: (status: AdvisorStatus) => void = () => {};
    let calls = 0;
    stubFetch({
      'GET /api/advisor/status': () => {
        calls += 1;
        return calls === 1 ? new Promise<AdvisorStatus>((resolve) => (late = resolve)) : ADVISOR_OK;
      },
    });
    const { result } = renderHook(() => useAdvisorStatus(0));
    act(() => result.current.recheck());
    await vi.waitFor(() => expect(result.current.status).toEqual(ADVISOR_OK));
    // The first check, given up on, must not overwrite the most recent one.
    await act(async () => {
      late(ADVISOR_OFFLINE);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.status).toEqual(ADVISOR_OK);
  });
});
