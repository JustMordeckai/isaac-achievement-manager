import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHashAchievement, useHashTab } from '@/hooks/useHashTab.ts';

const navigate = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

describe('useHashTab', () => {
  it('reads the tab from the address', () => {
    window.location.hash = '#/achievements';
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0]).toBe('achievements');
  });

  it('updates the address and follows the changes', () => {
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0]).toBe('dashboard');
    act(() => result.current[1]('achievements'));
    expect(window.location.hash).toBe('#/achievements');
    expect(result.current[0]).toBe('achievements');
    navigate('#/');
    expect(result.current[0]).toBe('dashboard');
  });

  it('recognizes the Settings tab and stays on Achievements when a card is open', () => {
    const { result } = renderHook(() => useHashTab());
    act(() => result.current[1]('settings'));
    expect(window.location.hash).toBe('#/settings');
    expect(result.current[0]).toBe('settings');
    navigate('#/achievements/9');
    expect(result.current[0]).toBe('achievements');
  });
});

describe('useHashTab: routes', () => {
  it('recognizes the Routes tab', () => {
    window.location.hash = '#/routes';
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0]).toBe('routes');
    act(() => result.current[1]('dashboard'));
    expect(window.location.hash).toBe('#/');
    act(() => result.current[1]('routes'));
    expect(window.location.hash).toBe('#/routes');
  });

  it('scrolls back to the top only when the tab changes', () => {
    const { result } = renderHook(() => useHashTab());
    document.documentElement.scrollTop = 400;
    act(() => result.current[1]('dashboard'));
    expect(document.documentElement.scrollTop).toBe(400);
    act(() => result.current[1]('routes'));
    expect(document.documentElement.scrollTop).toBe(0);
  });
});

describe('useHashTab: advisor', () => {
  it('recognizes the Advisor tab', () => {
    window.location.hash = '#/advisor';
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0]).toBe('advisor');
    act(() => result.current[1]('settings'));
    act(() => result.current[1]('advisor'));
    expect(window.location.hash).toBe('#/advisor');
  });
});

describe('useHashAchievement', () => {
  it('reads the open card from the address', () => {
    window.location.hash = '#/achievements/42';
    const { result } = renderHook(() => useHashAchievement());
    expect(result.current[0]).toBe(42);
  });

  it('opens and closes a card, and ignores addresses with no number', () => {
    const { result } = renderHook(() => useHashAchievement());
    expect(result.current[0]).toBeNull();
    act(() => result.current[1](9));
    expect(window.location.hash).toBe('#/achievements/9');
    expect(result.current[0]).toBe(9);
    act(() => result.current[1](null));
    expect(window.location.hash).toBe('#/achievements');
    expect(result.current[0]).toBeNull();
    navigate('#/achievements/abc');
    expect(result.current[0]).toBeNull();
    navigate('#/achievements/641');
    expect(result.current[0]).toBe(641);
  });
});
